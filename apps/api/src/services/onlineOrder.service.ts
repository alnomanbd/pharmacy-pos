import crypto from 'node:crypto';
import { Schema, model, Types } from 'mongoose';
import { BranchModel, SaleModel, ShopSettingsModel, ShopProductModel, StockBatchModel } from '../models/index.js';
import { assertOrgFeature, orgHasFeature } from './plan.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { storage } from './storage.service.js';
import { sendSms } from '../integrations/sms.js';
import { pushToShop, orderMessage } from './push.service.js';
import { branchMatch, inScope } from './branchScope.service.js';
import { ensureMainBranch } from './branch.service.js';
import type { Actor } from './shop.service.js';

/**
 * Orders from customers, before they reach the counter.
 *
 * A shop shares one link — on WhatsApp, Facebook, a poster with a QR by the
 * door — and a customer sends what they need: the medicines typed out, or a
 * photo of the prescription, for pickup or for delivery. The order lands in
 * the shop's app with a count on the menu; the counter confirms it, bills it
 * in the POS as usual, and moves it along. The customer gets an SMS at each
 * step, so nobody has to ring to ask "is it ready?".
 *
 * Sold with a plan: a shop whose plan (or its own setting in the console)
 * does not include online orders cannot switch them on, and its link answers
 * "not found".
 *
 * Nothing about an order touches stock or money — the bill does that, rung up
 * at the counter like any other. The order only says what was asked for, and
 * which bill answered it.
 */

export const ORDER_STATUSES = ['new', 'confirmed', 'ready', 'out', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Where an order may go next. Anything open can be cancelled. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'out', 'cancelled'],
  ready: ['delivered', 'out', 'cancelled'],
  out: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    /** W-0001, per shop: what the customer reads out on the phone. */
    number: { type: String, required: true },
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    customerPhone: { type: String, required: true, trim: true, maxlength: 20 },
    address: { type: String, default: '', trim: true, maxlength: 300 },
    mode: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    /** What they picked from the shop's list, with how many. */
    lines: {
      type: [
        new Schema(
          {
            product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', default: null },
            name: { type: String, required: true, trim: true, maxlength: 160 },
            qty: { type: Number, required: true, min: 1, max: 1000 },
            unit: { type: String, default: 'strip', enum: ['piece', 'strip', 'box'] },
            price: { type: Number, default: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** What they asked for, in their own words. */
    items: { type: String, default: '', trim: true, maxlength: 2000 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    /** Prescription photos, as storage keys. */
    photos: { type: [String], default: [] },
    status: { type: String, enum: ORDER_STATUSES, default: 'new', index: true },
    deliveryCharge: { type: Number, default: 0 },
    /** The bill that answered it, once billed. */
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
    billNo: { type: String, default: '' },
    total: { type: Number, default: 0 },
    cancelReason: { type: String, default: '', trim: true, maxlength: 200 },
    history: {
      type: [new Schema({ status: String, at: Date, by: String }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
);
schema.index({ organization: 1, number: 1 }, { unique: true });
schema.index({ organization: 1, status: 1, createdAt: -1 });

export const OnlineOrderModel = model('OnlineOrder', schema);

/* ------------------------------------------------------------------ */
/* The shop's settings                                                 */
/* ------------------------------------------------------------------ */

export interface OrderSettings {
  /** Whether the shop's plan (or its own setting in the console) includes online orders. */
  allowed?: boolean;
  enabled: boolean;
  code: string;
  pickup: boolean;
  delivery: boolean;
  deliveryCharge: number;
  freeDeliveryOver: number;
  note: string;
}

const DEFAULTS: Omit<OrderSettings, 'code'> = {
  enabled: false,
  pickup: true,
  delivery: true,
  deliveryCharge: 40,
  freeDeliveryOver: 0,
  note: '',
};

/** A short code for the shop's link: easy to type, nothing to guess. */
const newCode = () => crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 7).toLowerCase();

export async function orderSettings(org: string): Promise<OrderSettings> {
  const s = await ShopSettingsModel.findOne({ organization: org }).select('onlineOrders').lean<{ onlineOrders?: Partial<OrderSettings> }>();
  let code = s?.onlineOrders?.code ?? '';
  if (!code) {
    code = newCode();
    await ShopSettingsModel.updateOne({ organization: org }, { $set: { 'onlineOrders.code': code } }, { upsert: true });
  }
  return { ...DEFAULTS, ...(s?.onlineOrders ?? {}), code, allowed: await orgHasFeature(org, 'onlineOrders') };
}

export async function saveOrderSettings(org: string, input: Partial<Omit<OrderSettings, 'code' | 'allowed'>>) {
  if (input.enabled) await assertOrgFeature(org, 'onlineOrders');
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined && k !== 'allowed') set[`onlineOrders.${k}`] = v;
  await ShopSettingsModel.updateOne({ organization: org }, { $set: set }, { upsert: true });
  return orderSettings(org);
}

/** A fresh link: the old one stops working at once. */
export async function newOrderLink(org: string) {
  await assertOrgFeature(org, 'onlineOrders');
  await ShopSettingsModel.updateOne({ organization: org }, { $set: { 'onlineOrders.code': newCode() } }, { upsert: true });
  return orderSettings(org);
}

/* ------------------------------------------------------------------ */
/* The public page                                                      */
/* ------------------------------------------------------------------ */

async function shopByCode(code: string) {
  const s = await ShopSettingsModel.findOne({ 'onlineOrders.code': String(code).toLowerCase() })
    .select('organization shopName shopNameBn address phone onlineOrders')
    .lean<{ organization: Types.ObjectId; shopName?: string; shopNameBn?: string; address?: string; phone?: string; onlineOrders?: Partial<OrderSettings> }>();
  if (!s || !s.onlineOrders?.enabled) throw notFound('Shop');
  /* Off the plan: the link goes dead, whatever the shop's own switch says. */
  if (!(await orgHasFeature(s.organization, 'onlineOrders'))) throw notFound('Shop');
  return s;
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The shop's own list, searched from the order page.
 *
 * Only what the shop sells, by name, with its price per strip (or per piece
 * for something sold singly) and whether any is on the shelf — never the
 * quantity, the cost, or anything else a competitor would like to know.
 */
export async function publicMedicines(code: string, q: string) {
  const s = await shopByCode(code);
  const term = q.trim().slice(0, 40);
  if (term.length < 2) return [];
  const products = await ShopProductModel.find({
    organization: s.organization,
    isActive: { $ne: false },
    deletedAt: null,
    name: new RegExp(`^${escapeRx(term)}|\\b${escapeRx(term)}`, 'i'),
  })
    .select('name strength dosageForm piecesPerStrip mrpPerPiece')
    .sort({ name: 1 })
    .limit(12)
    .lean();
  const now = new Date();
  const stock = await StockBatchModel.aggregate<{ _id: Types.ObjectId; qty: number }>([
    {
      $match: {
        organization: s.organization,
        product: { $in: products.map((p) => p._id) },
        qtyOnHand: { $gt: 0 },
        $or: [{ expiry: null }, { expiry: { $gte: now } }],
      },
    },
    { $group: { _id: '$product', qty: { $sum: '$qtyOnHand' } } },
  ]);
  const onShelf = new Set(stock.filter((x) => x.qty > 0).map((x) => String(x._id)));
  return products.map((p) => {
    const perStrip = (p.piecesPerStrip ?? 1) > 1;
    return {
      id: String(p._id),
      name: p.name,
      strength: p.strength ?? '',
      form: p.dosageForm ?? '',
      unit: perStrip ? ('strip' as const) : ('piece' as const),
      price: Math.round((p.mrpPerPiece ?? 0) * (perStrip ? p.piecesPerStrip ?? 1 : 1) * 100) / 100,
      inStock: onShelf.has(String(p._id)),
    };
  });
}

/** What the order page shows before anybody types: the shop, and how it delivers. */
export async function publicShop(code: string) {
  const s = await shopByCode(code);
  const o = { ...DEFAULTS, ...s.onlineOrders };
  const branches = await BranchModel.find({ organization: s.organization, active: true })
    .select('name address isMain')
    .sort({ isMain: -1, name: 1 })
    .lean();
  return {
    name: s.shopName || 'Pharmacy',
    nameBn: s.shopNameBn || '',
    address: s.address || '',
    phone: s.phone || '',
    pickup: o.pickup,
    delivery: o.delivery,
    deliveryCharge: o.deliveryCharge,
    freeDeliveryOver: o.freeDeliveryOver,
    note: o.note,
    branches: branches.length > 1 ? branches.map((b) => ({ id: String(b._id), name: b.name, address: b.address ?? '' })) : [],
  };
}

export interface PlaceOrder {
  name: string;
  phone: string;
  address?: string;
  mode: 'pickup' | 'delivery';
  items?: string;
  /** Picked from the shop's list (or typed and added as a line). */
  lines?: { productId?: string; name: string; qty: number; unit?: 'piece' | 'strip' | 'box' }[];
  note?: string;
  branchId?: string;
}

/**
 * The lines as the shop will read them. A picked product's name and price
 * come from the shop's own list, not from what the browser sent.
 */
async function linesFor(org: Types.ObjectId, given: PlaceOrder['lines']) {
  const list = (given ?? []).slice(0, 30);
  const ids = list.map((l) => l.productId).filter((id): id is string => !!id && Types.ObjectId.isValid(id));
  const products = await ShopProductModel.find({ _id: { $in: ids }, organization: org, deletedAt: null })
    .select('name strength piecesPerStrip mrpPerPiece')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return list
    .map((l) => {
      const p = l.productId ? byId.get(l.productId) : undefined;
      const unit = l.unit ?? 'strip';
      const qty = Math.max(1, Math.min(1000, Math.round(l.qty || 1)));
      if (p) {
        const pieces = unit === 'piece' ? 1 : p.piecesPerStrip ?? 1;
        return {
          product: p._id,
          name: [p.name, p.strength].filter(Boolean).join(' ').slice(0, 160),
          qty,
          unit,
          price: Math.round((p.mrpPerPiece ?? 0) * (unit === 'box' ? 0 : pieces) * 100) / 100,
        };
      }
      const name = (l.name ?? '').trim().slice(0, 160);
      return name ? { product: null, name, qty, unit, price: 0 } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

async function nextNumber(org: Types.ObjectId) {
  const last = await OnlineOrderModel.findOne({ organization: org }).sort({ createdAt: -1 }).select('number').lean();
  const n = last ? Number(String(last.number).replace(/\D/g, '')) || 0 : 0;
  return `W-${String(n + 1).padStart(4, '0')}`;
}

export async function placeOrder(code: string, input: PlaceOrder, files: { buffer: Buffer; mimetype: string }[]) {
  const s = await shopByCode(code);
  const o = { ...DEFAULTS, ...s.onlineOrders };
  if (input.mode === 'delivery' && !o.delivery) throw badRequest('This shop does not deliver — choose pickup.');
  if (input.mode === 'pickup' && !o.pickup) throw badRequest('This shop only delivers — add your address.');
  if (input.mode === 'delivery' && !input.address?.trim()) throw badRequest('Where should it be delivered?');
  const lines = await linesFor(s.organization, input.lines);
  if (!input.items?.trim() && files.length === 0 && lines.length === 0) {
    throw badRequest('Pick or type what you need, or add a photo of the prescription.');
  }

  let branch: Types.ObjectId | null = null;
  if (input.branchId && Types.ObjectId.isValid(input.branchId)) {
    const b = await BranchModel.findOne({ _id: input.branchId, organization: s.organization, active: true }).select('_id').lean();
    branch = (b?._id as Types.ObjectId) ?? null;
  }
  if (!branch) {
    const main = await ensureMainBranch(s.organization);
    branch = (main?._id as Types.ObjectId) ?? null;
  }

  const org = String(s.organization);
  const photos: string[] = [];
  for (const f of files.slice(0, 3)) {
    const stored = await storage.save(`org/${org}/orders`, f);
    photos.push(stored.key);
  }

  /* The number is taken by the unique index; a clash on a busy second is tried again. */
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const made = await OnlineOrderModel.create({
        organization: s.organization,
        branch,
        number: await nextNumber(s.organization),
        customerName: input.name.trim(),
        customerPhone: input.phone.trim(),
        address: input.address?.trim() ?? '',
        mode: input.mode,
        items: input.items?.trim() ?? '',
        lines,
        note: input.note?.trim() ?? '',
        photos,
        deliveryCharge: input.mode === 'delivery' ? o.deliveryCharge : 0,
        history: [{ status: 'new', at: new Date(), by: 'Customer' }],
      });
      void sendSms(
        made.customerPhone,
        `${s.shopName || 'Pharmacy'}: your order ${made.number} is received. We will message you when it is confirmed.`,
        { kind: 'online-order', organization: org },
      );
      // Each phone in its own person's language — see push.service.
      void pushToShop(s.organization, 'orders', (lang) =>
        orderMessage({ number: made.number, customerName: made.customerName, mode: made.mode, lines, items: made.items }, lang),
      );
      return { number: made.number, shop: s.shopName || 'Pharmacy', phone: s.phone || '' };
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw badRequest('Please try again in a moment.');
}

/* ------------------------------------------------------------------ */
/* The shop's side                                                      */
/* ------------------------------------------------------------------ */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

export async function listOrders(actor: Actor, opts: { status?: string } = {}) {
  const filter: Record<string, unknown> = { organization: actor.org, ...branchMatch(actor.branch) };
  if (opts.status === 'open') filter.status = { $in: ['new', 'confirmed', 'ready', 'out'] };
  else if (opts.status && (ORDER_STATUSES as readonly string[]).includes(opts.status)) filter.status = opts.status;
  return OnlineOrderModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
}

/** How many are waiting for somebody to look — the badge on the menu. */
export async function newCount(actor: Actor) {
  if (!(await orgHasFeature(actor.org, 'onlineOrders'))) return { count: 0, allowed: false };
  return { allowed: true, count: await OnlineOrderModel.countDocuments({ organization: actor.org, status: 'new', ...branchMatch(actor.branch) }) };
}

const SMS: Partial<Record<OrderStatus, (shop: string, n: string, extra: string) => string>> = {
  confirmed: (shop, n, extra) => `${shop}: your order ${n} is confirmed${extra}. We are getting it ready.`,
  ready: (shop, n) => `${shop}: your order ${n} is ready to collect.`,
  out: (shop, n) => `${shop}: your order ${n} is on its way.`,
  delivered: (shop, n) => `${shop}: order ${n} delivered. Thank you!`,
  cancelled: (shop, n, extra) => `${shop}: sorry, your order ${n} was cancelled${extra}. Please call us.`,
};

export async function updateOrder(
  actor: Actor,
  id: string,
  input: { status?: OrderStatus; billNo?: string; reason?: string },
) {
  const order = await OnlineOrderModel.findOne({ _id: oid(id), organization: actor.org });
  if (!order || !inScope(actor.branch, order.branch)) throw notFound('Order');

  /* Linking the bill that answered it: the total comes off the bill itself. */
  if (input.billNo !== undefined) {
    const billNo = input.billNo.trim();
    if (billNo) {
      /* This branch's bill, not cancelled, and from around the order — bill
         numbers start again each month, so "13-0042" is only unique nearby. */
      const since = new Date(new Date(order.createdAt as Date).getTime() - 2 * 86_400_000);
      const sale = await SaleModel.findOne({
        organization: actor.org,
        billNo,
        deletedAt: null,
        status: { $ne: 'void' },
        soldAt: { $gte: since },
        ...branchMatch(actor.branch),
      })
        .sort({ soldAt: 1 })
        .select('_id total billNo')
        .lean();
      if (!sale) throw badRequest(`No bill ${billNo} here since this order came in`);
      const taken = await OnlineOrderModel.findOne({ organization: actor.org, sale: sale._id, _id: { $ne: order._id } }).select('number').lean();
      if (taken) throw badRequest(`Bill ${billNo} is already linked to order ${taken.number}`);
      order.set({ sale: sale._id, billNo: sale.billNo, total: sale.total });
    } else {
      order.set({ sale: null, billNo: '', total: 0 });
    }
  }

  if (input.status && input.status !== order.status) {
    const from = order.status as OrderStatus;
    if (!NEXT[from].includes(input.status)) throw badRequest(`An order that is ${from} cannot become ${input.status}`);
    if (input.status === 'cancelled') order.set('cancelReason', input.reason?.trim() ?? '');
    order.set('status', input.status);
    order.history.push({ status: input.status, at: new Date(), by: actor.name });

    const s = await ShopSettingsModel.findOne({ organization: actor.org }).select('shopName').lean();
    const shop = s?.shopName || 'Pharmacy';
    const extra =
      input.status === 'confirmed' && order.total > 0
        ? ` — ৳${Math.round(order.total + (order.deliveryCharge ?? 0))}`
        : input.status === 'cancelled' && input.reason?.trim()
          ? ` (${input.reason.trim()})`
          : '';
    const text = SMS[input.status]?.(shop, order.number, extra);
    if (text) void sendSms(order.customerPhone, text, { kind: 'online-order', organization: actor.org });
  }

  await order.save();
  return order.toObject();
}
