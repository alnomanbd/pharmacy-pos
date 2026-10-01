import type { Request } from 'express';
import { AuditLogModel, type AuditAction } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

export interface AuditTarget {
  model: string;
  id?: string | unknown;
  /** Human-readable handle, so the log reads without joining. */
  label?: string;
}

export interface AuditActor {
  org?: string | unknown;
  id?: string | unknown;
  name?: string;
  role?: string;
  ip?: string;
}

/**
 * Records an audited action with explicit actor and organization.
 *
 * This is the low-level writer. `audit()` wraps it for the common case where
 * everything comes from `req.user`; login and other pre-session events call it
 * directly because there is no authenticated request to read from.
 */
export async function recordAudit(
  actor: AuditActor,
  action: AuditAction,
  target: AuditTarget,
  changes?: { before?: unknown; after?: unknown },
) {
  try {
    await AuditLogModel.create({
      organization: actor.org ?? undefined,
      actor: actor.id,
      actorName: actor.name ?? '',
      actorRole: actor.role ?? '',
      action,
      target: { model: target.model, id: target.id, label: target.label ?? '' },
      before: changes?.before,
      after: changes?.after,
      ip: actor.ip ?? '',
    });
  } catch (err) {
    logger.error({ err, action, target }, 'Audit write failed');
  }
}

/**
 * Records an audited action.
 *
 * Never throws and never awaits the caller's critical path into failure: an
 * audit write that fails must not roll back the operation the user asked for.
 */
export async function audit(
  req: Request,
  action: AuditAction,
  target: AuditTarget,
  changes?: { before?: unknown; after?: unknown },
) {
  await recordAudit(
    { org: req.user?.org, id: req.user?.id, name: req.user?.name, role: req.user?.role, ip: req.ip },
    action,
    target,
    changes,
  );
}

/** Trail for the org, newest first. Read-only — nothing edits an entry. */
export async function listAuditLogs(
  orgId: string,
  opts: { action?: string; targetId?: string; page?: number; limit?: number } = {},
) {
  const filter: Record<string, unknown> = { organization: orgId };
  if (opts.action) filter.action = opts.action;
  if (opts.targetId) filter['target.id'] = opts.targetId;

  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 200);

  const [data, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return { data, total, page, limit };
}

/**
 * The platform's own trail.
 *
 * Every audited action a *platform* admin takes is written with no
 * `organization` — they do not belong to one — and `listAuditLogs` filters by
 * org. So suspending a shop, moving it between plans, deleting it, setting
 * one of its users' passwords and granting somebody console access were all
 * recorded faithfully and then readable by nobody. This is the reader.
 *
 * ## What it deliberately does not return
 *
 * Not "every row without an organization, plus everything else". A platform
 * operator holding `audit.view` must not thereby gain a window onto the trade
 * inside customer shops — who rang up which bill, who voided which sale. Those
 * rows are the shop's own trail and are read on the shop's own Activity page.
 *
 * So the filter is: rows with no organization (which is what platform actions
 * are), **and** an action in `PLATFORM_ACTIONS`. Both conditions, so a stray
 * org-less shop row — a bug elsewhere, a hand-edited document — still does
 * not leak through.
 */
const PLATFORM_ACTIONS: readonly string[] = [
  /*
   * Exactly the actions a platform operator emits — checked against the call
   * sites, not against the enum: `AUDIT_ACTIONS` also declares names nothing
   * writes yet, and a filter offering those would be a screen of empty
   * options.
   *
   * The session half of this list matters as much as the rest. Only failed
   * sign-ins were listed, so the trail could show somebody failing to get in
   * and never show them succeeding, or leaving — which is precisely the pair
   * that makes a trail answer "who was in the console at the time". An
   * operator's row carries no organization, so listing the shared session
   * actions here surfaces operators without opening a window onto the
   * customers' own sign-ins, which stay on their Activity page.
   */
  'auth.login',
  'auth.logout',
  'auth.failed_login',
  'auth.session.revoke',
  'auth.session.revoke_others',
  'password.change',
  'password.reset',
  'twoFactor.setup',
  'twoFactor.disable',

  /*
   * What an operator does to a customer. Approving, suspending, re-planning
   * and permanently deleting all arrive as `organization.platform_update` with
   * the change in `after`; the label carries which one it was. The other four
   * were being written and then shown to nobody: opening an account over the
   * phone, correcting a customer's details, correcting one of their users, and
   * setting that user's password.
   */
  'organization.platform_create',
  'organization.platform_update',
  'organization.platform_profile',
  'user.platform_update',
  'user.platform_password',

  /* The shared catalogue, and the shops' requests for what it lacks. */
  'catalogue.medicine_create',
  'catalogue.medicine_update',
  'catalogue.medicine_delete',
  'catalogue.ref_create',
  'catalogue.ref_update',
  'catalogue.ref_delete',
  'catalogue.request_approve',
  'catalogue.request_reject',

  /* The console's own people. */
  'user.update',
  'team.member_update',
  'team.member_password',
  'team.member_2fa_reset',
  'user.platform_2fa_reset',
];

export async function listPlatformAuditLogs(
  opts: { action?: string; actorId?: string; page?: number; limit?: number } = {},
) {
  const filter: Record<string, unknown> = {
    organization: { $in: [null, undefined] },
    action: { $in: PLATFORM_ACTIONS },
  };
  /* A named action narrows the list, but only within the platform set — asking
     for `sale.void` returns nothing rather than everything. */
  if (opts.action && PLATFORM_ACTIONS.includes(opts.action)) filter.action = opts.action;
  if (opts.actorId) filter.actor = opts.actorId;

  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(opts.limit || 50, 200);

  const [rows, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  return {
    data: rows.map((r) => ({
      _id: String(r._id),
      action: String(r.action),
      actorName: String(r.actorName ?? ''),
      actorRole: String(r.actorRole ?? ''),
      target: {
        model: String(r.target?.model ?? ''),
        id: r.target?.id ? String(r.target.id) : '',
        label: String(r.target?.label ?? ''),
      },
      /* The diff is kept, because "changed the plan" without saying from what
         is not an audit trail. */
      before: r.before ?? null,
      after: r.after ?? null,
      ip: String(r.ip ?? ''),
      createdAt: r.createdAt,
    })),
    total,
    page,
    limit,
    /** So the console can offer exactly the filters that can return something. */
    actions: PLATFORM_ACTIONS,
  };
}

/**
 * Picks out just the fields a patch actually changes, so the trail stores a diff
 * rather than a duplicate of the record.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null | undefined,
  patch: Record<string, unknown>,
) {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    const from = before?.[key];
    const to = patch[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changedBefore[key] = from;
    changedAfter[key] = to;
  }
  return { before: changedBefore, after: changedAfter };
}
