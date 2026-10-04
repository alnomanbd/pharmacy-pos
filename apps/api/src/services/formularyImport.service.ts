import {
  MedicineModel,
  MedicineGroupModel,
  MedicineCompanyModel,
  MedicineGenericModel,
} from '../models/index.js';
import { brandKeyOf } from '../models/Medicine.js';
import { normaliseCatalogRow, companyKey, genericKey } from './catalogNormalize.js';

/**
 * Bulk movement of the medicine catalogue, in and out of a spreadsheet.
 *
 * Bangladesh has tens of thousands of registered brands. Nobody is going to type
 * them into a form, so the catalogue has to be fillable from a file — and, just
 * as importantly, the file the app *produces* has to be the file it *accepts*.
 * Export, edit in Excel, import: the same columns in all three directions, so a
 * pharmaceutical company's list is loaded by adding rows to an export rather
 * than by matching somebody's bespoke format.
 *
 * The whole design turns on one question — when is a row in the file the same
 * medicine as a row in the database?
 *
 *   1. `id` present  → that document. (A brand can be renamed and still update.)
 *   2. `id` blank    → brand + strength + company + dosage form, case-insensitively.
 *   3. neither       → a new medicine.
 *
 * Brand name alone cannot be the identity: several companies sell a brand of the
 * same name, one brand ships at several strengths, and one brand at one strength
 * ships as a tablet and as a syrup. Matching on less than all four would silently
 * fold products into each other that a pharmacist would never confuse.
 *
 * An import never deletes. A medicine missing from the file is left exactly as
 * it was — the file is a set of changes, not a picture of what the catalogue
 * should become. Retiring is done in the file, by setting `status` to `retired`.
 */

/** The column order for export, import and the blank template alike. */
export const MEDICINE_COLUMNS = [
  'id',
  'brandName',
  'genericName',
  'companyName',
  'groupName',
  'dosageForm',
  'strength',
  'packSize',
  'price',
  'description',
  'indications',
  'sideEffects',
  'status',
  // Appended rather than slotted in beside the other identity fields, so that a
  // spreadsheet exported before this column existed still imports column-for-
  // column.
  'dar',
] as const;

export type MedicineColumn = (typeof MEDICINE_COLUMNS)[number];
export type ImportRow = Partial<Record<MedicineColumn, string>> & { _line?: number };

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * A real CSV reader: quoted fields may contain commas and newlines, `""` is an
 * escaped quote, and the leading UTF-8 BOM Excel writes is dropped.
 *
 * The seed importer used to split lines on `,` with a regex, which silently
 * mangled every row holding a value like `"Sodium chloride, 0.9%"` — shifting
 * every later column by one. That is exactly the kind of corruption nobody
 * notices until a bill prints the wrong strength.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // CRLF is one break, not two.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const csvCell = (value: unknown) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Serialises rows in `MEDICINE_COLUMNS` order.
 *
 * BOM-prefixed on purpose: without it Excel opens a UTF-8 file as the system
 * codepage and Bangla text in `description` arrives as mojibake — and the file
 * is then saved back that way, corrupting the catalogue on re-import.
 */
export function buildCsv(rows: Record<string, unknown>[]): string {
  return csvHeader() + rows.map(csvLine).join('');
}

/** Header line, BOM included — written once at the head of a streamed export. */
export const csvHeader = () => `\uFEFF${MEDICINE_COLUMNS.join(',')}\r\n`;

/** One row at a time, so a full export never sits in memory as one string. */
export const csvLine = (row: Record<string, unknown>) =>
  `${MEDICINE_COLUMNS.map((c) => csvCell(row[c])).join(',')}\r\n`;

/** Maps a header row onto our columns, so `parseCsv` output becomes objects. */
/**
 * Other people's column names for the same columns.
 *
 * The DGDA registry, a pharmaceutical company's price list and a colleague's
 * spreadsheet all describe brand, generic, company and strength — none of them
 * using this project's names for those things. Renaming 25,000 rows' header by
 * hand before an import is the kind of step that gets skipped, and skipping it
 * imports a file where every recognised column is blank: 25,000 rows, all
 * failing on `brandName is required`.
 *
 * Only unambiguous synonyms belong here. A header this map does not know is
 * ignored, which is the safe outcome — a *wrong* guess would file a column of
 * pack sizes as strengths, and every bill would print it.
 */
const HEADER_ALIASES: Record<MedicineColumn, string[]> = {
  id: ['medicineid'],
  brandName: ['brand', 'brands', 'tradename', 'productname', 'product', 'medicinename'],
  genericName: [
    'generic',
    'generics',
    'activeingredient',
    'activeingredients',
    'molecule',
    'composition',
  ],
  companyName: ['company', 'manufacturer', 'manufacturername', 'marketedby'],
  groupName: ['group', 'therapeuticgroup', 'therapeuticclass', 'pharmacologicalgroup'],
  dosageForm: ['form', 'dosage', 'formulation', 'presentation'],
  strength: ['strengths', 'potency'],
  packSize: ['pack', 'packing', 'packaging', 'packsizes'],
  price: ['mrp', 'unitprice', 'retailprice', 'rate'],
  description: ['notes', 'remarks'],
  indications: ['indication', 'uses'],
  sideEffects: ['sideeffect', 'adverseeffects', 'adversereactions'],
  status: ['activestatus'],
  dar: ['darno', 'darnumber', 'registrationno', 'registrationnumber', 'regno'],
};

const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_.\-()]/g, '');

export function rowsFromMatrix(matrix: string[][]): ImportRow[] {
  if (matrix.length === 0) return [];
  const [header, ...body] = matrix;
  const index = new Map<string, number>();
  // First occurrence wins, so a file carrying both `brandName` and `brand`
  // does not have its real column shadowed by a stray duplicate later on.
  header.forEach((h, i) => {
    const key = normaliseHeader(h);
    if (key && !index.has(key)) index.set(key, i);
  });

  /** The canonical name always beats an alias; aliases are tried in order. */
  const columnAt = (col: MedicineColumn) => {
    const own = index.get(normaliseHeader(col));
    if (own !== undefined) return own;
    for (const alias of HEADER_ALIASES[col]) {
      const at = index.get(alias);
      if (at !== undefined) return at;
    }
    return undefined;
  };

  const positions = MEDICINE_COLUMNS.map((col) => [col, columnAt(col)] as const).filter(
    ([, at]) => at !== undefined,
  );

  return body.map((cells, n) => {
    const row: ImportRow = { _line: n + 2 }; // +2: 1-based, past the header
    for (const [col, at] of positions) row[col] = (cells[at!] ?? '').trim();
    return row;
  });
}

/**
 * Which of this project's columns a header row was understood as, and which of
 * its own columns went unread. An import that silently ignores the column the
 * file called `Trade Name` is the failure worth catching *before* 25,000 rows
 * are written, so both the CLI and the Formulary page report this first.
 */
export function describeHeader(matrix: string[][]) {
  if (matrix.length === 0) return { recognised: [], ignored: [] };
  const rows = rowsFromMatrix([matrix[0], []]);
  const recognised = MEDICINE_COLUMNS.filter((col) => rows[0] && col in rows[0]);
  const used = new Set<string>();
  for (const col of recognised) {
    used.add(normaliseHeader(col));
    for (const alias of HEADER_ALIASES[col]) used.add(alias);
  }
  const ignored = matrix[0]
    .map((h) => h.trim())
    .filter((h) => h && !used.has(normaliseHeader(h)));
  return { recognised, ignored };
}

/** Two example rows under the header, so the shape of a value is obvious. */
export function buildTemplateCsv() {
  return buildCsv([
    {
      id: '',
      brandName: 'Napa',
      genericName: 'Paracetamol',
      companyName: 'Beximco Pharmaceuticals Ltd.',
      groupName: 'Analgesic & Antipyretic',
      dosageForm: 'Tablet',
      strength: '500 mg',
      packSize: '10 x 10',
      price: '1.20',
      description: 'Analgesic and antipyretic.',
      indications: 'Fever, mild to moderate pain',
      sideEffects: 'Rare: rash, hepatotoxicity in overdose',
      status: 'active',
      // The DGDA registration number, where you have it. Blank is fine; a row
      // that carries one is matched on it in preference to its name.
      dar: '',
    },
    {
      id: '',
      brandName: 'Napa Syrup',
      genericName: 'Paracetamol',
      companyName: 'Beximco Pharmaceuticals Ltd.',
      groupName: 'Analgesic & Antipyretic',
      dosageForm: 'Syrup',
      strength: '120 mg/5 ml',
      packSize: '100 ml bottle',
      price: '35.00',
      description: '',
      indications: '',
      sideEffects: '',
      status: 'active',
      dar: '',
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportReport {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: { line?: number; brandName?: string; reason: string }[];
  newCompanies: string[];
  newGenerics: string[];
  newGroups: string[];
}

const isObjectId = (v?: string) => Boolean(v && /^[0-9a-fA-F]{24}$/.test(v));

/**
 * Resolves reference names to ids, creating what is missing.
 *
 * One cache per import run, so a 25k-row file with 200 companies does 200
 * lookups rather than 25,000. Names are matched case-insensitively but stored
 * as first written, so "square pharmaceuticals ltd." in one row does not create
 * a second company beside "Square Pharmaceuticals Ltd.".
 */
class RefResolver {
  /** Exact (lower-cased) name → id. */
  private byName = {
    company: new Map<string, string>(),
    generic: new Map<string, string>(),
    group: new Map<string, string>(),
  };

  /**
   * Fingerprint → id, so a second source's spelling maps onto the first's.
   *
   * This is what stops "ACI Limited" and "ACI Ltd." becoming two companies. The
   * alternative — rewriting every name to one house style — was tried and is
   * worse: the company is *registered* as "ACI Limited", and a catalogue that
   * renames it no longer agrees with the registry, the invoice or the box. So
   * the first spelling to arrive is the one kept (and the registry is imported
   * first, deliberately), while later variants resolve to it silently.
   *
   * Only ever used to find an existing reference. It never merges two that
   * already exist — that is `catalog:audit`'s job, with a person deciding.
   */
  private byFingerprint = {
    company: new Map<string, string>(),
    generic: new Map<string, string>(),
    group: new Map<string, string>(),
  };

  /**
   * The in-flight load, not a boolean.
   *
   * Each row resolves its company, generic and group concurrently. With a flag
   * set before the queries were awaited, the first call started loading and the
   * other two sailed past it into *empty* maps — so they created references that
   * already existed, and the unique index rejected 754 rows of a 45,000-row
   * import with "duplicate key". Awaiting the same promise is the whole fix.
   */
  private loading: Promise<void> | null = null;

  /**
   * id -> stored name, so an import can write the *curated* spelling.
   *
   * `medicines.genericName` is a denormalised copy, and the row in the file is
   * not the authority on it. When a curator merges "Vitamin C [Ascorbic acid]"
   * into "Vitamin C", the source file still says the old thing - and an import
   * that copied the row verbatim wrote it straight back, undoing the merge on
   * every run. 182 rows flapped that way. So the reference decides the name and
   * the row only decides *which* reference.
   */
  private nameById = new Map<string, string>();

  readonly created = { company: [] as string[], generic: [] as string[], group: [] as string[] };

  /** Every reference loaded, so `nameOf` answers for ones this run has not resolved. */
  ready() {
    return this.load();
  }

  /** The stored spelling of a reference, once resolved. */
  nameOf(id?: string) {
    return id ? this.nameById.get(id) : undefined;
  }

  constructor(private readonly dryRun: boolean) {}

  private model(kind: 'company' | 'generic' | 'group') {
    if (kind === 'company') return MedicineCompanyModel;
    if (kind === 'generic') return MedicineGenericModel;
    return MedicineGroupModel;
  }

  private fingerprint(kind: 'company' | 'generic' | 'group', name: string) {
    if (kind === 'company') return companyKey(name);
    if (kind === 'generic') return genericKey(name);
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  /**
   * Loads every reference row once per import.
   *
   * There are a few hundred companies, a couple of thousand generics and a few
   * hundred groups — small enough to hold, and the alternative is a
   * case-insensitive regex query per row, which on a 45,000-row import is
   * 135,000 collection scans.
   */
  private load() {
    if (!this.loading) this.loading = this.loadAll();
    return this.loading;
  }

  private async loadAll() {
    for (const kind of ['company', 'generic', 'group'] as const) {
      const Model = this.model(kind) as unknown as {
        find(f: unknown): { select(f: string): { lean(): Promise<{ _id: unknown; name: string }[]> } };
      };
      for (const doc of await Model.find({}).select('name').lean()) {
        const id = String(doc._id);
        this.byName[kind].set(doc.name.trim().toLowerCase(), id);
        this.nameById.set(id, doc.name);
        const fp = this.fingerprint(kind, doc.name);
        // First wins, so an existing duplicate does not decide which one later
        // rows attach to on the basis of collection order.
        if (fp && !this.byFingerprint[kind].has(fp)) this.byFingerprint[kind].set(fp, id);
      }
    }
  }

  async resolve(kind: 'company' | 'generic' | 'group', rawName?: string) {
    const name = rawName?.trim();
    if (!name) return undefined;
    await this.load();

    const key = name.toLowerCase();
    const exact = this.byName[kind].get(key);
    if (exact) return exact.startsWith('dry:') ? undefined : exact;

    const fp = this.fingerprint(kind, name);
    const near = fp ? this.byFingerprint[kind].get(fp) : undefined;
    if (near) {
      // Remembered under this spelling too, so the next row with it is one lookup.
      this.byName[kind].set(key, near);
      return near.startsWith('dry:') ? undefined : near;
    }

    this.created[kind].push(name);
    if (this.dryRun) {
      // Nothing is written, but later rows naming the same company must not be
      // reported as another new one.
      this.byName[kind].set(key, `dry:${key}`);
      if (fp) this.byFingerprint[kind].set(fp, `dry:${key}`);
      return undefined;
    }

    const Model = this.model(kind) as unknown as { create(d: unknown): Promise<{ id: string }> };
    const doc = await Model.create(
      kind === 'company'
        ? { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
        : { name },
    );
    this.byName[kind].set(key, doc.id);
    if (fp) this.byFingerprint[kind].set(fp, doc.id);
    this.nameById.set(doc.id, name);
    return doc.id;
  }
}

/** Text fields are compared trimmed, so trailing spaces are not a "change". */
const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();

/**
 * Applies one batch of spreadsheet rows.
 *
 * The client sends the file in chunks so a large import stays inside the 1 MB
 * body limit and can show progress; each call is independent and reports on its
 * own rows, and the client sums the reports.
 */
export async function importRows(
  input: ImportRow[],
  opts: { dryRun?: boolean; ignoreIds?: boolean } = {},
): Promise<ImportReport> {
  const dryRun = Boolean(opts.dryRun);
  /*
   * A file exported from another server carries that server's ids, which mean
   * nothing here — every row would fail "not in this catalogue". With
   * `ignoreIds` they are dropped and each row is matched by what it is (brand,
   * strength, company, form), exactly as a row typed in by hand.
   */
  const rows = opts.ignoreIds ? input.map(({ id: _id, ...row }) => row as ImportRow) : input;
  const refs = new RefResolver(dryRun);
  const report: ImportReport = {
    received: rows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: [],
    newCompanies: [],
    newGenerics: [],
    newGroups: [],
  };

  // One indexed lookup for the whole batch instead of a query per row.
  const brandKeys = [...new Set(rows.map((r) => brandKeyOf(r.brandName || '')).filter(Boolean))];
  const ids = rows.map((r) => r.id).filter(isObjectId);
  const candidates = await MedicineModel.find({
    $or: [
      ...(brandKeys.length ? [{ brandKey: { $in: brandKeys } }] : []),
      ...(ids.length ? [{ _id: { $in: ids } }] : []),
    ],
  }).exec();

  const byId = new Map(candidates.map((m) => [String(m._id), m]));
  /**
   * Brand + strength + company + **dosage form**.
   *
   * The dosage form was added after a real catalogue arrived: 473 products in
   * the Bangladeshi registry share a brand, a company and a strength while being
   * different medicines — "Safi" as a capsule and as a syrup, "Aduvit" both
   * ways, and every herbal preparation registered without a strength at all.
   * Without the form in the key each of those pairs collapsed into one row, and
   * the one that survived was whichever the file happened to list last.
   */
  const naturalKey = (
    brand: string,
    strength?: unknown,
    company?: unknown,
    dosageForm?: unknown,
  ) =>
    [
      brandKeyOf(brand),
      String(strength ?? '').trim().toLowerCase(),
      company ? String(company) : '',
      String(dosageForm ?? '').trim().toLowerCase(),
    ].join('|');
  const byNatural = new Map(
    candidates.map((m) => [naturalKey(m.brandName, m.strength, m.company, m.dosageForm), m]),
  );

  for (const raw of rows) {
    // Normalised before matching, not after: "SQUARE PHARMACEUTICALS LIMITED"
    // and "Square Pharmaceuticals Ltd." have to become one company *before* the
    // row is looked up, or the second source silently creates a second company
    // and splits that maker's medicines across two names in the filter.
    const row = normaliseCatalogRow(raw);

    /*
     * A row that names its medicine by id keeps whatever it did not change.
     *
     * Without this an export imported straight back was not a no-op: the
     * normaliser re-spelt 8 dosage forms and strengths, re-resolved 33
     * generics to their curated names, and — worst — moved 526 medicines from
     * "Ibn Sina Pharmaceutical Ind. Ltd." to "Ibn Sina Pharmaceuticals Ltd.",
     * because the two names share a fingerprint. Normalising is for a list
     * arriving from outside; a cell that still says what the catalogue says is
     * the catalogue's own value, and stays exactly as it is.
     */
    const prior = isObjectId(raw.id) ? byId.get(raw.id!) : undefined;
    const kept = new Set<string>();
    if (prior) {
      await refs.ready();
      const sameText = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();
      const sameName = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
      for (const f of ['brandName', 'genericName', 'dosageForm', 'strength', 'packSize'] as const) {
        if (raw[f] !== undefined && sameText(raw[f], prior.get(f))) {
          row[f] = String(prior.get(f) ?? '');
          kept.add(f);
        }
      }
      const linked = (key: 'company' | 'group') => (prior.get(key) ? String(prior.get(key)) : undefined);
      if (linked('company') && sameName(raw.companyName, refs.nameOf(linked('company')))) kept.add('company');
      if (linked('group') && sameName(raw.groupName, refs.nameOf(linked('group')))) kept.add('group');
    }

    const brandName = row.brandName?.trim();
    try {
      if (!brandName) throw new Error('brandName is required');

      const [company, generic, group] = await Promise.all([
        kept.has('company') ? String(prior!.get('company')) : refs.resolve('company', row.companyName),
        kept.has('genericName') && prior!.get('generic')
          ? String(prior!.get('generic'))
          : refs.resolve('generic', row.genericName),
        kept.has('group') ? String(prior!.get('group')) : refs.resolve('group', row.groupName),
      ]);

      const rowGeneric = row.genericName?.trim();
      if (!rowGeneric) throw new Error('genericName is required');
      // The reference's spelling, not the file's - see `nameById`. Falls back to
      // the row when the reference could not be resolved (a dry run). A generic
      // the row did not change keeps the name the medicine already has.
      const genericName = kept.has('genericName') ? rowGeneric : (refs.nameOf(generic) ?? rowGeneric);

      let price: number | undefined;
      if (row.price?.trim()) {
        price = Number(row.price.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(price)) throw new Error(`price "${row.price}" is not a number`);
      }

      const status = (row.status || '').trim().toLowerCase();
      if (status && !['active', 'retired', 'inactive'].includes(status)) {
        throw new Error(`status "${row.status}" must be active or retired`);
      }
      const isActive = status ? status === 'active' : undefined;

      if (isObjectId(row.id) && !byId.has(row.id!)) {
        throw new Error(`id ${row.id} is not in this catalogue`);
      }

      const dar = (row.dar || '').trim();

      /**
       * The registration number is stored, and is **not** an identity.
       *
       * It looks like the perfect key — the one identifier issued by somebody
       * other than us — and it is not one. A DGDA registration covers a
       * *product*, not a presentation: "Albutrim" is registered once under
       * 096-0086-023 and sold as 400 mg + 80 mg and as 800 mg + 160 mg, and the
       * registry repeats a further 175 numbers across items that are plainly
       * different. Matching on it fused those rows, and every import then
       * rewrote the other's strength — a catalogue that never settled, 236 rows
       * "updated" on every single run.
       *
       * So identity stays with what actually distinguishes a product on a
       * shelf — brand, strength, company, form — and the DAR rides along as the
       * registration reference it is.
       */
      const existing = isObjectId(row.id)
        ? byId.get(row.id!)
        : byNatural.get(naturalKey(brandName, row.strength, company, row.dosageForm));

      /**
       * A blank cell means "nothing to say", not "erase what you have".
       *
       * This matters as soon as a catalogue is enriched from more than one file.
       * The registry has no prices; a drug index has no registration numbers; the
       * 700-row starter that ships with the repo has neither. With blank meaning
       * *empty*, importing the smaller file wiped the pack sizes and indications
       * the larger one had just supplied — 631 rows of quiet data loss, reported
       * as a successful import.
       *
       * Identity and labels are still written as given: a brand, generic,
       * strength or form is what the row says it is, and a row cannot blank them
       * anyway without becoming a different product. To actually clear a
       * description or a pack size, edit the medicine in the app — a bulk import
       * is the wrong instrument for deleting one field on one row.
       */
      const fields: Record<string, unknown> = {
        brandName,
        brandKey: brandKeyOf(brandName),
        genericName,
        dosageForm: row.dosageForm?.trim() ?? '',
        strength: row.strength?.trim() ?? '',
      };
      for (const soft of ['packSize', 'description', 'indications', 'sideEffects'] as const) {
        const value = row[soft]?.trim();
        if (value) fields[soft] = value;
      }
      // Only ever set, never cleared: a later import from a source that has no
      // registration numbers must not wipe the one already recorded.
      if (dar) fields.dar = dar;
      if (generic) fields.generic = generic;
      if (company) fields.company = company;
      if (group) fields.group = group;
      if (price !== undefined) fields.price = price;
      if (isActive !== undefined) fields.isActive = isActive;

      if (!existing) {
        report.created++;
        if (!dryRun) {
          const doc = await MedicineModel.create({ isActive: true, ...fields });
          // A later row in the same batch may target what this one just made.
          byId.set(String(doc._id), doc);
          byNatural.set(naturalKey(brandName, fields.strength, company, fields.dosageForm), doc);
        }
        continue;
      }

      const changed = Object.entries(fields).some(([key, value]) => {
        const current = existing.get(key);
        if (key === 'generic' || key === 'company' || key === 'group') {
          return String(current ?? '') !== String(value ?? '');
        }
        if (key === 'price') return Number(current ?? NaN) !== Number(value);
        if (key === 'isActive') return Boolean(current) !== Boolean(value);
        return !same(current, value);
      });

      if (!changed) {
        report.unchanged++;
        continue;
      }

      report.updated++;
      if (!dryRun) {
        existing.set(fields);
        await existing.save();
      }
    } catch (err) {
      report.failed.push({
        line: row._line,
        brandName,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  report.newCompanies = refs.created.company;
  report.newGenerics = refs.created.generic;
  report.newGroups = refs.created.group;
  return report;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

interface PopulatedRef {
  name?: string;
}

/** Shapes a medicine document into the exported row — the same columns back. */
export function toExportRow(m: {
  _id: unknown;
  brandName: string;
  genericName: string;
  company?: PopulatedRef | null;
  group?: PopulatedRef | null;
  dosageForm?: string;
  strength?: string;
  packSize?: string;
  price?: number | null;
  description?: string;
  indications?: string;
  sideEffects?: string;
  isActive?: boolean;
  dar?: string;
}): Record<MedicineColumn, string> {
  return {
    id: String(m._id),
    brandName: m.brandName || '',
    genericName: m.genericName || '',
    companyName: m.company?.name || '',
    groupName: m.group?.name || '',
    dosageForm: m.dosageForm || '',
    strength: m.strength || '',
    packSize: m.packSize || '',
    price: m.price == null ? '' : String(m.price),
    description: m.description || '',
    indications: m.indications || '',
    sideEffects: m.sideEffects || '',
    status: m.isActive === false ? 'retired' : 'active',
    dar: m.dar || '',
  };
}
