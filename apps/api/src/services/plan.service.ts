import { PlanModel, OrganizationModel } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Reading and editing the plan catalogue.
 *
 * Every limit check comes through here, so it is cached: adding a counter
 * should not cost a plan lookup, and plans change perhaps monthly. The cache is
 * short and is cleared on every write, so an edited price takes effect at once.
 */

const CACHE_MS = 60_000;
let cache: { at: number; plans: PlanShape[] } | null = null;

export interface PlanLimits {
  outlets: number | null;
  terminals: number | null;
  shopUsers: number | null;
}

const AXES = ['outlets', 'terminals', 'shopUsers'] as const;

export interface PlanShape {
  id: string;
  key: string;
  name: string;
  description: string;
  price: number;
  /** Branches the price covers. */
  includedBranches: number;
  /** Each branch beyond those, per month. 0: extra branches cost nothing more. */
  extraBranchPrice: number;
  currency: string;
  limits: PlanLimits;
  isTrial: boolean;
  trialDays: number;
  isActive: boolean;
  sortOrder: number;
}

const shape = (p: Record<string, unknown>): PlanShape => {
  const limits = (p.limits ?? {}) as Partial<PlanLimits>;
  return {
    id: String(p._id),
    key: String(p.key),
    name: String(p.name),
    description: String(p.description ?? ''),
    price: Number(p.price ?? 0),
    includedBranches: Math.max(1, Number(p.includedBranches ?? 1)),
    extraBranchPrice: Math.max(0, Number(p.extraBranchPrice ?? 0)),
    currency: String(p.currency ?? 'BDT'),
    limits: {
      outlets: limits.outlets ?? null,
      terminals: limits.terminals ?? null,
      shopUsers: limits.shopUsers ?? null,
    },
    isTrial: Boolean(p.isTrial),
    trialDays: Number(p.trialDays ?? 14),
    isActive: p.isActive !== false,
    sortOrder: Number(p.sortOrder ?? 0),
  };
};

/**
 * What a plan costs a month for a shop with `branches` branches: the plan's
 * price, and each branch beyond those it includes at the extra-branch price.
 * Pure — every place that charges a shop (the Subscription page, a claim, the
 * online checkout, a recorded payment, an invoice, monthly revenue) goes
 * through this, so they cannot disagree.
 */
export function monthlyPrice(
  plan: { price: number; includedBranches?: number | null; extraBranchPrice?: number | null },
  branches: number,
) {
  const included = Math.max(1, plan.includedBranches ?? 1);
  const extra = Math.max(0, Math.floor(branches) - included);
  const extraPrice = Math.max(0, plan.extraBranchPrice ?? 0);
  return {
    base: plan.price,
    extraBranches: extra,
    extraBranchPrice: extraPrice,
    extras: extra * extraPrice,
    total: plan.price + extra * extraPrice,
  };
}

export function clearPlanCache() {
  cache = null;
}

async function allPlans(): Promise<PlanShape[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.plans;
  const rows = await PlanModel.find({}).sort({ sortOrder: 1 }).lean();
  cache = { at: Date.now(), plans: rows.map((r) => shape(r as Record<string, unknown>)) };
  return cache.plans;
}

/** What a shop can buy. Retired plans and the trial are not offered. */
/** Every plan, trial and retired ones included — for reading what a shop is on. */
export async function everyPlan(): Promise<PlanShape[]> {
  return allPlans();
}

export async function purchasablePlans() {
  return (await allPlans()).filter((p) => p.isActive && !p.isTrial);
}

export async function planByKey(key: string): Promise<PlanShape | null> {
  return (await allPlans()).find((p) => p.key === key) ?? null;
}

export async function trialPlan(): Promise<PlanShape | null> {
  return (await allPlans()).find((p) => p.isTrial) ?? null;
}

/** Refuses a plan key that resolves to nothing, naming it. */
export function assertPlanExists(plan: PlanShape | null, key: string): asserts plan is PlanShape {
  if (!plan) {
    throw badRequest(`There is no plan with the key "${key}". Pick one from the Plans catalogue.`);
  }
}

/**
 * The limits in force. A key that no longer resolves falls back to the trial
 * rather than to nothing: unlimited-by-accident is the failure here that costs
 * money silently.
 */
export async function limitsForPlan(key: string): Promise<PlanLimits> {
  const plan = (await planByKey(key)) ?? (await trialPlan());
  return plan?.limits ?? { outlets: 1, terminals: 1, shopUsers: 2 };
}

/**
 * The refusal when a shop is at a plan limit. Pure, so the wording is tested,
 * and named after the plan so the owner knows what to upgrade from.
 */
export function limitMessage(axis: keyof PlanLimits, limit: number, planName: string): string {
  const what =
    axis === 'terminals'
      ? limit === 1
        ? 'one billing counter'
        : `${limit} billing counters`
      : axis === 'shopUsers'
        ? limit === 1
          ? 'one staff login'
          : `${limit} staff logins`
        : limit === 1
          ? 'one branch'
          : `${limit} branches`;
  return `${planName} includes ${what}. Upgrade the plan to add more.`;
}

/** The axes a single shop may be given its own ceiling on — branches included, for a negotiated chain. */
export const OVERRIDABLE_AXES = ['outlets', 'terminals', 'shopUsers'] as const;
export type OverridableAxis = (typeof OVERRIDABLE_AXES)[number];

/** A shop's own ceilings. `null` (or absent) on an axis means "use the plan". */
export type LimitOverrides = Partial<Record<OverridableAxis, number | null>>;

/** What is in force for one shop, and which axes are its own rather than the plan's. */
export interface EffectiveLimits extends PlanLimits {
  overridden: Record<OverridableAxis, boolean>;
}

/**
 * The limits in force for one shop: its plan's, with a per-shop override
 * replacing the plan's value on that axis. Pure, so the precedence is tested.
 * Anything but a finite number (null, undefined, NaN) is "no override".
 */
export function effectiveLimits(planLimits: PlanLimits, overrides?: LimitOverrides | null): EffectiveLimits {
  const out: EffectiveLimits = {
    outlets: planLimits.outlets,
    terminals: planLimits.terminals,
    shopUsers: planLimits.shopUsers,
    overridden: { outlets: false, terminals: false, shopUsers: false },
  };
  for (const axis of OVERRIDABLE_AXES) {
    const v = overrides?.[axis];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[axis] = v;
      out.overridden[axis] = true;
    }
  }
  return out;
}

/**
 * The refusal when a shop is at its own, operator-set ceiling. There is no
 * plan to upgrade from — the number was agreed with us — so it says who to ask.
 */
export function customLimitMessage(axis: OverridableAxis, limit: number): string {
  const what =
    axis === 'terminals'
      ? limit === 1
        ? 'one billing counter'
        : `${limit} billing counters`
      : axis === 'outlets'
        ? limit === 1
          ? 'one branch'
          : `${limit} branches`
        : limit === 1
          ? 'one staff login'
          : `${limit} staff logins`;
  return `Your shop is set up for ${what}. Contact Dawai support to add more.`;
}

/**
 * Whether one more fits, and the refusal if it does not. `overrides` are the
 * shop's own ceilings (`Organization.limitOverrides`); callers with an org id
 * use `assertOrgWithinLimit`, which loads them.
 */
export async function assertWithinLimit(
  orgPlanKey: string,
  axis: keyof PlanLimits,
  used: number,
  overrides?: LimitOverrides | null,
) {
  const plan = (await planByKey(orgPlanKey)) ?? (await trialPlan());
  const limits = effectiveLimits(plan?.limits ?? { outlets: 1, terminals: 1, shopUsers: 2 }, overrides);
  const limit = limits[axis] ?? null;
  if (limit !== null && used >= limit) {
    throw badRequest(
      limits.overridden[axis]
        ? customLimitMessage(axis, limit)
        : limitMessage(axis, limit, plan?.name ?? 'Your plan'),
    );
  }
}

/** The same check for a shop by id: its plan and its own ceilings, loaded here. */
export async function assertOrgWithinLimit(orgId: unknown, axis: keyof PlanLimits, used: number) {
  const org = await OrganizationModel.findById(orgId).select('plan limitOverrides').lean();
  await assertWithinLimit(org?.plan || 'trial', axis, used, (org?.limitOverrides ?? null) as LimitOverrides | null);
}

/**
 * The overrides a self-serve sign-up starts with. A one-counter shop gets
 * none — the trial fits it. A shop that says it runs N counters gets N, and a
 * login per counter plus the owner (never fewer than the trial already gives),
 * so it can try the product the way it would actually run it.
 *
 * Pure, so the arithmetic is tested; `trialShopUsers` is the trial plan's own
 * staff-login limit (`null` is unlimited, and then nothing is raised).
 */
export function signupLimitOverrides(
  counters: number | null | undefined,
  trialShopUsers: number | null,
): { terminals: number | null; shopUsers: number | null } {
  if (!counters || counters <= 1) return { terminals: null, shopUsers: null };
  return {
    terminals: counters,
    shopUsers: trialShopUsers === null ? null : Math.max(trialShopUsers, counters + 1),
  };
}

/**
 * The catalogue as the public site prints it: the price list and nothing else
 * — no ids, nothing that hints at who is on what. Retired plans left out; the
 * trial kept, because "14 days free" is the first thing the pricing page says.
 */
export interface PublicPlan {
  key: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  limits: PlanLimits;
  isTrial: boolean;
  trialDays: number;
  sortOrder: number;
}

export async function publicPlans(): Promise<PublicPlan[]> {
  return (await allPlans())
    .filter((p) => p.isActive)
    .map(({ id: _id, isActive: _active, ...rest }) => rest)
    .sort((a, b) => Number(b.isTrial) - Number(a.isTrial) || a.sortOrder - b.sortOrder);
}

/* ------------------------------------------------------------------ */
/* Editing                                                             */
/* ------------------------------------------------------------------ */

export async function listPlans() {
  return allPlans();
}

export interface PlanInput {
  key?: string;
  name?: string;
  description?: string;
  price?: number;
  includedBranches?: number;
  extraBranchPrice?: number;
  currency?: string;
  limits?: Partial<PlanLimits>;
  isTrial?: boolean;
  trialDays?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createPlan(input: PlanInput) {
  if (!input.key?.trim()) throw badRequest('A key is required');
  if (!input.name?.trim()) throw badRequest('A name is required');

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (await PlanModel.findOne({ key }).lean()) throw badRequest(`A plan with key "${key}" exists`);

  const plan = await PlanModel.create({ ...input, key });
  clearPlanCache();
  logger.info({ key }, 'Plan created');
  return shape(plan.toObject() as Record<string, unknown>);
}

export async function updatePlan(id: string, input: PlanInput) {
  const plan = await PlanModel.findById(id);
  if (!plan) throw notFound('Plan');

  // Shops store the key, so the label changes and the key never does.
  if (input.key && input.key !== plan.key) {
    throw badRequest('A plan’s key cannot change — shops are stored against it. Rename it instead.');
  }

  for (const field of ['name', 'description', 'currency'] as const) {
    if (input[field] !== undefined) plan.set(field, input[field]);
  }
  if (input.price !== undefined) plan.set('price', input.price);
  if (input.includedBranches !== undefined) plan.set('includedBranches', input.includedBranches);
  if (input.extraBranchPrice !== undefined) plan.set('extraBranchPrice', input.extraBranchPrice);
  if (input.trialDays !== undefined) plan.set('trialDays', input.trialDays);
  if (input.isActive !== undefined) plan.set('isActive', input.isActive);
  if (input.sortOrder !== undefined) plan.set('sortOrder', input.sortOrder);
  if (input.limits) {
    for (const axis of AXES) {
      if (input.limits[axis] !== undefined) plan.set(`limits.${axis}`, input.limits[axis]);
    }
  }

  await plan.save();
  clearPlanCache();
  return shape(plan.toObject() as Record<string, unknown>);
}

/**
 * Retires a plan. Never a deletion: shops are stored against the key. Retiring
 * takes it off the shelf while everyone already on it keeps their limits.
 */
export async function retirePlan(id: string) {
  const plan = await PlanModel.findById(id);
  if (!plan) throw notFound('Plan');
  if (plan.isTrial) throw badRequest('The trial plan cannot be retired — new shops start on it');

  plan.set('isActive', false);
  await plan.save();
  clearPlanCache();
  return shape(plan.toObject() as Record<string, unknown>);
}
