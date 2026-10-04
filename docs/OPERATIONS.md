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

## Releasing from GitHub

Three workflows in `.github/workflows`:

| Workflow | Runs | Does |
|---|---|---|
| **CI** | every push and pull request | typecheck, tests and builds for the API, the shop app, the console and the site |
| **Security** | every push, and Mondays at 09:00 Dhaka | `npm audit` of what ships (high fails the API and the apps; critical fails the static site) and a `gitleaks` scan of the whole history for committed secrets |
| **Deploy** | by hand (Actions → Deploy), or on a `v*` tag | builds the four images, pushes them to `ghcr.io/<owner>/<repo>/{api,shop,console,site}`, and rolls them out over SSH when a server is configured |

Dependabot (`.github/dependabot.yml`) opens a grouped pull request a week for
minor and patch updates; majors come one at a time.

To have Deploy roll out by itself, once:

1. In the repository, **Settings → Secrets and variables → Actions**:
   - variables `PUBLIC_API_URL`, `SHOP_URL`, `SITE_URL` (baked into the site image);
   - secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` (an SSH private key for a
     user in the `docker` group) and `DEPLOY_PATH` (the folder holding
     `docker-compose.yml` and `.env`).
2. On the server, add `DAWAI_REGISTRY=ghcr.io/<owner>/<repo>` (lower case) to
   `.env`, and log the server in to the registry once with a token that has
   `read:packages`: `docker login ghcr.io -u <user>`.

Each deploy then writes `DAWAI_TAG=<commit>` to `.env`, pulls the four images,
restarts them, and fails the run if the API does not answer `/health` within a
minute. To roll back, run `DAWAI_TAG=<an earlier commit> docker compose up -d
--no-build` on the server. Without the secrets, Deploy only builds and pushes.

## Errors in the browser

The shop app and the console report their own crashes (a page that fails to
draw, an uncaught error) to `POST /api/public/client-error`. The same fault from
many browsers is one entry with a count. They are listed on the console's
**System** page for 30 days, and passed to Sentry too when `SENTRY_DSN` is set.
What is sent is the message, the stack, the page without its query string and
the build — never what was on the screen.

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

## Online payments (SSLCommerz)

Shops can pay by bKash, Nagad, Rocket, Upay, card or internet banking through
SSLCommerz, and their subscription renews the moment the payment clears.

1. Get a store from SSLCommerz (a sandbox store first, for testing) and set
   `SSLCZ_STORE_ID` and `SSLCZ_STORE_PASSWORD`. Keep `SSLCZ_SANDBOX=true` until
   the live store is approved, then set it to `false`.
2. SSLCommerz posts back to `/api/public/sslcommerz/{success,fail,cancel,ipn}`
   under `SSLCZ_CALLBACK_BASE` (default `CLIENT_URL/api`). The IPN is called
   server to server, so that address must be reachable from the internet.
3. Nothing is believed until SSLCommerz's validation API confirms it, for the
   same order, amount and currency. A forged "success" renews nothing.

With no store id set, the shop app hides "Pay online" and shops pay by hand as
before.

## Backups

Two things hold what cannot be regenerated: **the database** (every shop's
books) and **the `uploads` volume** (shop logos, payment screenshots). The
`backup` service in docker-compose takes both:

- every night at `BACKUP_AT` (default `02:00`, in `APP_TZ`), and
- whenever an operator presses **Back up now** on the console's System page.

Each run writes `dawai-<date>_<time>.archive.gz` and `uploads-<date>_<time>.tgz`
to the `backups` volume, keeps the last `BACKUP_KEEP_LOCAL_DAYS` (7) on the
server, and copies them, encrypted, to Google Drive, which keeps
`BACKUP_KEEP_DAYS` (30). The System page shows the last run, turns red if it
failed or a night was missed, and lets an operator with `system.backup`
download one after entering their two-step code. Every request and download
is in the audit trail.

### Setting up Google Drive (once)

The copy goes through [rclone](https://rclone.org): a Google Drive remote, and
an encrypting remote on top of it so that what sits in Drive cannot be read by
anyone who gets into the Google account.

1. **Sign in to Google, on your own computer.** The server has no browser.
   Install rclone on a PC ([rclone.org/downloads](https://rclone.org/downloads/))
   and run:

   ```bash
   rclone authorize "drive"
   ```

   A browser opens; sign in with the Google account the backups should go to,
   and allow access. rclone prints a token (`{"access_token":...}`). Copy all of it.

2. **Make the two remotes, on the server**, from the folder with docker-compose:

   ```bash
   mkdir -p ops/backup/rclone
   docker compose run --rm backup rclone config
   ```

   - `n` (new remote), name it **`gdrive`**, storage **`drive`**. Leave client
     id and secret blank, scope **`1`** (full access), leave the rest at the
     defaults. At "Use web browser to automatically authenticate?" answer
     **`n`**, and paste the token from step 1.
   - `n` again, name it **`dawai-crypt`**, storage **`crypt`**, remote
     **`gdrive:dawai-backups`**, filename encryption **`standard`**, directory
     name encryption **`true`**. Choose **`g`** to generate a strong
     passphrase, and generate the salt (password2) too.
   - `q` to quit.

3. **Write down the two passphrases, somewhere other than this server** — a
   password manager. If the server is lost, `ops/backup/rclone/rclone.conf` is
   lost with it, and without those passphrases the backups in Drive are
   unreadable to you as well. Keeping a copy of `rclone.conf` itself in the
   same safe place is simplest.

4. **Turn it on** in `.env`, and restart the service:

   ```bash
   BACKUP_REMOTE=dawai-crypt:
   ```

   ```bash
   docker compose up -d backup
   ```

5. **Check it.** Press **Back up now** on the System page. Within a couple of
   minutes the Backups card should say "copied to Google Drive". In Drive you
   will see a `dawai-backups` folder whose file names are scrambled — that is
   the encryption working. To see them as rclone does:

   ```bash
   docker compose run --rm backup rclone ls dawai-crypt:
   ```

A free Google account has 15 GB. Thirty nights of a compressed database stays
well inside that for a long time; if Drive fills, the copy fails and the System
page says so. Switching to S3 or Backblaze later is another rclone remote and a
different `BACKUP_REMOTE` — nothing else changes.

The service's log says what each run did: `docker compose logs backup`.

### Putting a backup back

This replaces **every shop's** data with the backup's, so everything sold since
it was taken is gone. It is for a lost or corrupted database, not one shop's
mistake, and is deliberately not a button in the console.

1. Pick the backup. On the server: `docker compose exec backup ls -l /backups`.
   For an older one, from Drive:

   ```bash
   docker compose run --rm backup rclone copy dawai-crypt:dawai-2026-10-01_0200.archive.gz /backups/
   ```

2. Take one of the current state first, in case you need to go back:

   ```bash
   docker compose exec backup backup.sh manual before-restore
   ```

3. Stop the API so nothing writes while it runs, restore, start it again:

   ```bash
   docker compose stop api data-api
   docker compose exec backup mongorestore --uri="mongodb://mongo:27017"      --archive=/backups/dawai-2026-10-01_0200.archive.gz --gzip --drop
   docker compose start api data-api
   ```

4. The uploads, if they were lost too:

   ```bash
   docker run --rm -v dawai_backups:/b -v dawai_uploads:/data alpine      tar xzf /b/uploads-2026-10-01_0200.tgz -C /data
   ```

   (The volume names carry the compose project's name — `docker volume ls`
   shows them.)

Test this on a spare machine every few months. A backup that has never been
restored is a hope, not a backup.

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
