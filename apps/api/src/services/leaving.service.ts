import { Schema, model, Types } from 'mongoose';
import { OrganizationModel } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';

/**
 * Why a shop did not renew — asked once, in one tap, when its time has run out.
 *
 * "Lost 4 shops this month" says nothing a price change or a feature could
 * fix. "3 went back to the notebook, 1 said too expensive" does. Asked in the
 * shop app on the Subscription page while the shop is read-only, which is the
 * only moment the answer is fresh.
 *
 * One answer per ending: keyed by the shop and the date its time ran out, so a
 * shop that renews and lapses again next year is asked again, and asking twice
 * for the same ending is not possible.
 */

export const LEAVING_REASONS = [
  'too_expensive',
  'back_to_paper',
  'other_software',
  'shop_closed',
  'hard_to_use',
  'missing_feature',
  'will_renew',
  'other',
] as const;
export type LeavingReason = (typeof LEAVING_REASONS)[number];

/** What the console calls each reason. */
export const LEAVING_LABEL: Record<LeavingReason, string> = {
  too_expensive: 'Too expensive',
  back_to_paper: 'Went back to the notebook',
  other_software: 'Moved to other software',
  shop_closed: 'Shop closed or sold',
  hard_to_use: 'Hard to use',
  missing_feature: 'Missing something they need',
  will_renew: 'Will renew — just has not yet',
  other: 'Something else',
};

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** The end it is about: the shop's paid-until date when it answered. */
    endedAt: { type: Date, required: true },
    reason: { type: String, enum: LEAVING_REASONS, required: true },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    plan: { type: String, default: '' },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
schema.index({ organization: 1, endedAt: 1 }, { unique: true });
export const LeavingAnswerModel = model('LeavingAnswer', schema);

/** Asked only of a shop whose time has run out, in the two months after. Pure. */
export function shouldAsk(endsAt: Date | null, now = new Date()) {
  if (!endsAt || endsAt.getTime() > now.getTime()) return false;
  return now.getTime() - endsAt.getTime() <= 60 * 24 * 60 * 60 * 1000;
}

/** For the shop app: whether to ask, and the answer if already given. */
export async function leavingState(orgId: string) {
  const org = await OrganizationModel.findById(orgId).select('trialEndsAt').lean();
  if (!org) throw notFound('Shop');
  const endsAt = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
  if (!shouldAsk(endsAt)) return { ask: false, answered: null };
  const answer = await LeavingAnswerModel.findOne({ organization: orgId, endedAt: endsAt }).select('reason note').lean();
  return { ask: !answer, answered: answer ? { reason: answer.reason, note: answer.note } : null };
}

export async function answer(orgId: string, userId: string, input: { reason: LeavingReason; note?: string }) {
  if (!LEAVING_REASONS.includes(input.reason)) throw badRequest('Pick one of the reasons');
  const org = await OrganizationModel.findById(orgId).select('trialEndsAt plan').lean();
  if (!org) throw notFound('Shop');
  const endsAt = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
  if (!shouldAsk(endsAt)) throw badRequest('Your subscription is running — nothing to tell us.');
  // Upsert: changing one's mind replaces the answer rather than adding a second.
  await LeavingAnswerModel.updateOne(
    { organization: orgId, endedAt: endsAt },
    { $set: { reason: input.reason, note: (input.note ?? '').trim().slice(0, 500), plan: org.plan, by: userId } },
    { upsert: true },
  );
  return { ok: true };
}

/** The latest answer for each of these shops, for the console's Lapsed pile. */
export async function latestFor(orgIds: (string | Types.ObjectId)[]) {
  if (!orgIds.length) return new Map<string, { reason: LeavingReason; note: string }>();
  const rows = await LeavingAnswerModel.aggregate<{ _id: unknown; reason: LeavingReason; note: string }>([
    { $match: { organization: { $in: orgIds.map((i) => new Types.ObjectId(String(i))) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$organization', reason: { $first: '$reason' }, note: { $first: '$note' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { reason: r.reason, note: r.note }]));
}

/** Answers in the last `days`, by reason, most common first — the Overview's "why shops leave". */
export async function breakdown(days = 90) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await LeavingAnswerModel.aggregate<{ _id: LeavingReason; n: number }>([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$reason', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  return rows.map((r) => ({ reason: r._id, label: LEAVING_LABEL[r._id], count: r.n }));
}
