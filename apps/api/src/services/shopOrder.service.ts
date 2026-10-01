import { Types } from 'mongoose';
import {
  ShopOrderModel,
  ShopProductModel,
  StockBatchModel,
  SupplierModel,
  type OrderStatus,
} from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import type { Actor } from './shop.service.js';

/**
 * Ordering, which until now happened on a scrap of paper.
 *
 * The shop could record a delivery and could be told what was running low, and
 * there was nothing in between: no way to write down what was asked for, and so
 * no way to notice a week later that half of it never came.
 *
 * Two things here earn their place. The **suggestion** turns the reorder levels
 * that were already being kept into a list with quantities against it, so the
 * list writes itself and the shopkeeper edits it rather than starting from
 * nothing. And the **last supplier** on each row is read off the batch the
 * stock last arrived in, because "who did we get this from" is a question the
 * product record cannot answer — the same strip comes from a depot one month
 * and a wholesaler the next — and it is the first thing somebody needs when
 * splitting a list between two reps.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

export interface SuggestedLine {
  productId: string;
  name: string;
  strength: string;
  rackLabel: string;
  onHand: number;
  reorderLevel: number;
  piecesPerStrip: number;
  stripsPerBox: number;
  /** Enough to put it back above its level, rounded up to a whole strip. */
  suggestPieces: number;
  lastSupplierId: string;
  lastSupplierName: string;
}

/**
 * Rounded up to a strip, and never less than one.
 *
 * Nobody orders seven tablets. The company sells strips and the rep writes
 * strips, so a suggestion in loose pieces is a suggestion somebody has to
 * convert in their head before they can read it out.
 */
function toWholeStrips(pieces: number, piecesPerStrip: number) {
  const strip = Math.max(1, piecesPerStrip || 1);
  return Math.max(strip, Math.ceil(pieces / strip) * strip);
}

/**
 * What is worth ordering, and from whom.
 *
 * Only rows the shop asked to be told about — a reorder level of zero means
 * "never chase this", and plenty of a shop's long tail is stocked once
 * deliberately and never again.
 */
export async function suggestOrder(
  actor: Actor,
  opts: { supplierId?: string } = {},
): Promise<SuggestedLine[]> {
  const org = new Types.ObjectId(actor.org);

  const products = await ShopProductModel.find({
    organization: org,
    isActive: true,
    deletedAt: null,
    reorderLevel: { $gt: 0 },
  })
    .select('name strength rackLabel reorderLevel piecesPerStrip stripsPerBox')
    .lean();
  if (products.length === 0) return [];

  const ids = products.map((p) => p._id);

  const onHand = await StockBatchModel.aggregate<{ _id: Types.ObjectId; onHand: number }>([
    { $match: { organization: org, product: { $in: ids } } },
    { $group: { _id: '$product', onHand: { $sum: '$qtyOnHand' } } },
  ]);
  const held = new Map(onHand.map((r) => [String(r._id), r.onHand]));

  /*
   * The company each one came from last.
   *
   * The newest batch wins, which is the honest reading of "last bought from":
   * a lot received in March says nothing about where the shop buys it now.
   */
  const recent = await StockBatchModel.aggregate<{
    _id: Types.ObjectId;
    supplier: Types.ObjectId | null;
  }>([
    { $match: { organization: org, product: { $in: ids }, supplier: { $ne: null } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$product', supplier: { $first: '$supplier' } } },
  ]);
  const lastSupplier = new Map(recent.map((r) => [String(r._id), r.supplier]));

  const suppliers = await SupplierModel.find({ organization: org, deletedAt: null })
    .select('name')
    .lean();
  const supplierName = new Map(suppliers.map((s) => [String(s._id), s.name]));

  const rows: SuggestedLine[] = [];
  for (const p of products) {
    const have = held.get(String(p._id)) ?? 0;
    if (have > p.reorderLevel) continue;

    const supplier = lastSupplier.get(String(p._id));
    const supplierId = supplier ? String(supplier) : '';
    /* Splitting the list between two reps is the whole reason this filter
       exists; a row nobody has ever bought belongs on neither list. */
    if (opts.supplierId && supplierId !== opts.supplierId) continue;

    rows.push({
      productId: String(p._id),
      name: p.name,
      strength: p.strength ?? '',
      rackLabel: p.rackLabel ?? '',
      onHand: have,
      reorderLevel: p.reorderLevel,
      piecesPerStrip: p.piecesPerStrip,
      stripsPerBox: p.stripsPerBox,
      /* Back above the level rather than exactly to it: an order that lands a
         shop precisely on its own reorder line is an order it has to place
         again the same week. */
      suggestPieces: toWholeStrips(Math.max(p.reorderLevel - have, 0) + p.reorderLevel, p.piecesPerStrip),
      lastSupplierId: supplierId,
      lastSupplierName: supplierId ? (supplierName.get(supplierId) ?? 'Not recorded') : '',
    });
  }

  /* Emptiest first — what is already out matters more than what is close. */
  return rows.sort((a, b) => a.onHand - b.onHand);
}

export async function createOrder(
  actor: Actor,
  input: {
    supplierId: string;
    note?: string;
    lines: { productId: string; qtyPieces: number; note?: string }[];
  },
) {
  if (!input.lines?.length) throw badRequest('An order with nothing on it is not an order');

  const supplier = await SupplierModel.findOne({
    _id: oid(input.supplierId),
    organization: actor.org,
    deletedAt: null,
  }).lean();
  if (!supplier) throw notFound('Company');

  const products = await ShopProductModel.find({
    _id: { $in: input.lines.map((l) => oid(l.productId)) },
    organization: actor.org,
    deletedAt: null,
  })
    .select('name')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const stock = await StockBatchModel.aggregate<{ _id: Types.ObjectId; onHand: number }>([
    {
      $match: {
        organization: new Types.ObjectId(actor.org),
        product: { $in: products.map((p) => p._id) },
      },
    },
    { $group: { _id: '$product', onHand: { $sum: '$qtyOnHand' } } },
  ]);
  const held = new Map(stock.map((s) => [String(s._id), s.onHand]));

  const lines = input.lines.map((l) => {
    const product = byId.get(l.productId);
    if (!product) throw badRequest('One of those items is not on this shop’s list');
    if (!(l.qtyPieces > 0)) throw badRequest(`How many ${product.name}?`);
    return {
      product: product._id,
      name: product.name,
      onHandAtOrder: held.get(l.productId) ?? 0,
      qtyPieces: Math.round(l.qtyPieces),
      note: l.note?.trim() ?? '',
    };
  });

  const order = await ShopOrderModel.create({
    organization: actor.org,
    supplier: supplier._id,
    supplierName: supplier.name,
    lines,
    note: input.note?.trim() ?? '',
    status: 'open',
    createdBy: actor.id,
    createdByName: actor.name,
  });

  return order.toObject();
}

export async function listOrders(
  actor: Actor,
  opts: { status?: OrderStatus; supplierId?: string; limit?: number } = {},
) {
  const filter: Record<string, unknown> = { organization: actor.org };
  if (opts.status) filter.status = opts.status;
  if (opts.supplierId) filter.supplier = oid(opts.supplierId);

  return ShopOrderModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, opts.limit || 50)))
    .lean();
}

export async function getOrder(actor: Actor, id: string) {
  /* The item behind each line, for the printed order: its strength and pack
     size turn "100 pieces" into "10 strip", which is how the rep writes it. */
  const order = await ShopOrderModel.findOne({ _id: oid(id), organization: actor.org })
    .populate('lines.product', 'name strength genericName companyName piecesPerStrip stripsPerBox')
    .lean();
  if (!order) throw notFound('Order');
  return order;
}

/**
 * Where an order goes next.
 *
 * Four states and only the moves that mean something: an order is written,
 * read out to the rep, and then either arrives or does not. Nothing reopens —
 * a company that sends half an order gets a new list for the rest, which is
 * what a shop does with paper and keeps both halves visible.
 */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  open: ['sent', 'cancelled'],
  sent: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export async function setOrderStatus(
  actor: Actor,
  id: string,
  input: { status: OrderStatus; reason?: string },
) {
  const order = await ShopOrderModel.findOne({ _id: oid(id), organization: actor.org });
  if (!order) throw notFound('Order');

  const from = order.status as OrderStatus;
  if (!ALLOWED[from].includes(input.status)) {
    throw badRequest(`An order that is ${from} cannot be marked ${input.status}`);
  }
  if (input.status === 'cancelled' && !input.reason?.trim()) {
    throw badRequest('Why is it being cancelled?');
  }

  order.status = input.status;
  if (input.status === 'sent') order.sentAt = new Date();
  if (input.status === 'received') order.receivedAt = new Date();
  if (input.status === 'cancelled') order.closeReason = input.reason!.trim();
  await order.save();

  return order.toObject();
}

/**
 * The order a delivery is being recorded against, checked before anything is
 * written — a delivery saved and then refused its order is a delivery the
 * shop enters twice trying to get the order closed.
 */
export async function orderForDelivery(actor: Actor, orderId: string, supplierId: string) {
  const order = await ShopOrderModel.findOne({ _id: oid(orderId), organization: actor.org });
  if (!order) throw notFound('Order');
  if (order.status !== 'sent') {
    throw badRequest(`That order is ${order.status} — only one given to the rep can arrive`);
  }
  if (String(order.supplier) !== supplierId) {
    throw badRequest(`That order was written for ${order.supplierName}, not this company`);
  }
  return order;
}

/**
 * Closing an order with the delivery it arrived on.
 *
 * Each line keeps what actually came, bonus included, matched by item. A line
 * the invoice does not mention came as nothing, and that is the point: the
 * short half is written down against the order instead of disappearing.
 */
export async function closeWithDelivery(
  order: Awaited<ReturnType<typeof orderForDelivery>>,
  purchase: {
    _id: unknown;
    invoiceDate: Date;
    lines: { product: unknown; qtyPieces: number; bonusPieces: number }[];
  },
) {
  const came = new Map<string, number>();
  for (const l of purchase.lines) {
    const key = String(l.product);
    came.set(key, (came.get(key) ?? 0) + l.qtyPieces + l.bonusPieces);
  }
  for (const line of order.lines) line.qtyReceived = came.get(String(line.product)) ?? 0;

  order.status = 'received';
  order.receivedAt = purchase.invoiceDate;
  order.purchase = purchase._id as Types.ObjectId;
  await order.save();
}

/**
 * Exported for the tests: the two rules that decide what a list says and where
 * an order may go next, neither of which needs a database to be wrong.
 */
export const __testables = { toWholeStrips, ALLOWED };
