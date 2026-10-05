import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import { ok } from '../utils/response.js';
import { audit, recordAudit } from '../services/audit.service.js';
import { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie } from '../utils/cookies.js';

/**
 * Where the refresh token comes from, in order of preference.
 *
 * The cookie is how both apps send it. The body is still read as a fallback so
 * an API client written against the older contract keeps working; nothing the
 * browser does relies on it.
 */
function refreshTokenFrom(req: Request): string {
  return String(req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || '');
}

/**
 * Where this request came from, recorded against the session it opens.
 *
 * Kept short: a user agent is the only thing here a person recognises, and the
 * full string from some browsers runs to hundreds of characters of build
 * numbers nobody reads.
 */
function sessionMetaFrom(req: Request) {
  return { ip: req.ip ?? '', userAgent: (req.get('user-agent') ?? '').slice(0, 300), lang: saidLang(req) };
}

/**
 * The language the screen asked in — only when it said so (the shop app's
 * X-UI-Lang header). A request with no header leaves the account's remembered
 * language to decide, rather than resetting it to English.
 */
function saidLang(req: Request): 'en' | 'bn' | undefined {
  return req.headers['x-ui-lang'] ? (req.lang ?? 'en') : undefined;
}

/**
 * Hands the session to the browser: the refresh token as an httpOnly cookie,
 * the access token in the body for the app to hold in memory.
 *
 * The refresh token is deliberately **not** in the body. Putting it there is
 * what led to it being kept in `localStorage`, where any injected script could
 * read it - see utils/cookies.ts.
 */
function sendSession(
  res: Response,
  result: { user: unknown; accessToken: string; refreshToken: string },
  message: string,
) {
  setRefreshCookie(res, result.refreshToken);
  ok(res, { user: result.user, accessToken: result.accessToken }, message);
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.registerShop(req.body, { lang: saidLang(req) });
    // No session is issued: the shop is pending until an operator approves it.
    ok(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const token = String(req.body?.token || '');
    ok(res, await authService.verifyEmailToken(token), 'Email confirmed');
  } catch (err) {
    next(err);
  }
}

export async function resendEmailVerification(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.sendEmailVerification(req.user!.id, saidLang(req));
    // Always the same answer, whether or not it was already verified: the state
    // of somebody else's address is not something to report back.
    ok(res, null, 'If that address still needs confirming, a link is on its way');
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(
      email,
      password,
      req.body.twoFactorCode,
      sessionMetaFrom(req),
    );
    // No session exists yet — `req.user` is not populated, so the actor comes
    // straight from the login result. This is the very first line of the trail.
    await recordAudit(
      {
        org: result.user.organizationId,
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
        ip: req.ip,
      },
      'auth.login',
      { model: 'User', id: result.user.id, label: result.user.email },
    );
    sendSession(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.refresh(refreshTokenFrom(req), sessionMetaFrom(req));
    // Rotated on every use, so the cookie is replaced as well as the body.
    sendSession(res, result, 'Token refreshed');
  } catch (err) {
    next(err);
  }
}

/** The devices this account is signed in on, newest activity first. */
export async function listSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await authService.listSessions(req.user!.id, refreshTokenFrom(req));
    ok(res, sessions);
  } catch (err) {
    next(err);
  }
}

/** Ends one of them. Scoped to the caller's own account inside the service. */
export async function revokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.revokeSession(req.user!.id, req.params.id);
    await audit(req, 'auth.session.revoke', {
      model: 'User',
      id: req.user!.id,
      label: req.user!.email,
    });
    ok(res, null, 'That device has been signed out');
  } catch (err) {
    next(err);
  }
}

/** Ends every session except this one — the "sign out everywhere else" button. */
export async function revokeOtherSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const ended = await authService.revokeOtherSessions(req.user!.id, refreshTokenFrom(req));
    await audit(req, 'auth.session.revoke_others', {
      model: 'User',
      id: req.user!.id,
      label: req.user!.email,
    });
    ok(res, { ended }, ended === 1 ? '1 other device signed out' : `${ended} other devices signed out`);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(refreshTokenFrom(req));
    clearRefreshCookie(res);
    // The logout route now runs behind requireAuth, so the actor is known.
    await audit(req, 'auth.logout', { model: 'User', id: req.user!.id, label: req.user!.email });
    ok(res, null, 'Logged out');
  } catch (err) {
    next(err);
  }
}

/**
 * Always answers the same way, whether or not the address is registered — see
 * authService.forgotPassword.
 */
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.forgotPassword(req.body.email, saidLang(req));
    ok(res, null, 'If that email is registered, a reset link has been sent to the phone on file');
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const who = await authService.resetPassword(req.body.token, req.body.newPassword);
    // No session exists here either — the actor comes from the reset itself.
    await recordAudit(
      { org: who.org, id: who.id, name: who.name, role: who.role, ip: req.ip },
      'password.reset',
      { model: 'User', id: who.id, label: who.email },
    );
    ok(res, null, 'Password reset. Please sign in with your new password');
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    await audit(req, 'password.change', { model: 'User', id: req.user!.id, label: req.user!.email });
    ok(res, null, 'Password changed. Your other devices have been signed out');
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user!.id);
    ok(res, user);
  } catch (err) {
    next(err);
  }
}
