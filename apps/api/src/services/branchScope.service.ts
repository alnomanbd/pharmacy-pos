import { Types } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import {
  BranchModel,
  UserModel,
  StockBatchModel,
  StockLedgerModel,
  SaleModel,
  ShopCounterModel,
  ShiftModel,
  PurchaseModel,
  StockCountModel,
  ShopOrderModel,
  CashMoveModel,
  ExpenseModel,
  IncomeModel,
  OrganizationModel,
  CustomerLedgerModel,
  SupplierLedgerModel,
} from '../models/index.js';
import { ensureMainBranch } from './branch.service.js';
import { badRequest } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Which branch a request is about.
 *
 * Two answers, because reading and writing differ:
 * - **show** — the branches a list or a report covers: one branch, or all the
 *   person may see. `null` means every branch of the shop.
 * - **write** — where a new bill, delivery, count or expense goes: always
 *   exactly one branch, or `null` when the owner is looking at "All branches"
 *   of a shop with several and nothing says which one is meant.
 *
 * The shop app says which branch it is on in the `X-Branch` header. A shop
 * with one branch never sends it, and is simply on its Main branch. Staff
 * limited to some branches (`User.branches`) never see the others, whatever
 * the header says.
 */
export interface BranchScope {
  show: Types.ObjectId[] | null;
  write: Types.ObjectId | null;
  /** How many branches the shop has, so the app knows whether to show any of this. */
  count: number;
  /** Every branch this person may switch to. */
  visible?: Types.ObjectId[];
}

/** A query fragment that keeps a read to the branches in scope. Empty for "all". */
export function branchMatch(scope?: BranchScope | null): Record<string, unknown> {
  if (!scope?.show) return {};
  return scope.show.length === 1 ? { branch: scope.show[0] } : { branch: { $in: scope.show } };
}

/** Where a write goes, or a refusal the owner can act on. */
export async function writeBranchOf(actor: { org: string; branch?: BranchScope | null }): Promise<Types.ObjectId> {
  if (actor.branch?.write) return actor.branch.write;
  if (actor.branch && actor.branch.count > 1) {
    throw badRequest('Pick a branch at the top of the screen first — this goes into one branch.');
  }
  // No scope given (a service called from elsewhere) or a single-branch shop: the Main branch.
  return (await ensureMainBranch(actor.org))._id as Types.ObjectId;
}

/**
 * The branch to stamp on money that belongs to the whole shop but went
 * through one drawer — a baki payment, a payment to a company. The branch in
 * view, or Main when the owner is looking at all of them; never a refusal,
 * because settling a customer's account is not something to block.
 */
export async function branchOrMain(actor: { org: string; branch?: BranchScope | null }): Promise<Types.ObjectId> {
  if (actor.branch?.write) return actor.branch.write;
  return (await ensureMainBranch(actor.org))._id as Types.ObjectId;
}

/**
 * Every branch this person may switch to, rather than the one in view. For
 * the few look-ups that cross branches on purpose — a customer bringing back
 * at one branch what they bought at another.
 */
export function visibleMatch(scope?: BranchScope | null): Record<string, unknown> {
  if (!scope?.visible || scope.count <= 1) return {};
  return { branch: { $in: scope.visible } };
}

/** Whether a record's branch is one this request may touch. Records from before branches have none. */
export function inScope(scope: BranchScope | null | undefined, branch: unknown) {
  if (!scope?.show || !branch) return true;
  return scope.show.some((b) => String(b) === String(branch));
}

/**
 * Works out the scope for this request and puts it on `req.branchScope`.
 * Mounted after `requireAuth` on the shop's routers.
 */
export async function attachBranch(req: Request, _res: Response, next: NextFunction) {
  try {
    const org = req.user?.org;
    if (!org) return next();
    const main = await ensureMainBranch(org);
    const branches = await BranchModel.find({ organization: org, active: true }).select('_id').lean();
    const all = branches.map((b) => b._id as Types.ObjectId);
    const user = await UserModel.findById(req.user!.id).select('branches role').lean();
    const assigned = ((user as { branches?: Types.ObjectId[] } | null)?.branches ?? []).map(String);
    // The owner sees every branch; anybody else, the ones they are assigned to (none assigned: all).
    const allowed =
      req.user!.role === 'admin' || !assigned.length ? all : all.filter((b) => assigned.includes(String(b)));
    const visible = allowed.length ? allowed : [main._id as Types.ObjectId];

    const asked = String(req.headers['x-branch'] ?? '').trim();
    const picked = asked && asked !== 'all' ? visible.find((b) => String(b) === asked) : undefined;

    let scope: BranchScope;
    if (picked) scope = { show: [picked], write: picked, count: all.length, visible };
    else if (visible.length === 1) scope = { show: all.length > 1 ? visible : null, write: visible[0], count: all.length, visible };
    else scope = { show: visible.length === all.length ? null : visible, write: null, count: all.length, visible };

    (req as Request & { branchScope?: BranchScope }).branchScope = scope;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * What the app's branch switcher shows: the branches this person can work in,
 * and which one this request is on (`null`: all of them). A shop with one
 * branch gets `count: 1`, and the app shows nothing at all.
 */
export async function switcherOf(org: string, scope: BranchScope | undefined) {
  const ids = scope?.visible ?? [];
  const rows = await BranchModel.find({ organization: org, _id: { $in: ids } })
    .select('name isMain address phone')
    .sort({ isMain: -1, name: 1 })
    .lean();
  return {
    count: scope?.count ?? 1,
    branches: rows.map((b) => ({ _id: String(b._id), name: b.name, isMain: b.isMain, address: b.address ?? '', phone: b.phone ?? '' })),
    current: scope?.write ? String(scope.write) : null,
    /* "All branches" is for whoever can see more than one. */
    canSeeAll: rows.length > 1,
  };
}

/** The scope `attachBranch` worked out, for `actorOf`. */
export const scopeOf = (req: Request) => (req as Request & { branchScope?: BranchScope }).branchScope;

/**
 * Puts every record made before branches existed into its shop's Main branch.
 *
 * Run at start-up. Idempotent: it only touches records with no branch, so the
 * second run does nothing, and a shop that never opens a second branch keeps
 * working exactly as before — its one branch holds everything.
 */
export async function assignMainBranches() {
  const models = [
    StockBatchModel,
    StockLedgerModel,
    SaleModel,
    ShopCounterModel,
    ShiftModel,
    PurchaseModel,
    StockCountModel,
    ShopOrderModel,
    CashMoveModel,
    ExpenseModel,
    IncomeModel,
    CustomerLedgerModel,
    SupplierLedgerModel,
  ];
  const orgs = await OrganizationModel.find({}).select('_id').lean();
  let moved = 0;
  for (const o of orgs) {
    const main = await ensureMainBranch(o._id as Types.ObjectId);
    for (const m of models) {
      const r = await (m as unknown as { updateMany: (f: object, u: object) => Promise<{ modifiedCount: number }> }).updateMany(
        { organization: o._id, $or: [{ branch: { $exists: false } }, { branch: null }] },
        { $set: { branch: main._id } },
      );
      moved += r.modifiedCount;
    }
  }
  if (moved) logger.info({ moved }, 'Records put into their shop’s Main branch');
  return moved;
}
