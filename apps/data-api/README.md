# Dawai Data API

The medicine catalogue and anonymous medicine sales figures, sold by key to
pharma companies, distributors and researchers. It runs as its own service,
with its own admin, apart from the shop platform and its console.

```
npm install
cp .env.example .env      # set DATA_API_ADMIN_TOKEN (32+ characters)
npm run dev               # http://localhost:5200
```

- `/v1/…` — the API. Every call needs a key (`Authorization: Bearer dwk_…`).
- `/docs/` — the reference clients read.
- `/admin/` — clients, keys, plans, usage and a log of every change. Signed
  in with `DATA_API_ADMIN_TOKEN` and the name of whoever is at the keyboard.

## Where the figures come from

The platform's nightly job (`apps/api/src/services/medicineDemand.service.ts`)
turns the bills of every shop that has not switched itself out
(Settings → Medicine figures) into three tables: daily sales by medicine and
district, monthly coverage (how many different shops sold each medicine in
each district), and a record of each rebuild. This service reads those and the
catalogue — nothing else of the platform's.

## The rule every figure leaves under

Figures are built from cells of one medicine, in one district, in one month,
and a cell is used only when at least `DEMAND_MIN_SHOPS` (5, never lower in
production) different shops sold it. Cells under that are dropped before any
sum — a country total is the sum of the districts that pass — and ranges are
whole months, so no two answers subtract to one shop's sales. See
`src/services/demand.ts`.

## Running it

- Its own container (`docker compose up -d data-api`, port 8085 → 5200), behind
  TLS at its own hostname.
- Give it a database user that can only **read** `medicines`,
  `medicinegenerics`, `medicinecompanies`, `medicinedemanddailies`,
  `medicinecoverages` and `medicinedemandruns`, and read/write its own
  `data_*` collections (`DATA_API_MONGODB_URI`).
- Plans start as Catalogue, Insight and Enterprise on first start; after that
  they are the admin's to change.
- Usage limits are counted in memory per process and written to `data_usage`;
  run one instance, or accept that several each count their own share of the
  per-minute limit.
