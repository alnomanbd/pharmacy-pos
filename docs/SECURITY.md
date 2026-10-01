# Security

## Sessions

- The **access token** is a 15-minute JWT, held in memory by the app and never
  in `localStorage`.
- The **refresh token** is a 7-day `httpOnly`, `secure`, `sameSite=strict`
  cookie with path `/api/auth`, so page scripts cannot read it and it travels
  only to the auth endpoints. Refresh tokens rotate on use and are stored
  server-side, so a session can be ended from Settings → Sessions, and signing
  out revokes it on the server.
- Every authenticated call is same-origin, through the app's own `/api` proxy.
  CORS is open only to the marketing site, and only for its two public forms.

## Passwords and two-factor

- Passwords are hashed with bcrypt (cost 12). The strength rules live in
  `packages/shared/src/lib/password.ts` and are enforced by the API.
- Password reset links are single-use and expire. The "forgot password" answer
  is the same whether or not the address exists.
- TOTP two-factor (issuer "Dawai") is available to every account and required
  for the platform admin. Recovery codes are shown once and stored only as
  hashes.

## Tenancy

Every shop-owned query is scoped by the signed-in user's `organization`, taken
from the session and never from the request body or query string. A shop past
its paid date is read-only (`requireWritableTenant`), and a suspended or pending
shop cannot sign in. See [ARCHITECTURE.md](ARCHITECTURE.md).

Inside a shop, a `salesman` sells at the till and nothing else. The API refuses
them every back-room route, where purchases, suppliers and trade prices live,
and drops those rows from their search results. The app hiding the screens is a
convenience, not the control.

## Rate limits

| Surface | Limit (production) |
|---|---|
| Sign-in | 20 per 15 minutes per IP |
| Other auth endpoints | 300 per 15 minutes per IP |
| Shop sign-up | 10 per hour per IP |
| Public forms and reference data | 120 to 240 per minute per IP |

Set `TRUST_PROXY` behind a proxy, or every visitor shares one bucket.

## What is never logged

The logger redacts passwords, tokens, cookies, authorization headers, two-factor
codes and recovery codes (`apps/api/src/utils/redact.ts`). A log line can be
pasted into an issue safely.

## Files

Uploads are checked against a per-kind type and size list before they are
written. They are never served statically: `GET /api/files/*` authorises the
key against the caller's shop first.

## HTTP headers

`helmet` on the API. The shop app and console set a strict CSP
(`connect-src 'self'`, `frame-ancestors 'none'`), HSTS, `nosniff` and a locked
Permissions-Policy in their `nginx.conf`.

## Reporting a vulnerability

Email alnoman.cse@outlook.com. Please do not open a public issue.
