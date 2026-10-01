/**
 * Builds one catalogue CSV out of every source you have.
 *
 * Two sources, and they are good at different things:
 *
 * **DGDA's drug database** — the registry, and the legal authority on what is
 * registered in Bangladesh. 34,175 human allopathic products, each with a DAR
 * registration number, the manufacturer, the generic, the strength and the form.
 * No price, no therapeutic class, no indication.
 *
 * **A drug-index export (medex.com.bd shape)** — 21,712 brands with the price,
 * the pack, the therapeutic class and what the drug is for, plus monographs for
 * 1,711 generics. Secondary: derived from the registry and from company
 * literature, occasionally behind it, and not authoritative.
 *
 * So the registry is the spine — it decides which products exist and what they
 * are — and the index enriches it. Where they disagree about a *fact about the
 * product* (strength, manufacturer, form), the registry wins. Where the registry
 * is silent (price, class, indication), the index fills in. Anything the index
 * has and the registry does not is still emitted, marked as unregistered in this
 * export, because a brand a doctor uses is worth having even when this month's
 * registry file does not list it.
 *
 * ## Matching, and why it is careful
 *
 * The two sources do not agree on spelling. The registry writes "Zeocin 500",
 * "The ACME Laboratories Ltd."; the index writes "Zeocin", "ACME Laboratories
 * Ltd.". So matching is done on fingerprints from `catalogNormalize.ts`, and
 * always on more than the brand:
 *
 *   1. brand + generic + strength   — the strongest, and the usual case
 *   2. brand + company + strength   — when the index names the molecule differently
 *   3. brand + generic              — when only the strength notation differs
 *
 * Never brand alone. Several companies sell a brand of the same name, and
 * "matching" those would attach one company's price to another's product.
 *
 * Nothing here writes to the database: the output goes through
 * `seed:medicines:full`, the one import path that is already tested. Run
 * `catalog:audit` afterwards.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, buildCsv } from '../services/formularyImport.service.js';
import {
  canonicalBrand,
  canonicalCompany,
  canonicalGeneric,
  canonicalDosageForm,
  canonicalStrength,
  stripRedundantStrength,
  brandKey,
  companyKey,
  genericKey,
  strengthKey,
  dosageFamily,
  tidy,
} from '../services/catalogNormalize.js';
import { parsePackageContainer } from './medexConvert.js';

export interface CatalogBuildOptions {
  /** DGDA export: `Allopathic_Drug_Database.csv`, or the folder holding it. */
  dgda?: string;
  /** Drug-index export folder — the one with `medicine.csv` and `generic.csv`. */
  medex?: string;
  /** Where to write. Defaults to `backend/dgda-products.csv`. */
  out?: string;
  /**
   * Systems to include. The registry publishes allopathic, ayurvedic, unani,
   * homeopathic and herbal separately; a chamber prescribing allopathically does
   * not want 8,000 unani preparations in its search, and one that does can ask.
   */
  types?: string[];
  onProgress?: (message: string) => void;
}

/** A row as it will be written, plus what we know about where it came from. */
interface BuiltRow {
  id: string;
  dar: string;
  brandName: string;
  genericName: string;
  companyName: string;
  groupName: string;
  dosageForm: string;
  strength: string;
  packSize: string;
  price: string;
  description: string;
  indications: string;
  sideEffects: string;
  status: string;
}

const backendRoot = path.resolve(
  new URL('../..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
);

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

/** The index's rows, indexed three ways for the match cascade. */
interface IndexEntry {
  groupName: string;
  indications: string;
  packSize: string;
  price: string;
  dosageForm: string;
  used: boolean;
  row: Record<string, string>;
}

function buildIndexLookups(entries: IndexEntry[]) {
  const byBrandGenericStrength = new Map<string, IndexEntry>();
  const byBrandCompanyStrength = new Map<string, IndexEntry>();
  const byBrandGeneric = new Map<string, IndexEntry>();

  for (const e of entries) {
    const b = brandKey(stripRedundantStrength(e.row['brand name'], e.row['strength']));
    const g = genericKey(e.row['generic']);
    const c = companyKey(e.row['manufacturer']);
    const s = strengthKey(e.row['strength']);
    if (!b) continue;
    // First wins: where the index lists a brand twice, the earlier row is the
    // one a person reading the file would see first.
    if (!byBrandGenericStrength.has(`${b}|${g}|${s}`)) {
      byBrandGenericStrength.set(`${b}|${g}|${s}`, e);
    }
    if (!byBrandCompanyStrength.has(`${b}|${c}|${s}`)) {
      byBrandCompanyStrength.set(`${b}|${c}|${s}`, e);
    }
    if (!byBrandGeneric.has(`${b}|${g}`)) byBrandGeneric.set(`${b}|${g}`, e);
  }

  return { byBrandGenericStrength, byBrandCompanyStrength, byBrandGeneric };
}

export async function buildCatalog(opts: CatalogBuildOptions) {
  const say = opts.onProgress ?? (() => {});
  const out = path.resolve(opts.out || path.join(backendRoot, 'dgda-products.csv'));
  const types = (opts.types ?? ['allopathic']).map((t) => t.toLowerCase());

  /* ---------------------------------------------------------------- index */

  const index: IndexEntry[] = [];
  if (opts.medex) {
    const dir = path.resolve(opts.medex);
    const brands = await readNamed(path.join(dir, 'medicine.csv'));
    const generics = new Map<string, Record<string, string>>();
    try {
      for (const g of await readNamed(path.join(dir, 'generic.csv'))) {
        const name = (g['generic name'] || '').toLowerCase();
        if (name && !generics.has(name)) generics.set(name, g);
      }
    } catch {
      say('index: no generic.csv, so no therapeutic classes from this source');
    }

    for (const row of brands) {
      const g = generics.get((row['generic'] || '').toLowerCase());
      const { packSize, price } = parsePackageContainer(row['package container'] || '');
      index.push({
        groupName: tidy(g?.['drug class'] || ''),
        indications: (g?.['indication'] || '').slice(0, 200),
        packSize,
        price,
        dosageForm: canonicalDosageForm(row['dosage form'] || ''),
        used: false,
        row,
      });
    }
    say(`index: ${index.length} brands, ${generics.size} generics`);
  }

  const lookups = buildIndexLookups(index);

  const report = {
    registryRows: 0,
    registrySkippedType: 0,
    registrySkippedNonHuman: 0,
    registrySkippedNoBrand: 0,
    written: 0,
    enrichedFromIndex: 0,
    withPrice: 0,
    withGroup: 0,
    indexOnlyRows: 0,
    matchedBy: { brandGenericStrength: 0, brandCompanyStrength: 0, brandGeneric: 0 },
  };

  const rows: BuiltRow[] = [];

  /* ------------------------------------------------------------- registry */

  if (opts.dgda) {
    const given = path.resolve(opts.dgda);
    const file = given.toLowerCase().endsWith('.csv')
      ? given
      : path.join(given, 'Allopathic_Drug_Database.csv');
    const registry = await readNamed(file);
    report.registryRows = registry.length;
    say(`registry: ${registry.length} rows from ${path.basename(file)}`);

    for (const r of registry) {
      // "Use For" separates human medicine from veterinary. A chamber must not
      // be able to search up a cattle formulation and prescribe it.
      const useFor = (r['Use For'] || '').toLowerCase();
      if (useFor && useFor !== 'human') {
        report.registrySkippedNonHuman++;
        continue;
      }

      // The concatenated file carries a Type column; the per-system files do not,
      // in which case the file itself is the type.
      const type = (r['Type'] || 'allopathic').toLowerCase();
      if (!types.includes(type)) {
        report.registrySkippedType++;
        continue;
      }

      const strength = canonicalStrength(r['Strength'] || '');
      const rawBrand = r['Brand Name'] || '';
      const brandName = canonicalBrand(stripRedundantStrength(rawBrand, strength));
      if (!brandName) {
        report.registrySkippedNoBrand++;
        continue;
      }

      const genericName = canonicalGeneric(r['Generic Name'] || r['Generic Name and Strength'] || '');
      const companyName = canonicalCompany(r['Name of the Manufacturer'] || '');
      const dosageForm = canonicalDosageForm(r['Dosages Description'] || '');

      const b = brandKey(brandName);
      const g = genericKey(genericName);
      const c = companyKey(companyName);
      const s = strengthKey(strength);

      // The cascade, strongest first. Each match is also checked for agreement on
      // the dosage form where the index has one: a syrup's price on a tablet row
      // is the kind of error nobody notices.
      let hit = lookups.byBrandGenericStrength.get(`${b}|${g}|${s}`);
      let how: keyof typeof report.matchedBy | null = hit ? 'brandGenericStrength' : null;
      if (!hit) {
        hit = lookups.byBrandCompanyStrength.get(`${b}|${c}|${s}`);
        how = hit ? 'brandCompanyStrength' : null;
      }
      if (!hit) {
        hit = lookups.byBrandGeneric.get(`${b}|${g}`);
        how = hit ? 'brandGeneric' : null;
      }
      // Compared by family, not by string: "Injection" and "IV Injection" are the
      // same product written two ways, while tablet and syrup never are.
      if (
        hit &&
        hit.dosageForm &&
        dosageForm &&
        dosageFamily(hit.dosageForm) !== dosageFamily(dosageForm)
      ) {
        hit = undefined;
        how = null;
      }

      if (hit && how) {
        hit.used = true;
        report.enrichedFromIndex++;
        report.matchedBy[how]++;
      }

      if (hit?.price) report.withPrice++;
      if (hit?.groupName) report.withGroup++;

      rows.push({
        id: '',
        dar: tidy(r['DAR'] || ''),
        brandName,
        genericName,
        companyName,
        groupName: hit?.groupName ?? '',
        dosageForm,
        strength,
        packSize: hit?.packSize ?? '',
        price: hit?.price ?? '',
        description: '',
        indications: hit?.indications ?? '',
        sideEffects: '',
        status: 'active',
      });
    }
  }

  /* ------------------------------------------------- index-only leftovers */

  // Brands the index has and this registry export does not. Kept: a registry
  // snapshot is a month old the day it is published, and a doctor's brand not
  // being in it is not a reason for the app to be unable to find it.
  for (const e of index) {
    if (e.used) continue;
    const strength = canonicalStrength(e.row['strength'] || '');
    const brandName = canonicalBrand(stripRedundantStrength(e.row['brand name'], strength));
    const genericName = canonicalGeneric(e.row['generic'] || '');
    if (!brandName || !genericName) continue;

    report.indexOnlyRows++;
    if (e.price) report.withPrice++;
    if (e.groupName) report.withGroup++;

    rows.push({
      id: '',
      dar: '',
      brandName,
      genericName,
      companyName: canonicalCompany(e.row['manufacturer'] || ''),
      groupName: e.groupName,
      dosageForm: e.dosageForm,
      strength,
      packSize: e.packSize,
      price: e.price,
      description: '',
      indications: e.indications,
      sideEffects: '',
      status: 'active',
    });
  }

  /* ------------------------------------------------------------ dedupe */

  // The same product can arrive twice — the registry repeats a few DARs, and a
  // brand can appear in both a per-system file and a concatenated one. Collapsed
  // here rather than at import so the CSV a person opens has one row per
  // product, and so the richer of the two rows is the one kept.
  const byKey = new Map<string, BuiltRow>();
  let collapsed = 0;
  const richness = (r: BuiltRow) =>
    (r.price ? 4 : 0) + (r.groupName ? 2 : 0) + (r.packSize ? 1 : 0) + (r.dar ? 8 : 0);

  for (const r of rows) {
    const key = [
      brandKey(r.brandName),
      strengthKey(r.strength),
      companyKey(r.companyName),
      r.dosageForm.toLowerCase(),
    ].join('|');
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, r);
      continue;
    }
    collapsed++;
    // Keep the richer row, but never lose a DAR or a price by choosing it.
    const winner = richness(r) > richness(seen) ? r : seen;
    const loser = winner === r ? seen : r;
    winner.dar ||= loser.dar;
    winner.price ||= loser.price;
    winner.groupName ||= loser.groupName;
    winner.packSize ||= loser.packSize;
    winner.indications ||= loser.indications;
    byKey.set(key, winner);
  }

  const final = [...byKey.values()];

  /*
   * Repeated registration numbers are left exactly as the registry has them.
   *
   * They were briefly blanked here, on the assumption that a number identifying
   * two things identifies neither. That was the wrong conclusion: a DGDA
   * registration covers a product, and one product is sold at several strengths
   * under the same number — so the repetition is usually correct, and clearing
   * it threw away real information. The importer simply does not use the number
   * as an identity, which is where that problem actually belonged.
   */

  report.written = final.length;

  await writeFile(out, buildCsv(final as unknown as Record<string, unknown>[]), 'utf8');

  return { ...report, collapsedDuplicates: collapsed, out };
}
