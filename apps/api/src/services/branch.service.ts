import { Types } from 'mongoose';
import { BranchModel, OrganizationModel } from '../models/index.js';
import { assertWithinLimit, effectiveLimits, planByKey, trialPlan, monthlyPrice, type LimitOverrides } from './plan.service.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';

/**
 * A shop's branches — see `models/Branch.ts`.
 *
 * Every shop has at least one: the Main branch, made the first time anything
 * asks, so a shop that has never heard of branches has one without knowing.
 */

const oid = (v: string | Types.ObjectId) => (typeof v === 'string' ? new Types.ObjectId(v) : v);

/** The shop's Main branch, made if it has none yet. Safe to call from anywhere, any number of times. */
export async function ensureMainBranch(orgId: string | Types.ObjectId) {
  const org = oid(orgId);
  const existing = await BranchModel.findOne({ organization: org, isMain: true }).lean();
  if (existing) return existing;
  try {
    return (await BranchModel.create({ organization: org, name: 'Main branch', isMain: true })).toObject();
  } catch (err) {
    // Two requests making it at once: the other one won, so use its.
    if ((err as { code?: number }).code === 11000) {
      const won = await BranchModel.findOne({ organization: org, isMain: true }).lean();
      if (won) return won;
    }
    throw err;
  }
}

/** Active branches, Main first. */
export async function listBranches(orgId: string, opts: { includeClosed?: boolean } = {}) {
  await ensureMainBranch(orgId);
  const filter: Record<string, unknown> = { organization: oid(orgId) };
  if (!opts.includeClosed) filter.active = true;
  return BranchModel.find(filter).sort({ isMain: -1, name: 1 }).lean();
}

/** How many active branches a shop has — what the plan limit and the price count. */
export async function branchCount(orgId: string | Types.ObjectId) {
  const n = await BranchModel.countDocuments({ organization: oid(orgId), active: true });
  return Math.max(1, n);
}

export interface BranchInput {
  name: string;
  address?: string;
  phone?: string;
}

export async function createBranch(orgId: string, input: BranchInput) {
  await ensureMainBranch(orgId);
  const org = await OrganizationModel.findById(orgId).select('plan limitOverrides').lean();
  if (!org) throw notFound('Shop');
  await assertWithinLimit(org.plan, 'outlets', await branchCount(orgId), (org.limitOverrides ?? null) as LimitOverrides | null);
  const name = input.name.trim();
  if (!name) throw badRequest('Give the branch a name');
  try {
    return (
      await BranchModel.create({
        organization: oid(orgId),
        name,
        address: input.address?.trim() ?? '',
        phone: input.phone?.trim() ?? '',
      })
    ).toObject();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('You already have a branch with that name');
    throw err;
  }
}

export async function updateBranch(orgId: string, id: string, input: Partial<BranchInput> & { active?: boolean }) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Branch');
  const b = await BranchModel.findOne({ _id: id, organization: oid(orgId) });
  if (!b) throw notFound('Branch');
  if (input.active === false && b.isMain) throw badRequest('The Main branch cannot be closed — rename it instead.');
  if (input.active === true && !b.active) {
    // Reopening counts against the limit like opening a new one.
    const org = await OrganizationModel.findById(orgId).select('plan limitOverrides').lean();
    await assertWithinLimit(org!.plan, 'outlets', await branchCount(orgId), (org!.limitOverrides ?? null) as LimitOverrides | null);
  }
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw badRequest('Give the branch a name');
    b.set('name', name);
  }
  if (input.address !== undefined) b.set('address', input.address.trim());
  if (input.phone !== undefined) b.set('phone', input.phone.trim());
  if (input.active !== undefined) b.set('active', input.active);
  try {
    await b.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('You already have a branch with that name');
    throw err;
  }
  return b.toObject();
}

/** One branch of this shop, or a 404 — never another shop's. */
export async function branchOf(orgId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Branch');
  const b = await BranchModel.findOne({ _id: id, organization: oid(orgId) }).lean();
  if (!b) throw notFound('Branch');
  return b;
}

/** Active branches per shop, for the console's lists. A shop with none recorded yet counts as one. */
export async function branchCounts(orgIds: (string | Types.ObjectId)[]) {
  const rows = await BranchModel.aggregate<{ _id: unknown; n: number }>([
    { $match: { organization: { $in: orgIds.map(oid) }, active: true } },
    { $group: { _id: '$organization', n: { $sum: 1 } } },
  ]);
  const m = new Map(rows.map((r) => [String(r._id), r.n]));
  return (id: string | Types.ObjectId) => Math.max(1, m.get(String(id)) ?? 1);
}

/**
 * The Branches page: the shop's branches, and what its plan says about them —
 * how many it may have, how many the price covers, and what one more costs —
 * so the owner sees the price before adding one, not on the next bill.
 */
export async function branchesPage(orgId: string) {
  const [branches, org] = await Promise.all([
    listBranches(orgId, { includeClosed: true }),
    OrganizationModel.findById(orgId).select('plan limitOverrides').lean(),
  ]);
  if (!org) throw notFound('Shop');
  const plan = (await planByKey(org.plan)) ?? (await trialPlan());
  const limits = effectiveLimits(plan?.limits ?? { outlets: 1, terminals: 1, shopUsers: 2 }, (org.limitOverrides ?? null) as LimitOverrides | null);
  const active = branches.filter((b) => b.active).length;
  const now = plan ? monthlyPrice(plan, Math.max(1, active)) : null;
  const next = plan ? monthlyPrice(plan, Math.max(1, active) + 1) : null;
  return {
    branches,
    plan: {
      name: plan?.name ?? org.plan,
      isTrial: plan?.isTrial ?? true,
      limit: limits.outlets,
      included: plan?.includedBranches ?? 1,
      extraBranchPrice: plan?.extraBranchPrice ?? 0,
    },
    /** What a month costs now, and what it would with one more branch. */
    monthlyNow: now?.total ?? 0,
    monthlyWithOneMore: next?.total ?? 0,
    canAdd: limits.outlets === null || active < limits.outlets,
  };
}
