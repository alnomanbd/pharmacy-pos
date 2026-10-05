import { env } from '../config/env.js';
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokens.js';
import { AppError, unauthorized, forbidden } from '../utils/AppError.js';
import { UserModel } from '../models/User.js';
import { OrganizationModel } from '../models/Organization.js';
import type { Role } from '../types/enums.js';
import { PLATFORM_ROLES } from '../types/roles.js';
import type { Permission } from '../types/permissions.js';
import { platformPermissionsOf, shopPermissionsOf } from '../services/accessRole.service.js';
import type { ShopPermission } from '../types/shopPermissions.js';

export interface AuthUser {
  id: string;
  org: string | null;
  role: Role;
  name: string;
  email: string;
  /** Platform staff only. The owner's set is filled in, not stored. */
  permissions?: Permission[];
  /** Shop staff only: what their role lets them do in the shop. The owner holds all of it. */
  shopPermissions?: ShopPermission[];
  /** An operator looking through the shop's own app, read-only. */
  impersonated?: boolean;
  /** Which operator, when `impersonated`. */
  impersonatedBy?: string;
}

/**
 * The state of the shop this request belongs to.
 *
 * `readOnly` is the expired-trial case: the shop keeps its login and can read
 * everything, and writes are refused. Locking a pharmacy out of its own stock
 * and dues at nine in the morning is a support call and a refund; letting them
 * read while nothing new can be entered is what actually gets renewed.
 */
export interface TenantContext {
  id: string;
  status: 'pending' | 'active' | 'suspended';
  plan: 'trial' | 'basic' | 'pro';
  readOnly: boolean;
  trialEndsAt: Date | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenant?: TenantContext;
      /** The screen's language, from the shop app's X-UI-Lang header — see middlewares/uiLang. */
      lang?: 'en' | 'bn';
    }
  }
}

/**
 * Whether this request must be turned away until the operator enrols.
 *
 * A separate function rather than a condition inside `requireAuth`, because the
 * interesting part is the *exemption list* — get that wrong in either direction
 * and you either leave a hole or lock an operator out of the screen that would
 * let them back in. A list that can be read in one place can be tested in one
 * place.
 *
 * Shop roles are untouched: two-factor is offered to them and not required.
 */
export function needsTwoFactorSetup(
  role: Role,
  twoFactorEnabled: boolean,
  path: string,
  required: boolean = env.security.operatorTwoFactorRequired,
): boolean {
  if (!required || !PLATFORM_ROLES.includes(role) || twoFactorEnabled) return false;
  /*
   * Matched on a *suffix*, not a prefix.
   *
   * `requireAuth` runs inside each router, where `req.path` is relative to the
   * mount point: a `GET /api/two-factor` arrives here as `/`. Matching the
   * front of the string meant the gate refused the one call that would let an
   * operator enrol, and the enrolment screen rendered empty with a 403 behind
   * it. The caller passes `req.baseUrl + req.path`, so what arrives is the
   * whole route and the ending is the stable part.
   */
  const enrolling =
    path.includes('/two-factor') ||
    path.endsWith('/auth/me') ||
    path.endsWith('/auth/logout') ||
    path.endsWith('/auth/change-password');
  return !enrolling;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw unauthorized('Missing token');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const user = await UserModel.findById(payload.sub).lean();
    if (!user || !user.isActive) throw unauthorized('Account not found or inactive');

    /*
     * Remembered per person, for what reaches them when they are not looking —
     * an email, a push at nine in the evening. The shop app says which language
     * its screen is in on every request; only a change is written, and not on
     * an operator's support view of somebody else's account.
     */
    const said = req.headers['x-ui-lang'];
    if ((said === 'bn' || said === 'en') && user.lang !== said && !payload.imp) {
      void UserModel.updateOne({ _id: user._id }, { $set: { lang: said } }).catch(() => undefined);
    }

    req.user = {
      id: user._id.toString(),
      org: user.organization ? user.organization.toString() : null,
      role: user.role,
      name: user.name,
      email: user.email,
      permissions: await platformPermissionsOf(user as { role?: string; permissions?: string[]; accessRole?: unknown }),
      shopPermissions: user.organization
        ? await shopPermissionsOf(user as { role?: string; accessRole?: unknown; organization?: unknown })
        : [],
      impersonated: Boolean(payload.imp),
      impersonatedBy: payload.by,
    };

    /*
     * A support view is for looking.
     *
     * Ringing up a sale, changing a price or writing off stock on a shop's
     * behalf is not support — it is somebody else's books with our name nowhere
     * on them. Refused here rather than per route, so the next endpoint cannot
     * forget it; `SAFE_METHODS` is the same set the read-only trial uses.
     */
    if (payload.imp && !SAFE_METHODS.has(req.method)) {
      throw forbidden('Support view is read-only. Nothing can be changed from here.');
    }

    /*
     * An operator account must carry a second factor.
     *
     * These are the accounts that can suspend a shop, export any shop's
     * records, and change what everyone pays. A password alone is not enough for
     * that, and making it optional means the one account that matters most is
     * protected by whoever remembered to turn it on.
     *
     * Enforced here rather than per route, so an endpoint added to the console
     * next month is covered without anybody remembering to cover it. The two
     * ways out are left open: enrol, or leave.
     */
    // `req.baseUrl + req.path` — the whole route. `req.path` alone is relative to
    // whichever router this middleware is mounted inside.
    const routePath = `${req.baseUrl}${req.path}`;
    if (needsTwoFactorSetup(req.user.role, Boolean(user.twoFactorEnabled), routePath)) {
      throw new AppError(
        403,
        'TWO_FACTOR_SETUP_REQUIRED',
        'Set up two-factor authentication before using the console',
      );
    }

    // The one place a shop's lifecycle is enforced. Before this existed,
    // `Organization.isActive` was written but never read, so a shop could not
    // be suspended — and suspending it would have changed nothing.
    //
    // A platform admin has no organization and is deliberately outside it.
    if (req.user.org) {
      const org = await OrganizationModel.findById(req.user.org)
        .select('status plan trialEndsAt suspendedReason')
        .lean();
      if (!org) throw unauthorized('This account is not attached to a shop');
      req.tenant = tenantContextOf(org);
      assertTenantUsable(req.tenant, org.suspendedReason);
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Restricts a route to a set of roles. Prefer the named sets in types/roles.ts
 * over listing roles inline — an inline list is where a role gets quietly
 * missed.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(forbidden('Not authenticated'));
    if (!roles.includes(req.user.role)) return next(forbidden('Insufficient permissions'));
    next();
  };
}

/**
 * Derives the request-time view of a shop from its stored lifecycle.
 *
 * `trialEndsAt` is the date the shop is trialled *or paid* up to, so past it the
 * shop is read-only on any plan — a lapsed subscription stops writing exactly as
 * a lapsed trial does, until a payment moves the date forward.
 */
export function tenantContextOf(org: {
  _id: unknown;
  status?: string | null;
  plan?: string | null;
  trialEndsAt?: Date | null;
}): TenantContext {
  const plan = (org.plan || 'trial') as TenantContext['plan'];
  const trialEndsAt = org.trialEndsAt ?? null;
  return {
    id: String(org._id),
    status: (org.status || 'active') as TenantContext['status'],
    plan,
    trialEndsAt,
    readOnly: trialEndsAt !== null && trialEndsAt < new Date(),
  };
}

/**
 * Refuses a sign-in that should not happen at all, with a message the shop can
 * act on — an unexplained failure at the login screen is worse than the lockout
 * itself. An expired trial is not refused here; it is handled by `readOnly`.
 */
export function assertTenantUsable(tenant: TenantContext, suspendedReason?: string | null) {
  if (tenant.status === 'pending') {
    throw forbidden('This shop is awaiting approval. We will email you as soon as it is open — usually within a day.');
  }
  if (tenant.status === 'suspended') {
    throw forbidden(
      suspendedReason
        ? `This shop is suspended: ${suspendedReason}`
        : 'This shop is suspended. Please contact Dawai support.',
    );
  }
}

/** Methods that only read. A read-only shop must still be able to use these. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses writes while a shop is read-only, and lets reads through.
 *
 * Applied whole-router rather than per-route so a new endpoint is covered by
 * default instead of by someone remembering — which is why it filters on the
 * method itself: mounting it on the router must not take the shop's own
 * records away from it, only its ability to add to them.
 */
export function requireWritableTenant(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.tenant?.readOnly) {
    return next(
      forbidden('Your trial has ended. You can still read your records — renew to make changes.'),
    );
  }
  next();
}

/**
 * Restricts a route to holders of a permission.
 *
 * Per-route rather than per-router, because that is the whole point: a support
 * agent and a billing clerk both reach the console, and what separates them is
 * which of these they pass. The owner (`platformAdmin`) holds every permission
 * implicitly and passes them all.
 */
/**
 * A shop route for whoever's role allows any of these — the shop's own
 * roles, the way `requirePermission` is the console's.
 */
export function requireShopPermission(...permissions: ShopPermission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(forbidden('Not authenticated'));
    const held = req.user.shopPermissions ?? [];
    if (!permissions.some((p) => held.includes(p))) {
      return next(forbidden('Your role does not allow this — ask the shop owner'));
    }
    next();
  };
}

/**
 * The shop's back-room routes, by path: each path names what reading it and
 * changing it take. A path nobody named needs `settings.manage` — a new
 * route is closed until somebody says who it is for, never open by accident.
 */
export function shopPathGate(
  rules: { path: string; read: ShopPermission | null; write: ShopPermission | null }[],
  fallback: ShopPermission | null = 'settings.manage',
) {
  const sorted = [...rules].sort((a, b) => b.path.length - a.path.length);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(forbidden('Not authenticated'));
    const rule = sorted.find((r) => req.path === r.path || req.path.startsWith(`${r.path}/`) || (r.path.endsWith('/') && req.path.startsWith(r.path)));
    const reading = req.method === 'GET' || req.method === 'HEAD';
    const needed = rule ? (reading ? rule.read : rule.write) : fallback;
    if (needed === null) return next();
    if (!(req.user.shopPermissions ?? []).includes(needed)) {
      return next(forbidden('Your role does not allow this — ask the shop owner'));
    }
    next();
  };
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(forbidden('Not authenticated'));
    const held = req.user.permissions ?? [];
    const ok = permissions.some((p) => held.includes(p));
    if (!ok) {
      return next(
        forbidden(`You do not have permission to do this (${permissions.join(' or ')})`),
      );
    }
    next();
  };
}
