import {
  MedicineModel,
  MedicineGroupModel,
  MedicineCompanyModel,
  MedicineGenericModel,
} from '../models/index.js';
import { prefixRegex, containsRegex, escapeRegex } from '../utils/search.js';

/**
 * The search term, safe to interpolate into an aggregation's `regex` string.
 *
 * `$regexMatch` takes a pattern as a string, not a RegExp, so the term has to be
 * escaped by hand — an unescaped "Vitamin B (" would be an invalid pattern and
 * the whole query would fail.
 */
const escapeForRank = (term: string) => escapeRegex(term.trim());

/** How long a catalogue search may run before it is abandoned. */
const SEARCH_TIMEOUT_MS = 2000;

export async function searchMedicines(opts: {
  q?: string;
  generic?: string;
  group?: string;
  company?: string;
  page?: number;
  limit?: number;
}) {
  const page = opts.page || 1;
  const limit = opts.limit || 25;
  const base: Record<string, unknown> = { isActive: true };

  if (opts.generic) base.generic = opts.generic;
  if (opts.group) base.group = opts.group;
  if (opts.company) base.company = opts.company;

  let filter = base;
  const term = opts.q?.trim();
  if (term) {
    // Anchored first so the brandName/genericName indexes are usable — a plain
    // substring regex is a full scan of the catalogue on every keystroke, and
    // the catalogue is 45,000 brands.
    const byPrefix = {
      ...base,
      $or: [{ brandName: prefixRegex(term) }, { genericName: prefixRegex(term) }],
    };

    /*
     * The substring fallback, so "cetamol" still finds Paracetamol — but only
     * from three characters.
     *
     * Below that it is a collection scan whose results are useless anyway: "xy"
     * matched 92 unrelated brands, none of which is what the pharmacist was reaching
     * for, and every keystroke of a longer word paid for one of these on the way
     * through. Measured at ~130ms per scan, which is fine once and not fine as
     * the cost of typing.
     */
    filter =
      (await MedicineModel.exists(byPrefix)) || term.length < 3
        ? byPrefix
        : { ...base, $or: [{ brandName: containsRegex(term) }, { genericName: containsRegex(term) }] };
  }

  // Ranked, not alphabetical.
  //
  // With a few hundred medicines, sorting by generic name was fine. With the
  // registry loaded — 45,000 brands — typing "Napa" returned "Napa EXTRA",
  // "Napaxin Plus" and "NAPACHE" above plain "Napa", because those sort earlier
  // by *generic*. The first row is the one the counter takes with a keypress, so
  // the exact brand has to be it.
  //
  // 0: the brand *is* the term. 1: brand starts with it. 2: generic starts with
  // it. 3: matched somewhere inside. Then the shorter brand — "Napa" before
  // "Napa Extend" — then alphabetically, so paging is stable.
  const escaped = term ? escapeForRank(term) : '';
  const rank = term
    ? {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: '$brandName', regex: `^${escaped}$`, options: 'i' } }, then: 0 },
            { case: { $regexMatch: { input: '$brandName', regex: `^${escaped}`, options: 'i' } }, then: 1 },
            { case: { $regexMatch: { input: '$genericName', regex: `^${escaped}`, options: 'i' } }, then: 2 },
          ],
          default: 3,
        },
      }
    : 0;

  const [rows, total] = await Promise.all([
    MedicineModel.aggregate([
      { $match: filter },
      { $addFields: { _rank: rank, _brandLen: { $strLenCP: { $ifNull: ['$brandName', ''] } } } },
      { $sort: term ? { _rank: 1, _brandLen: 1, brandName: 1, _id: 1 } : { genericName: 1, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      // Only the name of each reference is needed, and only for one page of rows.
      { $lookup: { from: 'medicinegroups', localField: 'group', foreignField: '_id', as: 'group', pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: 'medicinecompanies', localField: 'company', foreignField: '_id', as: 'company', pipeline: [{ $project: { name: 1 } }] } },
      { $lookup: { from: 'medicinegenerics', localField: 'generic', foreignField: '_id', as: 'generic', pipeline: [{ $project: { name: 1 } }] } },
      {
        $addFields: {
          group: { $first: '$group' },
          company: { $first: '$company' },
          generic: { $first: '$generic' },
        },
      },
      { $unset: ['_rank', '_brandLen'] },
    ])
      // Bounded. The substring fallback is a collection scan, and a scan still
      // running after two seconds is no use to somebody mid-consult — better an
      // empty result than a request holding a connection open per keystroke.
      .option({ maxTimeMS: SEARCH_TIMEOUT_MS }),
    MedicineModel.countDocuments(filter).maxTimeMS(SEARCH_TIMEOUT_MS),
  ]);

  return { data: rows, total, page, limit };
}

export async function getMedicine(id: string) {
  return MedicineModel.findById(id).populate('group company generic').lean();
}

/** The lists a caller can ask for. */
export type ReferenceList = 'groups' | 'companies' | 'generics' | 'dosageForms';

/**
 * The filter lists behind the catalogue picker and the medicine-request form.
 *
 * `only` exists because of what the registry did to the size of this response.
 * With a few hundred medicines it was 20 KB and sending everything to everyone
 * was free. With the registry loaded it is **520 KB** — 2,045 generics, 467
 * groups, 360 companies — and a picker that uses two of those four lists was
 * downloading all of it on every single page load, on a shop's connection.
 *
 * So each caller names what it needs. Only `_id` and `name` are selected: the
 * timestamps and `isActive` flags on a reference row are nobody's business here
 * and were a third of the bytes.
 */
export async function getReferenceLists(only?: ReferenceList[]) {
  const wanted = (list: ReferenceList) => !only || only.length === 0 || only.includes(list);

  const [groups, companies, generics, dosageForms] = await Promise.all([
    wanted('groups')
      ? MedicineGroupModel.find({ isActive: true }).select('name').sort({ name: 1 }).lean()
      : Promise.resolve([]),
    wanted('companies')
      ? MedicineCompanyModel.find({ isActive: true }).select('name').sort({ name: 1 }).lean()
      : Promise.resolve([]),
    wanted('generics')
      ? MedicineGenericModel.find({ isActive: true }).select('name').sort({ name: 1 }).lean()
      : Promise.resolve([]),
    /**
     * Dosage forms have no reference list of their own — they are free text on
     * the medicine, because a catalogue import brings whatever the source wrote.
     * So the offered list is what the catalogue actually contains, which is both
     * accurate and self-maintaining.
     */
    wanted('dosageForms')
      ? (MedicineModel.distinct('dosageForm', { isActive: true }) as Promise<string[]>)
      : Promise.resolve([] as string[]),
  ]);

  return {
    groups,
    companies,
    generics,
    dosageForms: dosageForms
      .map((f) => (f || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  };
}
