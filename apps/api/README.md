# Dawai API

Express + Mongoose. It serves the shop app, the operator console and the
marketing site's two public forms. The repo-wide picture is in
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Run it

```bash
cp .env.example .env          # the JWT secrets at least
npm install
npm run seed:all              # plans + the medicine catalogue from data/catalogue
npm run seed:platform-admin   # the operator login, from PLATFORM_ADMIN_* in .env
npm run seed:demo-shop        # optional: a demo pharmacy with owner / pharmacist / salesman
npm run seed:shop-demo        # optional: stock, suppliers, deliveries and bills for it
npm run dev                   # http://localhost:5100
```

## Scripts

| Script | Does |
|---|---|
| `dev` / `build` / `start` | watch mode / compile to `dist/` / run `dist/` |
| `typecheck`, `test` | `tsc --noEmit`, vitest |
| `seed:all` | plans + catalogue |
| `seed:plans` | Trial / Basic / Plus. Never overwrites a plan already priced |
| `seed:platform-admin` | create the operator, or reset their password |
| `catalog:restore` | load the catalogue from `data/catalogue` |
| `catalog:export` | write the live catalogue back to `data/catalogue`, to commit |
| `seed:catalog:copy -- --from=<uri>` | copy the catalogue from another database |
| `catalog:build`, `seed:medicines:full` | rebuild the catalogue from the DGDA registry |
| `seed:demo-shop`, `seed:shop-demo` | demo data |
| `mail:test [to]`, `sms:test <to>` | check the mail and SMS settings |

The catalogue is explained in [docs/CATALOGUE.md](../../docs/CATALOGUE.md).

## Layout

`src/routes` → `src/controllers` → `src/services` → `src/models`, with zod
schemas in `src/validators`. The rules live in services, and that is where the
tests in `tests/` point.
