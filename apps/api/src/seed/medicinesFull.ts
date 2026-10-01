// Bulk import of a medicine catalogue — the path from "the DGDA registry as a
// spreadsheet" to "the doctor finds their brand in the Rx builder".
//
// The parsing and upsert rules live in services/formularyImport.service.ts, so
// this CLI and the Formulary page in the app behave identically — a file that
// imports cleanly here imports cleanly there, and vice versa. That includes the
// header aliases: a file whose columns are `Brand`, `Generic`, `Manufacturer`
// needs no renaming before either route accepts it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCsv,
  rowsFromMatrix,
  describeHeader,
  importRows,
  type ImportRow,
} from '../services/formularyImport.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `backend/` — two levels up from `src/seed/`. */
const backendRoot = path.resolve(__dirname, '..', '..');

/**
 * Where an operator's own products CSV is looked for, in order.
 *
 * `backend/dgda-products.csv` comes first because that is the path .gitignore
 * already excludes — health-adjacent bulk data that must not be committed. The
 * importer used to look only next to this file, in `src/seed/`, so a file
 * dropped where the repo told you to drop it was reported as missing.
 */
export const DEFAULT_CANDIDATES = [
  path.join(backendRoot, 'dgda-products.csv'),
  path.join(__dirname, 'dgda-products.csv'),
  path.join(__dirname, 'data', 'dgda-products.csv'),
];

export interface FullImportOptions {
  /** Explicit CSV path. Relative paths resolve against `backend/`. */
  file?: string;
  /** Parse, validate and report without writing anything. */
  dryRun?: boolean;
  /** Called once with the header analysis, then per completed batch. */
  onProgress?: (message: string) => void;
}

async function resolveCsv(file?: string) {
  const candidates = file
    ? [path.isAbsolute(file) ? file : path.resolve(backendRoot, file)]
    : DEFAULT_CANDIDATES;

  for (const candidate of candidates) {
    try {
      return { path: candidate, raw: await readFile(candidate, 'utf8') };
    } catch {
      /* try the next one */
    }
  }

  throw new Error(
    `Products CSV not found. Looked in:\n  ${candidates.join(
      '\n  ',
    )}\nDrop the file at backend/dgda-products.csv, or pass a path: ` +
      `npm run seed:medicines:full -- --file=/path/to/products.csv`,
  );
}

/**
 * @param source Either a path relative to `src/seed/` (how the curated starter
 * catalogue is loaded) or an options object.
 */
export async function runFullImport(source?: string | FullImportOptions) {
  const opts: FullImportOptions =
    typeof source === 'string' ? { file: path.join(__dirname, source) } : (source ?? {});

  const csv = await resolveCsv(opts.file);
  const matrix = parseCsv(csv.raw);
  const header = describeHeader(matrix);

  if (!header.recognised.includes('brandName') || !header.recognised.includes('genericName')) {
    throw new Error(
      `${csv.path}: no brand/generic columns found. Header reads: ` +
        `${(matrix[0] ?? []).join(', ')}. Both a brand and a generic column are required.`,
    );
  }

  opts.onProgress?.(
    `${csv.path}\n  columns read: ${header.recognised.join(', ')}` +
      (header.ignored.length ? `\n  columns ignored: ${header.ignored.join(', ')}` : ''),
  );

  const rows = rowsFromMatrix(matrix);

  // In batches, so one run of tens of thousands of rows does not hold every
  // document it touches in memory at once.
  const BATCH = 500;
  const total = {
    received: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: [] as { line?: number; brandName?: string; reason: string }[],
  };

  for (let i = 0; i < rows.length; i += BATCH) {
    const report = await importRows(rows.slice(i, i + BATCH) as ImportRow[], {
      dryRun: opts.dryRun,
    });
    total.received += report.received;
    total.created += report.created;
    total.updated += report.updated;
    total.unchanged += report.unchanged;
    total.failed.push(...report.failed);

    if (rows.length > BATCH) {
      opts.onProgress?.(
        `  ${Math.min(i + BATCH, rows.length)}/${rows.length} rows — ` +
          `${total.created} new, ${total.updated} updated, ${total.failed.length} failed`,
      );
    }
  }

  return {
    file: csv.path,
    dryRun: Boolean(opts.dryRun),
    header,
    rows: rows.length,
    inserted: total.created,
    ...total,
  };
}
