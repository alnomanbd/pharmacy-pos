import { Types } from 'mongoose';
import { OrganizationModel, SaleModel, UserModel } from '../models/index.js';
import { everyPlan } from './plan.service.js';
import * as notify from './notification.service.js';
import { sendSms } from '../integrations/sms.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { setupForMany } from './onboarding.service.js';
import { latestFor, LEAVING_LABEL } from './leaving.service.js';

/**
 * Who is about to leave, and who already has.
 *
 * Nothing else in the console answers this. The shop list counts shops by
 * status and plan, and a trial running out on Thursday looks exactly like one
 * with ten weeks left. The automatic emails go out at 7, 3 and 1 days, but an
 * email is easy to ignore, and a phone call the day before is what actually
 * renews a pharmacy.
 *
 * So this is a working list, in four piles:
 *
 * - **Trials ending** — on the trial, and it ends within the window.
 * - **Renewals due** — paying, and the paid time ends within the window.
 * - **Lapsed** — ended in the last 30 days and not renewed. Still read-only
 *   rather than gone, so still worth a call.
 * - **Inactive** — in good standing but nobody has rung up a bill or signed in
 *   for a week. The first sign of a shop that has gone back to the notebook.
 * - **Stuck in setup** — signed up at least three days ago, in its first two
 *   months, and fewer than half of the getting-started steps done. The trial
 *   that will not convert unless somebody helps.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const LAPSED_LOOKBACK_DAYS = 30;
export const INACTIVE_AFTER_DAYS = 7;
/** Long enough to stop a double click and a second operator; short enough to chase again tomorrow. */
export const REMIND_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type RetentionPile = 'trialsEnding' | 'renewalsDue' | 'lapsed' | 'inactive' | 'stuck';
export type ReminderKind = 'renewal' | 'inactive' | 'setup';

/** A shop this new, or this old, is not "stuck": too soon to tell, or past the point of onboarding. */
export const STUCK_AFTER_DAYS = 3;
export const STUCK_UNTIL_DAYS = 60;

/** Fewer than half the steps done, in the window where onboarding still matters. Pure. */
export function isStuck(createdAt: Date, setupDone: number, setupTotal: number, now = new Date()) {
  const age = (now.getTime() - createdAt.getTime()) / DAY_MS;
  return age >= STUCK_AFTER_DAYS && age <= STUCK_UNTIL_DAYS && setupDone < setupTotal / 2;
}

/** Whole days from now to `end`: 0 is today, negative is past. */
export function daysUntil(end: Date, now = new Date()): number {
  return Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Which pile a shop belongs in, or none.
 *
 * Pure, so the rules can be tested without a database: what goes in which pile
 * is the whole of this feature, and a mistake in it is a customer nobody rang.
 */
export function pileOf(
  shop: { trial: boolean; endsAt: Date | null; lastActivityAt: Date | null },
  windowDays: number,
  now = new Date(),
): RetentionPile | null {
  if (!shop.endsAt) return null;
  const end = shop.endsAt.getTime();
  const t = now.getTime();
  if (end < t) return end >= t - LAPSED_LOOKBACK_DAYS * DAY_MS ? 'lapsed' : null;
  if (end <= t + windowDays * DAY_MS) return shop.trial ? 'trialsEnding' : 'renewalsDue';
  const last = shop.lastActivityAt?.getTime() ?? 0;
  return last < t - INACTIVE_AFTER_DAYS * DAY_MS ? 'inactive' : null;
}

export async function retentionBoard(opts: { days?: number } = {}) {
  const windowDays = Math.min(60, Math.max(1, Math.round(opts.days || 7)));
  const now = new Date();

  const [orgs, plans] = await Promise.all([
    OrganizationModel.find({ status: { $in: ['active', 'suspended'] } })
      .select('name plan status trialEndsAt contactPhone contactEmail approvedAt createdAt lastManualReminder')
      .lean(),
    everyPlan(),
  ]);
  const planOf = new Map(plans.map((p) => [p.key, p]));
  const ids = orgs.map((o) => o._id);

  const [bills, logins, owners] = await Promise.all([
    SaleModel.aggregate<{ _id: unknown; last: Date }>([
      { $match: { organization: { $in: ids }, status: { $ne: 'void' } } },
      { $group: { _id: '$organization', last: { $max: '$createdAt' } } },
    ]),
    UserModel.aggregate<{ _id: unknown; last: Date }>([
      { $match: { organization: { $in: ids }, lastLoginAt: { $ne: null } } },
      { $group: { _id: '$organization', last: { $max: '$lastLoginAt' } } },
    ]),
    UserModel.find({ organization: { $in: ids }, role: 'admin', isActive: { $ne: false } })
      .select('organization name email phone')
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  const lastBill = new Map(bills.map((r) => [String(r._id), r.last]));
  const lastLogin = new Map(logins.map((r) => [String(r._id), r.last]));
  const ownerOf = new Map<string, (typeof owners)[number]>();
  for (const u of owners) if (!ownerOf.has(String(u.organization))) ownerOf.set(String(u.organization), u);

  const piles: Record<RetentionPile, ReturnType<typeof row>[]> = {
    trialsEnding: [],
    renewalsDue: [],
    lapsed: [],
    inactive: [],
    stuck: [],
  };
  const [setup, answers] = await Promise.all([setupForMany(ids), latestFor(ids)]);

  function row(o: (typeof orgs)[number], lastActivityAt: Date | null) {
    const plan = planOf.get(o.plan);
    const owner = ownerOf.get(String(o._id));
    const endsAt = o.trialEndsAt ? new Date(o.trialEndsAt) : null;
    return {
      _id: String(o._id),
      name: o.name,
      plan: o.plan,
      planName: plan?.name ?? o.plan,
      price: plan?.price ?? 0,
      trial: plan ? plan.isTrial : o.plan === 'trial',
      status: o.status,
      endsAt,
      daysLeft: endsAt ? daysUntil(endsAt, now) : null,
      lastActivityAt,
      owner: owner
        ? { name: owner.name, email: owner.email, phone: owner.phone || o.contactPhone || '' }
        : { name: '', email: o.contactEmail || '', phone: o.contactPhone || '' },
      lastManualReminder: o.lastManualReminder?.at ? o.lastManualReminder : null,
      setup: setup.get(String(o._id)) ? { done: setup.get(String(o._id))!.done, total: setup.get(String(o._id))!.total } : null,
      leaving: answers.get(String(o._id))
        ? { label: LEAVING_LABEL[answers.get(String(o._id))!.reason], note: answers.get(String(o._id))!.note }
        : null,
    };
  }

  for (const o of orgs) {
    const key = String(o._id);
    const candidates = [lastBill.get(key), lastLogin.get(key), o.approvedAt].filter(Boolean) as Date[];
    const lastActivityAt = candidates.length
      ? new Date(Math.max(...candidates.map((d) => new Date(d).getTime())))
      : null;
    const r = row(o, lastActivityAt);
    const pile = pileOf({ trial: r.trial, endsAt: r.endsAt, lastActivityAt }, windowDays, now);
    if (pile) piles[pile].push(r);
    // Alongside its other pile, if any: a stuck shop may also be ending its trial.
    if (r.setup && o.createdAt && isStuck(new Date(o.createdAt), r.setup.done, r.setup.total, now)) piles.stuck.push(r);
  }

  // Soonest first where a date decides it; the longest silence first for the idle.
  const byEnd = (a: { endsAt: Date | null }, b: { endsAt: Date | null }) =>
    (a.endsAt?.getTime() ?? 0) - (b.endsAt?.getTime() ?? 0);
  piles.trialsEnding.sort(byEnd);
  piles.renewalsDue.sort(byEnd);
  piles.lapsed.sort((a, b) => -byEnd(a, b));
  piles.inactive.sort((a, b) => (a.lastActivityAt?.getTime() ?? 0) - (b.lastActivityAt?.getTime() ?? 0));

  return {
    windowDays,
    ...piles,
    counts: {
      trialsEnding: piles.trialsEnding.length,
      renewalsDue: piles.renewalsDue.length,
      lapsed: piles.lapsed.length,
      inactive: piles.inactive.length,
      stuck: piles.stuck.length,
    },
  };
}

/** Why a reminder cannot go now, or null. */
export function cooldownMessage(last: { at?: Date | null; kind?: string } | null | undefined, kind: ReminderKind, now = new Date()) {
  if (!last?.at || last.kind !== kind) return null;
  const since = now.getTime() - new Date(last.at).getTime();
  if (since >= REMIND_COOLDOWN_MS) return null;
  const hours = Math.round(since / (60 * 60 * 1000));
  const when = hours < 1 ? 'a few minutes' : hours === 1 ? 'an hour' : `${hours} hours`;
  return `This shop was already sent that reminder ${when} ago.`;
}

/**
 * An operator chasing one shop by hand: an email to the owner, and an SMS too
 * when asked for and there is a number.
 *
 * `renewal` says when the subscription ends (or ended) and links to the
 * billing page; `inactive` asks whether something is wrong and offers help.
 */
export async function remindShop(
  orgId: string,
  operatorId: string,
  input: { kind: ReminderKind; sms?: boolean },
) {
  if (!Types.ObjectId.isValid(orgId)) throw notFound('Shop');
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw notFound('Shop');
  const waiting = cooldownMessage(org.lastManualReminder, input.kind);
  if (waiting) throw badRequest(waiting);

  const owner =
    (await UserModel.findOne({ organization: orgId, role: 'admin', isActive: { $ne: false } })
      .select('name email phone')
      .sort({ createdAt: 1 })
      .lean()) ?? null;
  const email = owner?.email || org.contactEmail || '';
  const phone = owner?.phone || org.contactPhone || '';
  const name = owner?.name || org.name;
  if (!email && !(input.sms && phone)) throw badRequest('This shop has no email address or phone number to remind.');

  const sent: string[] = [];
  const endsAt = org.trialEndsAt ? new Date(org.trialEndsAt) : null;

  if (email) {
    if (input.kind === 'renewal') {
      if (!endsAt) throw badRequest('This shop has no end date to remind about.');
      const days = daysUntil(endsAt);
      if (days < 0) await notify.subscriptionLapsed({ email, name, shop: org.name, endedAt: endsAt });
      else await notify.subscriptionEnding({ email, name, shop: org.name, daysLeft: days, endsAt });
    } else if (input.kind === 'setup') {
      await notify.setupHelp({ email, name, shop: org.name });
    } else {
      await notify.shopInactive({ email, name, shop: org.name });
    }
    sent.push('email');
  }

  if (input.sms && phone) {
    const text =
      input.kind === 'setup'
        ? `Dawai: need a hand setting up ${org.name}? Call or message us and we will add your medicines and staff with you, free.`
        : input.kind === 'renewal'
        ? `Dawai: ${org.name} subscription ${endsAt && daysUntil(endsAt) < 0 ? 'has ended' : `ends ${endsAt ? endsAt.toLocaleDateString('en-GB') : 'soon'}`}. Renew from Subscription in the app, or reply/call us for help.`
        : `Dawai: we noticed ${org.name} has not used Dawai this week. Anything wrong? Call or message us and we will help.`;
    await sendSms(phone, text, { kind: `remind.${input.kind}`, organization: orgId });
    sent.push('sms');
  }

  org.set('lastManualReminder', { at: new Date(), by: operatorId, kind: input.kind });
  await org.save();

  return { sent, to: { email, phone: input.sms ? phone : '' }, shop: org.name };
}
