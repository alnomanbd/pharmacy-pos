import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { OrganizationModel, PaymentModel, PlanModel } from '../models/index.js';

/**
 * What the platform itself is earning.
 *
 * Every other number in this deployment is a shop's — bills rung up, stock
 * bought, dues collected. This is ours: the subscription money, day by
 * day, and who it came from. Without it "how did we do this month" was a
 * question somebody answered by counting rows on the Payments page.
 *
 * A sale is a **verified** payment, dated by `reviewedAt`. Not `createdAt`: a
 * shop submits a claim whenever it likes and an operator checks it later, so
 * booking the money on submission would credit us for money we had not
 * confirmed, and would move last month's total every time an old claim was
 * finally rejected. The unverified pile is reported separately as `pending` —
 * it is a pipeline, not revenue.
 *
 * Everything is aggregated on demand from the payments themselves. There is no
 * ledger to drift out of step, and at one row per subscription payment there
 * will not need to be for a long time.
 */

export type Granularity = 'day' | 'week' | 'month';

export interface RevenuePoint {
  /** The bucket's key: `2026-09-03`, `2026-W36` or `2026-09`. */
  period: string;
  /** How to print it on an axis. */
  label: string;
  total: number;
  count: number;
}

const DAY_MS = 86_400_000;

/* ------------------------------- date keys -------------------------------- */

/**
 * Calendar day of an instant, as seen in the app timezone.
 *
 * Days are grouped in Dhaka time rather than UTC for the same reason the shop's
 * own reports do it: a payment accepted at 8pm here is today's sale, and
 * grouping on the raw instant would file every evening under tomorrow.
 */
export function dayKeyOf(instant: Date, tz: string = env.appTz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** `2026-09-03` → `2026-W36`, ISO 8601: weeks start Monday, week 1 holds Jan 4. */
export function isoWeekKeyOf(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Shift to this week's Thursday: the ISO year is whichever year that Thursday
  // falls in, which is the whole trick around New Year.
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Which bucket a day belongs to, at the requested granularity. */
export function bucketKeyOf(dayKey: string, granularity: Granularity) {
  if (granularity === 'month') return dayKey.slice(0, 7);
  if (granularity === 'week') return isoWeekKeyOf(dayKey);
  return dayKey;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-03` → `03 Sep`; `2026-W36` → `W36 2026`; `2026-09` → `Sep 2026`. */
export function bucketLabel(key: string, granularity: Granularity) {
  if (granularity === 'month') {
    const [y, m] = key.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (granularity === 'week') {
    const [y, w] = key.split('-W');
    return `W${w} ${y}`;
  }
  const [, m, d] = key.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/**
 * Every calendar day in the range, in the app timezone.
 *
 * Stepping in whole days from noon — rather than doing arithmetic on a local
 * Date — keeps a DST-shifted zone from dropping or doubling a day. Dhaka has no
 * DST, but this function should not be the reason a second deployment cannot.
 */
export function enumerateDayKeys(from: Date, to: Date, tz: string = env.appTz) {
  const keys: string[] = [];
  const firstKey = dayKeyOf(from, tz);
  const lastKey = dayKeyOf(to, tz);
  if (lastKey < firstKey) return keys;

  const cursor = new Date(from.getTime());
  cursor.setUTCHours(12, 0, 0, 0);
  // A guard, not a limit: ten years of days, so a nonsense range cannot spin.
  for (let i = 0; i < 4000; i++) {
    const key = dayKeyOf(cursor, tz);
    if (key > lastKey) break;
    if (key >= firstKey && key !== keys[keys.length - 1]) keys.push(key);
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return keys;
}

export type DailyTotals = Map<string, { total: number; count: number }>;

/**
 * Daily totals rolled up into buckets, with the empty ones kept.
 *
 * A gap in the series is information — it is the week nobody paid — and a chart
 * that silently closes it up reads as a steady business rather than a stalled
 * one.
 */
export function rollUp(daily: DailyTotals, dayKeys: string[], granularity: Granularity): RevenuePoint[] {
  const out = new Map<string, RevenuePoint>();
  for (const day of dayKeys) {
    const key = bucketKeyOf(day, granularity);
    const point =
      out.get(key) ?? { period: key, label: bucketLabel(key, granularity), total: 0, count: 0 };
    const hit = daily.get(day);
    if (hit) {
      point.total += hit.total;
      point.count += hit.count;
    }
    out.set(key, point);
  }
  return [...out.values()];
}

/** Sum a set of days out of a daily map. */
export function sumOf(daily: DailyTotals, days: string[]) {
  return days.reduce(
    (acc, d) => {
      const hit = daily.get(d);
      return hit ? { total: acc.total + hit.total, count: acc.count + hit.count } : acc;
    },
    { total: 0, count: 0 },
  );
}

/* ------------------------------- aggregates -------------------------------- */

/** The date a sale is booked on: when an operator accepted the money. */
const SALE_DATE = { $ifNull: ['$reviewedAt', '$createdAt'] };

const verifiedBetween = (from: Date, to: Date) => ({
  status: 'verified',
  $expr: { $and: [{ $gte: [SALE_DATE, from] }, { $lte: [SALE_DATE, to] }] },
});

async function dailyTotals(from: Date, to: Date): Promise<DailyTotals> {
  const rows = await PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
    { $match: verifiedBetween(from, to) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: SALE_DATE, timezone: env.appTz } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return new Map(rows.map((r) => [r._id, { total: r.total, count: r.count }]));
}

/* --------------------------------- report ---------------------------------- */

/**
 * Sales for a period, plus the standing today/week/month/year figures.
 *
 * The tiles are deliberately *not* derived from the selected range: "what did we
 * sell today" is the question this page gets opened for, and it should still be
 * answered when somebody has left the range set to last quarter.
 */
export async function platformRevenue(
  opts: { from?: string; to?: string; granularity?: Granularity } = {},
) {
  const now = new Date();
  const to = (() => {
    const t = opts.to ? new Date(opts.to) : new Date(now);
    t.setHours(23, 59, 59, 999);
    return t;
  })();
  const from = opts.from ? new Date(opts.from) : new Date(to.getTime() - 29 * DAY_MS);
  from.setHours(0, 0, 0, 0);

  const granularity: Granularity =
    opts.granularity === 'week' || opts.granularity === 'month' ? opts.granularity : 'day';

  const todayKey = dayKeyOf(now);
  const year = todayKey.slice(0, 4);
  // One aggregate feeds all four standing tiles, so it starts far enough back to
  // cover the longest of them — the year, plus the days of the ISO week that
  // may hang over from December.
  const tilesFrom = new Date(`${Number(year) - 1}-12-20T00:00:00.000Z`);

  const [
    rangeDaily,
    tileDaily,
    allTime,
    byPlanRows,
    byMethodRows,
    topShopRows,
    pendingRows,
    firstSales,
    subscriberRows,
    plans,
  ] = await Promise.all([
    dailyTotals(from, to),
    dailyTotals(tilesFrom, now),
    PaymentModel.aggregate<{ _id: null; total: number; count: number }>([
      { $match: { status: 'verified' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    PaymentModel.aggregate<{ _id: string; total: number; count: number; months: number }>([
      { $match: verifiedBetween(from, to) },
      {
        $group: {
          _id: '$plan',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          months: { $sum: '$months' },
        },
      },
      { $sort: { total: -1 } },
    ]),
    PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: verifiedBetween(from, to) },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    PaymentModel.aggregate<{
      _id: Types.ObjectId;
      total: number;
      count: number;
      name: string;
      plan: string;
      last: Date;
    }>([
      { $match: verifiedBetween(from, to) },
      {
        $group: {
          _id: '$organization',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          last: { $max: SALE_DATE },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'organizations', localField: '_id', foreignField: '_id', as: 'org' } },
      {
        $project: {
          total: 1,
          count: 1,
          last: 1,
          name: { $ifNull: [{ $first: '$org.name' }, 'Unknown shop'] },
          plan: { $ifNull: [{ $first: '$org.plan' }, ''] },
        },
      },
    ]),
    // Money claimed but not yet accepted: the pipeline, and a nudge to go and
    // check it — every row in it is a shop waiting on us.
    PaymentModel.aggregate<{ _id: null; total: number; count: number }>([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // When each paying shop first bought anything. A sale in the range whose
    // shop's first-ever purchase also falls in the range is a new customer;
    // the rest are renewals. Winning somebody and keeping somebody are
    // different problems, and one number hides which of them you have.
    PaymentModel.aggregate<{ _id: Types.ObjectId; firstAt: Date }>([
      { $match: { status: 'verified' } },
      { $group: { _id: '$organization', firstAt: { $min: SALE_DATE } } },
    ]),
    OrganizationModel.aggregate<{ _id: null; paying: number; expiring: number; trial: number }>([
      {
        $addFields: {
          // A paid subscription is a non-trial plan that has not run out;
          // `trialEndsAt` carries the expiry for both, see verifyPayment.
          live: {
            $and: [
              { $ne: ['$plan', 'trial'] },
              { $gt: [{ $ifNull: ['$trialEndsAt', new Date(0)] }, now] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          paying: { $sum: { $cond: ['$live', 1, 0] } },
          expiring: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$live',
                    { $lte: ['$trialEndsAt', new Date(now.getTime() + 30 * DAY_MS)] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          trial: { $sum: { $cond: [{ $eq: ['$plan', 'trial'] }, 1, 0] } },
        },
      },
    ]),
    PlanModel.find({}).select('key name').lean(),
  ]);

  const series = rollUp(rangeDaily, enumerateDayKeys(from, to), granularity);

  /** The day keys each standing tile covers, measured in the app timezone. */
  const tileDays = (() => {
    const yearDays = enumerateDayKeys(tilesFrom, now).filter((d) => d.startsWith(year));
    const thisWeek = isoWeekKeyOf(todayKey);
    return {
      today: [todayKey],
      // The current week can start in December, so it is taken from the wider
      // window rather than from the year's own days.
      week: enumerateDayKeys(tilesFrom, now).filter((d) => isoWeekKeyOf(d) === thisWeek),
      month: yearDays.filter((d) => d.startsWith(todayKey.slice(0, 7))),
      year: yearDays,
    };
  })();

  const planName = new Map(plans.map((p) => [p.key, p.name]));
  const total = series.reduce((s, p) => s + p.total, 0);
  const count = series.reduce((s, p) => s + p.count, 0);
  const newCustomers = firstSales.filter((r) => r.firstAt >= from && r.firstAt <= to).length;
  const sub = subscriberRows[0] ?? { paying: 0, expiring: 0, trial: 0 };

  return {
    currency: 'BDT',
    range: { from, to, granularity },
    /** Answers "how did we do" regardless of the range the page is set to. */
    summary: {
      today: sumOf(tileDaily, tileDays.today),
      week: sumOf(tileDaily, tileDays.week),
      month: sumOf(tileDaily, tileDays.month),
      year: sumOf(tileDaily, tileDays.year),
      allTime: { total: allTime[0]?.total ?? 0, count: allTime[0]?.count ?? 0 },
      pending: { total: pendingRows[0]?.total ?? 0, count: pendingRows[0]?.count ?? 0 },
    },
    period: {
      total,
      count,
      /** What one sale is worth on average — the number a price change moves. */
      average: count ? Math.round(total / count) : 0,
      newCustomers,
      renewals: Math.max(0, count - newCustomers),
    },
    subscribers: {
      paying: sub.paying,
      /** Paying shops whose subscription runs out inside a month. Call them. */
      expiringIn30Days: sub.expiring,
      onTrial: sub.trial,
    },
    series,
    byPlan: byPlanRows.map((r) => ({
      plan: r._id || 'unknown',
      name: planName.get(r._id) || r._id || 'Unknown plan',
      total: r.total,
      count: r.count,
      months: r.months,
    })),
    byMethod: byMethodRows.map((r) => ({
      method: r._id || 'unknown',
      total: r.total,
      count: r.count,
    })),
    topShops: topShopRows.map((r) => ({
      id: String(r._id),
      name: r.name,
      plan: r.plan,
      total: r.total,
      count: r.count,
      lastPaidAt: r.last,
    })),
  };
}
