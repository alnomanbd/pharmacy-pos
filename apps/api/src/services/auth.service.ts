import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { UserModel, OrganizationModel, type UserDoc } from '../models/index.js';
import { tenantContextOf, assertTenantUsable } from '../middlewares/auth.js';
import { AppError, unauthorized, conflict, badRequest } from '../utils/AppError.js';
import { env } from '../config/env.js';
import * as notify from './notification.service.js';
import { verifyCode } from './twoFactor.service.js';
import { TERMS_VERSION } from '../validators/auth.validator.js';
import { convertLeadForEmail } from './lead.service.js';
import { trialPlan, signupLimitOverrides } from './plan.service.js';
import { logger } from '../utils/logger.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  type TokenPayload,
} from '../utils/tokens.js';
import type { Role } from '../types/enums.js';

export interface LoginResult {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
    organizationId?: string;
    /**
     * Whether a second factor is already set up — so the operator console can
     * put an operator straight into enrolment instead of a screen of refusals.
     */
    twoFactorEnabled: boolean;
    /**
     * Whether this account has to have a second factor before it can do
     * anything. Operators only, and only while `OPERATOR_2FA_REQUIRED` is on —
     * the console reads this rather than guessing from `twoFactorEnabled`.
     */
    twoFactorRequired: boolean;
  };
  accessToken: string;
  refreshToken: string;
}

export interface RegistrationResult {
  organizationId: string;
  organizationName: string;
  status: 'pending';
  message: string;
}

/**
 * Self-serve shop sign-up, from the marketing site.
 *
 * Creates the shop in `pending` and issues **no session**: an operator approves
 * it first (and usually rings the owner to set the counter up). Signing the
 * owner straight in would drop them into an app that refuses every request,
 * which reads as a broken product rather than a queue they are waiting in.
 */
export async function registerShop(payload: {
  organizationName: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  counters?: number;
  /** Branches they run. Recorded, not enforced. */
  outlets?: number;
  /** Their drug licence number, as typed. */
  licence?: string;
  /** Where they came from, if the page could tell. Never trusted beyond a label. */
  attribution?: {
    channel?: string;
    agentCode?: string;
    fbclid?: string;
    utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  };
  intendedPlan?: string;
}): Promise<RegistrationResult> {
  if (await UserModel.findOne({ email: payload.email.toLowerCase() })) {
    throw conflict('Email already registered');
  }
  if (await UserModel.findOne({ phone: payload.phone })) {
    throw conflict('Phone already registered');
  }

  /*
   * A shop that runs ten counters has to be able to try ten counters. The trial
   * plan allows one, so the shop is given its own ceilings for as many as it
   * said, and a login per counter plus the owner. The operator can change
   * them on the shop's page; nothing here is a price.
   */
  const trial = await trialPlan();
  const overrides = signupLimitOverrides(payload.counters, trial?.limits.shopUsers ?? 2);

  const org = await OrganizationModel.create({
    name: payload.organizationName,
    status: 'pending',
    plan: 'trial',
    /*
     * One counter is a Basic shop; more than one is a Plus shop — including
     * past Plus's own five, where the operator prices the extra counters.
     * Offered first on billing.
     */
    intendedPlan: payload.intendedPlan || ((payload.counters ?? 1) > 1 ? 'plus' : 'basic'),
    signup: {
      counters: payload.counters ?? null,
      outlets: payload.outlets ?? null,
      licence: payload.licence?.trim() ?? '',
    },
    limitOverrides: overrides,
  });

  const owner = await UserModel.create({
    organization: org._id,
    role: 'admin',
    termsAcceptedAt: new Date(),
    termsVersion: TERMS_VERSION,
    name: payload.name,
    email: payload.email.toLowerCase(),
    phone: payload.phone,
    passwordHash: await bcrypt.hash(payload.password, 12),
  });

  /*
   * Where this customer came from — written once, at sign-up, and never
   * rewritten: "which campaign produced this shop" has one answer, the first
   * touch. Matched to an earlier enquiry by email, which also closes that
   * enquiry as won.
   */
  const converted = await convertLeadForEmail(payload.email, org.id);
  org.set('acquisition', {
    lead: converted?._id ?? null,
    channel: payload.attribution?.channel || (converted ? 'lead' : 'direct'),
    campaign: payload.attribution?.utm?.campaign || converted?.utm?.campaign || '',
    agentCode: payload.attribution?.agentCode || '',
    fbclid: payload.attribution?.fbclid || converted?.fbclid || '',
    utm: {
      source: payload.attribution?.utm?.source || converted?.utm?.source || '',
      medium: payload.attribution?.utm?.medium || converted?.utm?.medium || '',
      campaign: payload.attribution?.utm?.campaign || converted?.utm?.campaign || '',
      content: payload.attribution?.utm?.content || converted?.utm?.content || '',
      term: payload.attribution?.utm?.term || converted?.utm?.term || '',
    },
    firstTouchAt: converted?.createdAt ?? new Date(),
  });

  // Whoever signs up owns the shop; every later authority question resolves to this.
  org.set('owner', owner._id);
  await org.save();

  logger.info(
    {
      org: org.id,
      name: org.name,
      counters: payload.counters ?? null,
      outlets: payload.outlets ?? null,
      limitOverrides: overrides,
    },
    'New shop registered, awaiting approval',
  );

  // The owner is told it is being reviewed, the operator that there is something
  // to review. Neither send can fail the registration.
  void notify.shopRegistered({ email: owner.email, name: owner.name, shop: org.name });
  void notify.shopAwaitingApproval(org.name);
  void sendEmailVerification(owner.id);

  return {
    organizationId: org.id,
    organizationName: org.name,
    status: 'pending',
    message: 'Your shop has been submitted for approval. We will email you as soon as it is open.',
  };
}

/**
 * Raised when the password was right but a second factor is still needed.
 *
 * A distinct error rather than a plain refusal, so the client knows to ask for a
 * code instead of telling the user their password was wrong.
 */
export class TwoFactorRequired extends AppError {
  constructor() {
    // An AppError, so the handler returns it as a 401 with its code rather than
    // logging it as an unhandled fault and answering 500.
    super(401, 'TWO_FACTOR_REQUIRED', 'Enter the code from your authenticator app');
  }
}

/**
 * How long an account stops answering after repeated failures.
 *
 * Nothing happens for the first four — people mistype their own password, and
 * locking them out of the till at 9am is a support call. The fifth costs a
 * minute, and each one after that costs twice the last, to a ceiling of half an
 * hour. A person who has forgotten their password waits a minute and tries
 * again; a script working through a word list gets four attempts an hour.
 */
const LOCK_AFTER_FAILURES = 5;
const LOCK_BASE_MS = 60_000;
const LOCK_MAX_MS = 30 * 60_000;

export function lockDurationFor(failures: number): number {
  const step = Math.max(0, failures - LOCK_AFTER_FAILURES);
  return Math.min(LOCK_BASE_MS * 2 ** step, LOCK_MAX_MS);
}

/**
 * Counts a failure and locks the account once there have been enough.
 *
 * Deliberately silent about what it did: the caller throws the same
 * "Invalid credentials" either way, so a wrong password and a wrong password
 * against a locked account are indistinguishable until the lock itself answers.
 */
async function recordFailedLogin(user: UserDoc): Promise<void> {
  const failures = (user.failedLoginCount ?? 0) + 1;
  user.set('failedLoginCount', failures);
  if (failures >= LOCK_AFTER_FAILURES) {
    user.set('lockedUntil', new Date(Date.now() + lockDurationFor(failures)));
    logger.warn({ user: user.id, failures }, 'Account locked after repeated failed sign-ins');
  }
  await user.save();
}

export async function login(
  email: string,
  password: string,
  twoFactorCode?: string,
  meta: SessionMeta = {},
): Promise<LoginResult> {
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select(
    '+failedLoginCount +lockedUntil',
  );
  if (!user || !user.isActive) throw unauthorized('Invalid credentials');

  /*
   * Told plainly rather than hidden behind "invalid credentials". Someone whose
   * own account is locked needs to know to wait rather than to keep guessing,
   * and the alternative — silence — teaches them nothing while costing the
   * attacker nothing either. It reveals that the address exists, which
   * registration already reveals by refusing a duplicate.
   */
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw new AppError(
      429,
      'ACCOUNT_LOCKED',
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await recordFailedLogin(user);
    throw unauthorized('Invalid credentials');
  }

  // Same lifecycle check as requireAuth, run here so a pending or suspended
  // shop is told why at the login screen rather than on some later request.
  if (user.organization) {
    const org = await OrganizationModel.findById(user.organization)
      .select('status plan trialEndsAt suspendedReason')
      .lean();
    if (!org) throw unauthorized('This account is not attached to a shop');
    assertTenantUsable(tenantContextOf(org), org.suspendedReason);
  }

  // Checked after the password, so a wrong password never reveals whether an
  // account has a second factor at all.
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) throw new TwoFactorRequired();
    if (!(await verifyCode(user.id, twoFactorCode))) {
      // A wrong second factor counts too: a stolen password plus a guessed code
      // is the attack this exists to slow down.
      await recordFailedLogin(user);
      throw unauthorized('That code is not right');
    }
  }

  /*
   * Is this somewhere new?
   *
   * Judged before the session is recorded, and on the user agent rather than the
   * address — an owner moves between the shop's connection and mobile data all
   * evening, and an alert on every hop is an alert nobody reads. A browser this
   * account has not signed in from before is the thing worth a message.
   */
  const known = (user.sessions ?? []).some(
    (s) => s.userAgent && s.userAgent === (meta.userAgent ?? '').slice(0, 300),
  );
  const firstEver = (user.sessions ?? []).length === 0;

  user.lastLoginAt = new Date();
  // A sign-in that worked clears the slate. Only *consecutive* failures count,
  // or a busy account would eventually lock itself out over months.
  user.set('failedLoginCount', 0);
  user.set('lockedUntil', null);
  await user.save();

  if (!firstEver && !known) {
    // Never blocks the sign-in, and never throws: an alert is worth nothing if
    // it can stop somebody getting into their own account.
    void notify.newDeviceSignIn({
      email: user.email,
      name: user.name,
      at: new Date(),
      ip: meta.ip ?? '',
      userAgent: meta.userAgent ?? '',
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    org: user.organization?.toString() ?? null,
    role: user.role,
  });
  const refreshToken = await issueRefreshToken(user.id, meta);

  return serializeLogin(
    user,
    user.organization?.toString(),
    accessToken,
    refreshToken,
  );
}

export async function refresh(
  refreshToken: string,
  meta: SessionMeta = {},
): Promise<LoginResult> {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Invalid refresh token');
  }

  const hashed = hashToken(refreshToken);
  const user = await UserModel.findById(payload.sub);
  const session = user?.sessions?.find((s) => s.tokenHash === hashed);
  if (!user || !user.isActive || !session) {
    throw unauthorized('Invalid refresh token');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    org: user.organization?.toString() ?? null,
    role: user.role,
  });

  /*
   * Rotated in place rather than removed and re-added: this is the same device
   * continuing, and a new row each quarter of an hour would turn the session
   * list into a log. The old hash stops working the moment this saves, which is
   * what makes a stolen refresh token worth one use at most.
   */
  const newRefreshToken = signRefreshToken(user.id);
  session.set('tokenHash', hashToken(newRefreshToken));
  session.set('lastSeenAt', new Date());
  if (meta.ip) session.set('ip', meta.ip);
  if (meta.userAgent) session.set('userAgent', meta.userAgent.slice(0, 300));
  await user.save();

  return serializeLogin(
    user,
    user.organization?.toString(),
    accessToken,
    newRefreshToken,
  );
}

export async function logout(refreshToken: string): Promise<void> {
  const hashed = hashToken(refreshToken);
  await UserModel.updateMany({}, { $pull: { sessions: { tokenHash: hashed } } });
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Starts a password reset.
 *
 * Always reports success. Telling an unauthenticated caller whether an address
 * is registered turns this endpoint into an account-enumeration oracle, and the
 * list of registered shop owners is itself worth protecting.
 *
 * The link goes out over SMS, because that is the channel this deployment
 * actually has configured (SMTP is declared in env but no mailer is wired yet).
 */
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a verification link.
 *
 * Idempotent by design — asking again simply replaces the token, because the
 * commonest reason to ask is that the first mail did not arrive.
 */
export async function sendEmailVerification(userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user || user.isEmailVerified) return;

  const token = crypto.randomBytes(32).toString('hex');
  user.set('emailVerifyTokenHash', hashToken(token));
  user.set('emailVerifyExpiresAt', new Date(Date.now() + EMAIL_VERIFY_TTL_MS));
  await user.save();

  const base = env.clientUrl;
  await notify.verifyEmail({
    email: user.email,
    name: user.name,
    url: `${base}/verify-email?token=${token}`,
  });
}

/**
 * Confirms an address from the emailed token.
 *
 * The token is matched by hash and by expiry together, so an expired one is not
 * a near miss — it simply does not match anything.
 */
export async function verifyEmailToken(token: string): Promise<{ email: string }> {
  const user = await UserModel.findOne({
    emailVerifyTokenHash: hashToken(token),
    emailVerifyExpiresAt: { $gt: new Date() },
  }).select('+emailVerifyTokenHash +emailVerifyExpiresAt');

  if (!user) throw badRequest('That confirmation link is invalid or has expired');

  user.set('isEmailVerified', true);
  user.set('emailVerifyTokenHash', '');
  user.set('emailVerifyExpiresAt', null);
  await user.save();

  return { email: user.email };
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) return;

  // The raw token goes to the user, only its hash to the database, so a
  // database read cannot be replayed into an account takeover.
  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  const link = `${env.clientUrl}/reset-password?token=${token}`;
  try {
    // Both channels. It went by SMS alone, which fails whenever a gateway is
    // unconfigured or a number has changed — and the person it locks out is
    // usually the owner, whose account is the one that pays.
    await notify.passwordReset({
      email: user.email,
      phone: user.phone,
      name: user.name,
      url: link,
    });
  } catch (err) {
    // The reset is already recorded; a delivery outage must not surface as a
    // different response than the success path above.
    logger.error({ err, userId: user.id }, 'Password reset delivery failed');
  }
}

/**
 * Completes a reset. Every refresh token is revoked: if the account was taken
 * over, the point of resetting is to end the attacker's sessions too.
 */
/**
 * Returns who it was for, so the controller can record it.
 *
 * A password reset completed from an emailed link is an account takeover when
 * it is not the account's owner doing it, and it was leaving no trace at all —
 * the one event in the session lifecycle with no row. The identity comes back
 * from here because nothing else in the request knows it: the caller is not
 * signed in.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ id: string; name: string; email: string; role: string; org?: string }> {
  const user = await UserModel.findOne({
    passwordResetTokenHash: hashToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user || !user.isActive) throw badRequest('That reset link is invalid or has expired');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordResetTokenHash = '';
  user.passwordResetExpiresAt = null;
  // Every device, including whoever prompted the reset.
  user.set('sessions', []);
  await user.save();

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: String(user.role),
    org: user.organization ? String(user.organization) : undefined,
  };
}

/** Changes the signed-in user's password, and signs their other devices out. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw badRequest('Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.set('sessions', []);
  await user.save();
}

export async function getMe(userId: string) {
  const user = await UserModel.findById(userId)
    .select('-passwordHash -sessions')
    .lean();
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  return user;
}

/**
 * How many refresh tokens one account may hold at once, i.e. how many devices
 * can stay signed in. Past this the oldest is dropped, which signs out the
 * least-recently-used device.
 *
 * Without a cap the array grew by one on every login and every refresh and was
 * never trimmed — one demo account had already accumulated 30. Left alone it
 * becomes an unbounded array inside a document that `requireAuth` loads on
 * every single request.
 */
const MAX_REFRESH_TOKENS = 10;

/** Where a session was opened from. Recorded so a person can recognise it. */
export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

async function issueRefreshToken(userId: string, meta: SessionMeta = {}): Promise<string> {
  const token = signRefreshToken(userId);
  await UserModel.findByIdAndUpdate(userId, {
    $push: {
      sessions: {
        $each: [
          {
            tokenHash: hashToken(token),
            createdAt: new Date(),
            lastSeenAt: new Date(),
            ip: meta.ip ?? '',
            userAgent: (meta.userAgent ?? '').slice(0, 300),
          },
        ],
        // Negative slice keeps the last N, so the newest sessions survive.
        $slice: -MAX_REFRESH_TOKENS,
      },
    },
  });
  return token;
}

/**
 * The devices this account is signed in on.
 *
 * The token hash never leaves the server — what identifies a session to the
 * person reading the list is its id, and `current` is how they know which one
 * they would be ending if they pressed the wrong button.
 */
export async function listSessions(userId: string, currentRefreshToken?: string) {
  const user = await UserModel.findById(userId).select('sessions').lean();
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  const currentHash = currentRefreshToken ? hashToken(currentRefreshToken) : '';
  type StoredSession = {
    _id: unknown;
    tokenHash: string;
    createdAt: Date;
    lastSeenAt: Date;
    ip?: string;
    userAgent?: string;
  };

  return ((user.sessions ?? []) as unknown as StoredSession[])
    .map((s) => ({
      id: String(s._id),
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      ip: s.ip ?? '',
      userAgent: s.userAgent ?? '',
      current: Boolean(currentHash) && s.tokenHash === currentHash,
    }))
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

/**
 * Ends one session.
 *
 * Scoped to the caller's own account: a session id is not a secret, and this is
 * reachable by every signed-in user. Ending somebody else's session because you
 * guessed an id would be a denial of service with a friendly interface.
 */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const res = await UserModel.updateOne(
    { _id: userId },
    { $pull: { sessions: { _id: sessionId } } },
  );
  if (!res.modifiedCount) throw new AppError(404, 'NOT_FOUND', 'That session has already ended');
}

/**
 * Ends every session but the one asking.
 *
 * The button people actually want: "sign out everywhere else", after losing a
 * phone or using somebody's computer. Keeping the current session is what makes
 * it pressable without locking yourself out.
 */
export async function revokeOtherSessions(
  userId: string,
  currentRefreshToken?: string,
): Promise<number> {
  const user = await UserModel.findById(userId).select('sessions');
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  const keep = currentRefreshToken ? hashToken(currentRefreshToken) : '';
  const before = user.sessions?.length ?? 0;
  const remaining = (user.sessions ?? []).filter((s) => s.tokenHash === keep);
  user.set('sessions', remaining);
  await user.save();
  return before - remaining.length;
}

function serializeLogin(
  user: {
    id?: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
    twoFactorEnabled?: boolean;
  },
  organizationId: string | null | undefined,
  accessToken: string,
  refreshToken: string,
): LoginResult {
  return {
    user: {
      id: user.id!,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      organizationId: organizationId || undefined,
      /*
       * So the console can route an operator to enrolment instead of letting
       * them walk into a screen of refusals — `requireAuth` turns every other
       * call away until this is true.
       */
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      twoFactorRequired:
        env.security.operatorTwoFactorRequired && ['platformAdmin', 'platformStaff'].includes(user.role),
    },
    accessToken,
    refreshToken,
  };
}

export { verifyAccessToken };
export type { TokenPayload };
