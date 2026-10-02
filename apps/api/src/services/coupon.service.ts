import { Types } from 'mongoose';
import { CouponModel, PaymentModel } from '../models/index.js';
import type { CouponKind } from '../models/Coupon.js';
import { planByKey } from './plan.service.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';

/**
 * Discount codes — see `models/Coupon.ts`.
 *
 * `quote` is the whole of the rules and is pure, so it can be tested without a
 * database and run in exactly the same way when the shop applies a code and
 * again when the payment is accepted.
 */

export interface CouponRules {
  code: string;
  kind: CouponKind;
  value: number;
  plans?: string[] | null;
  minMonths?: number | null;
  firstPaymentOnly?: boolean | null;
  oncePerShop?: boolean | null;
  maxRedemptions?: number | null;
  redemptions?: number | null;
  expiresAt?: Date | null;
  active?: boolean | null;
}

export type Quote =
  | { ok: true; discount: number; total: number; base: number }
  | { ok: false; reason: string };

/** Taka, rounded to the whole taka: nobody pays ৳1,333.33. */
const whole = (n: number) => Math.round(n);

/**
 * What a code takes off `price × months` for this shop, or why it cannot.
 *
 * `paidBefore`: the shop has an accepted payment already. `usedBefore`: the
 * shop has an accepted payment that used this code.
 */
export function quote(
  c: CouponRules,
  ctx: { plan: string; price: number; months: number; paidBefore: boolean; usedBefore: boolean; now?: Date },
): Quote {
  const now = ctx.now ?? new Date();
  const base = whole(ctx.price * ctx.months);
  if (!c.active) return { ok: false, reason: 'That code is no longer active.' };
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'That code has expired.' };
  if (c.maxRedemptions != null && (c.redemptions ?? 0) >= c.maxRedemptions) {
    return { ok: false, reason: 'That code has been used up.' };
  }
  if (c.plans?.length && !c.plans.includes(ctx.plan)) return { ok: false, reason: 'That code is not for this plan.' };
  if (ctx.months < (c.minMonths ?? 1)) {
    return { ok: false, reason: `That code needs at least ${c.minMonths} months at once.` };
  }
  if (c.firstPaymentOnly && ctx.paidBefore) return { ok: false, reason: 'That code is only for a first payment.' };
  if (c.oncePerShop && ctx.usedBefore) return { ok: false, reason: 'You have already used that code.' };

  const raw = c.kind === 'percent' ? (base * Math.min(100, Math.max(0, c.value))) / 100 : c.value;
  const discount = Math.min(base, whole(raw));
  return { ok: true, discount, total: base - discount, base };
}

export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');
export const CODE_RX = /^[A-Z0-9-]{3,24}$/;

/** The rules for a code a shop typed, applied to its plan and months — for the "Apply" button and for submitting. */
export async function quoteForShop(orgId: string, input: { code: string; plan: string; months: number }) {
  const code = normaliseCode(input.code);
  if (!CODE_RX.test(code)) return { ok: false as const, reason: 'That code does not look right.' };
  const [coupon, plan] = await Promise.all([CouponModel.findOne({ code }).lean(), planByKey(input.plan)]);
  if (!coupon) return { ok: false as const, reason: 'That code does not exist.' };
  if (!plan || plan.isTrial) return { ok: false as const, reason: 'Pick a paid plan first.' };
  const [paidBefore, usedBefore] = await Promise.all([
    PaymentModel.exists({ organization: orgId, status: 'verified' }),
    PaymentModel.exists({ organization: orgId, status: 'verified', 'coupon.code': code }),
  ]);
  const q = quote(coupon, {
    plan: plan.key,
    price: plan.price,
    months: input.months,
    paidBefore: Boolean(paidBefore),
    usedBefore: Boolean(usedBefore),
  });
  return q.ok ? { ...q, code, description: coupon.description } : q;
}

/** Counts a redemption once the payment is accepted. A code at its limit still counts: the money is in. */
export async function redeem(code: string) {
  if (!code) return;
  await CouponModel.updateOne({ code }, { $inc: { redemptions: 1 } });
}

/* ------------------------------------------------------------------ */
/* The console                                                         */
/* ------------------------------------------------------------------ */

export interface CouponInput {
  code: string;
  description?: string;
  kind: CouponKind;
  value: number;
  plans?: string[];
  minMonths?: number;
  firstPaymentOnly?: boolean;
  oncePerShop?: boolean;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  active?: boolean;
}

function check(kind: CouponKind, value: number) {
  if (kind === 'percent' && (value <= 0 || value > 100)) throw badRequest('A percentage has to be between 1 and 100');
  if (kind === 'amount' && value <= 0) throw badRequest('Enter how many taka it takes off');
}

export async function listCoupons() {
  return CouponModel.find({}).sort({ createdAt: -1 }).limit(200).lean();
}

export async function createCoupon(input: CouponInput, authorId: string) {
  const code = normaliseCode(input.code);
  if (!CODE_RX.test(code)) throw badRequest('A code is 3 to 24 letters, digits or dashes');
  check(input.kind, input.value);
  if (await CouponModel.exists({ code })) throw conflict('That code already exists');
  const c = await CouponModel.create({
    ...input,
    code,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    createdBy: authorId,
  });
  return c.toObject();
}

/** Everything but the code itself, which payments refer to by name. */
export async function updateCoupon(id: string, input: Partial<Omit<CouponInput, 'code'>>) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Code');
  const c = await CouponModel.findById(id);
  if (!c) throw notFound('Code');
  const { expiresAt, ...rest } = input;
  c.set(rest);
  if (expiresAt !== undefined) c.set('expiresAt', expiresAt ? new Date(expiresAt) : null);
  check(c.kind as CouponKind, c.value);
  await c.save();
  return c.toObject();
}
