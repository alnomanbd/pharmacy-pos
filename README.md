# Dawai

Pharmacy POS for Bangladesh, sold as SaaS. A medicine shop signs up, gets a
14-day trial, and runs its counter on it: billing in pieces, strips and boxes,
batch and expiry stock, purchases and supplier ledgers, the baki khata, cash and
shift close, and the reports an owner reads at night. Bangla and English
throughout.

| Piece | Folder | Dev port | Production |
|---|---|---|---|
| API | [`apps/api`](apps/api) | 5100 | behind the shop app's `/api` |
| Shop app | [`apps/shop`](apps/shop) | 5175 | `shop.dawai.com.bd` |
| Operator console | [`apps/console`](apps/console) | 5176 | `console.dawai.com.bd` |
| Marketing site | [`apps/site`](apps/site) | 3100 | `dawai.com.bd` |
| Shared UI and API client | [`packages/shared`](packages/shared) | | |

The stack is Express, Mongoose and MongoDB on the server, React and Vite in the
two apps, and Next.js (static export) for the site. The name "Dawai" is set in
one place per app (`apps/site/src/lib/site.ts`, `apps/shop/src/brand.ts`,
`apps/console/src/brand.ts`), so a rebrand is a small change.

## Getting started

You need Node 22 and a local MongoDB 7.

```bash
npm run install:all                 # root workspaces, plus the API and the site
cp apps/api/.env.example apps/api/.env   # set the two JWT secrets at least

npm --prefix apps/api run seed:all            # plans + the 46,303-brand medicine catalogue
npm --prefix apps/api run seed:platform-admin # the operator login, from PLATFORM_ADMIN_* in .env
npm --prefix apps/api run seed:demo-shop      # optional: a demo pharmacy and its three logins
npm --prefix apps/api run seed:shop-demo      # optional: stock, suppliers and a day of bills

npm run dev        # API + shop app + console
npm run dev:site   # the marketing site, separately
```

Sign in to the shop app at <http://localhost:5175> and to the console at
<http://localhost:5176>. Operator accounts must enrol two-factor on first
sign-in.

## Checks

```bash
npm run typecheck
npm test
```

CI runs both, and builds every app, on each push and pull request
(`.github/workflows/ci.yml`).

## Documentation

- [Architecture](docs/ARCHITECTURE.md): the pieces, tenancy, roles, plans and billing.
- [Medicine catalogue](docs/CATALOGUE.md): where it comes from, and the backup in this repo.
- [Operations](docs/OPERATIONS.md): deploying with Docker, configuration, backups.
- [Security](docs/SECURITY.md): sessions, two-factor, what is never logged.

## Repository layout

```
apps/
  api/        Express API. src/{routes,controllers,services,models,validators}
              data/catalogue/  the medicine catalogue archive (gzipped NDJSON)
  shop/       the shop app (counter, stock, purchases, khata, reports, settings)
  console/    the operator console (shops, payments, plans, enquiries, team, audit)
  site/       the marketing site, EN + BN
packages/
  shared/     API client with token refresh, session store, i18n helpers, UI bits
docs/
docker-compose.yml
```

`packages/shared` is consumed as source through a Vite alias
(`@dawai/shared`), so there is no build step for it. The API and the site have
their own lockfiles and are not npm workspaces: each builds into its own image
from its own folder.
