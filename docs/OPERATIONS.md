# Operations

## Deploying with Docker

```bash
cp .env.example .env            # secrets, mail, payment numbers, operator login
docker compose up -d --build

docker compose exec api node dist/seed/run.js all             # plans + medicine catalogue
docker compose exec api node dist/seed/run.js platform-admin  # the operator login
```

| Service | Port | Serves |
|---|---|---|
| `shop` | 8082 | the shop app, and `/api` proxied to the API |
| `console` | 8083 | the operator console, and `/api` proxied to the API |
| `site` | 8084 | the marketing site (static) |
| `api` | not published | reached through `shop` and `console` |
| `mongo` | 127.0.0.1:27017 | loopback only |

Put TLS in front with Caddy, Traefik or a cloud load balancer, and point
`shop.`, `console.` and the bare domain at the three ports. The site is built
with the public API address baked in (`PUBLIC_API_URL`, usually
`https://shop.dawai.com.bd/api`). Changing it means rebuilding the `site` image.

Before exposing the console, restrict it to the office and VPN addresses in the
`allow`/`deny` block in `apps/console/nginx.conf`.

## Configuration

The API reads its settings from the environment. `apps/api/.env.example` has
every variable with a comment, and `.env.example` at the root lists the ones
compose passes through.

These are required in production:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: at least 32 random characters
  each, different from each other.
- `SMTP_*` and `MAIL_FROM`. Without mail, sign-up approvals and password
  resets cannot reach anyone.
- `PAY_BKASH`, `PAY_NAGAD`, `PAY_UPAY`, `PAY_ROCKET`, `PAY_BANK`: the numbers
  shops pay into, shown on their Subscription page. Leave unused ones empty.
- `CLIENT_URL`, `CONSOLE_URL` and `SITE_URL`: the public origins. They drive
  CORS and the links in emails.

These are useful:

- `TRUST_PROXY=1` behind a proxy. Without it, every rate limit is shared by
  everyone.
- `SCHEDULER=off` on every API instance but one, so reminders go out once.
- `SENTRY_DSN` for error reporting.
- `SMS_PROVIDER`: `log`, `twilio` or `bulksms`, for baki reminders.

## Backups

There are two things to back up. Neither can be regenerated.

1. **The database**, which holds every shop's books:

   ```bash
   # nightly, from the host
   docker compose exec -T mongo mongodump --db=dawai --archive --gzip > backups/dawai-$(date +%F).archive.gz
   # restore
   docker compose exec -T mongo mongorestore --archive --gzip --drop < backups/dawai-2026-10-01.archive.gz
   ```

   Keep copies off the server, for at least 30 days, and test a restore every
   quarter.
2. **The `uploads` volume**, which holds shop logos and payment screenshots:

   ```bash
   docker run --rm -v dawai_uploads:/data -v "$PWD/backups":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .
   ```

The medicine catalogue is also kept in this repository. If the database is
lost, `catalog:restore` brings back the catalogue even without a dump. See
[CATALOGUE.md](CATALOGUE.md).

## Routine tasks

| Task | Command (inside the `api` container: `node dist/seed/run.js …`) |
|---|---|
| Reset the operator's password | `platform-admin`, after setting `PLATFORM_ADMIN_PASSWORD` |
| Restore or refresh the catalogue | `catalog:restore` / `catalog:export` |
| Add new plans after an upgrade | `plans` (never overwrites a plan already priced) |
| Test mail | `node dist/scripts/mailTest.js you@example.com` |
| Test SMS | `node dist/scripts/smsTest.js 01XXXXXXXXX` |

## Health

`GET /health` on the API (also proxied as `/health` on the shop and console
origins) answers `200` with the process uptime when the API is serving. The
compose health check uses it. It does not query the database; watch Mongo with
its own health check (compose has one) or your monitoring.
