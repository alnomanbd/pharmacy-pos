/**
 * Converts a Bangladeshi drug-index export into the catalogue CSV this project
 * imports.
 *
 * The repo ships 409 curated brands. Bangladesh has tens of thousands, and the
 * gap is the single thing most likely to lose a doctor in the first five
 * minutes: a prescribing app that cannot find their brand is a worse pad of
 * paper. This converter is how a real export becomes that catalogue.
 *
 * **Two steps, on purpose.** This writes a CSV; `seed:medicines:full` imports
 * it. Nothing here talks to the database, so the output can be read, diffed,
 * corrected in Excel and imported by the one code path that is already tested —
 * rather than a second, parallel importer that drifts from the first.
 *
 * **On the source.** The expected shape is the medex.com.bd-style export
 * (`medicine.csv`, `generic.csv`, `manufacturer.csv`, `drug class.csv`) which is
 * what circulates as a Bangladeshi medicine dataset. It is a *secondary* source:
 * accurate enough to prescribe from in practice, and not the legal authority.
 * DGDA's registered-product list is. Two consequences worth writing down:
 *
 *   - Have a pharmacist review before a clinic prescribes from it, and check the
 *     licence of whatever export you use before redistributing it. The converted
 *     file is deliberately left out of version control.
 *   - Prices are a snapshot of the export's date and go stale. They are imported
 *     because an empty price column is worse than an old one for a chamber that
 *     quotes costs, but they are not authoritative either.
 *
 * The columns it reads, and what they become:
 *
 * | source (`medicine.csv`)   | ours          |
 * |---------------------------|---------------|
 * | brand name                | brandName     |
 * | generic                   | genericName   |
 * | manufacturer              | companyName   |
 * | dosage form               | dosageForm    |
 * | strength                  | strength      |
 * | package container         | packSize + price (parsed) |
 * | (joined from generic.csv) | groupName (drug class), indications |
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, buildCsv } from '../services/formularyImport.service.js';

export interface MedexConvertOptions {
  /** Directory holding the export's CSVs. */
  dir: string;
  /** Where to write the catalogue CSV. Defaults to `backend/dgda-products.csv`. */
  out?: string;
  /** Stop after this many brands — for looking at the output before committing to 21,000 rows. */
  limit?: number;
  /** Drop non-allopathic rows (herbal, unani). Off: a doctor who writes them should find them. */
  allopathicOnly?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Splits a package-and-price string into a pack description and a unit price.
 *
 * The export writes one of three shapes, and the difference matters:
 *
 *   `100 ml bottle: ৳ 40.12`                     → the pack costs 40.12
 *   `Unit Price: ৳ 5.98,(100's pack: ৳ 598.00),` → one tablet costs 5.98
 *   `Price Unavailable`                          → say nothing
 *
 * For the second shape the price kept is the **unit** price, because that is the
 * number a doctor is asked about ("how much per tablet?"), with the pack taken
 * from the parenthetical so the row still records what it is sold in. Reading
 * 598.00 as the price of a tablet would be a hundredfold error printed next to a
 * medicine — which is why this is a named function with its own tests rather
 * than a regex inline.
 */
export function parsePackageContainer(raw: string): { packSize: string; price: string } {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text || /price\s*unavailable/i.test(text)) return { packSize: '', price: '' };

  const money = String.raw`(?:৳|Tk\.?|BDT)?\s*([\d,]+(?:\.\d+)?)`;
  const clean = (n: string) => n.replace(/,/g, '');

  // Shape 2: a unit price, with the pack in a parenthetical.
  const unit = new RegExp(String.raw`^unit price\s*:\s*${money}`, 'i').exec(text);
  if (unit) {
    const pack = /\(([^:()]+)\s*:/.exec(text)?.[1]?.trim() ?? '';
    return { packSize: pack, price: clean(unit[1]) };
  }

  // Shape 1: "<pack>: <price>", ignoring any further parentheticals.
  const packed = new RegExp(String.raw`^([^:()]+?)\s*:\s*${money}`).exec(text);
  if (packed) return { packSize: packed[1].trim(), price: clean(packed[2]) };

  // Something unrecognised: keep it as the pack description rather than guess a
  // number. A wrong price is worse than a missing one.
  return { packSize: text.slice(0, 80), price: '' };
}

/** Reads a CSV into row objects keyed by its own header names. */
async function readNamed(file: string) {
  const matrix = parseCsv(await readFile(file, 'utf8'));
  if (matrix.length === 0) return [] as Record<string, string>[];
  const [header, ...body] = matrix;
  const keys = header.map((h) => h.trim());
  return body.map((cells) => {
    const row: Record<string, string> = {};
    keys.forEach((k, i) => (row[k] = (cells[i] ?? '').trim()));
    return row;
  });
}

export async function convertMedex(opts: MedexConvertOptions) {
  const dir = path.resolve(opts.dir);
  // Defaults into `backend/`, which is the path .gitignore excludes and the one
  // `seed:medicines:full` looks in first — so convert-then-import needs no
  // arguments at all.
  const backendRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  const out = path.resolve(opts.out || path.join(backendRoot, 'dgda-products.csv'));
  const say = opts.onProgress ?? (() => {});

  const medicineFile = path.join(dir, 'medicine.csv');
  const genericFile = path.join(dir, 'generic.csv');

  let brands: Record<string, string>[];
  try {
    brands = await readNamed(medicineFile);
  } catch {
    throw new Error(`${medicineFile} not found. Point --dir at the folder holding medicine.csv.`);
  }
  if (brands.length === 0) throw new Error(`${medicineFile} has no rows.`);

  // The drug class and the indication live on the generic, not the brand, so the
  // group every prescription is filtered by comes from this join. A generic the
  // table does not carry is not an error — the brand still imports, without a
  // group, which is exactly what an unknown group should look like.
  const byGeneric = new Map<string, Record<string, string>>();
  try {
    for (const row of await readNamed(genericFile)) {
      const name = (row['generic name'] || '').toLowerCase();
      if (name && !byGeneric.has(name)) byGeneric.set(name, row);
    }
    say(`generic.csv: ${byGeneric.size} generics, for drug class and indication`);
  } catch {
    say('generic.csv not found — importing without drug classes or indications');
  }

  const report = {
    read: brands.length,
    written: 0,
    skippedNoBrand: 0,
    skippedNoGeneric: 0,
    skippedNonAllopathic: 0,
    withoutGroup: 0,
    withoutPrice: 0,
    genericsNotInTable: new Set<string>(),
  };

  const rows: Record<string, string>[] = [];

  for (const b of brands) {
    if (opts.limit && rows.length >= opts.limit) break;

    const brandName = b['brand name'] || '';
    const genericName = b['generic'] || '';
    if (!brandName) {
      report.skippedNoBrand++;
      continue;
    }
    // The importer requires a generic, and rightly: a brand with no molecule is
    // not something to hand a prescriber.
    if (!genericName) {
      report.skippedNoGeneric++;
      continue;
    }
    if (opts.allopathicOnly && (b['type'] || '').toLowerCase() !== 'allopathic') {
      report.skippedNonAllopathic++;
      continue;
    }

    const generic = byGeneric.get(genericName.toLowerCase());
    if (!generic) report.genericsNotInTable.add(genericName);

    const groupName = (generic?.['drug class'] || '').trim();
    if (!groupName) report.withoutGroup++;

    const { packSize, price } = parsePackageContainer(b['package container'] || '');
    if (!price) report.withoutPrice++;

    rows.push({
      id: '',
      brandName,
      genericName,
      companyName: b['manufacturer'] || '',
      groupName,
      dosageForm: b['dosage form'] || '',
      strength: b['strength'] || '',
      packSize,
      price,
      description: '',
      // Short and human — "Ulcerative colitis", not a page of HTML. The export's
      // monographs are far richer than anything this schema can hold; when a
      // generic-information screen exists, that is where they belong.
      indications: (generic?.['indication'] || '').slice(0, 200),
      sideEffects: '',
      status: 'active',
    });
  }

  report.written = rows.length;
  await writeFile(out, buildCsv(rows), 'utf8');

  return {
    ...report,
    genericsNotInTable: [...report.genericsNotInTable].slice(0, 10),
    genericsNotInTableCount: report.genericsNotInTable.size,
    out,
  };
}
