import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { OrganizationModel, PaymentModel } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';

/**
 * One pharmacy bringing in another.
 *
 * Shop owners in one bazaar know each other, and a recommendation from the shop
 * next door is worth more than any advert. Each shop gets its own sign-up link;
 * a shop that signs up through it is recorded as referred by it, and the
 * console lists who brought in whom and whether the new shop has paid yet.
 *
 * The reward is given by hand — an extended month, a discount, a thank-you
 * call — and marked here, so each sign-up is rewarded at most once and the
 * list says which are still owed.
 */

/** No 0/O, 1/I/L: a code read out over the phone has to survive it. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_RX = /^[A-HJ-NP-Z2-9]{6}$/;

export function makeReferralCode(bytes: Buffer = crypto.randomBytes(6)): string {
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** This shop's code, made on first use. */
export async function ensureReferralCode(orgId: string): Promise<string> {
  const org = await OrganizationModel.findById(orgId).select('referralCode').lean();
  if (!org) throw notFound('Shop');
  if (org.referralCode) return org.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeReferralCode();
    try {
      // Only if it still has none: two tabs opening the card at once get the same code.
      const res = await OrganizationModel.findOneAndUpdate(
        { _id: orgId, referralCode: { $exists: false } },
        { $set: { referralCode: code } },
        { new: true },
      ).lean();
      if (res?.referralCode) return res.referralCode;
      const again = await OrganizationModel.findById(orgId).select('referralCode').lean();
      if (again?.referralCode) return again.referralCode;
    } catch (err) {
      // A clash with another shop's code: try another.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw new Error('Could not make a referral code');
}

/** What the shop's referral card shows. */
export async function referralSummary(orgId: string) {
  const code = await ensureReferralCode(orgId);
  const referred = await OrganizationModel.find({ referredBy: orgId }).select('_id').lean();
  const ids = referred.map((r) => r._id);
  const paying = ids.length
    ? (await PaymentModel.distinct('organization', { organization: { $in: ids }, status: 'verified' })).length
    : 0;
  return { code, signedUp: ids.length, paying };
}

/** The shop a sign-up came through, if the code is real. Never the new shop itself. */
export async function referrerFor(code: string | undefined | null) {
  const c = (code ?? '').trim().toUpperCase();
  if (!REFERRAL_CODE_RX.test(c)) return null;
  const org = await OrganizationModel.findOne({ referralCode: c }).select('_id').lean();
  return org?._id ?? null;
}

/** The console's list: every referred shop, its referrer, whether it pays, and whether the reward was given. */
export async function listReferrals() {
  const rows = await OrganizationModel.find({ referredBy: { $ne: null } })
    .select('name status plan createdAt referredBy referralReward')
    .populate('referredBy', 'name referralCode')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  const ids = rows.map((r) => r._id);
  const firstPaid = await PaymentModel.aggregate<{ _id: unknown; at: Date }>([
    { $match: { organization: { $in: ids }, status: 'verified' } },
    { $group: { _id: '$organization', at: { $min: '$reviewedAt' } } },
  ]);
  const paidAt = new Map(firstPaid.map((p) => [String(p._id), p.at]));
  return rows.map((r) => ({
    ...r,
    firstPaidAt: paidAt.get(String(r._id)) ?? null,
    rewarded: Boolean(r.referralReward?.at),
  }));
}

/** Marks the referrer's reward for this sign-up as given. Once only. */
export async function markRewarded(referredId: string, operatorId: string, note: string) {
  if (!Types.ObjectId.isValid(referredId)) throw notFound('Shop');
  const org = await OrganizationModel.findById(referredId);
  if (!org) throw notFound('Shop');
  if (!org.referredBy) throw badRequest('This shop did not come through a referral');
  if (org.referralReward?.at) throw badRequest('The reward for this referral has already been marked as given');
  org.set('referralReward', { at: new Date(), by: operatorId, note: note.trim() });
  await org.save();
  return org.toObject();
}
