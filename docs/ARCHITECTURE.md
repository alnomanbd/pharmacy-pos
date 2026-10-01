# Architecture

## The pieces

```
 browser                         origin                    server
 ───────                         ──────                    ──────
 shop app  (React/Vite) ───────► shop.dawai.com.bd ──/api──►┐
 console   (React/Vite) ───────► console.dawai.com.bd /api─►├─► API (Express, :5100) ──► MongoDB "dawai"
 site      (Next.js export) ───► dawai.com.bd               │      │
            └── sign-up / enquiry forms POST ──────────────►┘      └─► uploads (local disk)
```

- **One API, three browser origins.** The shop app and the console each proxy
  `/api` to the API on their own origin (nginx in production, Vite in
  development). The authenticated API is never cross-origin, so the session
  cookie stays host-only and nothing authenticated is on the CORS list. Only
  the site's two public forms, `POST /api/auth/register` and
  `POST /api/public/contact`, are called cross-origin, from the origins in
  `SITE_URL`.
- **Its own database.** Everything lives in the `dawai` database. Moving it to
  another server is a change to `MONGODB_URI`.
- **`packages/shared`** holds what both apps need: the axios client with
  silent token refresh, the session store, two-factor setup, password rules,
  Bangla input and numerals, toasts and dialogs. It is imported as source.

## API layout

`apps/api/src`:

| Folder | Holds |
|---|---|
| `routes/` | One router per area, mounted in `routes/index.ts`: `auth`, `users`, `two-factor`, `shop`, `till`, `medicines`, `billing`, `files`, `public`, `platform` |
| `validators/` | zod schemas; `middlewares/validate.ts` applies them |
| `controllers/` | Thin request/response glue |
| `services/` | The rules. Everything worth testing is here |
| `models/` | Mongoose schemas. Every shop-owned row carries `organization` |
| `middlewares/` | Auth, tenancy, roles, rate limits, errors |
| `jobs/` | The scheduler (trial and subscription reminders) |
| `seed/` | Plans, the operator login, demo data, the catalogue archive |

## Tenancy

A shop is an `Organization`. Every shop-owned document has an `organization`
field, and every query a shop makes is scoped to the signed-in user's
organization by the service, never by a value from the request.

`requireAuth` builds `req.tenant` from the organization on each request:

- `status`: `pending` (signed up, awaiting approval), `active` or `suspended`.
  Only `active` shops can sign in.
- `trialEndsAt`: the date the shop is **trialled or paid up to**. Past it, on any
  plan, `readOnly` is true. `requireWritableTenant` then refuses writes, while
  reads, exports and the Subscription page keep working, so an expired shop can
  still see its books and pay.

## Roles

| Role | Who | Can |
|---|---|---|
| `admin` | The shop owner | Everything in the shop, including staff, settings and billing |
| `pharmacist` | Runs the counter and the stock | Sell, receive purchases, adjust stock, see costs |
| `salesman` | Sells | Sell at the counter. Never sees a purchase price |
| `platformAdmin` | Dawai's own operator | The whole console |
| `platformStaff` | Dawai's team | The console, limited by permissions (`types/permissions.ts`) |

The role groups are in `apps/api/src/types/roles.ts`. Operator accounts belong
to no shop, and must use two-factor.

## Plans and limits

Plans are database rows, seeded once and then priced from the console:

| Plan | Price / month | Counters | Staff logins |
|---|---|---|---|
| Trial | free, 14 days | 1 | 2 |
| Basic | ৳1,500 | 1 | 2 |
| Plus | ৳3,000 | 5 | 10 |

`null` is unlimited and `0` is none. Limits are enforced where they bite:
`counters.service` when a billing counter is added, and `shopStaff.service` when
a login is created (`plan.service#assertWithinLimit`).

## Sign-up and billing

1. A shop signs up on the site (`POST /api/auth/register`) and lands **pending**.
   The owner and the operator are emailed.
2. An operator approves it in the console, which starts the trial.
3. Payments are manual (bKash, Nagad, Upay, Rocket, bank, cash). The owner
   submits one from Subscription in the shop app with the transaction ID. An
   operator verifies it in the console, which issues an invoice and moves
   `trialEndsAt` forward by the months paid.
4. The scheduler emails the owner before the date runs out.

## Front-end apps

- **Shop app** (`apps/shop/src`): `pages/` for screens, `components/` for
  shared parts, `api.ts` for every call it makes, `i18n/ui.ts` for the Bangla
  strings. The till works offline: bills queue on the device and replay with an
  idempotency key when the line comes back.
- **Console** (`apps/console/src`): shops, payments, sales, plans, enquiries,
  team and audit. `api.ts` holds its calls and types.
- **Site** (`apps/site/src`): `app/[lang]` for pages, `components/sections` for
  the home page bands, `i18n/dictionary.ts` for the copy. `{brand}` in the copy
  is replaced with `siteConfig.name`.

Bangla mode localises everything, numerals included, except identifiers: a
brand name, a batch number, a bill reference or a function key stays exactly as
printed.
