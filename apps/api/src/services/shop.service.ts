import { Types } from 'mongoose';
import {
  OrganizationModel,
  ShopSettingsModel,
  ShopRackModel,
  SupplierModel,
  SupplierLedgerModel,
  ShopProductModel,
  StockBatchModel,
  StockLedgerModel,
  PurchaseModel,
  MedicineModel,
  type StockMove,
} from '../models/index.js';
import { assertMonthOpen } from './shopCash.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { expiryFromInput, calendarPartsInAppTz, dayKeyFromParts } from '../utils/date.js';
import { orderForDelivery, closeWithDelivery } from './shopOrder.service.js';

/**
 * The shop's stock, its purchases and its companies.
 *
 * Three rules hold this together, and everything else is bookkeeping:
 *
 * 1. **Stock is counted in pieces.** A customer buys four tablets out of a
 *    strip of ten, so the smallest sellable unit is the unit. Purchase is
 *    entered in boxes and strips because that is how a delivery arrives, and
 *    converted on the way in.
 * 2. **Stock lives in batches.** Every strip carries a batch and an expiry, the
 *    price paid changes between deliveries, and a sale must take from the lot
 *    that expires first. A product-level quantity cannot answer any of that.
 * 3. **Nothing moves without a ledger row.** `StockBatch.qtyOnHand` is a
 *    running total kept for speed; `StockLedger` is the record. When the shelf
 *    and the screen disagree, the question is when it started, and only the
 *    ledger knows.
 */

/**
 * One shop, one code, one row.
 *
 * A scanner sends whatever is under the beam and then an Enter, so codes
 * arrive with stray spaces around them often enough to be worth stripping
 * once here rather than at three call sites. The uniqueness check is done in
 * the service as well as by the index, because the index answers with E11000
 * and the person at the counter deserves the name of the product that already
 * holds the code.
 */
async function checkBarcodeFree(actor: Actor, barcode: string, exceptId?: Types.ObjectId | string) {
  const clash = await ShopProductModel.findOne({
    organization: actor.org,
    barcode,
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  })
    .select('name')
    .lean();
  if (clash) throw badRequest(`That barcode is already on ${clash.name}`);
}

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

export interface Actor {
  org: string;
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ units -- */

/**
 * Boxes and strips as they were delivered, in pieces.
 *
 * A line on an invoice reads "2 box + 3 strip" and the shop thinks in exactly
 * those words, so the form takes them and this turns them into the one unit
 * everything else uses.
 */
export function toPieces(
  qty: { boxes?: number; strips?: number; pieces?: number },
  pack: { piecesPerStrip?: number; stripsPerBox?: number },
) {
  const perStrip = Math.max(1, pack.piecesPerStrip || 1);
  const perBox = Math.max(1, pack.stripsPerBox || 1) * perStrip;
  return (qty.boxes || 0) * perBox + (qty.strips || 0) * perStrip + (qty.pieces || 0);
}

/**
 * What one piece of a delivered lot actually cost.
 *
 * The invoice charges for `qty` and the shop receives `qty + bonus`, so the
 * money is spread across everything that arrived. A cost worked out from the
 * charged quantity alone overstates the margin on every bonused line, which is
 * most of them.
 */
export function costPerPiece(lineTotal: number, qtyPieces: number, bonusPieces: number) {
  const received = qtyPieces + bonusPieces;
  if (received <= 0) return 0;
  return lineTotal / received;
}

/* -------------------------------------------------------------- companies -- */

export async function listSuppliers(actor: Actor, opts: { q?: string } = {}) {
  /* The bin is its own screen: nothing deleted appears on a list. */
  const filter: Record<string, unknown> = { organization: actor.org, deletedAt: null };
  if (opts.q?.trim()) {
    filter.name = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const suppliers = await SupplierModel.find(filter).sort({ name: 1 }).lean();
  const balances = await balancesFor(
    actor.org,
    suppliers.map((s) => String(s._id)),
  );

  return suppliers.map((s) => ({
    ...s,
    _id: String(s._id),
    /* The number the owner came for, on the list rather than one click in. */
    balance: balances.get(String(s._id)) ?? s.openingBalance ?? 0,
  }));
}

/**
 * What is owed to each of several companies.
 *
 * One aggregate rather than a query per row: a shop with forty suppliers on its
 * list should not make forty round trips to draw one page.
 */
async function balancesFor(org: string, supplierIds: string[]) {
  if (supplierIds.length === 0) return new Map<string, number>();

  const rows = await SupplierLedgerModel.aggregate<{ _id: Types.ObjectId; total: number }>([
    {
      $match: {
        organization: new Types.ObjectId(org),
        supplier: { $in: supplierIds.map((id) => new Types.ObjectId(id)) },
      },
    },
    { $group: { _id: '$supplier', total: { $sum: '$amount' } } },
  ]);

  const opening = await SupplierModel.find({ _id: { $in: supplierIds } })
    .select('openingBalance')
    .lean();

  const map = new Map<string, number>();
  for (const o of opening) map.set(String(o._id), o.openingBalance ?? 0);
  for (const r of rows) map.set(String(r._id), (map.get(String(r._id)) ?? 0) + r.total);
  return map;
}

export async function createSupplier(
  actor: Actor,
  input: {
    name: string;
    contactPerson?: string;
    phone?: string;
    address?: string;
    repName?: string;
    repVisitDay?: number | null;
    openingBalance?: number;
    note?: string;
  },
) {
  const existing = await SupplierModel.findOne({
    organization: actor.org,
    name: input.name.trim(),
  }).lean();
  if (existing) throw badRequest('There is already a company with that name');

  const supplier = await SupplierModel.create({ ...input, organization: actor.org });

  /*
   * The opening balance is a ledger row, not a field the balance reads around.
   *
   * A shop that starts on a Tuesday already owes money on Monday's delivery,
   * and that debt has to appear in the statement like everything else — or the
   * first page the owner prints does not add up to what they know they owe.
   */
  if (input.openingBalance) {
    await SupplierLedgerModel.create({
      organization: actor.org,
      supplier: supplier._id,
      entry: 'opening',
      amount: input.openingBalance,
      balanceAfter: input.openingBalance,
      note: 'Opening balance',
      actor: actor.id,
      actorName: actor.name,
    });
    /* Kept on the supplier too, so `balancesFor` does not need a special case
       for a company whose only row is its opening balance. */
    await SupplierModel.updateOne({ _id: supplier._id }, { $set: { openingBalance: 0 } });
  }

  return supplier.toObject();
}

export async function updateSupplier(actor: Actor, id: string, input: Record<string, unknown>) {
  const supplier = await SupplierModel.findOneAndUpdate(
    { _id: oid(id), organization: actor.org },
    { $set: input },
    { new: true },
  ).lean();
  if (!supplier) throw notFound('Company');
  return supplier;
}

/**
 * One company's statement: every row, in date order, with a running balance.
 *
 * The balance is recomputed as it is read rather than trusted from the stored
 * `balanceAfter`, because rows can be back-dated — a payment made on Sunday and
 * typed in on Tuesday belongs on Sunday, and everything after it moves.
 */
export async function supplierStatement(
  actor: Actor,
  id: string,
  range: { from?: string; to?: string } = {},
) {
  const supplier = await SupplierModel.findOne({ _id: oid(id), organization: actor.org }).lean();
  if (!supplier) throw notFound('Company');

  const rows = await SupplierLedgerModel.find({ organization: actor.org, supplier: supplier._id })
    .sort({ at: 1, createdAt: 1 })
    .lean();

  let running = 0;
  const entries = rows.map((r) => {
    running += r.amount;
    return { ...r, _id: String(r._id), balanceAfter: running };
  });

  const from = range.from ? new Date(range.from) : null;
  const to = range.to ? new Date(range.to) : null;
  const shown = entries.filter((e) => (!from || new Date(e.at) >= from) && (!to || new Date(e.at) <= to));

  /*
   * What actually came in, beside the account.
   *
   * "Koto dite hobe" and "kobe ki dise" are the same question asked twice, and
   * a ledger row reading "Delivery, ৳12,000" answers only the first. The rep is
   * standing there with his own book open at the invoices.
   */
  const deliveries = await PurchaseModel.find({
    organization: actor.org,
    supplier: supplier._id,
  })
    .sort({ invoiceDate: -1, createdAt: -1 })
    .limit(100)
    .lean();

  return {
    supplier: { ...supplier, _id: String(supplier._id) },
    /* The balance is the *whole* account, not the window: a statement for
       September still has to say what is owed in total. */
    balance: running,
    openingForRange: shown.length ? shown[0].balanceAfter - shown[0].amount : running,
    entries: shown,
    deliveries: deliveries.map((d) => ({
      _id: String(d._id),
      invoiceNo: d.invoiceNo,
      invoiceDate: d.invoiceDate,
      lines: d.lines.length,
      total: d.total,
      paidAmount: d.paidAmount,
      createdByName: d.createdByName ?? '',
    })),
    totals: {
      bought: Math.round(deliveries.reduce((n, d) => n + d.total, 0) * 100) / 100,
      paidOnInvoice: Math.round(deliveries.reduce((n, d) => n + d.paidAmount, 0) * 100) / 100,
    },
  };
}

/** Money paid to a company, against the account rather than one invoice. */
export async function paySupplier(
  actor: Actor,
  id: string,
  input: { amount: number; method?: string; reference?: string; note?: string; at?: string },
) {
  const supplier = await SupplierModel.findOne({ _id: oid(id), organization: actor.org }).lean();
  if (!supplier) throw notFound('Company');
  if (!(input.amount > 0)) throw badRequest('A payment has to be more than nothing');
  await assertMonthOpen(actor.org, input.at ? new Date(input.at) : new Date());
  /* More than is owed is a mistyped figure, not an advance: the account has
     nowhere to show money the company is holding for the shop, and a minus
     balance reads as "settled" on every screen. */
  const owedNow =
    Math.round(
      Math.max(0, (await balancesFor(actor.org, [String(supplier._id)])).get(String(supplier._id)) ?? 0) *
        100,
    ) / 100;
  if (input.amount > owedNow + 0.009) {
    throw badRequest(
      owedNow > 0
        ? `You owe ${supplier.name} ৳${owedNow} — pay that much at most`
        : `You owe ${supplier.name} nothing`,
    );
  }

  await SupplierLedgerModel.create({
    organization: actor.org,
    supplier: supplier._id,
    entry: 'payment',
    // Negative: a payment reduces what the shop owes.
    amount: -Math.abs(input.amount),
    at: input.at ? new Date(input.at) : new Date(),
    method: input.method ?? '',
    reference: input.reference ?? '',
    note: input.note ?? '',
    actor: actor.id,
    actorName: actor.name,
  });

  const balances = await balancesFor(actor.org, [String(supplier._id)]);
  return { balance: balances.get(String(supplier._id)) ?? 0 };
}

/* --------------------------------------------------------------- settings -- */

/**
 * The shop's own particulars, and the paper it prints on.
 *
 * Created on first read rather than at signup: a shop that has never opened
 * this page still has to be able to print, and a row that appears when it is
 * first needed is one less thing for the account-opening path to get wrong.
 *
 * The name falls back to the organisation's, because that is what the customer
 * typed when they signed up and it is right far more often than an empty
 * header.
 */
export async function getSettings(actor: Actor) {
  const existing = await ShopSettingsModel.findOne({ organization: actor.org }).lean();
  if (existing) return { ...existing, _id: String(existing._id) };

  const org = await OrganizationModel.findById(actor.org).select('name contactPhone address').lean();

  const created = await ShopSettingsModel.create({
    organization: actor.org,
    shopName: org?.name ?? '',
    phone: org?.contactPhone ?? '',
    address: [org?.address?.area, org?.address?.city].filter(Boolean).join(', '),
  });
  return { ...created.toObject(), _id: String(created._id) };
}

export async function updateSettings(actor: Actor, input: Record<string, unknown>) {
  /* Keep the two width fields honest: a shop on an 80mm roll should not be
     able to leave a stale custom width behind it that nothing reads. */
  const patch: Record<string, unknown> = { ...input };
  if (patch.paperSize === '80') patch.paperWidthMm = 80;
  if (patch.paperSize === '58') patch.paperWidthMm = 58;

  /*
   * The A4 sheet's settings arrive as an object and are written one key at a
   * time.
   *
   * `$set: { invoice: { paper: 'A5' } }` replaces the whole sub-document, so a
   * shop that changes the paper silently loses the colour it chose last month.
   * Dot paths set what was sent and leave the rest alone, which is what the
   * screen means when it saves one field.
   */
  if (patch.invoice && typeof patch.invoice === 'object') {
    for (const [key, value] of Object.entries(patch.invoice as Record<string, unknown>)) {
      patch[`invoice.${key}`] = value;
    }
    delete patch.invoice;
  }

  await getSettings(actor);
  const updated = await ShopSettingsModel.findOneAndUpdate(
    { organization: actor.org },
    { $set: patch },
    { new: true },
  ).lean();
  return { ...updated!, _id: String(updated!._id) };
}

/* ------------------------------------------------------------------ racks -- */

/**
 * The shelves, with what is on each.
 *
 * Counted rather than listed: an owner opening this page wants to know which
 * shelf is empty and what the stock on each is worth, and the contents are one
 * click away on the stock list filtered by rack.
 */
export async function listRacks(actor: Actor) {
  const racks = await ShopRackModel.find({
    organization: actor.org,
    isActive: true,
    deletedAt: null,
  })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const counts = await ShopProductModel.aggregate<{ _id: Types.ObjectId | null; n: number }>([
    { $match: { organization: new Types.ObjectId(actor.org), isActive: true } },
    { $group: { _id: '$rack', n: { $sum: 1 } } },
  ]);
  const byRack = new Map(counts.map((c) => [String(c._id), c.n]));

  return racks.map((r) => ({
    ...r,
    _id: String(r._id),
    items: byRack.get(String(r._id)) ?? 0,
  }));
}

export async function createRack(
  actor: Actor,
  input: {
    name: string;
    rule?: string;
    match?: string[];
    note?: string;
    isCold?: boolean;
    sortOrder?: number;
  },
) {
  const name = input.name.trim();
  if (await ShopRackModel.findOne({ organization: actor.org, name }).lean()) {
    throw badRequest('There is already a rack with that name');
  }
  const rack = await ShopRackModel.create({
    organization: actor.org,
    name,
    rule: input.rule ?? 'manual',
    /* Matched case-insensitively later, so it is stored the way it will be
       compared rather than the way it was typed. */
    match: (input.match ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean),
    note: input.note ?? '',
    isCold: input.isCold ?? false,
    sortOrder: input.sortOrder ?? 0,
  });
  return rack.toObject();
}

export async function updateRack(actor: Actor, id: string, input: Record<string, unknown>) {
  const patch = { ...input };
  if (Array.isArray(patch.match)) {
    patch.match = (patch.match as string[]).map((m) => String(m).trim().toLowerCase()).filter(Boolean);
  }
  const rack = await ShopRackModel.findOneAndUpdate(
    { _id: oid(id), organization: actor.org },
    { $set: patch },
    { new: true },
  ).lean();
  if (!rack) throw notFound('Rack');

  /* The label lives on the product so the counter never needs a join. A rename
     has to reach the items already on that shelf. */
  if (typeof patch.name === 'string') {
    await ShopProductModel.updateMany(
      { organization: actor.org, rack: rack._id },
      { $set: { rackLabel: rack.name } },
    );
  }
  return rack;
}

/**
 * Which shelf this item belongs on, if any rule claims it.
 *
 * A suggestion, not a decision — the caller can ignore it, and the person
 * adding the item can put it somewhere else entirely. Form beats company when
 * both match, because a shop that sorts by form has a syrup shelf for a reason
 * and putting one company's syrup somewhere else defeats it.
 */
export function rackFor(
  racks: { _id: unknown; name: string; rule?: string; match?: string[] }[],
  item: { dosageForm?: string; companyName?: string },
) {
  const form = (item.dosageForm ?? '').trim().toLowerCase();
  const company = (item.companyName ?? '').trim().toLowerCase();

  const hits = (rule: string, value: string) =>
    value
      ? racks.find(
          (r) => r.rule === rule && (r.match ?? []).some((m) => value.includes(m) || m.includes(value)),
        )
      : undefined;

  return hits('form', form) ?? hits('company', company) ?? null;
}

/* --------------------------------------------------------------- products -- */

/**
 * Adds something to this shop's list, from the catalogue or from nothing.
 *
 * A medicine is added by reference, and its name, generic, company and strength
 * are snapshotted: the shop's list should not change because the platform
 * corrected a brand, and the till must not need a join to print a bill. Soap,
 * syringes and baby food are added with no medicine at all, which is why the
 * catalogue link is optional.
 */
export async function createProduct(
  actor: Actor,
  input: {
    medicineId?: string;
    name?: string;
    genericName?: string;
    companyName?: string;
    strength?: string;
    dosageForm?: string;
    isMedicine?: boolean;
    piecesPerStrip?: number;
    stripsPerBox?: number;
    mrpPerPiece?: number;
    /** An explicit shelf, chosen by the person adding it. */
    rackId?: string;
    /** Or a label typed by a shop that has not set its shelves up. */
    rackLabel?: string;
    reorderLevel?: number;
    prescriptionOnly?: boolean;
    /** Kept for the law's classified register. */
    controlled?: boolean;
    /** What the scanner reads off the pack, when the shop has scanned it. */
    barcode?: string;
  },
) {
  let snapshot = {
    name: input.name?.trim() ?? '',
    genericName: input.genericName ?? '',
    companyName: input.companyName ?? '',
    strength: input.strength ?? '',
    dosageForm: input.dosageForm ?? '',
    isMedicine: input.isMedicine ?? true,
  };

  let medicine: Types.ObjectId | null = null;
  if (input.medicineId) {
    const row = await MedicineModel.findById(oid(input.medicineId)).populate('company', 'name').lean();
    if (!row) throw notFound('Medicine');

    const already = await ShopProductModel.findOne({
      organization: actor.org,
      medicine: row._id,
    }).lean();
    if (already) throw badRequest('That medicine is already on this shop’s list');

    medicine = row._id as Types.ObjectId;
    snapshot = {
      name: row.brandName,
      genericName: row.genericName ?? '',
      companyName: (row.company as { name?: string } | null)?.name ?? '',
      strength: row.strength ?? '',
      dosageForm: row.dosageForm ?? '',
      isMedicine: true,
    };
  }

  if (!snapshot.name) throw badRequest('What is it called?');

  /*
   * Where it goes on the shelf.
   *
   * An explicit choice wins; otherwise the racks' own rules are asked, and if
   * none of them claims it the item simply has no shelf yet — which is honest,
   * and better than guessing at one the person behind the counter will not
   * find it on.
   */
  let rack: Types.ObjectId | null = null;
  let rackLabel = (input.rackLabel ?? '').trim();
  if (input.rackId) {
    const chosen = await ShopRackModel.findOne({
      _id: oid(input.rackId),
      organization: actor.org,
    }).lean();
    if (chosen) {
      rack = chosen._id as Types.ObjectId;
      rackLabel = chosen.name;
    }
  } else if (!rackLabel) {
    const racks = await ShopRackModel.find({ organization: actor.org, isActive: true }).lean();
    const match = rackFor(racks, snapshot);
    if (match) {
      rack = match._id as Types.ObjectId;
      rackLabel = match.name;
    }
  }

  const barcode = (input.barcode ?? '').trim();
  if (barcode) await checkBarcodeFree(actor, barcode);

  const product = await ShopProductModel.create({
    organization: actor.org,
    medicine,
    ...snapshot,
    barcode,
    piecesPerStrip: input.piecesPerStrip ?? 1,
    stripsPerBox: input.stripsPerBox ?? 1,
    mrpPerPiece: input.mrpPerPiece ?? 0,
    rack,
    rackLabel,
    reorderLevel: input.reorderLevel ?? 0,
    prescriptionOnly: input.prescriptionOnly ?? false,
    controlled: input.controlled ?? false,
  });

  return product.toObject();
}

export async function updateProduct(actor: Actor, id: string, input: Record<string, unknown>) {
  if (typeof input.barcode === 'string') {
    const barcode = input.barcode.trim();
    if (barcode) await checkBarcodeFree(actor, barcode, oid(id));
    input = { ...input, barcode };
  }

  /*
   * The shelf, as the create path takes it: a rack that exists wins, a typed
   * label is for a shop with no shelves set up, and an empty id takes it off
   * the shelf. `rackId` is not a field on the product — passed through as it
   * was, it was dropped on the floor and the item never moved.
   */
  const {
    rackId,
    medicineId: _medicine,
    ...rest
  } = input as Record<string, unknown> & {
    rackId?: string;
    medicineId?: string;
  };
  input = rest;
  if (rackId !== undefined) {
    if (rackId) {
      const chosen = await ShopRackModel.findOne({
        _id: oid(rackId),
        organization: actor.org,
      }).lean();
      if (!chosen) throw notFound('Rack');
      input = { ...input, rack: chosen._id, rackLabel: chosen.name };
    } else {
      input = { ...input, rack: null, rackLabel: '' };
    }
  }

  const product = await ShopProductModel.findOneAndUpdate(
    { _id: oid(id), organization: actor.org },
    { $set: input },
    { new: true },
  ).lean();
  if (!product) throw notFound('Product');
  return product;
}

/**
 * The shop's list with what is on the shelf against each row.
 *
 * On-hand, the nearest expiry and the value of what is held, in one pass —
 * three separate questions that are always asked together.
 */
export type StockStatus = 'low' | 'out' | 'expiring';
export type StockSort = 'name' | 'onHand' | 'expiry' | 'value';

/** How close the first expiry has to be for an item to count as "expiring". */
const STOCK_EXPIRY_DAYS = 90;

export async function listProducts(
  actor: Actor,
  opts: {
    q?: string;
    /** Kept for older callers; the same as `status: 'low'`. */
    lowStock?: boolean;
    status?: StockStatus;
    rackId?: string;
    sort?: StockSort;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(200, Math.max(1, opts.limit || 50));
  const status = opts.status ?? (opts.lowStock ? 'low' : undefined);
  const now = new Date();
  const soon = new Date(now.getTime() + STOCK_EXPIRY_DAYS * 86_400_000);

  const filter: Record<string, unknown> = {
    organization: new Types.ObjectId(actor.org),
    isActive: true,
    /* The bin is its own screen: nothing deleted appears on a list. */
    deletedAt: null,
  };
  /* "Show me what is on R2" — the question a shelf check starts with. */
  if (opts.rackId) filter.rack = opts.rackId === 'none' ? null : oid(opts.rackId);
  if (opts.q?.trim()) {
    const rx = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    /* The number printed on the strip finds the item too: "D-10007" is what
       somebody reads off a box they are holding. */
    const lots = await StockBatchModel.find({ organization: actor.org, batchNo: rx }).distinct('product');
    filter.$or = [
      { name: rx },
      { genericName: rx },
      { companyName: rx },
      { barcode: rx },
      { _id: { $in: lots } },
    ];
  }

  /*
   * One pipeline, so the figures are the whole list's and not one page's.
   *
   * The stock is joined on before anything is filtered or paged. Filtering on
   * "to reorder" after paging — which this used to do — hands back a page with
   * three rows on it and a total that counts the ones it threw away; and the
   * tiles above the list were adding up whatever page happened to be loaded.
   */
  const statusMatch: Record<string, unknown> =
    status === 'low'
      ? { $expr: { $and: [{ $gt: ['$reorderLevel', 0] }, { $lte: ['$onHand', '$reorderLevel'] }] } }
      : status === 'out'
        ? { onHand: { $lte: 0 } }
        : status === 'expiring'
          ? { nearestExpiry: { $ne: null, $lte: soon } }
          : {};

  const sortStage: Record<string, 1 | -1> =
    opts.sort === 'onHand'
      ? { onHand: 1, name: 1 }
      : opts.sort === 'value'
        ? { stockValue: -1, name: 1 }
        : opts.sort === 'expiry'
          ? /* Items with nothing dated go last, not first. */ { hasExpiry: -1, nearestExpiry: 1, name: 1 }
          : { name: 1 };

  const [out] = await ShopProductModel.aggregate<{
    rows: Record<string, unknown>[];
    count: { n: number }[];
    summary: { value: number; items: number; low: number; out: number; expiring: number }[];
  }>([
    { $match: filter },
    {
      $lookup: {
        from: 'stockbatches',
        let: { product: '$_id' },
        as: 'held',
        pipeline: [
          { $match: { $expr: { $eq: ['$product', '$$product'] } } },
          {
            $group: {
              _id: null,
              /* Every lot, minus ones included: a shelf below zero is a
                 shelf somebody needs to count, and it should say so. */
              onHand: { $sum: '$qtyOnHand' },
              value: {
                $sum: { $multiply: [{ $max: ['$qtyOnHand', 0] }, '$costPerPiece'] },
              },
              nearestExpiry: {
                $min: { $cond: [{ $gt: ['$qtyOnHand', 0] }, '$expiry', null] },
              },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        onHand: { $ifNull: [{ $first: '$held.onHand' }, 0] },
        stockValue: { $round: [{ $ifNull: [{ $first: '$held.value' }, 0] }, 2] },
        nearestExpiry: { $ifNull: [{ $first: '$held.nearestExpiry' }, null] },
      },
    },
    { $addFields: { hasExpiry: { $cond: [{ $eq: ['$nearestExpiry', null] }, 0, 1] } } },
    { $project: { held: 0 } },
    {
      $facet: {
        rows: [
          { $match: statusMatch },
          { $sort: sortStage },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          /* The lots on the shelf, soonest first — so a row can say which
             batch it is selling from, and which one a search found. */
          {
            $lookup: {
              from: 'stockbatches',
              let: { product: '$_id' },
              as: 'lots',
              pipeline: [
                {
                  $match: {
                    $expr: { $and: [{ $eq: ['$product', '$$product'] }, { $gt: ['$qtyOnHand', 0] }] },
                  },
                },
                { $sort: { expiry: 1, receivedAt: 1 } },
                { $project: { _id: 0, batchNo: 1, expiry: 1, qtyOnHand: 1 } },
              ],
            },
          },
          { $project: { hasExpiry: 0 } },
        ],
        count: [{ $match: statusMatch }, { $count: 'n' }],
        summary: [
          {
            $group: {
              _id: null,
              items: { $sum: 1 },
              value: { $sum: '$stockValue' },
              low: {
                $sum: {
                  $cond: [
                    { $and: [{ $gt: ['$reorderLevel', 0] }, { $lte: ['$onHand', '$reorderLevel'] }] },
                    1,
                    0,
                  ],
                },
              },
              out: { $sum: { $cond: [{ $lte: ['$onHand', 0] }, 1, 0] } },
              expiring: {
                $sum: {
                  $cond: [
                    { $and: [{ $ne: ['$nearestExpiry', null] }, { $lte: ['$nearestExpiry', soon] }] },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ]);

  const sum = out?.summary[0];
  return {
    data: (out?.rows ?? []).map(({ lots, ...p }) => {
      const held = (lots ?? []) as { batchNo?: string; expiry?: Date | null; qtyOnHand: number }[];
      const needle = opts.q?.trim().toLowerCase();
      const found = needle ? held.find((l) => l.batchNo?.toLowerCase().includes(needle)) : undefined;
      const lot = found ?? held[0];
      return {
        ...p,
        _id: String(p._id),
        lotCount: held.length,
        /* The batch a search found, else the one the till sells next. */
        lot: lot
          ? {
              batchNo: lot.batchNo ?? '',
              expiry: lot.expiry ?? null,
              qtyOnHand: lot.qtyOnHand,
              matched: !!found,
            }
          : null,
      };
    }),
    total: out?.count[0]?.n ?? 0,
    page,
    limit,
    /* Across everything the search and the rack allow, whatever page this is. */
    summary: {
      items: sum?.items ?? 0,
      value: Math.round((sum?.value ?? 0) * 100) / 100,
      low: sum?.low ?? 0,
      out: sum?.out ?? 0,
      expiring: sum?.expiring ?? 0,
      expiryDays: STOCK_EXPIRY_DAYS,
    },
  };
}

/** Every lot of one product, soonest expiry first — the till's own order. */
export async function productBatches(actor: Actor, productId: string) {
  return (
    StockBatchModel.find({
      organization: actor.org,
      product: oid(productId),
      qtyOnHand: { $gt: 0 },
    })
      .sort({ expiry: 1, createdAt: 1 })
      /* Where each lot came from, beside when it goes out of date: a strip
       found bad is traced back to the company and the invoice it came on. */
      .populate('supplier', 'name')
      .populate('purchase', 'invoiceNo invoiceDate')
      .lean()
  );
}

/* -------------------------------------------------------------- purchases -- */

/**
 * Records a delivery and moves everything it touches.
 *
 * Four things happen together and none of them makes sense alone: the purchase
 * document is written, a batch is created or topped up for every line, a stock
 * ledger row is appended for each, and the company's account moves by what was
 * charged less what was paid at the door. Written in that order so a failure
 * halfway leaves stock that exists rather than stock that was paid for and
 * never arrived.
 */
export async function createPurchase(
  actor: Actor,
  input: {
    supplierId: string;
    invoiceNo?: string;
    invoiceDate?: string;
    discount?: number;
    vat?: number;
    paidAmount?: number;
    note?: string;
    /** The order this delivery is the answer to, when it was recorded from one. */
    orderId?: string;
    lines: {
      productId: string;
      batchNo?: string;
      expiry?: string;
      boxes?: number;
      strips?: number;
      pieces?: number;
      bonusStrips?: number;
      bonusPieces?: number;
      tradePricePerPiece: number;
      mrpPerPiece?: number;
      discount?: number;
    }[];
  },
) {
  const supplier = await SupplierModel.findOne({
    _id: oid(input.supplierId),
    organization: actor.org,
  }).lean();
  if (!supplier) throw notFound('Company');
  if (!input.lines?.length) throw badRequest('A delivery with no lines is not a delivery');
  const order = input.orderId ? await orderForDelivery(actor, input.orderId, String(supplier._id)) : null;

  const products = await ShopProductModel.find({
    _id: { $in: input.lines.map((l) => oid(l.productId)) },
    organization: actor.org,
  }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = input.lines.map((l) => {
    const product = byId.get(l.productId);
    if (!product) throw badRequest('One of those products is not on this shop’s list');

    const qtyPieces = toPieces(l, product);
    const bonusPieces = toPieces({ strips: l.bonusStrips, pieces: l.bonusPieces }, product);
    if (qtyPieces <= 0) throw badRequest(`How many ${product.name}?`);

    /*
     * A medicine does not go on the shelf without its date.
     *
     * A lot with no expiry is invisible to every check that follows it: the
     * expiry report cannot list it, and the till cannot refuse it once it has
     * gone out of date. Syringes and soap are left alone — plenty of what the
     * same counter sells has no date on it at all.
     */
    const expiry = l.expiry ? expiryFromInput(l.expiry) : null;
    if (!expiry && product.isMedicine !== false) {
      throw badRequest(`What is the expiry on ${product.name}?`);
    }
    /* Almost always a mistyped year, and the till would refuse it anyway. */
    if (expiry && expiry.getTime() < Date.now()) {
      throw badRequest(`${product.name} — that expiry has already passed. Check the year.`);
    }

    const gross = qtyPieces * l.tradePricePerPiece;
    const lineTotal = Math.max(0, gross - (l.discount || 0));

    return {
      product: product._id,
      name: product.name,
      batchNo: l.batchNo ?? '',
      expiry,
      qtyPieces,
      bonusPieces,
      tradePricePerPiece: l.tradePricePerPiece,
      mrpPerPiece: l.mrpPerPiece ?? product.mrpPerPiece ?? 0,
      discount: l.discount || 0,
      lineTotal,
    };
  });

  const subTotal = lines.reduce((n, l) => n + l.lineTotal, 0);
  const total = Math.max(0, subTotal - (input.discount || 0) + (input.vat || 0));
  /* Paid at the door: this invoice, and any old balance with it — but not more
     than the two together, which would leave the company holding the shop's
     money with nothing on screen to say so. */
  if ((input.paidAmount || 0) > 0) {
    const before = Math.max(
      0,
      (await balancesFor(actor.org, [String(supplier._id)])).get(String(supplier._id)) ?? 0,
    );
    const most = Math.round((total + before) * 100) / 100;
    if ((input.paidAmount || 0) > most + 0.009) {
      throw badRequest(`This invoice and the old balance come to ৳${most} — pay that much at most`);
    }
  }
  /* A delivery dated into a closed month would change figures already closed. */
  await assertMonthOpen(actor.org, input.invoiceDate ? new Date(input.invoiceDate) : new Date());

  const purchase = await PurchaseModel.create({
    organization: actor.org,
    supplier: supplier._id,
    invoiceNo: input.invoiceNo ?? '',
    invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : new Date(),
    lines,
    subTotal,
    discount: input.discount || 0,
    vat: input.vat || 0,
    total,
    paidAmount: input.paidAmount || 0,
    note: input.note ?? '',
    createdBy: actor.id,
    createdByName: actor.name,
  });

  for (const line of lines) {
    const received = line.qtyPieces + line.bonusPieces;
    const cost = costPerPiece(line.lineTotal, line.qtyPieces, line.bonusPieces);

    /*
     * The same batch number from the same company is the same lot.
     *
     * Two deliveries of it a fortnight apart should be one row on the shelf,
     * not two — the strips are physically mixed in the same box. The cost is
     * the weighted average of what the shop actually paid for what it is
     * holding, which is what a margin has to be worked out against.
     */
    const existing = line.batchNo
      ? await StockBatchModel.findOne({
          organization: actor.org,
          product: line.product,
          batchNo: line.batchNo,
        })
      : null;

    let batch = existing;
    if (batch) {
      const before = batch.qtyOnHand;
      const blended =
        before + received > 0 ? (before * batch.costPerPiece + received * cost) / (before + received) : cost;
      batch.qtyOnHand = before + received;
      batch.costPerPiece = Math.round(blended * 10000) / 10000;
      if (line.mrpPerPiece) batch.mrpPerPiece = line.mrpPerPiece;
      if (line.expiry) batch.expiry = line.expiry;
      await batch.save();
    } else {
      batch = await StockBatchModel.create({
        organization: actor.org,
        product: line.product,
        batchNo: line.batchNo,
        expiry: line.expiry,
        costPerPiece: Math.round(cost * 10000) / 10000,
        mrpPerPiece: line.mrpPerPiece,
        qtyOnHand: received,
        purchase: purchase._id,
        supplier: supplier._id,
        /* The day it arrived is the invoice's day, not the day somebody got
           round to typing it in — a Saturday delivery entered on Monday was
           still on the shelf on Saturday. */
        receivedAt: purchase.invoiceDate,
      });
    }

    await StockLedgerModel.create({
      organization: actor.org,
      product: line.product,
      batch: batch._id,
      move: 'purchase' satisfies StockMove,
      qtyDelta: received,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: batch.costPerPiece,
      ref: { model: 'Purchase', id: purchase._id },
      reason: line.bonusPieces ? `${line.qtyPieces} + ${line.bonusPieces} bonus` : '',
      actor: actor.id,
      actorName: actor.name,
    });
  }

  /* What the delivery added to the account, and what was handed over at the
     door, are two rows: a shop that pays half now and half on Thursday should
     see both, not one net figure. */
  await SupplierLedgerModel.create({
    organization: actor.org,
    supplier: supplier._id,
    entry: 'purchase',
    amount: total,
    at: purchase.invoiceDate,
    reference: purchase.invoiceNo,
    ref: { model: 'Purchase', id: purchase._id },
    actor: actor.id,
    actorName: actor.name,
  });

  if (input.paidAmount) {
    await SupplierLedgerModel.create({
      organization: actor.org,
      supplier: supplier._id,
      entry: 'payment',
      amount: -Math.abs(input.paidAmount),
      at: purchase.invoiceDate,
      reference: purchase.invoiceNo,
      note: 'Paid with the delivery',
      ref: { model: 'Purchase', id: purchase._id },
      actor: actor.id,
      actorName: actor.name,
    });
  }

  /* Last, once the stock and the money are both in: the order closing is the
     part that can be put right by hand if anything after it fails. */
  if (order) await closeWithDelivery(order, purchase);

  return purchase.toObject();
}

export async function listPurchases(
  actor: Actor,
  opts: {
    supplierId?: string;
    /** An invoice number, or part of a company's name. */
    q?: string;
    /** `due`: something is still on account; `paid`: settled at the door. */
    paid?: 'due' | 'paid';
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));

  const filter: Record<string, unknown> = { organization: actor.org };
  if (opts.supplierId) filter.supplier = oid(opts.supplierId);
  if (opts.paid === 'due') filter.$expr = { $lt: ['$paidAmount', '$total'] };
  if (opts.paid === 'paid') filter.$expr = { $gte: ['$paidAmount', '$total'] };

  const text = opts.q?.trim();
  if (text) {
    const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const companies = await SupplierModel.find({ organization: actor.org, name: rx }).select('_id').lean();
    filter.$or = [
      { invoiceNo: rx },
      { supplier: { $in: companies.map((c) => c._id) } },
      /* A lot's batch number finds the delivery it came in on. */
      { 'lines.batchNo': rx },
    ];
  }

  /*
   * This month, whatever page is showing.
   *
   * Worked out on the server because the list is paged: a total added up from
   * the rows on screen is the total of the first page. The month is the shop's
   * own — in Dhaka — and invoice dates are day keys, so the range is too.
   */
  const { year, month } = calendarPartsInAppTz(new Date());
  const monthRange = { $gte: dayKeyFromParts(year, month, 1), $lt: dayKeyFromParts(year, month + 1, 1) };

  const [data, total, summary] = await Promise.all([
    PurchaseModel.find(filter)
      .populate('supplier', 'name')
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PurchaseModel.countDocuments(filter),
    PurchaseModel.aggregate<{ _id: null; count: number; total: number; paid: number }>([
      { $match: { organization: new Types.ObjectId(actor.org), invoiceDate: monthRange } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: '$total' },
          paid: { $sum: { $min: ['$paidAmount', '$total'] } },
        },
      },
    ]),
  ]);

  const m = summary[0];
  return {
    data,
    total,
    page,
    limit,
    thisMonth: {
      deliveries: m?.count ?? 0,
      total: Math.round((m?.total ?? 0) * 100) / 100,
      paid: Math.round((m?.paid ?? 0) * 100) / 100,
    },
  };
}

export async function getPurchase(actor: Actor, id: string) {
  const purchase = await PurchaseModel.findOne({ _id: oid(id), organization: actor.org })
    .populate('supplier', 'name phone repName')
    .lean();
  if (!purchase) throw notFound('Purchase');
  return purchase;
}

/* --------------------------------------------------- returns to a company -- */

/**
 * Stock going back to the company it came from.
 *
 * In this trade it is routine: what expires on the shelf goes back on the next
 * delivery, and so does anything that arrived broken. It is settled against the
 * account rather than refunded in cash — the rep takes the strips and the
 * amount comes off what the shop owes, which is why this writes a supplier
 * ledger row and not a payment.
 *
 * Valued at what the shop actually paid for those pieces, not at MRP. A return
 * credited at the printed price would turn a loss into a profit on paper, and
 * the company would not accept it either.
 */
export async function returnToSupplier(
  actor: Actor,
  input: {
    supplierId: string;
    lines: { batchId: string; pieces: number }[];
    reason?: string;
    reference?: string;
  },
) {
  const supplier = await SupplierModel.findOne({
    _id: oid(input.supplierId),
    organization: actor.org,
  }).lean();
  if (!supplier) throw notFound('Company');
  if (!input.lines?.length) throw badRequest('What is going back?');

  let credit = 0;
  const sent: { name: string; batchNo: string; pieces: number; value: number }[] = [];

  for (const line of input.lines) {
    const batch = await StockBatchModel.findOne({
      _id: oid(line.batchId),
      organization: actor.org,
    });
    if (!batch) throw notFound('Batch');
    if (line.pieces <= 0 || line.pieces > batch.qtyOnHand) {
      throw badRequest(`Only ${batch.qtyOnHand} of batch ${batch.batchNo || '—'} are on the shelf`);
    }

    const product = await ShopProductModel.findById(batch.product).select('name').lean();
    const value = Math.round(line.pieces * (batch.costPerPiece || 0) * 100) / 100;

    batch.qtyOnHand -= line.pieces;
    await batch.save();

    await StockLedgerModel.create({
      organization: actor.org,
      product: batch.product,
      batch: batch._id,
      move: 'purchase_return',
      qtyDelta: -line.pieces,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: batch.costPerPiece,
      reason: input.reason ?? 'Returned to the company',
      actor: actor.id,
      actorName: actor.name,
    });

    credit += value;
    sent.push({
      name: product?.name ?? '',
      batchNo: batch.batchNo ?? '',
      pieces: line.pieces,
      value,
    });
  }

  credit = Math.round(credit * 100) / 100;

  /* Negative: what goes back reduces what the shop owes. Marked as awaiting
     credit in the note, because the rep takes the strips today and the company
     adjusts the account whenever it gets round to it — and the shop needs to
     see the difference between "sent" and "credited". */
  await SupplierLedgerModel.create({
    organization: actor.org,
    supplier: supplier._id,
    entry: 'purchase_return',
    amount: -credit,
    reference: input.reference ?? '',
    note: input.reason ?? 'Expiry and damage returned',
    actor: actor.id,
    actorName: actor.name,
  });

  return { supplier: supplier.name, credit, lines: sent };
}

/* ------------------------------------------------------------------ stock -- */

/**
 * What is about to go out of date, and what it is worth.
 *
 * The report an owner renews for. Buckets rather than one list, because "gone
 * already" is a write-off, "this month" is a discount, and "three months" is a
 * conversation with the rep about taking it back.
 */
export async function expiryReport(actor: Actor, days = 90) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86_400_000);

  const rows = await StockBatchModel.find({
    organization: actor.org,
    qtyOnHand: { $gt: 0 },
    expiry: { $ne: null, $lte: horizon },
  })
    /* `rackLabel`, not `rack`: the page prints the shelf as a word. The
       company is there so a lot can go back to whoever sent it. */
    .populate('product', 'name genericName strength rackLabel')
    .populate('supplier', 'name')
    .sort({ expiry: 1 })
    .lean();

  /*
   * Lots on the shelf with no date recorded.
   *
   * Counted rather than listed. A delivery can no longer be saved without one
   * for a medicine, so these are older stock — and "not recorded" is not
   * "safe", which is the whole reason for saying how many there are.
   */
  const undated = await StockBatchModel.countDocuments({
    organization: actor.org,
    qtyOnHand: { $gt: 0 },
    expiry: null,
  });

  const expired = rows.filter((r) => r.expiry && new Date(r.expiry) < now);
  const soon = rows.filter((r) => r.expiry && new Date(r.expiry) >= now);
  const value = (list: typeof rows) =>
    Math.round(list.reduce((n, r) => n + r.qtyOnHand * (r.costPerPiece || 0), 0) * 100) / 100;

  return {
    days,
    expired: { rows: expired, value: value(expired) },
    soon: { rows: soon, value: value(soon) },
    undated,
  };
}

/** One product's whole history, newest first. */
export async function productLedger(actor: Actor, productId: string, limit = 100) {
  return StockLedgerModel.find({ organization: actor.org, product: oid(productId) })
    .sort({ createdAt: -1 })
    .limit(Math.min(500, limit))
    .lean();
}

/**
 * A count that disagreed with the screen, or something broken or out of date.
 *
 * The only way stock moves without a document behind it, so the reason is
 * required — an adjustment with no reason is the line an owner finds three
 * months later and cannot explain.
 */
export async function adjustStock(
  actor: Actor,
  input: { batchId: string; qtyDelta: number; move: StockMove; reason: string },
) {
  if (!input.reason?.trim()) throw badRequest('Say why — an unexplained adjustment is a hole');
  if (!input.qtyDelta) throw badRequest('By how much?');

  const batch = await StockBatchModel.findOne({
    _id: oid(input.batchId),
    organization: actor.org,
  });
  if (!batch) throw notFound('Batch');

  const next = batch.qtyOnHand + input.qtyDelta;
  if (next < 0) throw badRequest('That would take the shelf below zero');

  batch.qtyOnHand = next;
  await batch.save();

  await StockLedgerModel.create({
    organization: actor.org,
    product: batch.product,
    batch: batch._id,
    move: input.move,
    qtyDelta: input.qtyDelta,
    balanceAfter: next,
    costPerPiece: batch.costPerPiece,
    reason: input.reason.trim(),
    actor: actor.id,
    actorName: actor.name,
  });

  return { batchId: String(batch._id), onHand: next };
}
