import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, rowsFromMatrix } from '../src/services/formularyImport.service.js';
import { companyKey } from '../src/services/catalogNormalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(
  path.join(here, '../src/seed/data/bd-medicines-starter.csv'),
  'utf8',
);
const rows = rowsFromMatrix(parseCsv(csv));

const companies = parseCsv(
  readFileSync(path.join(here, '../src/seed/data/bd-companies.csv'), 'utf8'),
)
  .slice(1)
  .map(([name]) => name.trim())
  .filter(Boolean);

/**
 * Guards the catalogue that ships with the repo.
 *
 * It is loaded by `npm run seed:catalog` straight into a live formulary, so a
 * malformed row is not a broken build — it is a medicine that quietly fails to
 * import, or worse, one that imports under the wrong generic.
 */
describe('bundled Bangladesh medicine catalogue', () => {
  it('has a substantial number of medicines', () => {
    expect(rows.length).toBeGreaterThan(350);
  });

  it('gives every medicine a brand and a generic', () => {
    const broken = rows.filter((r) => !r.brandName?.trim() || !r.genericName?.trim());
    expect(broken).toEqual([]);
  });

  it('names a company for every medicine', () => {
    const broken = rows.filter((r) => !r.companyName?.trim());
    expect(broken.map((r) => r.brandName)).toEqual([]);
  });

  it('classifies most medicines, and does not drop the rest over it', () => {
    // Not all of them, deliberately. The published drug index carries no
    // therapeutic class for azithromycin, amoxicillin or a further 983 brands,
    // and refusing the commonest antibiotic in Bangladesh over a missing label
    // would be the wrong trade — so the generator takes those rows and leaves the
    // group empty. Most rows still carry one, which is what the group filter
    // needs to be useful.
    const classified = rows.filter((r) => r.groupName?.trim()).length;
    expect(classified / rows.length).toBeGreaterThan(0.8);
  });

  it('has no duplicate brand + strength + company + form', () => {
    // This is the importer's natural key: a duplicate here would mean the file
    // cannot round-trip — the second row would update the first instead of
    // creating its own medicine.
    const seen = new Map<string, string[]>();
    for (const r of rows) {
      const key = `${r.brandName?.toLowerCase()}|${r.strength ?? ''}|${r.companyName ?? ''}|${r.dosageForm ?? ''}`;
      seen.set(key, [...(seen.get(key) ?? []), String(r._line)]);
    }
    const clashes = [...seen.entries()].filter(([, lines]) => lines.length > 1);
    expect(clashes).toEqual([]);
  });

  it('covers the therapeutic areas a pharmacy sells from daily', () => {
    // Asserted on molecules, not on group names. The groups now come from the
    // drug index's own 467-class taxonomy, which will change again the next time
    // the catalogue is rebuilt from a newer source — but a shop that cannot
    // find paracetamol, amoxicillin, omeprazole or metformin is broken whatever
    // the classes are called.
    const generics = new Set(rows.map((r) => (r.genericName ?? '').toLowerCase()));
    const has = (fragment: string) => [...generics].some((g) => g.includes(fragment));

    for (const molecule of [
      'paracetamol',
      'amoxicillin',
      'cefixime',
      'azithromycin',
      'omeprazole',
      'metformin',
      'losartan',
      'amlodipine',
      'cetirizine',
      'salbutamol',
    ]) {
      expect(has(molecule), `no ${molecule} in the bundled catalogue`).toBe(true);
    }

    // And breadth, which is the selection rule the generator implements.
    expect(new Set(rows.map((r) => r.groupName)).size).toBeGreaterThan(100);
  });

  it('carries the registration number for every row', () => {
    // The file is generated from registry-backed rows only. A row without a DAR
    // came from somewhere else, and the last hand-made catalogue is exactly what
    // this replaced: it credited Moxacil to Opsonin and Maxpro to Square.
    const undocumented = rows.filter((r) => !r.dar?.trim());
    expect(undocumented.map((r) => r.brandName)).toEqual([]);
  });

  it('names only companies that are in the company list', () => {
    // The two files are seeded separately. If a medicine names a company the
    // list does not have, the import creates a second, near-duplicate company
    // row and the Formulary company filter quietly splits in half.
    const known = new Set(companies.map((c) => c.toLowerCase()));
    const unknown = [...new Set(rows.map((r) => r.companyName!))].filter(
      (c) => !known.has(c.toLowerCase()),
    );
    expect(unknown).toEqual([]);
  });

  it('spells each company one way only', () => {
    // Keyed exactly the way the importer keys companies, rather than on the first
    // eight letters as this used to be. That crude key called "Renata Limited"
    // and "Renata PLC. Bhaluka" the same company — they are two separately
    // registered entities, and the registry lists both.
    const used = [...new Set(rows.map((r) => r.companyName!))];
    const collapsed = new Map<string, string[]>();
    for (const c of used) {
      collapsed.set(companyKey(c), [...(collapsed.get(companyKey(c)) ?? []), c]);
    }
    const nearDuplicates = [...collapsed.values()].filter((names) => names.length > 1);
    expect(nearDuplicates).toEqual([]);
  });
});

describe('bundled pharmaceutical company list', () => {
  it('holds the companies operating in Bangladesh', () => {
    expect(companies.length).toBeGreaterThan(150);
  });

  it('has no duplicate names, in any casing', () => {
    // The source list this was built from repeated several companies and spelt
    // others two ways ("Orion Pharmaceutical Ltd." / "Orion Pharma Ltd.");
    // seeding those unmerged would give a pharmacist the same maker twice in one
    // dropdown.
    const seen = new Map<string, string[]>();
    for (const c of companies) {
      const key = c.toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), c]);
    }
    expect([...seen.values()].filter((names) => names.length > 1)).toEqual([]);
  });

  it('has no name that would import as another', () => {
    // The importer resolves a company by this fingerprint, so two names sharing
    // one are one company as far as the catalogue is concerned — and shipping
    // both would put the same maker in the dropdown twice.
    const collapsed = new Map<string, string[]>();
    for (const c of companies) {
      collapsed.set(companyKey(c), [...(collapsed.get(companyKey(c)) ?? []), c]);
    }
    expect([...collapsed.values()].filter((names) => names.length > 1)).toEqual([]);
  });

  it('is sorted, so the seeded dropdown reads alphabetically', () => {
    const sorted = [...companies].sort((a, b) => a.localeCompare(b));
    expect(companies).toEqual(sorted);
  });
});
