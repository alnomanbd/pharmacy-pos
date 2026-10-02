import {
  OrganizationModel,
  PaymentModel,
  SupportThreadModel,
  LeadModel,
  MedicineRequestModel,
  ShopNoteModel,
} from '../models/index.js';
import { everyPlan, monthlyPrice } from './plan.service.js';
import { branchCounts } from './branch.service.js';
import { endOfDay } from './shopNote.service.js';
import { breakdown } from './leaving.service.js';

/**
 * The console's first page: how the business is doing, and what needs doing.
 *
 * Until this existed the answers were spread over the shop list (how many),
 * Sales (how much) and the bell (what is waiting), and nobody could say at a
 * glance what the platform earns in a month or how many trials became paying
 * shops.
 *
 * Money is only included for whoever may see it (`revenue.view`): a support
 * agent who can see a shop's payments is not thereby told what the company
 * turns over.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const monthStart = (d: Date, back = 0) => new Date(d.getFullYear(), d.getMonth() - back, 1);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Monthly recurring revenue: what the shops paying right now are worth each
 * month, at their plan's price. Pure, for the tests.
 */
export function mrrOf(
  shops: { plan: string; paidUntil: Date | null; branches?: number }[],
  priceOf: (plan: string) => { price: number; isTrial: boolean; includedBranches?: number; extraBranchPrice?: number } | undefined,
  now = new Date(),
) {
  let mrr = 0;
  let paying = 0;
  for (const s of shops) {
    const p = priceOf(s.plan);
    if (!p || p.isTrial || !s.paidUntil || s.paidUntil <= now) continue;
    // What this shop pays a month, its extra branches included.
    mrr += monthlyPrice(p, s.branches ?? 1).total;
    paying++;
  }
  return { mrr, paying };
}

/** Of the shops that signed up in a period, the share that has paid at least once — as a whole percent. */
export function conversionRate(signedUp: number, paid: number) {
  return signedUp > 0 ? Math.round((paid / signedUp) * 100) : null;
}

export async function overview(opts: { money: boolean }) {
  const now = new Date();
  const thisMonth = monthStart(now);
  const lastMonth = monthStart(now, 1);
  const sixMonthsAgo = monthStart(now, 5);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);

  const [plans, live, statusCounts, signupsByMonth, recent, everPaid] = await Promise.all([
    everyPlan(),
    OrganizationModel.find({ status: 'active' }).select('plan trialEndsAt').lean(),
    OrganizationModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    OrganizationModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+06:00' } }, n: { $sum: 1 } } },
    ]),
    OrganizationModel.find({ createdAt: { $gte: ninetyDaysAgo } }).select('_id').lean(),
    PaymentModel.distinct('organization', { status: 'verified' }),
  ]);

  const planOf = new Map(plans.map((p) => [p.key, p]));
  const isTrial = (key: string) => planOf.get(key)?.isTrial ?? key === 'trial';
  const branchesOf = await branchCounts(live.map((o) => o._id));
  const { mrr, paying } = mrrOf(
    live.map((o) => ({ plan: o.plan, paidUntil: o.trialEndsAt ? new Date(o.trialEndsAt) : null, branches: branchesOf(o._id) })),
    (k) => planOf.get(k),
    now,
  );
  const onTrial = live.filter((o) => isTrial(o.plan) && o.trialEndsAt && new Date(o.trialEndsAt) > now).length;
  const status = Object.fromEntries(statusCounts.map((r) => [r._id, r.n]));

  const paidSet = new Set(everPaid.map(String));
  const recentPaid = recent.filter((o) => paidSet.has(String(o._id))).length;

  // Paid at least once, and the paid time ran out in the last 30 days without a renewal.
  const lost = await OrganizationModel.countDocuments({
    _id: { $in: everPaid },
    trialEndsAt: { $gte: thirtyDaysAgo, $lt: now },
  });

  const months = Array.from({ length: 6 }, (_, i) => monthKey(monthStart(now, 5 - i)));
  const signups = new Map(signupsByMonth.map((r) => [r._id, r.n]));

  const [pendingPayments, supportWaiting, newLeads, pendingRequests, followUps, renewalsDue] = await Promise.all([
    PaymentModel.countDocuments({ status: 'pending' }),
    SupportThreadModel.countDocuments({ status: 'open', unreadForPlatform: { $gt: 0 } }),
    LeadModel.countDocuments({ status: 'new' }),
    MedicineRequestModel.countDocuments({ status: 'pending' }),
    ShopNoteModel.countDocuments({ followUpAt: { $ne: null, $lte: endOfDay(now) }, doneAt: null }),
    OrganizationModel.countDocuments({ status: 'active', trialEndsAt: { $gte: now, $lte: weekAhead } }),
  ]);

  const base = {
    shops: {
      paying,
      onTrial,
      pending: status.pending ?? 0,
      suspended: status.suspended ?? 0,
      total: Object.values(status).reduce((a, b) => a + b, 0),
    },
    signups: {
      thisMonth: signups.get(monthKey(thisMonth)) ?? 0,
      lastMonth: signups.get(monthKey(lastMonth)) ?? 0,
      byMonth: months.map((m) => ({ month: m, count: signups.get(m) ?? 0 })),
    },
    conversion: { signedUp: recent.length, paid: recentPaid, rate: conversionRate(recent.length, recentPaid) },
    lost30d: lost,
    leaving: await breakdown(90),
    todo: {
      pendingPayments,
      pendingApprovals: status.pending ?? 0,
      supportWaiting,
      newDemoRequests: newLeads,
      pendingMedicineRequests: pendingRequests,
      followUpsDue: followUps,
      renewalsDue7d: renewalsDue,
    },
  };

  if (!opts.money) return { ...base, money: null };

  const revenue = await PaymentModel.aggregate<{ _id: string; total: number }>([
    { $match: { status: 'verified', reviewedAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$reviewedAt', timezone: '+06:00' } }, total: { $sum: '$amount' } } },
  ]);
  const byMonth = new Map(revenue.map((r) => [r._id, r.total]));
  return {
    ...base,
    money: {
      mrr,
      thisMonth: byMonth.get(monthKey(thisMonth)) ?? 0,
      lastMonth: byMonth.get(monthKey(lastMonth)) ?? 0,
      byMonth: months.map((m) => ({ month: m, total: byMonth.get(m) ?? 0 })),
    },
  };
}
