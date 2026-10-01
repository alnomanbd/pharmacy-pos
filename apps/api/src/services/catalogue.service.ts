import { Types, type Model } from 'mongoose';
import {
  MedicineModel,
  MedicineCompanyModel,
  MedicineGenericModel,
  MedicineGroupModel,
  MedicineRequestModel,
  ShopProductModel,
} from '../models/index.js';
import { brandKeyOf } from '../models/Medicine.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { containsRegex, escapeRegex, prefixRegex } from '../utils/search.js';
import type { MedicineInput, MedicinePatch } from '../validators/catalogue.validator.js';

/**
 * The write side of the shared medicine catalogue, for the console.
 *
 * Kept apart from `medicine.service.ts`, which is the read path the shop's
 * counter hits on every keystroke: that one only ever sees active rows and is
 * tuned for ranking; this one sees everything and is tuned for curating.
 *
 * Two rules run through it:
 *
 * 1. **Deactivate, don't delete.** A shop's product list points at catalogue
 *    rows. Deleting one that a shop stocks would leave that product pointing at
 *    nothing, so a hard delete is only offered while no shop stocks it — for a
 *    row that was simply entered wrong. An obsolete brand is switched off: it
 *    leaves the counter's search and stays on every shelf that has it.
 * 2. **Brand + strength + company + form is the identity.** One brand is sold
 *    by several companies, at several strengths and in several forms, so the
 *    name alone identifies nothing. That is the same key the bulk importer
 *    uses, and the index it uses.
 */

const clean = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');

function oid(id: string, what = 'id'): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw badRequest(`Not a valid ${what}`);
  return new Types.ObjectId(id);
}

/* ------------------------------------------------------------------ */
/* Pure rules — tested without a database                              */
/* ------------------------------------------------------------------ */

/** What makes two catalogue rows the same product. */
export interface MedicineKey {
  brandName: string;
  strength?: string | null;
  companyId?: string | null;
  dosageForm?: string | null;
}

/**
 * The Mongo filter that finds a row with the same identity.
 *
 * An empty strength, company or form matches a missing one too: rows imported
 * years apart disagree about whether "no strength" is `''` or absent, and they
 * are the same product either way.
 */
export function duplicateFilter(key: MedicineKey, excludeId?: string) {
  const blank = { $in: ['', null] };
  const strength = clean(key.strength);
  const form = clean(key.dosageForm);
  const filter: Record<string, unknown> = {
    brandKey: brandKeyOf(key.brandName),
    strength: strength || blank,
    dosageForm: form || blank,
    company: key.companyId ? new Types.ObjectId(key.companyId) : { $in: [null] },
  };
  if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };
  return filter;
}

/** Whether a patch touches any part of a row's identity. */
export function touchesIdentity(patch: MedicinePatch) {
  return (
    patch.brandName !== undefined ||
    patch.strength !== undefined ||
    patch.companyId !== undefined ||
    patch.dosageForm !== undefined
  );
}

export const DUPLICATE_MEDICINE = 'That medicine is already in the catalogue';

/** Why a catalogue row cannot be deleted, or null when it can. */
export function medicineDeleteBlock(usedByShops: number): string | null {
  if (usedByShops <= 0) return null;
  return usedByShops === 1
    ? '1 shop stocks this medicine — deactivate it instead'
    : `${usedByShops} shops stock this medicine — deactivate it instead`;
}

/** Why a company, generic or group cannot be deleted, or null when it can. */
export function refDeleteBlock(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? 'Used by 1 medicine' : `Used by ${count} medicines`;
}

/** `?active=true|false` — anything else is "both". */
export function activeFilter(v: unknown): boolean | undefined {
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return undefined;
}

/** Page and size, bounded so a `limit=99999` cannot pull the whole catalogue. */
export function pageWindow(opts: { page?: number; limit?: number }, fallback = 25, max = 100) {
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const limit = Math.min(max, Math.max(1, Math.floor(Number(opts.limit) || fallback)));
  return { page, limit, skip: (page - 1) * limit };
}

/* ------------------------------------------------------------------ */
/* Reference lists: companies, generics, groups                        */
/* ------------------------------------------------------------------ */

export const REF_KINDS = ['companies', 'generics', 'groups'] as const;
export type RefKind = (typeof REF_KINDS)[number];

/*
 * Typed as a plain `Model` rather than the union of the three schemas: the
 * union has no call signature the three share, so every `find` on it fails to
 * compile. The documents are near-identical anyway — a name and a flag.
 */
type AnyModel = Model<Record<string, unknown>>;
const REF_MODEL: Record<RefKind, AnyModel> = {
  companies: MedicineCompanyModel as unknown as AnyModel,
  generics: MedicineGenericModel as unknown as AnyModel,
  groups: MedicineGroupModel as unknown as AnyModel,
};

/** The field on `Medicine` that points at each list. */
const REF_FIELD: Record<RefKind, 'company' | 'generic' | 'group'> = {
  companies: 'company',
  generics: 'generic',
  groups: 'group',
};

const REF_LABEL: Record<RefKind, string> = {
  companies: 'Company',
  generics: 'Generic',
  groups: 'Group',
};

export const isRefKind = (v: string): v is RefKind => (REF_KINDS as readonly string[]).includes(v);

const exactName = (name: string) => new RegExp(`^${escapeRegex(name.trim())}$`, 'i');

const refView = (r: { _id: unknown; name?: unknown }, count?: number) => ({
  _id: String(r._id),
  name: String(r.name ?? ''),
  ...(count === undefined ? {} : { count }),
});

async function refCounts(kind: RefKind, ids: unknown[]) {
  const field = REF_FIELD[kind];
  const rows = await MedicineModel.aggregate<{ _id: unknown; n: number }>([
    { $match: { [field]: { $in: ids } } },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

export async function listRefs(kind: RefKind, opts: { q?: string; page?: number; limit?: number }) {
  const Ref = REF_MODEL[kind];
  const { page, limit, skip } = pageWindow(opts, 50, 500);
  const filter: Record<string, unknown> = {};
  if (opts.q?.trim()) filter.name = containsRegex(opts.q);

  const [rows, total] = await Promise.all([
    Ref.find(filter).select('name').sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    Ref.countDocuments(filter),
  ]);
  // The count is what makes the list usable: it says which companies actually
  // carry products here and which are empty rows somebody typed once.
  const counts = await refCounts(kind, rows.map((r) => r._id));
  return {
    data: rows.map((r) => refView(r, counts.get(String(r._id)) ?? 0)),
    total,
    page,
    limit,
  };
}

async function assertRefNameFree(kind: RefKind, name: string, excludeId?: Types.ObjectId) {
  const filter: Record<string, unknown> = { name: exactName(name) };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await REF_MODEL[kind].exists(filter)) {
    throw badRequest(`${REF_LABEL[kind]} "${name.trim()}" already exists`);
  }
}

const slugOf = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function createRef(kind: RefKind, input: { name: string }) {
  const name = input.name.trim();
  await assertRefNameFree(kind, name);
  const doc = await REF_MODEL[kind].create({
    name,
    ...(kind === 'companies' ? { slug: slugOf(name) } : {}),
  });
  return refView(doc.toObject(), 0);
}

export async function updateRef(kind: RefKind, id: string, input: { name: string }) {
  const _id = oid(id);
  const doc = await REF_MODEL[kind].findById(_id);
  if (!doc) throw notFound(REF_LABEL[kind]);
  const before = String(doc.get('name') ?? '');
  const name = input.name.trim();
  await assertRefNameFree(kind, name, _id);

  doc.set('name', name);
  if (kind === 'companies') doc.set('slug', slugOf(name));
  await doc.save();

  // `genericName` is copied onto every medicine because the counter searches
  // and sorts on it. A renamed generic that left those copies behind would be
  // found under its old name for ever.
  if (kind === 'generics' && name !== before) {
    await MedicineModel.updateMany({ generic: _id }, { $set: { genericName: name } });
  }

  const counts = await refCounts(kind, [_id]);
  return { ref: refView(doc.toObject(), counts.get(String(_id)) ?? 0), before };
}

/**
 * Removes a reference row outright, only while no medicine points at it — the
 * alternative is a catalogue full of brands whose company is a dangling id.
 */
export async function deleteRef(kind: RefKind, id: string) {
  const _id = oid(id);
  const doc = await REF_MODEL[kind].findById(_id).lean();
  if (!doc) throw notFound(REF_LABEL[kind]);
  const count = await MedicineModel.countDocuments({ [REF_FIELD[kind]]: _id });
  const block = refDeleteBlock(count);
  if (block) throw badRequest(block);
  await REF_MODEL[kind].deleteOne({ _id });
  return { id: String(_id), name: String(doc.name ?? ''), deleted: true as const };
}

/* ------------------------------------------------------------------ */
/* Medicines                                                           */
/* ------------------------------------------------------------------ */

type Populated = { _id: unknown; name?: unknown } | null | undefined;
type MedicineRow = Record<string, unknown> & { _id: unknown };

const refOrNull = (r: unknown) =>
  r && typeof r === 'object' && 'name' in (r as object) ? refView(r as Populated & object) : null;

/** One row in the console's shape. */
function medicineView(m: MedicineRow, usedByShops: number) {
  return {
    _id: String(m._id),
    brandName: String(m.brandName ?? ''),
    genericName: String(m.genericName ?? ''),
    strength: String(m.strength ?? ''),
    dosageForm: String(m.dosageForm ?? ''),
    packSize: String(m.packSize ?? ''),
    price: typeof m.price === 'number' ? m.price : null,
    dar: String(m.dar ?? ''),
    description: String(m.description ?? ''),
    indications: String(m.indications ?? ''),
    sideEffects: String(m.sideEffects ?? ''),
    isActive: m.isActive !== false,
    company: refOrNull(m.company),
    generic: refOrNull(m.generic),
    group: refOrNull(m.group),
    usedByShops,
    createdAt: m.createdAt ?? null,
    updatedAt: m.updatedAt ?? null,
  };
}

export type CatalogueMedicine = ReturnType<typeof medicineView>;

async function shopCounts(ids: unknown[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await ShopProductModel.aggregate<{ _id: unknown; n: number }>([
    { $match: { medicine: { $in: ids } } },
    { $group: { _id: '$medicine', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

async function loadView(id: Types.ObjectId): Promise<CatalogueMedicine> {
  const row = await MedicineModel.findById(id)
    .populate('company', 'name')
    .populate('generic', 'name')
    .populate('group', 'name')
    .lean();
  if (!row) throw notFound('Medicine');
  const counts = await shopCounts([id]);
  return medicineView(row as MedicineRow, counts.get(String(id)) ?? 0);
}

export async function getMedicine(id: string) {
  return loadView(oid(id));
}

export async function listMedicines(opts: {
  q?: string;
  company?: string;
  generic?: string;
  group?: string;
  dosageForm?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}) {
  const { page, limit, skip } = pageWindow(opts);
  const filter: Record<string, unknown> = {};
  if (opts.company) filter.company = oid(opts.company, 'company');
  if (opts.generic) filter.generic = oid(opts.generic, 'generic');
  if (opts.group) filter.group = oid(opts.group, 'group');
  if (opts.dosageForm?.trim()) filter.dosageForm = exactName(opts.dosageForm);
  if (opts.active !== undefined) filter.isActive = opts.active;

  const term = opts.q?.trim();
  if (term) {
    // Anchored first, so the brandName/genericName indexes can be walked; the
    // substring form is a scan of 45,000 rows and only runs when the prefix
    // finds nothing — "cetamol" still finds Paracetamol.
    const byPrefix = [
      { brandName: prefixRegex(term) },
      { genericName: prefixRegex(term) },
      { dar: prefixRegex(term) },
    ];
    const anchored = term.length < 3 || (await MedicineModel.exists({ ...filter, $or: byPrefix }));
    filter.$or = anchored
      ? byPrefix
      : [
          { brandName: containsRegex(term) },
          { genericName: containsRegex(term) },
          { dar: containsRegex(term) },
        ];
  }

  const [rows, total] = await Promise.all([
    MedicineModel.find(filter)
      .populate('company', 'name')
      .populate('generic', 'name')
      .populate('group', 'name')
      // `_id` as the tie-break, or a brand sold by three companies can appear
      // on page 2 and again on page 3 while another is never seen.
      .sort({ brandName: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MedicineModel.countDocuments(filter),
  ]);

  const counts = await shopCounts(rows.map((r) => r._id));
  return {
    data: rows.map((r) => medicineView(r as MedicineRow, counts.get(String(r._id)) ?? 0)),
    total,
    page,
    limit,
  };
}

/** Checks each linked reference exists, and returns the generic's name if one is linked. */
async function resolveRefs(input: { companyId?: string | null; genericId?: string | null; groupId?: string | null }) {
  const [company, generic, group] = await Promise.all([
    input.companyId ? MedicineCompanyModel.findById(oid(input.companyId, 'company')).select('name').lean() : null,
    input.genericId ? MedicineGenericModel.findById(oid(input.genericId, 'generic')).select('name').lean() : null,
    input.groupId ? MedicineGroupModel.findById(oid(input.groupId, 'group')).select('name').lean() : null,
  ]);
  if (input.companyId && !company) throw notFound('Company');
  if (input.genericId && !generic) throw notFound('Generic');
  if (input.groupId && !group) throw notFound('Group');
  return { genericName: generic?.name };
}

async function assertNotDuplicate(key: MedicineKey, excludeId?: string) {
  if (await MedicineModel.exists(duplicateFilter(key, excludeId))) {
    throw badRequest(DUPLICATE_MEDICINE);
  }
}

/**
 * Adds a row to the catalogue. Also the path a shop's request takes when an
 * operator approves it by creating the medicine, so both are held to the same
 * duplicate rule.
 */
export async function createMedicine(input: MedicineInput): Promise<CatalogueMedicine> {
  const refs = await resolveRefs(input);
  await assertNotDuplicate({
    brandName: input.brandName,
    strength: input.strength,
    companyId: input.companyId,
    dosageForm: input.dosageForm,
  });

  const doc = await MedicineModel.create({
    brandName: input.brandName.trim(),
    // A linked generic's own name wins, so the copy cannot start out of step.
    genericName: refs.genericName ?? input.genericName.trim(),
    generic: input.genericId || undefined,
    company: input.companyId || undefined,
    group: input.groupId || undefined,
    strength: clean(input.strength),
    dosageForm: clean(input.dosageForm),
    packSize: clean(input.packSize),
    price: input.price ?? undefined,
    dar: clean(input.dar),
    description: clean(input.description),
    indications: clean(input.indications),
    sideEffects: clean(input.sideEffects),
    isActive: input.isActive ?? true,
  });
  return loadView(doc._id);
}

const TEXT_FIELDS = [
  'brandName',
  'strength',
  'dosageForm',
  'packSize',
  'dar',
  'description',
  'indications',
  'sideEffects',
] as const;

export async function updateMedicine(id: string, patch: MedicinePatch) {
  const _id = oid(id);
  const doc = await MedicineModel.findById(_id);
  if (!doc) throw notFound('Medicine');
  const before = medicineView(doc.toObject() as MedicineRow, 0);

  const refs = await resolveRefs(patch);
  if (touchesIdentity(patch)) {
    await assertNotDuplicate(
      {
        brandName: patch.brandName ?? doc.brandName,
        strength: patch.strength ?? doc.strength,
        dosageForm: patch.dosageForm ?? doc.dosageForm,
        companyId:
          patch.companyId !== undefined ? patch.companyId : doc.company ? String(doc.company) : null,
      },
      id,
    );
  }

  for (const key of TEXT_FIELDS) {
    if (patch[key] !== undefined) doc.set(key, clean(patch[key]));
  }
  if (patch.companyId !== undefined) doc.set('company', patch.companyId || undefined);
  if (patch.groupId !== undefined) doc.set('group', patch.groupId || undefined);
  if (patch.genericId !== undefined) {
    doc.set('generic', patch.genericId || undefined);
    if (refs.genericName) doc.set('genericName', refs.genericName);
  }
  if (patch.genericName !== undefined && !refs.genericName) doc.set('genericName', patch.genericName.trim());
  if (patch.price !== undefined) doc.set('price', patch.price ?? undefined);
  if (patch.isActive !== undefined) doc.set('isActive', patch.isActive);

  await doc.save();
  const after = await loadView(_id);
  return { medicine: after, before };
}

export async function deleteMedicine(id: string) {
  const _id = oid(id);
  const doc = await MedicineModel.findById(_id).select('brandName strength').lean();
  if (!doc) throw notFound('Medicine');
  const used = await ShopProductModel.countDocuments({ medicine: _id });
  const block = medicineDeleteBlock(used);
  if (block) throw badRequest(block);
  await MedicineModel.deleteOne({ _id });
  return {
    id: String(_id),
    deleted: true as const,
    label: [doc.brandName, doc.strength].filter(Boolean).join(' '),
  };
}

/** The forms the catalogue actually contains, for the filter and the form. */
export async function dosageForms() {
  const values = (await MedicineModel.distinct('dosageForm')) as (string | null)[];
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = (v || '').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export async function catalogueStats() {
  const [medicines, active, companies, generics, groups, pendingRequests] = await Promise.all([
    MedicineModel.estimatedDocumentCount(),
    MedicineModel.countDocuments({ isActive: true }),
    MedicineCompanyModel.estimatedDocumentCount(),
    MedicineGenericModel.estimatedDocumentCount(),
    MedicineGroupModel.estimatedDocumentCount(),
    MedicineRequestModel.countDocuments({ status: 'pending' }),
  ]);
  return { medicines, active, companies, generics, groups, pendingRequests };
}
