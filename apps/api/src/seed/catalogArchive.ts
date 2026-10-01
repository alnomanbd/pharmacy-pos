import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import {
  MedicineGroupModel,
  MedicineCompanyModel,
  MedicineGenericModel,
  MedicineModel,
} from '../models/index.js';

/**
 * The medicine catalogue, kept in the repo.
 *
 * The 46,000-odd brands, their companies, generics and groups took months of
 * imports and hand corrections to get right. A database can be lost; a git
 * history is on every clone. So the catalogue is checked in under
 * `data/catalogue/`, one gzipped NDJSON file per collection, and a fresh
 * deployment restores from it instead of rebuilding from the registry.
 *
 * - `catalog:export` writes the files from the live database. Run it after a
 *   round of catalogue corrections, and commit the result.
 * - `catalog:restore` reads them back. It upserts by `_id`, so it is safe on a
 *   database that already has a catalogue: rows come back as they were in the
 *   archive, and rows added since are left alone.
 *
 * Extended JSON (canonical) rather than plain JSON, so ObjectIds and dates
 * survive the round trip as themselves — a stringified `_id` would break every
 * product that points at a medicine.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
/** `apps/api/data/catalogue`, whether run from `src/` (tsx) or `dist/` (node). */
export const CATALOGUE_DIR = path.resolve(here, '../../data/catalogue');

/** Parents first, so a restore never leaves a medicine pointing at nothing. */
const COLLECTIONS = [
  { name: 'medicinegroups', model: MedicineGroupModel },
  { name: 'medicinecompanies', model: MedicineCompanyModel },
  { name: 'medicinegenerics', model: MedicineGenericModel },
  { name: 'medicines', model: MedicineModel },
] as const;

const { EJSON } = mongoose.mongo.BSON;

interface Manifest {
  exportedAt: string;
  format: 'ndjson+gzip, canonical extended JSON';
  collections: Record<string, { file: string; count: number; sha256: string }>;
}

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

export async function exportCatalog(dir = CATALOGUE_DIR, onProgress?: (m: string) => void) {
  mkdirSync(dir, { recursive: true });
  const manifest: Manifest = {
    exportedAt: new Date().toISOString(),
    format: 'ndjson+gzip, canonical extended JSON',
    collections: {},
  };

  for (const { name, model } of COLLECTIONS) {
    const file = `${name}.ndjson.gz`;
    const target = path.join(dir, file);
    const gzip = createGzip({ level: 9 });
    const out = createWriteStream(target);
    gzip.pipe(out);

    let count = 0;
    // Sorted by `_id`, so an export of an unchanged catalogue is byte-for-byte
    // the same file and git records no change.
    for await (const doc of model.collection.find({}).sort({ _id: 1 })) {
      if (!gzip.write(EJSON.stringify(doc, { relaxed: false }) + '\n')) await once(gzip, 'drain');
      count += 1;
    }
    gzip.end();
    await once(out, 'finish');

    manifest.collections[name] = { file, count, sha256: sha256(target) };
    onProgress?.(`${name}: ${count}`);
  }

  // An export of an unchanged catalogue keeps the old date, so it is not a diff.
  const manifestFile = path.join(dir, 'manifest.json');
  if (existsSync(manifestFile)) {
    const previous = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;
    if (JSON.stringify(previous.collections) === JSON.stringify(manifest.collections)) {
      manifest.exportedAt = previous.exportedAt;
    }
  }
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return Object.fromEntries(Object.entries(manifest.collections).map(([k, v]) => [k, v.count]));
}

export async function restoreCatalog(dir = CATALOGUE_DIR, onProgress?: (m: string) => void) {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!existsSync(manifestFile)) {
    throw new Error(`No catalogue archive at ${dir} — run catalog:export on a database that has one first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest;

  const counts: Record<string, number> = {};
  for (const { name, model } of COLLECTIONS) {
    const entry = manifest.collections[name];
    if (!entry) throw new Error(`The archive has no ${name}`);
    const file = path.join(dir, entry.file);
    // A truncated or hand-edited file would restore half a catalogue quietly.
    if (sha256(file) !== entry.sha256) throw new Error(`${entry.file} does not match its checksum in manifest.json`);

    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    let batch: Record<string, unknown>[] = [];
    let n = 0;
    const flush = async () => {
      if (!batch.length) return;
      await model.collection.bulkWrite(
        batch.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })) as never,
        { ordered: false },
      );
      n += batch.length;
      batch = [];
      onProgress?.(`${name}: ${n} / ${entry.count}`);
    };
    for await (const line of lines) {
      if (!line) continue;
      batch.push(EJSON.parse(line, { relaxed: false }) as Record<string, unknown>);
      if (batch.length >= 1000) await flush();
    }
    await flush();
    if (n !== entry.count) throw new Error(`${name}: restored ${n} rows, the manifest says ${entry.count}`);

    // Written through the driver, so the search indexes are built here rather
    // than left to the first query.
    await model.createIndexes();
    counts[name] = n;
  }
  return counts;
}
