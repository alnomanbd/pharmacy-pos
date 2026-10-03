import crypto from 'node:crypto';
import { Schema, model, Types } from 'mongoose';
import { BranchModel, SaleModel, ShopSettingsModel } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { storage } from './storage.service.js';
import { sendSms } from '../integrations/sms.js';
import { pushToShop } from './push.service.js';
import { branchMatch, inScope } from './branchScope.service.js';
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
  return { ...DEFAULTS, ...(s?.onlineOrders ?? {}), code };
}

export async function saveOrderSettings(org: string, input: Partial<Omit<OrderSettings, 'code'>>) {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) set[`onlineOrders.${k}`] = v;
  await ShopSettingsModel.updateOne({ organization: org }, { $set: set }, { upsert: true });
  return orderSettings(org);
}

/** A fresh link: the old one stops working at once. */
export async function newOrderLink(org: string) {
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
  return s;
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
  note?: string;
  branchId?: string;
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
  if (!input.items?.trim() && files.length === 0) throw badRequest('Type what you need, or add a photo of the prescription.');

  let branch: Types.ObjectId | null = null;
  if (input.branchId && Types.ObjectId.isValid(input.branchId)) {
    const b = await BranchModel.findOne({ _id: input.branchId, organization: s.organization, active: true }).select('_id').lean();
    branch = (b?._id as Types.ObjectId) ?? null;
  }
  if (!branch) {
    const main = await BranchModel.findOne({ organization: s.organization, isMain: true }).select('_id').lean();
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
      void pushToShop(s.organization, 'orders', {
        title: `New order ${made.number}`,
        body: `${made.customerName} · ${made.mode === 'delivery' ? 'delivery' : 'pickup'}${made.items ? ` — ${made.items.split(/\r?\n/)[0].slice(0, 80)}` : ''}`,
        url: '/online-orders',
        tag: `order-${made.number}`,
      });
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
  return { count: await OnlineOrderModel.countDocuments({ organization: actor.org, status: 'new', ...branchMatch(actor.branch) }) };
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
      const sale = await SaleModel.findOne({ organization: actor.org, billNo, deletedAt: null })
        .sort({ soldAt: -1 })
        .select('_id total billNo')
        .lean();
      if (!sale) throw badRequest(`No bill ${billNo} in this shop`);
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
