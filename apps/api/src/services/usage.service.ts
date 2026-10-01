import { Types } from 'mongoose';
import { SaleModel, PurchaseModel } from '../models/index.js';

/**
 * What each shop is actually doing with the product.
 *
 * For pricing: what a shop's month looks like. For retention: which shops are
 * growing and which have quietly stopped — a shop that rang up 900 bills in
 * March and 90 in April is about to leave, and that is knowable a month before
 * the renewal is not paid. Computed on demand from the sales themselves, never
 * from a counter kept on the write path, which drifts the first time a write
 * fails halfway.
 */

export interface MonthlyUsage {
  /** `YYYY-MM`. */
  month: string;
  bills: number;
  takings: number;
  purchases: number;
}

/** The first day of the month, `months` back, in UTC. */
function monthsAgo(months: number) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - months + 1);
  return d;
}

const monthKey = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };

/** A shop's last N months, every month present — a gap is the signal. */
export async function usageForOrganization(orgId: string, months = 6): Promise<MonthlyUsage[]> {
  const since = monthsAgo(months);
  const organization = new Types.ObjectId(orgId);

  const [sales, purchases] = await Promise.all([
    SaleModel.aggregate<{ _id: string; n: number; takings: number }>([
      { $match: { organization, createdAt: { $gte: since }, status: { $ne: 'void' } } },
      { $group: { _id: monthKey, n: { $sum: 1 }, takings: { $sum: { $ifNull: ['$total', 0] } } } },
    ]),
    PurchaseModel.aggregate<{ _id: string; n: number }>([
      { $match: { organization, createdAt: { $gte: since } } },
      { $group: { _id: monthKey, n: { $sum: 1 } } },
    ]),
  ]);

  const s = new Map(sales.map((r) => [r._id, r]));
  const p = new Map(purchases.map((r) => [r._id, r.n]));

  const out: MonthlyUsage[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const month = d.toISOString().slice(0, 7);
    out.push({
      month,
      bills: s.get(month)?.n ?? 0,
      takings: Math.round(s.get(month)?.takings ?? 0),
      purchases: p.get(month) ?? 0,
    });
  }
  return out;
}

/** The whole deployment by month, plus the busiest shops — who to talk to before changing a price. */
export async function platformUsage(months = 6) {
  const since = monthsAgo(months);
  const live = { createdAt: { $gte: since }, status: { $ne: 'void' } };

  const [byMonth, topShops] = await Promise.all([
    SaleModel.aggregate<{ _id: string; n: number }>([
      { $match: live },
      { $group: { _id: monthKey, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    SaleModel.aggregate<{ _id: unknown; n: number; name: string }>([
      { $match: live },
      { $group: { _id: '$organization', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
      { $project: { n: 1, name: { $ifNull: [{ $first: '$org.name' }, 'Unknown'] } } },
    ]),
  ]);

  return {
    months,
    billsByMonth: byMonth.map((r) => ({ month: r._id, bills: r.n })),
    topShops: topShops.map((r) => ({ id: String(r._id), name: r.name, bills: r.n })),
  };
}
