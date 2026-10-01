# The medicine catalogue

Dawai ships with the Bangladesh market's medicines: **46,303 brands**, 2,039
generics, 358 companies and 467 therapeutic groups. A shop adds products to its
own shelf from this list instead of typing them.

## The backup in this repo

The catalogue is checked in at [`apps/api/data/catalogue/`](../apps/api/data/catalogue):

| File | Rows |
|---|---|
| `medicinegroups.ndjson.gz` | 467 |
| `medicinecompanies.ndjson.gz` | 358 |
| `medicinegenerics.ndjson.gz` | 2,039 |
| `medicines.ndjson.gz` | 46,303 |
| `manifest.json` | counts and SHA-256 of each file |

Each file is gzipped NDJSON, one document per line, in canonical Extended JSON,
so ObjectIds and dates come back as themselves. Every shop product that points
at a medicine keeps pointing at the same `_id` after a restore.

### Restore

```bash
npm --prefix apps/api run catalog:restore
# in Docker:
docker compose exec api node dist/seed/run.js catalog:restore
```

`seed:all` runs this too. The restore checks each file against its checksum
before loading it, and upserts by `_id`, so it is safe to run on a database that
already has a catalogue: archived rows come back as archived, and rows added
since are left alone. Indexes are built at the end.

### Refresh the backup

After a round of catalogue corrections in a live database:

```bash
MONGODB_URI=mongodb://<host>/dawai npm --prefix apps/api run catalog:export
git add apps/api/data/catalogue && git commit -m "chore(catalogue): refresh the archive"
```

The export is sorted by `_id` and deterministic. An unchanged catalogue
produces identical files and keeps its `exportedAt` date, so git only shows a
diff when something actually changed.

## Copying between databases

```bash
npm --prefix apps/api run seed:catalog:copy -- --from=mongodb://<host>/<database>
```

This copies the four collections from another database, staging into
production for example, keeping every `_id`. Re-running it only brings changes.

## Rebuilding from the sources

This is rarely needed. The archive is the source of truth for a deployment.
The catalogue was originally built from two public datasets:

- **The DGDA registry** (Directorate General of Drug Administration,
  `Allopathic_Drug_Database.csv`): which products exist, who makes them, and
  their DAR registration numbers. This one is authoritative.
- **A drug index in the medex.com.bd shape** (`medicine.csv`, `generic.csv`):
  price, pack size, therapeutic class and generic monographs.

The registry says what exists; the index supplies price and class. Where the
two disagree about a manufacturer, the registry wins.

```bash
npm --prefix apps/api run catalog:build -- --dgda=/path/Allopathic_Drug_Database.csv --medex=/path/archive
npm --prefix apps/api run seed:medicines:full    # imports apps/api/dgda-products.csv
```

A second import of the same build must report `0 inserted, 0 updated`. That is
the check that the identity rules still hold. `dgda-products.csv` is a build
intermediate and is not committed.
