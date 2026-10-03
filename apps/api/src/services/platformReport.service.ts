import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { OrganizationModel, PaymentModel, SaleModel } from '../models/index.js';
import { OnlineOrderModel } from './onlineOrder.service.js';
import { badRequest } from '../utils/AppError.js';
import { dayKeyOf, enumerateDayKeys } from './revenue.service.js';
import { dayRangeInstants } from './shopReport.service.js';

/**
 * The console's stretch: any run of days against the same number of days just
 * before it — the question the platform's owner asks sitting down, the same
 * one a shop owner asks of their own shop.
 *
 * Three things, each as a total, a day-by-day line, and last time's figure:
 *
 * - **Money** (only for whoever may see it): what was received, by plan and by
 *   method, and who paid most.
 * - **Growth**: sign-ups, shops that paid for the first time, shops lost —
 *   paid before, and their subscription ran out in the stretch.
 * - **Use**: what the shops sold through Dawai, how many bills, how many shops
 *   sold at all, the busiest, and the paying shops that have gone quiet — the
 *   ones about to be lost.
 */

const DAY_MS = 86_400_000;
const money = (n: number) => Math.round(n * 100) / 100;

/** The date a payment is booked on: when an operator accepted it. */
const PAID_AT = { $ifNull: ['$reviewedAt', '$createdAt'] };

function rangeOf(opts: { from?: string; to?: string }) {
  const now = new Date();
  const toKey = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? opts.to : dayKeyOf(now);
  const fromKey = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? opts.from : dayKeyOf(new Date(now.getTime() - 29 * DAY_MS));
  if (fromKey > toKey) throw badRequest('That range runs backwards');
  /* Day keys are the app's calendar days; the instants are those days' bounds in the app's timezone. */
  const { start: from, end: to } = dayRangeInstants(fromKey, toKey);
  const days = Math.round((to.getTime() + 1 - from.getTime()) / DAY_MS);
  if (days > 400) throw badRequest('Pick at most about a year');
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  return { from, to, prevFrom, prevTo, days, keys: enumerateDayKeys(from, to), prevKeys: enumerateDayKeys(prevFrom, prevTo) };
}

type Daily = Map<string, { total: number; count: number }>;
const series = (keys: string[], m: Daily) => keys.map((k) => ({ dayKey: k, total: money(m.get(k)?.total ?? 0), count: m.get(k)?.count ?? 0 }));
const sum = (m: Daily, keys: string[]) => keys.reduce((a, k) => ({ total: a.total + (m.get(k)?.total ?? 0), count: a.count + (m.get(k)?.count ?? 0) }), { total: 0, count: 0 });

async function paymentsDaily(from: Date, to: Date): Promise<Daily> {
  const rows = await PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
    { $match: { status: 'verified', $expr: { $and: [{ $gte: [PAID_AT, from] }, { $lte: [PAID_AT, to] }] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: PAID_AT, timezone: env.appTz } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, { total: r.total, count: r.count }]));
}

async function signupsDaily(from: Date, to: Date): Promise<Daily> {
  const rows = await OrganizationModel.aggregate<{ _id: string; count: number }>([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: env.appTz } }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, { total: r.count, count: r.count }]));
}

/** What the shops sold through Dawai, by their own calendar day. */
async function shopSalesDaily(fromKey: string, toKey: string): Promise<Daily> {
  const rows = await SaleModel.aggregate<{ _id: string; total: number; count: number }>([
    { $match: { dayKey: { $gte: fromKey, $lte: toKey }, deletedAt: null, status: { $ne: 'void' } } },
    { $group: { _id: '$dayKey', total: { $sum: '$total' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, { total: r.total, count: r.count }]));
}

async function activeShops(fromKey: string, toKey: string) {
  return (await SaleModel.distinct('organization', { dayKey: { $gte: fromKey, $lte: toKey }, deletedAt: null, status: { $ne: 'void' } })).length;
}

/** Shops whose first accepted payment falls in the stretch — won, rather than kept. */
async function firstPaid(from: Date, to: Date) {
  const rows = await PaymentModel.aggregate<{ _id: Types.ObjectId; first: Date }>([
    { $match: { status: 'verified' } },
    { $group: { _id: '$organization', first: { $min: PAID_AT } } },
    { $match: { first: { $gte: from, $lte: to } } },
  ]);
  return rows.length;
}

/** Shops that had paid, whose subscription ran out in the stretch and has not been renewed since. */
async function lostShops(from: Date, to: Date, now: Date) {
  const payers = await PaymentModel.distinct('organization', { status: 'verified' });
  const end = to < now ? to : now;
  return OrganizationModel.find({ _id: { $in: payers }, plan: { $ne: 'trial' }, trialEndsAt: { $gte: from, $lte: end } })
    .select('name plan trialEndsAt')
    .sort({ trialEndsAt: -1 })
    .lean();
}

export async function platformStretch(opts: { from?: string; to?: string }, access: { money: boolean }) {
  const r = rangeOf(opts);
  const now = new Date();
  const fromKey = r.keys[0];
  const toKey = r.keys[r.keys.length - 1];
  const prevFromKey = r.prevKeys[0];
  const prevToKey = r.prevKeys[r.prevKeys.length - 1];

  const [
    pay,
    payBefore,
    sign,
    signBefore,
    sold,
    soldBefore,
    active,
    activeBefore,
    won,
    wonBefore,
    lost,
    lostBefore,
    ordersNow,
    ordersBefore,
    topShops,
    payers,
  ] = await Promise.all([
    access.money ? paymentsDaily(r.from, r.to) : Promise.resolve(new Map() as Daily),
    access.money ? paymentsDaily(r.prevFrom, r.prevTo) : Promise.resolve(new Map() as Daily),
    signupsDaily(r.from, r.to),
    signupsDaily(r.prevFrom, r.prevTo),
    shopSalesDaily(fromKey, toKey),
    shopSalesDaily(prevFromKey, prevToKey),
    activeShops(fromKey, toKey),
    activeShops(prevFromKey, prevToKey),
    firstPaid(r.from, r.to),
    firstPaid(r.prevFrom, r.prevTo),
    lostShops(r.from, r.to, now),
    lostShops(r.prevFrom, r.prevTo, now),
    OnlineOrderModel.countDocuments({ createdAt: { $gte: r.from, $lte: r.to } }),
    OnlineOrderModel.countDocuments({ createdAt: { $gte: r.prevFrom, $lte: r.prevTo } }),
    SaleModel.aggregate<{ _id: Types.ObjectId; total: number; bills: number; name: string; plan: string }>([
      { $match: { dayKey: { $gte: fromKey, $lte: toKey }, deletedAt: null, status: { $ne: 'void' } } },
      { $group: { _id: '$organization', total: { $sum: '$total' }, bills: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
      { $project: { total: 1, bills: 1, name: { $ifNull: [{ $first: '$org.name' }, 'A shop'] }, plan: { $ifNull: [{ $first: '$org.plan' }, ''] } } },
    ]),
    /* Paying today: a non-trial plan that has not run out. */
    OrganizationModel.find({ plan: { $ne: 'trial' }, trialEndsAt: { $gt: now }, status: 'active' }).select('name plan trialEndsAt').lean(),
  ]);

  /* Paying shops that sold nothing in the stretch — on the way to being lost. */
  const sellers = new Set((await SaleModel.distinct('organization', { dayKey: { $gte: fromKey, $lte: toKey }, deletedAt: null })).map(String));
  const quiet = payers
    .filter((p) => !sellers.has(String(p._id)))
    .map((p) => ({ id: String(p._id), name: p.name, plan: p.plan, paidUntil: p.trialEndsAt }))
    .slice(0, 20);

  const growth = {
    signups: { now: sum(sign, r.keys).count, before: sum(signBefore, r.prevKeys).count, series: series(r.keys, sign), prev: series(r.prevKeys, signBefore) },
    firstPaid: { now: won, before: wonBefore },
    lost: { now: lost.length, before: lostBefore.length, shops: lost.slice(0, 20).map((o) => ({ id: String(o._id), name: o.name, plan: o.plan, endedAt: o.trialEndsAt })) },
  };
  const use = {
    sold: { now: money(sum(sold, r.keys).total), before: money(sum(soldBefore, r.prevKeys).total) },
    bills: { now: sum(sold, r.keys).count, before: sum(soldBefore, r.prevKeys).count },
    activeShops: { now: active, before: activeBefore },
    onlineOrders: { now: ordersNow, before: ordersBefore },
    series: series(r.keys, sold),
    prev: series(r.prevKeys, soldBefore),
    topShops: topShops.map((s) => ({ id: String(s._id), name: s.name, plan: s.plan, total: money(s.total), bills: s.bills })),
    quiet,
    payingNow: payers.length,
  };

  if (!access.money) {
    return { range: { from: fromKey, to: toKey, prevFrom: prevFromKey, prevTo: prevToKey, days: r.days }, money: null, growth, use };
  }

  const [byPlan, byMethod, topPayers] = await Promise.all([
    PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { status: 'verified', $expr: { $and: [{ $gte: [PAID_AT, r.from] }, { $lte: [PAID_AT, r.to] }] } } },
      { $group: { _id: '$plan', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { status: 'verified', $expr: { $and: [{ $gte: [PAID_AT, r.from] }, { $lte: [PAID_AT, r.to] }] } } },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    PaymentModel.aggregate<{ _id: Types.ObjectId; total: number; count: number; name: string }>([
      { $match: { status: 'verified', $expr: { $and: [{ $gte: [PAID_AT, r.from] }, { $lte: [PAID_AT, r.to] }] } } },
      { $group: { _id: '$organization', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
      { $project: { total: 1, count: 1, name: { $ifNull: [{ $first: '$org.name' }, 'A shop'] } } },
    ]),
  ]);
  const paid = sum(pay, r.keys);
  const paidBefore = sum(payBefore, r.prevKeys);
  return {
    range: { from: fromKey, to: toKey, prevFrom: prevFromKey, prevTo: prevToKey, days: r.days },
    money: {
      received: { now: money(paid.total), before: money(paidBefore.total) },
      payments: { now: paid.count, before: paidBefore.count },
      series: series(r.keys, pay),
      prev: series(r.prevKeys, payBefore),
      byPlan: byPlan.map((p) => ({ plan: p._id || '—', total: money(p.total), count: p.count })),
      byMethod: byMethod.map((p) => ({ method: p._id || '—', total: money(p.total), count: p.count })),
      topPayers: topPayers.map((p) => ({ id: String(p._id), name: p.name, total: money(p.total), count: p.count })),
    },
    growth,
    use,
  };
}
