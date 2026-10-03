import { resetTwoFactor } from './twoFactor.service.js';
import {
  OrganizationModel,
  UserModel,
  PaymentModel,
  MedicineRequestModel,
  SaleModel,
  ShopProductModel,
  ShopCounterModel,
} from '../models/index.js';
import bcrypt from 'bcryptjs';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import * as notify from './notification.service.js';
import {
  planByKey,
  trialPlan,
  limitsForPlan,
  effectiveLimits,
  assertPlanExists,
  OVERRIDABLE_AXES,
  type LimitOverrides,
  orgFeatures,
  FEATURE_KEYS,
  type FeatureOverrides,
} from './plan.service.js';
import { branchCount } from './branch.service.js';
import { containsRegex } from '../utils/search.js';
import type { OrgStatus, Role } from '../types/enums.js';
import { PLATFORM_ROLES } from '../types/roles.js';

/**
 * The operator's view of the deployment: which shops exist, what they are
 * doing, and whether they may keep doing it. The only service that looks
 * across shops, reachable only by `PLATFORM_ROLES`.
 */

/** How long a shop gets once an operator lets it in, when the catalogue has no trial row. */
export const TRIAL_DAYS = 14;

const DAY_MS = 86_400_000;

export async function platformStats() {
  const [byStatus, byPlan, total, signupsThisWeek, pendingPayments, pendingMedicineRequests] = await Promise.all([
    OrganizationModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    OrganizationModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$plan', n: { $sum: 1 } } }]),
    OrganizationModel.countDocuments({}),
    OrganizationModel.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * DAY_MS) } }),
    PaymentModel.countDocuments({ status: 'pending' }),
    // For the console's nav badge: shops waiting on the catalogue team.
    MedicineRequestModel.countDocuments({ status: 'pending' }),
  ]);

  const tally = (rows: { _id: string; n: number }[]) =>
    Object.fromEntries(rows.map((r) => [r._id || 'unknown', r.n]));

  return {
    total,
    signupsThisWeek,
    byStatus: tally(byStatus),
    byPlan: tally(byPlan),
    pending: byStatus.find((r) => r._id === 'pending')?.n ?? 0,
    pendingPayments,
    pendingMedicineRequests,
  };
}

/**
 * The shop list. The counts are what make it readable — "signed up in March,
 * two users, zero bills" is a shop that never started, the single most useful
 * thing an operator can see. One aggregate per collection over the page's ids.
 */
export async function listOrganizations(opts: {
  q?: string;
  status?: OrgStatus;
  plan?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));

  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  if (opts.plan) filter.plan = opts.plan;
  if (opts.q?.trim()) {
    filter.$or = [
      { name: containsRegex(opts.q) },
      { contactEmail: containsRegex(opts.q) },
      { contactPhone: containsRegex(opts.q) },
    ];
  }

  const [orgs, total] = await Promise.all([
    OrganizationModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OrganizationModel.countDocuments(filter),
  ]);

  const ids = orgs.map((o) => o._id);
  const [users, sales, products, owners] = await Promise.all([
    UserModel.aggregate<{ _id: unknown; n: number }>([
      { $match: { organization: { $in: ids } } },
      { $group: { _id: '$organization', n: { $sum: 1 } } },
    ]),
    SaleModel.aggregate<{ _id: unknown; n: number; last: Date }>([
      { $match: { organization: { $in: ids }, status: { $ne: 'void' } } },
      { $group: { _id: '$organization', n: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]),
    ShopProductModel.aggregate<{ _id: unknown; n: number }>([
      { $match: { organization: { $in: ids } } },
      { $group: { _id: '$organization', n: { $sum: 1 } } },
    ]),
    UserModel.find({ organization: { $in: ids }, role: 'admin' })
      .select('organization name email phone role lastLoginAt')
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const countBy = (rows: { _id: unknown; n: number }[]) => new Map(rows.map((r) => [String(r._id), r.n]));
  const userCount = countBy(users);
  const billCount = countBy(sales);
  const productCount = countBy(products);
  const lastBill = new Map(sales.map((r) => [String(r._id), r.last]));

  const ownerOf = new Map<string, (typeof owners)[number]>();
  for (const u of owners) {
    const key = String(u.organization);
    if (!ownerOf.has(key)) ownerOf.set(key, u);
  }

  const data = orgs.map((o) => {
    const key = String(o._id);
    const owner = ownerOf.get(key);
    const lastActivity = [lastBill.get(key), owner?.lastLoginAt, o.approvedAt]
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

    return {
      ...o,
      owner: owner ? { name: owner.name, email: owner.email, phone: owner.phone, role: owner.role } : null,
      counts: {
        users: userCount.get(key) || 0,
        bills: billCount.get(key) || 0,
        products: productCount.get(key) || 0,
      },
      lastActivityAt: lastActivity ?? null,
    };
  });

  return { data, total, page, limit };
}

export async function getOrganization(id: string) {
  const org = await OrganizationModel.findById(id).lean();
  if (!org) throw notFound('Shop');

  const [users, bills, products, counters] = await Promise.all([
    UserModel.find({ organization: id }).select('-passwordHash -sessions').sort({ createdAt: 1 }).lean(),
    SaleModel.countDocuments({ organization: id, status: { $ne: 'void' } }),
    ShopProductModel.countDocuments({ organization: id }),
    ShopCounterModel.countDocuments({ organization: id }),
  ]);

  return {
    organization: org,
    users,
    counts: { bills, products, counters, users: users.length },
    usage: await planUsage(id),
  };
}

/**
 * Approving, suspending, reactivating, and moving a shop between plans — one
 * function because they are one decision, the state of a customer account, and
 * keeping the transitions side by side is what stops a later edit from
 * reactivating without clearing the suspension reason.
 */
export async function updateOrganization(
  id: string,
  actorId: string,
  payload: {
    status?: OrgStatus;
    /** A plan key from the catalogue; checked below. */
    plan?: string;
    suspendedReason?: string;
    /** Sets the trial (or paid-up) date this many days from today. */
    trialDays?: number;
  },
) {
  const org = await OrganizationModel.findById(id);
  if (!org) throw notFound('Shop');
  const previousStatus = org.status;

  if (payload.status && payload.status !== org.status) {
    if (payload.status === 'active') {
      const firstApproval = org.status === 'pending';
      org.set('status', 'active');
      org.set('isActive', true);
      org.set('suspendedReason', '');
      if (firstApproval) {
        org.set('approvedAt', new Date());
        org.set('approvedBy', actorId);
        // The trial starts when they can first use the product, not when they
        // filled the form — an approval three days later should not cost them three days.
        if (!org.trialEndsAt) {
          const days = (await trialPlan())?.trialDays ?? TRIAL_DAYS;
          org.set('trialEndsAt', new Date(Date.now() + days * DAY_MS));
        }
      }
    } else if (payload.status === 'suspended') {
      org.set('status', 'suspended');
      org.set('isActive', false);
      org.set('suspendedReason', (payload.suspendedReason || '').trim());
    } else {
      // Back to pending would silently lock out a shop that is already selling.
      throw badRequest('A shop cannot be moved back to pending');
    }
  } else if (payload.suspendedReason !== undefined && org.status === 'suspended') {
    org.set('suspendedReason', payload.suspendedReason.trim());
  }

  if (payload.plan && payload.plan !== org.plan) {
    const plan = await planByKey(payload.plan);
    assertPlanExists(plan, payload.plan);
    // Only the plan changes. The paid-up date is moved by payments (or by
    // `trialDays` below), never silently by a plan edit.
    org.set('plan', payload.plan);
  }

  if (payload.trialDays !== undefined) {
    if (payload.trialDays < 0 || payload.trialDays > 365) {
      throw badRequest('The length must be between 0 and 365 days');
    }
    org.set('trialEndsAt', new Date(Date.now() + payload.trialDays * DAY_MS));
  }

  await org.save();

  // Told after the state is saved, so a mail failure cannot leave a shop
  // believing something the database does not agree with.
  if (payload.status && payload.status !== previousStatus) {
    const owner = org.owner
      ? await UserModel.findById(org.owner).select('name email').lean()
      : await UserModel.findOne({ organization: org._id }).select('name email').sort({ createdAt: 1 }).lean();

    if (owner?.email) {
      if (payload.status === 'active' && previousStatus === 'pending') {
        void notify.shopApproved({
          email: owner.email,
          name: owner.name,
          shop: org.name,
          trialEndsAt: org.trialEndsAt,
        });
      } else if (payload.status === 'suspended') {
        void notify.shopSuspended({
          email: owner.email,
          name: owner.name,
          shop: org.name,
          reason: org.suspendedReason || 'Please contact Dawai support.',
        });
      }
    }
  }

  return org.toObject();
}

/**
 * Correcting a shop's own details on its behalf — the typo in a name, a phone
 * that changed. Status, plan and dates live in `updateOrganization` behind
 * their own permissions; money does not belong in the same function as a typo.
 */
export async function updateOrganizationProfile(
  orgId: string,
  input: { name?: string; contactPhone?: string; contactEmail?: string; address?: Record<string, string> },
) {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw notFound('Shop');

  if (input.name !== undefined) org.set('name', input.name.trim());
  if (input.contactPhone !== undefined) org.set('contactPhone', input.contactPhone.trim());
  if (input.contactEmail !== undefined) org.set('contactEmail', input.contactEmail.trim().toLowerCase());
  if (input.address) {
    for (const [key, value] of Object.entries(input.address)) {
      org.set(`address.${key}`, String(value ?? '').trim());
    }
  }
  await org.save();
  return org.toObject();
}

/**
 * The shop user this operator is about to act on. One lookup, one set of
 * refusals: an operator may not touch another operator, and may not reach a
 * user through the wrong shop's id.
 */
async function shopUserOf(orgId: string, userId: string) {
  const user = await UserModel.findOne({ _id: userId, organization: orgId });
  if (!user) throw notFound('That user is not in this shop');
  if (PLATFORM_ROLES.includes(user.role as Role)) {
    throw badRequest('Operator accounts are not managed from here');
  }
  return user;
}

/** Corrects a shop user's details. Not their role, and not their password. */
export async function updateShopUser(
  orgId: string,
  userId: string,
  input: { name?: string; email?: string; phone?: string; isActive?: boolean },
) {
  const user = await shopUserOf(orgId, userId);

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    const clash = await UserModel.findOne({ email, _id: { $ne: user._id } }).lean();
    if (clash) throw conflict('Another account already uses that email');
    user.set('email', email);
    // A changed address is an unverified address, whoever changed it.
    user.set('isEmailVerified', false);
  }
  if (input.name !== undefined) user.set('name', input.name.trim());
  if (input.phone !== undefined) user.set('phone', input.phone.trim());
  if (input.isActive !== undefined) user.set('isActive', input.isActive);

  await user.save();
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
  };
}

/**
 * Sets a shop user's password, because they cannot — the owner locked out at
 * opening time, whose account email nobody has opened in a year. Kept honest:
 * the account is emailed that support did it, the reason is in the audit trail
 * (see the route), and every session ends.
 */
export async function setShopUserPassword(
  orgId: string,
  userId: string,
  newPassword: string,
  by: { name: string; email: string },
) {
  const user = await shopUserOf(orgId, userId);

  user.set('passwordHash', await bcrypt.hash(newPassword, 12));
  user.set('passwordResetTokenHash', '');
  user.set('passwordResetExpiresAt', null);
  user.set('sessions', []);
  user.set('failedLoginCount', 0);
  user.set('lockedUntil', null);
  await user.save();

  const org = await OrganizationModel.findById(orgId).select('name').lean();
  void notify.passwordChangedBySupport({
    email: user.email,
    name: user.name,
    shop: org?.name ?? 'your shop',
    operator: by.name,
  });

  return { id: String(user._id), email: user.email, name: user.name };
}

/** A shop user who lost their phone: see `resetTwoFactor`. */
export async function resetShopUserTwoFactor(orgId: string, userId: string) {
  const user = await shopUserOf(orgId, userId);
  return resetTwoFactor(String(user._id));
}

/**
 * Opens a shop on the customer's behalf — the owner on the phone saying "open
 * one for me", or an agent sitting in the shop. Created **active**: the
 * operator typing it in is the review. Terms are deliberately not marked
 * accepted; an operator cannot accept them on somebody else's behalf.
 */
export async function createOrganizationForCustomer(
  input: {
    organizationName: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    plan?: string;
    trialDays?: number;
    /** Already checked and made official by the validator. */
    address?: Record<string, string>;
  },
  operatorId: string,
) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (await UserModel.findOne({ email }).lean()) throw conflict('An account already uses that email');
  if (await UserModel.findOne({ phone }).lean()) throw conflict('An account already uses that phone number');

  const trial = await trialPlan();
  const planKey = input.plan || trial?.key || 'trial';
  if (input.plan) assertPlanExists(await planByKey(input.plan), input.plan);
  const days = input.trialDays ?? trial?.trialDays ?? TRIAL_DAYS;

  const org = await OrganizationModel.create({
    name: input.organizationName.trim(),
    plan: planKey,
    intendedPlan: input.plan && input.plan !== trial?.key ? input.plan : '',
    status: 'active',
    approvedAt: new Date(),
    approvedBy: operatorId,
    trialEndsAt: new Date(Date.now() + days * DAY_MS),
    ...(input.address ? { address: input.address } : {}),
  });

  const owner = await UserModel.create({
    organization: org._id,
    role: 'admin',
    name: input.ownerName.trim(),
    email,
    phone,
    passwordHash: await bcrypt.hash(input.password, 12),
  });

  org.set('owner', owner._id);
  await org.save();

  void notify.accountOpenedByOperator({ email: owner.email, name: owner.name, shop: org.name });

  return {
    id: String(org._id),
    name: org.name,
    owner: { id: String(owner._id), name: owner.name, email: owner.email },
    trialEndsAt: org.trialEndsAt,
  };
}

/* ------------------------------------------------------------------ */
/* Plan usage                                                          */
/* ------------------------------------------------------------------ */

/**
 * One axis of a shop's limits: what it allows, what is used, whether that is
 * it — and whether the limit is the shop's own (`overridden`) rather than its
 * plan's, so the console can mark it "custom".
 */
export interface SeatUsage {
  limit: number | null;
  used: number;
  full: boolean;
  overridden: boolean;
  /** What the plan alone would allow — the value "use plan default" goes back to. */
  planLimit: number | null;
}

export function seatUsage(
  limit: number | null | undefined,
  used: number,
  overridden = false,
  planLimit: number | null | undefined = limit,
): SeatUsage {
  const l = limit ?? null;
  return { limit: l, used, full: l !== null && used >= l, overridden, planLimit: planLimit ?? null };
}

export interface PlanUsage {
  plan: string;
  planName: string;
  outlets: SeatUsage;
  terminals: SeatUsage;
  shopUsers: SeatUsage;
  features: Awaited<ReturnType<typeof orgFeatures>>;
}

/**
 * Where a shop stands against its limits — its plan's, with any of its own
 * ceilings applied: counters and staff logins.
 */
export async function planUsage(orgId: string): Promise<PlanUsage> {
  const org = await OrganizationModel.findById(orgId).select('plan limitOverrides').lean();
  if (!org) throw notFound('Shop');

  const planLimits = await limitsForPlan(org.plan || 'trial');
  const limits = effectiveLimits(planLimits, (org.limitOverrides ?? null) as LimitOverrides | null);
  const [counters, users, branches] = await Promise.all([
    ShopCounterModel.countDocuments({ organization: orgId, isActive: { $ne: false } }),
    UserModel.countDocuments({ organization: orgId, isActive: true, deletedAt: null }),
    branchCount(orgId),
  ]);

  return {
    plan: org.plan || 'trial',
    planName: (await planByKey(org.plan || 'trial'))?.name ?? org.plan ?? 'Trial',
    outlets: seatUsage(limits.outlets, branches, limits.overridden.outlets, planLimits.outlets),
    terminals: seatUsage(limits.terminals, counters, limits.overridden.terminals, planLimits.terminals),
    shopUsers: seatUsage(limits.shopUsers, users, limits.overridden.shopUsers, planLimits.shopUsers),
    features: await orgFeatures(orgId),
  };
}

/**
 * Sets (a number) or clears (`null`) a shop's own ceilings. An axis left out
 * is left alone. Returns both sides, for the audit trail.
 *
 * Nothing already in use is switched off when a ceiling is lowered below it —
 * the shop simply cannot add another until it is back under.
 */
/** Gives a plan feature to one shop, takes it away, or (`null`) puts it back on the plan. */
export async function updateFeatureOverrides(orgId: string, overrides: FeatureOverrides) {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw notFound('Shop');
  const read = () => Object.fromEntries(FEATURE_KEYS.map((k) => [k, (org.get(`featureOverrides.${k}`) as boolean | null) ?? null]));
  const before = read();
  for (const k of FEATURE_KEYS) if (overrides[k] !== undefined) org.set(`featureOverrides.${k}`, overrides[k]);
  await org.save();
  return { organization: org.toObject(), before, after: read(), features: await orgFeatures(orgId) };
}

export async function updateLimitOverrides(orgId: string, overrides: LimitOverrides) {
  const org = await OrganizationModel.findById(orgId);
  if (!org) throw notFound('Shop');

  const current = (org.limitOverrides ?? {}) as LimitOverrides;
  const before = { outlets: current.outlets ?? null, terminals: current.terminals ?? null, shopUsers: current.shopUsers ?? null };
  for (const axis of OVERRIDABLE_AXES) {
    if (overrides[axis] !== undefined) org.set(`limitOverrides.${axis}`, overrides[axis]);
  }
  await org.save();

  const saved = (org.limitOverrides ?? {}) as LimitOverrides;
  const after = { outlets: saved.outlets ?? null, terminals: saved.terminals ?? null, shopUsers: saved.shopUsers ?? null };
  return { organization: org.toObject(), before, after, usage: await planUsage(orgId) };
}
