import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { UserModel, OrganizationModel, ImpersonationHandoffModel } from '../models/index.js';
import { signAccessToken, hashToken } from '../utils/tokens.js';
import { badRequest, notFound, unauthorized } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { PLATFORM_ROLES } from '../types/roles.js';

/**
 * Seeing what a shop sees, for support.
 *
 * An owner rings and says "the stock is wrong" or "the bill printed twice", and
 * there is otherwise no way to look. Asking for their password is what people
 * actually resort to, and that is far worse: unlogged, unbounded, and it hands
 * over an account that can also change its own password.
 *
 * So this is deliberately narrow:
 *
 * - **Read-only.** The token carries `imp: true`, and `requireAuth` refuses
 *   every write while it is set. Nothing is sold, priced or written off on a
 *   shop's behalf.
 * - **Short.** Thirty minutes and no refresh token. It expires rather than
 *   being revoked, because a session nobody remembered to end is the usual
 *   failure.
 * - **Named in the audit trail.** The entry records the operator, not the shop
 *   user — "who looked at this" must have an answer.
 * - **Never an operator.** A console account cannot be viewed as.
 *
 * The console and the shop app are separate origins, so this happens in two
 * steps: the console is issued a one-time code, and the shop app trades it for
 * the session. See `models/ImpersonationHandoff.ts` for why the code, and not
 * the token, is what travels in the URL.
 */
export const IMPERSONATION_TTL = '30m';
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

/** Long enough to click, short enough that a leaked URL is already dead. */
export const HANDOFF_TTL_MS = 60 * 1000;

/** One answer for expired, already used and never existed — which of the three is not the caller's to learn. */
export const STALE_LINK = 'That support link is no longer valid';

/** Why a user cannot be viewed as, or null when they can. */
export function cannotViewAs(user: { role: string; isActive?: boolean | null; organization?: unknown }): string | null {
  if ((PLATFORM_ROLES as string[]).includes(user.role)) return 'Operator accounts cannot be viewed as';
  if (!user.isActive) return 'That account is deactivated';
  if (!user.organization) return 'That account is not attached to a shop';
  return null;
}

export async function impersonate(operatorId: string, targetUserId: string, shopId?: string) {
  if (!Types.ObjectId.isValid(targetUserId)) throw notFound('User');
  const target = await UserModel.findById(targetUserId)
    .select('name email phone role organization isActive deletedAt')
    .lean();
  if (!target || target.deletedAt) throw notFound('User');
  // From a shop's page, the user must be that shop's.
  if (shopId && String(target.organization) !== shopId) throw notFound('User');
  const refused = cannotViewAs(target);
  if (refused) throw badRequest(refused);

  const org = await OrganizationModel.findById(target.organization).select('name status').lean();
  if (!org) throw notFound('Shop');

  const code = crypto.randomBytes(32).toString('hex');
  await ImpersonationHandoffModel.create({
    codeHash: hashToken(code),
    targetUser: target._id,
    operator: operatorId,
    organization: target.organization,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  });

  logger.warn({ operator: operatorId, target: String(target._id), shop: org.name }, 'Support view code issued');

  return {
    code,
    expiresInMs: HANDOFF_TTL_MS,
    viewing: {
      user: { id: String(target._id), name: target.name, email: target.email, role: target.role },
      shop: { id: String(target.organization), name: org.name, status: org.status },
    },
  };
}

/**
 * The website's "Try the demo".
 *
 * The same read-only door as a support view — a one-time code the shop app
 * trades for a thirty-minute session that cannot write — opened onto the one
 * shop the console has named as the demo. Off, or pointed at an account that
 * cannot be viewed, it says so and opens nothing.
 */
export async function startDemo() {
  const { getSiteSettings } = await import('./siteSettings.service.js');
  const s = await getSiteSettings();
  if (!s.demo.enabled) throw badRequest('The demo is not open right now.');
  const target = await UserModel.findOne({ email: s.demo.email, deletedAt: null })
    .select('role organization isActive')
    .lean();
  if (!target || cannotViewAs(target)) throw badRequest('The demo is not open right now.');

  const code = crypto.randomBytes(32).toString('hex');
  await ImpersonationHandoffModel.create({
    codeHash: hashToken(code),
    targetUser: target._id,
    operator: target._id,
    organization: target.organization,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
    demo: true,
  });
  return { code };
}

/**
 * Trades a handoff code for the read-only session it stands for.
 *
 * Unauthenticated on purpose: the caller is the shop app, which has no session
 * yet — the code *is* the credential. Claiming is a compare-and-set on
 * `usedAt`, so two tabs racing the same code cannot both get a session, and a
 * replayed URL gets nothing.
 */
export async function claimImpersonation(code: string) {
  const claimed = await ImpersonationHandoffModel.findOneAndUpdate(
    { codeHash: hashToken(code), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  ).lean();
  if (!claimed) throw unauthorized(STALE_LINK);

  const target = await UserModel.findById(claimed.targetUser)
    .select('name email phone role organization isActive twoFactorEnabled deletedAt')
    .lean();
  if (!target || target.deletedAt || cannotViewAs(target)) throw unauthorized(STALE_LINK);

  const org = await OrganizationModel.findById(claimed.organization).select('name status').lean();
  if (!org) throw unauthorized(STALE_LINK);

  const operator = await UserModel.findById(claimed.operator).select('name').lean();

  const accessToken = signAccessToken(
    {
      sub: String(target._id),
      org: String(target.organization),
      role: target.role,
      // Read by requireAuth. Its absence is what makes an ordinary session
      // writable, so a forged token cannot gain writes by dropping the flag.
      imp: true,
      by: String(claimed.operator),
    },
    IMPERSONATION_TTL,
  );

  if (claimed.demo) logger.info({ shop: org.name }, 'Demo opened from the website');
  else
    logger.warn(
      { operator: String(claimed.operator), target: String(target._id), shop: org.name },
      'Support view opened',
    );

  return {
    accessToken,
    expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS).toISOString(),
    // The same shape a sign-in hands back, so the shop app treats it as one.
    user: {
      id: String(target._id),
      name: target.name,
      email: target.email,
      phone: target.phone,
      role: target.role,
      organizationId: String(target.organization),
      twoFactorEnabled: Boolean(target.twoFactorEnabled),
      twoFactorRequired: false,
    },
    viewing: {
      shop: { id: String(target.organization), name: org.name, status: org.status },
      operator: claimed.demo ? '' : (operator?.name ?? ''),
      demo: Boolean(claimed.demo),
    },
  };
}
