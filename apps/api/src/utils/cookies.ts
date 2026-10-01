import type { Response } from 'express';
import { env, isProduction } from '../config/env.js';

/**
 * The refresh token lives in a cookie, not in the response body.
 *
 * It used to be handed to the browser and kept in `localStorage`, which meant
 * one cross-site scripting bug anywhere in either app handed over a session
 * that could renew itself forever. A cookie the page cannot read is the part
 * script injection cannot steal — so the refresh token moves here and the
 * access token stays in memory, where a reload throws it away.
 *
 * Four properties, each doing a specific job:
 *
 * - **`httpOnly`** — `document.cookie` cannot see it. This is the whole point.
 * - **`secure`** in production — never sent over plain HTTP. Off in development
 *   because localhost is not HTTPS, and a cookie that is never set is a login
 *   screen that never works.
 * - **`sameSite: 'strict'`** — the browser attaches it only to requests the app
 *   itself made. Available to us because each app proxies `/api` on its own
 *   origin, so nothing here is ever cross-site.
 * - **`path: '/api/auth'`** — sent to the four endpoints that need it and to
 *   nothing else. Every other request authorises with the Bearer access token,
 *   so there is no reason for the refresh token to travel with them.
 *
 * **On CSRF.** The cookie-carrying endpoints are refresh and logout. Logging
 * somebody out against their will is a nuisance, not a breach. A forged refresh
 * is worth nothing to an attacker: `SameSite=Strict` stops the browser sending
 * the cookie from another site in the first place, and even if it did, the new
 * access token comes back in a JSON body the attacker's page cannot read — the
 * API allows no cross-origin read of it. So there is no CSRF token here, and
 * that is a decision rather than an omission.
 */
export const REFRESH_COOKIE = 'dawai_refresh';

/** Where the cookie is sent. Kept in one place so the clear matches the set. */
const COOKIE_PATH = '/api/auth';

/**
 * `7d`, `12h`, `30m` → milliseconds.
 *
 * The cookie's lifetime has to match the token's, or one of the two outlives
 * the other: a cookie that dies first logs people out early, and one that
 * survives means the browser keeps sending a token the server already refuses.
 */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return value * factor;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: ttlToMs(env.jwt.refreshExpires),
  });
}

/**
 * Clears it on the way out.
 *
 * The options have to match the ones it was set with — a browser will not
 * remove a cookie it considers to be a different cookie, and the difference
 * that catches people is the path.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
  });
}
