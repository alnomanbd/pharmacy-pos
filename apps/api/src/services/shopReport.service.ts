import { Types } from 'mongoose';
import {
  PurchaseModel,
  SaleModel,
  ShopProductModel,
  StockBatchModel,
  ShopCustomerModel,
  ShopOrderModel,
  ExpenseModel,
  IncomeModel,
  CashMoveModel,
} from '../models/index.js';
import { formatDayKey, instantFromDayKeyAndTime, parseDayKey } from '../utils/date.js';
import type { Actor } from './shop.service.js';
import { backfillRefunds } from './shopCash.service.js';

/**
 * The four questions an owner asks that the day summary cannot answer.
 *
 * The till's day says what came in this evening. What it never says is whether
 * this month is better than last, which shelf is earning its space, which
 * company is worth the credit, and what has been sitting there since the day it
 * was delivered. All four are already in the data — every sale line carries the
 * cost it sold at, every batch carries the supplier it came from — and none of
 * it was being read.
 *
 * Three rules shape every figure here:
 *
 * - **A cancelled bill is not takings.** It stays in the register because its
 *   number was printed on somebody's slip, and it is left out of every total
 *   here, exactly as the day summary leaves it out.
 * - **A return is netted off the line, not off the day it was sold.** The
 *   pieces that came back never earned anything; the bill they were sold on
 *   has already been counted and closed.
 * - **The range it is compared against is the same length, immediately
 *   before.** "This month against last" with 31 days against 28 is a comparison
 *   of calendars rather than of trade.
 */

const money = (n: number) => Math.round(n * 100) / 100;

const DAY = 86_400_000;

export interface RangeTotals {
  bills: number;
  sales: number;
  cost: number;
  margin: number;
  /** Margin as a share of what was sold, which is how a shop talks about it. */
  marginPercent: number;
  due: number;
  averageBill: number;
  itemsSold: number;
  /**
   * What came in off the companies' vans.
   *
   * A sale is takings and a delivery is spending, and a month is not reported
   * honestly by the first alone — "koto mal duklo" is the same evening question
   * as "koto bikri holo". Counted off `invoiceDate` (the day the boxes arrived),
   * valued at the invoice the shop will actually pay, and counted again in
   * pieces, because a delivery of a few costly inhalers and one of cartons of
   * paracetamol are two very different evenings.
   */
  cameIn: { count: number; value: number; pieces: number };
  /** What the shop itself cost to stand open. */
  expenses: number;
  /** Money in that is not a sale: the company's cash-back, a service charge. */
  otherIncome: number;
  /** Margin, plus other income, minus what the shop cost — "the month earned". */
  net: number;
}

/**
 * A day key `n` days from another.
 *
 * Through `parseDayKey`/`formatDayKey` rather than string arithmetic, because
 * a day key is the shop's calendar date and month ends are exactly where a
 * hand-rolled version goes wrong.
 */
const shiftKey = (key: string, days: number) =>
  formatDayKey(new Date(parseDayKey(key).getTime() + days * DAY));

const daysBetween = (from: string, to: string) =>
  Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / DAY) + 1;

/**
 * The range asked for, and the one before it of the same length.
 *
 * Defaults to the last thirty days ending today, which is the question
 * somebody who opens the page and touches nothing is asking.
 */
export function rangeOf(opts: { from?: string; to?: string } = {}) {
  const to = formatDayKey(parseDayKey(opts.to));
  const from = opts.from ? formatDayKey(parseDayKey(opts.from)) : shiftKey(to, -29);
  /* A range typed backwards is a typo, not a request for nothing. */
  const [start, end] = from <= to ? [from, to] : [to, from];
  const days = daysBetween(start, end);
  return {
    from: start,
    to: end,
    days,
    previousFrom: shiftKey(start, -days),
    previousTo: shiftKey(start, -1),
  };
}

const EMPTY: RangeTotals = {
  bills: 0,
  sales: 0,
  cost: 0,
  margin: 0,
  marginPercent: 0,
  due: 0,
  averageBill: 0,
  itemsSold: 0,
  cameIn: { count: 0, value: 0, pieces: 0 },
  expenses: 0,
  otherIncome: 0,
  net: 0,
};

/**
 * The real instants a pair of day keys cover, in the app's timezone.
 *
 * A day key is UTC midnight of a calendar date; a delivery's `invoiceDate` is
 * a real moment in the app's timezone. Matching the two means resolving the
 * key to the wall-clock day it refers to, so a purchase made at half past
 * nine in the evening lands on the shop's own calendar day — same rule as the
 * sales, which store a `dayKey` for exactly this reason.
 */
export function dayRangeInstants(from: string, to: string) {
  const start = instantFromDayKeyAndTime(parseDayKey(from), '00:00');
  const end = new Date(
    instantFromDayKeyAndTime(parseDayKey(shiftKey(to, 1)), '00:00').getTime() - 1,
  );
  return { start, end };
}

/** The deliveries a shop took in over a range, as one line of figures. */
export async function goodsIn(org: Types.ObjectId, from: string, to: string) {
  const { start, end } = dayRangeInstants(from, to);
  const [row] = await PurchaseModel.aggregate<{ count: number; value: number; pieces: number }>([
    { $match: { organization: org, invoiceDate: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        value: { $sum: '$total' },
        pieces: { $sum: { $sum: ['$lines.qtyPieces', { $ifNull: ['$lines.bonusPieces', 0] }] } },
      },
    },
  ]);
  return {
    count: row?.count ?? 0,
    value: money(row?.value ?? 0),
    pieces: row?.pieces ?? 0,
  };
}

/** Money handed out for the shop itself, over a range. */
async function spendFor(org: Types.ObjectId, from: string, to: string) {
  const { start, end } = dayRangeInstants(from, to);
  const [row] = await ExpenseModel.aggregate<{ count: number; amount: number }>([
    {
      $match: {
        organization: org,
        expenseDate: { $gte: start, $lte: end },
        deletedAt: null,
      },
    },
    { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);
  return { count: row?.count ?? 0, amount: money(row?.amount ?? 0) };
}

/** What returns took off the stretch's sales and its stock's cost. */
async function returnsFor(org: Types.ObjectId, from: string, to: string) {
  const { start, end } = dayRangeInstants(from, to);
  const [row] = await CashMoveModel.aggregate<{ value: number; cost: number }>([
    { $match: { organization: org, kind: 'refund', deletedAt: null, moveDate: { $gte: start, $lte: end } } },
    { $group: { _id: null, value: { $sum: '$returnValue' }, cost: { $sum: '$returnCost' } } },
  ]);
  return { value: row?.value ?? 0, cost: row?.cost ?? 0 };
}

/** Money in that is not a sale, over a range. */
async function incomeFor(org: Types.ObjectId, from: string, to: string) {
  const { start, end } = dayRangeInstants(from, to);
  const [row] = await IncomeModel.aggregate<{ amount: number }>([
    { $match: { organization: org, incomeDate: { $gte: start, $lte: end }, deletedAt: null } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  return money(row?.amount ?? 0);
}

/** What the shop itself cost, by what it was for. */
export async function expensesByCategory(org: Types.ObjectId, from: string, to: string) {
  const { start, end } = dayRangeInstants(from, to);
  const rows = await ExpenseModel.aggregate<{ _id: string; amount: number }>([
    {
      $match: {
        organization: org,
        expenseDate: { $gte: start, $lte: end },
        deletedAt: null,
      },
    },
    { $group: { _id: '$category', amount: { $sum: '$amount' } } },
    { $sort: { amount: -1 } },
  ]);
  return rows.map((r) => ({ category: r._id, amount: money(r.amount) }));
}

/** The bills in a range, as one row of totals. */
async function totalsFor(org: Types.ObjectId, from: string, to: string): Promise<RangeTotals> {
  const [[row], received, spent, earned, back] = await Promise.all([
    SaleModel.aggregate<{
      bills: number;
      sales: number;
      cost: number;
      due: number;
      itemsSold: number;
    }>([
      {
        $match: {
          /* Cast, always: an aggregation does not put a string through the
             schema, and an un-cast id reports itself as a zero. */
          organization: org,
          dayKey: { $gte: from, $lte: to },
          deletedAt: null,
          status: { $ne: 'void' },
        },
      },
      {
        $group: {
          _id: null,
          bills: { $sum: 1 },
          sales: { $sum: '$total' },
          cost: { $sum: '$cost' },
          due: { $sum: '$due' },
          itemsSold: { $sum: { $sum: '$lines.qtyPieces' } },
        },
      },
    ]),
    goodsIn(org, from, to),
    spendFor(org, from, to),
    incomeFor(org, from, to),
    returnsFor(org, from, to),
  ]);

  if (!row) {
    return {
      ...EMPTY,
      cameIn: received,
      expenses: spent.amount,
      otherIncome: earned,
      net: money(earned - spent.amount),
    };
  }

  /* Returns come off both, the same as on the Accounts page. */
  const sales = money(row.sales - back.value);
  const cost = money(row.cost - back.cost);
  const margin = money(sales - cost);
  return {
    bills: row.bills,
    sales,
    cost,
    margin,
    marginPercent: sales > 0 ? Math.round((margin / sales) * 1000) / 10 : 0,
    due: money(row.due),
    averageBill: row.bills > 0 ? money(sales / row.bills) : 0,
    itemsSold: row.itemsSold ?? 0,
    cameIn: received,
    expenses: spent.amount,
    otherIncome: earned,
    net: money(margin + earned - spent.amount),
  };
}

/** Every day in the range with a figure against it, the empty ones included. */
async function byDay(org: Types.ObjectId, from: string, to: string) {
  const rows = await SaleModel.aggregate<{
    _id: string;
    sales: number;
    cost: number;
    bills: number;
  }>([
    {
      $match: {
        organization: org,
        dayKey: { $gte: from, $lte: to },
        deletedAt: null,
        status: { $ne: 'void' },
      },
    },
    {
      $group: {
        _id: '$dayKey',
        sales: { $sum: '$total' },
        cost: { $sum: '$cost' },
        bills: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  /*
   * A day with no bills is a fact about the shop — a closed Friday, a hartal,
   * the day the shutter stayed down — and a chart that simply skips it draws a
   * straight line through the gap as though trade carried on.
   */
  const found = new Map(rows.map((r) => [r._id, r]));
  const out: { dayKey: string; sales: number; cost: number; margin: number; bills: number }[] = [];
  for (let key = from; key <= to; key = shiftKey(key, 1)) {
    const r = found.get(key);
    const sales = money(r?.sales ?? 0);
    const cost = money(r?.cost ?? 0);
    out.push({ dayKey: key, sales, cost, margin: money(sales - cost), bills: r?.bills ?? 0 });
  }
  return out;
}

/** What sold, ranked by what it earned rather than by how much of it left. */
async function topProducts(org: Types.ObjectId, from: string, to: string, limit = 12) {
  /* Net of what came back: a strip sold and returned earned nothing, and a
     product that is bought and returned all day is the opposite of a mover. */
  const netPieces = {
    $subtract: ['$lines.qtyPieces', { $ifNull: ['$lines.returnedPieces', 0] }],
  };

  return SaleModel.aggregate<{
    _id: Types.ObjectId;
    name: string;
    pieces: number;
    sales: number;
    margin: number;
  }>([
    {
      $match: {
        organization: org,
        dayKey: { $gte: from, $lte: to },
        deletedAt: null,
        status: { $ne: 'void' },
      },
    },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.product',
        name: { $last: '$lines.name' },
        pieces: { $sum: netPieces },
        sales: { $sum: { $multiply: [netPieces, '$lines.pricePerPiece'] } },
        margin: {
          $sum: {
            $multiply: [netPieces, { $subtract: ['$lines.pricePerPiece', '$lines.costPerPiece'] }],
          },
        },
      },
    },
    { $sort: { sales: -1 } },
    { $limit: limit },
  ]);
}

/**
 * Margin by the company the stock came from.
 *
 * Reached through the batch, because that is the only record of who supplied
 * these particular pieces — the same product arrives from a depot one month and
 * a Mitford wholesaler the next, at two different costs, and telling those two
 * apart is the whole of the question.
 */
async function bySupplier(org: Types.ObjectId, from: string, to: string) {
  return SaleModel.aggregate<{
    _id: Types.ObjectId | null;
    name: string;
    sales: number;
    cost: number;
  }>([
    {
      $match: {
        organization: org,
        dayKey: { $gte: from, $lte: to },
        deletedAt: null,
        status: { $ne: 'void' },
      },
    },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'stockbatches',
        localField: 'lines.batch',
        foreignField: '_id',
        as: 'batch',
        pipeline: [{ $project: { supplier: 1 } }],
      },
    },
    { $unwind: { path: '$batch', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'batch.supplier',
        foreignField: '_id',
        as: 'supplier',
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        /* Stock from before suppliers were recorded still sold, and saying so
           is better than dropping the money out of the report. */
        _id: '$batch.supplier',
        name: { $last: { $ifNull: ['$supplier.name', 'Not recorded'] } },
        sales: { $sum: '$lines.lineTotal' },
        cost: { $sum: { $multiply: ['$lines.qtyPieces', '$lines.costPerPiece'] } },
      },
    },
    { $sort: { sales: -1 } },
    { $limit: 20 },
  ]);
}

/**
 * Money asleep on the shelf.
 *
 * Stock that is held and did not sell one piece in the range, valued at what
 * the shop paid for it — which is the number that matters, because that is the
 * money it cannot spend on something that moves.
 */
async function deadStock(org: Types.ObjectId, from: string, to: string, limit = 25) {
  const sold = await SaleModel.aggregate<{ _id: Types.ObjectId }>([
    {
      $match: {
        organization: org,
        dayKey: { $gte: from, $lte: to },
        deletedAt: null,
        status: { $ne: 'void' },
      },
    },
    { $unwind: '$lines' },
    { $group: { _id: '$lines.product' } },
  ]);

  const movers = sold.map((s) => s._id);

  const held = await StockBatchModel.aggregate<{
    _id: Types.ObjectId;
    onHand: number;
    value: number;
  }>([
    { $match: { organization: org, qtyOnHand: { $gt: 0 }, product: { $nin: movers } } },
    {
      $group: {
        _id: '$product',
        onHand: { $sum: '$qtyOnHand' },
        value: { $sum: { $multiply: ['$qtyOnHand', '$costPerPiece'] } },
      },
    },
    { $sort: { value: -1 } },
    { $limit: limit },
  ]);

  const products = await ShopProductModel.find({
    _id: { $in: held.map((h) => h._id) },
    deletedAt: null,
  })
    .select('name strength rackLabel')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  /* A deleted product can still hold batches. It is not on the shelf to be
     chased, so it is not on this list either — the bin is its own screen. */
  return held
    .filter((h) => byId.has(String(h._id)))
    .map((h) => {
      const p = byId.get(String(h._id))!;
      return {
        _id: String(h._id),
        name: p.name,
        strength: p.strength ?? '',
        rackLabel: p.rackLabel ?? '',
        onHand: h.onHand,
        value: money(h.value),
      };
    });
}

/**
 * The owner's page, in one request.
 *
 * One call rather than six: every part of it is about the same range, and six
 * requests that each re-read the same bills is six times the work for a screen
 * that gets looked at while the shutter is coming down.
 */
export async function ownerReport(actor: Actor, opts: { from?: string; to?: string } = {}) {
  /* Earlier returns that never reached the accounts, written in once. */
  await backfillRefunds(actor.org).catch(() => 0);
  const range = rangeOf(opts);
  const org = new Types.ObjectId(actor.org);

  const [now, before, days, top, suppliers, dead, expenseCategories] = await Promise.all([
    totalsFor(org, range.from, range.to),
    totalsFor(org, range.previousFrom, range.previousTo),
    byDay(org, range.from, range.to),
    topProducts(org, range.from, range.to),
    bySupplier(org, range.from, range.to),
    deadStock(org, range.from, range.to),
    expensesByCategory(org, range.from, range.to),
  ]);

  return {
    range,
    now,
    before,
    byDay: days,
    topProducts: top.map((p) => ({
      _id: String(p._id),
      name: p.name,
      pieces: p.pieces,
      sales: money(p.sales),
      margin: money(p.margin),
    })),
    bySupplier: suppliers.map((s) => {
      const sales = money(s.sales);
      const cost = money(s.cost);
      const margin = money(sales - cost);
      return {
        _id: s._id ? String(s._id) : '',
        name: s.name,
        sales,
        cost,
        margin,
        marginPercent: sales > 0 ? Math.round((margin / sales) * 1000) / 10 : 0,
      };
    }),
    deadStock: dead,
    expenseCategories,
  };
}

/**
 * What came in today, for the evening screen and the day's sheet.
 *
 * The day summary is the till's — salesman-shaped, and it knows nothing about
 * the companies' vans. Deliveries are the owner's business, so they come in on
 * the admin's report router rather than being smuggled into the counter's.
 */
export async function todayGoodsIn(actor: Actor) {
  const org = new Types.ObjectId(actor.org);
  const today = formatDayKey(parseDayKey());
  return { dayKey: today, cameIn: await goodsIn(org, today, today) };
}

/** Exported for the tests, which are about the arithmetic, not the database. */
export const __testables = { shiftKey, daysBetween, dayRangeInstants };

/* ------------------------------------------------------- what needs doing -- */

/**
 * The five things that quietly get worse while nobody is looking.
 *
 * Every one of these already had a screen, and a screen only tells somebody who
 * goes to look. Stock goes out of date on a shelf nobody opens, a strip sells
 * out and is never reordered, an order is given to a rep and never chased, and
 * the khata grows. So: one small count of each, cheap enough to sit on the page
 * the owner opens every evening anyway.
 *
 * Counts and money only. Anything that wants a list has a screen of its own,
 * and this is the thing that sends them to it.
 */
export async function needsAttention(actor: Actor) {
  const org = new Types.ObjectId(actor.org);
  const now = new Date();
  const soon = new Date(now.getTime() + 90 * DAY);

  const [expiry, lowStock, orders, khata] = await Promise.all([
    StockBatchModel.aggregate<{ _id: 'expired' | 'soon'; items: number; value: number }>([
      {
        $match: {
          organization: org,
          qtyOnHand: { $gt: 0 },
          expiry: { $ne: null, $lte: soon },
        },
      },
      {
        $group: {
          /* Past its date is a different job from about to be: one is written
             off or goes back to the company, the other is sold first. */
          _id: { $cond: [{ $lte: ['$expiry', now] }, 'expired', 'soon'] },
          items: { $sum: 1 },
          value: { $sum: { $multiply: ['$qtyOnHand', '$costPerPiece'] } },
        },
      },
    ]),
    /* Below the level the shop itself set — a level of zero means never chase
       it, and most of a long tail is deliberately stocked once. */
    ShopProductModel.aggregate<{ _id: null; count: number }>([
      {
        $match: { organization: org, isActive: true, deletedAt: null, reorderLevel: { $gt: 0 } },
      },
      {
        $lookup: {
          from: 'stockbatches',
          let: { product: '$_id' },
          as: 'held',
          pipeline: [
            { $match: { $expr: { $eq: ['$product', '$$product'] } } },
            { $group: { _id: null, onHand: { $sum: '$qtyOnHand' } } },
          ],
        },
      },
      {
        $match: {
          $expr: {
            $lte: [{ $ifNull: [{ $first: '$held.onHand' }, 0] }, '$reorderLevel'],
          },
        },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    ShopOrderModel.countDocuments({ organization: org, status: { $in: ['open', 'sent'] } }),
    ShopCustomerModel.aggregate<{ _id: null; count: number; owed: number }>([
      { $match: { organization: org, deletedAt: null, balance: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, owed: { $sum: '$balance' } } },
    ]),
  ]);

  const expired = expiry.find((e) => e._id === 'expired');
  const goingOff = expiry.find((e) => e._id === 'soon');

  return {
    expired: { batches: expired?.items ?? 0, value: money(expired?.value ?? 0) },
    expiringSoon: { batches: goingOff?.items ?? 0, value: money(goingOff?.value ?? 0), days: 90 },
    toReorder: lowStock[0]?.count ?? 0,
    ordersWaiting: orders,
    khata: { customers: khata[0]?.count ?? 0, owed: money(khata[0]?.owed ?? 0) },
  };
}
