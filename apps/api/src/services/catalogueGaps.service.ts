import { Schema, model, Types } from 'mongoose';
import { MedicineGenericModel, MedicineGroupModel, MedicineModel, ShopProductModel } from '../models/index.js';
import { MedicineDemandDailyModel } from './medicineDemand.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { formatDayKey, todayKey } from '../utils/date.js';
import { logger } from '../utils/logger.js';

/**
 * Filling the catalogue's gaps from what shops already know.
 *
 * A shop that stocks a medicine has typed the MRP printed on the pack and how
 * many pieces a strip and a box hold. Across shops those agree, and where the
 * catalogue is blank — or where every shop now charges something the
 * catalogue does not say — that agreement is a suggestion. A brand with no
 * therapeutic group gets the one its generic's other brands nearly all share.
 *
 * Nothing is written to the catalogue from here on its own: one wrong MRP
 * reaches every shop that searches it. Suggestions wait in the console's
 * Catalogue gaps page for somebody to accept or dismiss, busiest medicines
 * first, and an accepted one is written only if the catalogue still says what
 * it said when it was suggested.
 *
 * The prices are MRPs printed on the pack — public facts, not a shop's own.
 */

export const GAP_FIELDS = ['price', 'packSize', 'group'] as const;
export type GapField = (typeof GAP_FIELDS)[number];

const suggestionSchema = new Schema(
  {
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    field: { type: String, enum: GAP_FIELDS, required: true },
    /** Filling a blank, or changing what the catalogue says. */
    kind: { type: String, enum: ['fill', 'update'], required: true },
    value: { type: Schema.Types.Mixed, required: true },
    /** What the catalogue said when this was made; accepting checks it still does. */
    current: { type: Schema.Types.Mixed, default: null },
    display: { type: String, default: '' },
    basis: { type: String, enum: ['shops', 'generic'], required: true },
    /** How many shops (or sibling brands) say this, of how many that say anything. */
    agree: { type: Number, default: 0 },
    reporting: { type: Number, default: 0 },
    confidence: { type: String, enum: ['high', 'low'], required: true },
    /** How many shops stock it, and pieces sold in the last 90 days — the order to work in. */
    stocked: { type: Number, default: 0, index: true },
    sold: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'accepted', 'dismissed'], default: 'open', index: true },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
suggestionSchema.index({ status: 1, field: 1, stocked: -1, sold: -1 });
export const CatalogueSuggestionModel = model('CatalogueSuggestion', suggestionSchema);

const HIGH_SHOPS = Number(process.env.CATALOGUE_SUGGEST_MIN_SHOPS || 3);
const round2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isTabletLike = (form?: string | null) => /tablet|capsule/i.test(form ?? '');

/** The most common value and how many say it. */
function mode<T>(values: T[], key: (v: T) => string = String) {
  const counts = new Map<string, { v: T; n: number }>();
  for (const v of values) {
    const k = key(v);
    const e = counts.get(k) ?? { v, n: 0 };
    e.n++;
    counts.set(k, e);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0] ?? null;
}

/** Strong when enough agree and they are most of those reporting. */
const confidenceOf = (agree: number, reporting: number) => (agree >= HIGH_SHOPS && agree / reporting >= 2 / 3 ? 'high' : 'low');

/* -------------------------------------------------------------- rebuild -- */

/** Works out every open suggestion again. Accepted and dismissed ones stay as they were. */
export async function rebuildSuggestions() {
  const since = formatDayKey(new Date(new Date(`${formatDayKey(todayKey())}T00:00:00Z`).getTime() - 90 * 86_400_000));
  const [perShop, sold] = await Promise.all([
    ShopProductModel.aggregate<{ _id: Types.ObjectId; rows: { org: Types.ObjectId; mrp: number; pps: number; spb: number }[] }>([
      { $match: { medicine: { $type: 'objectId' }, deletedAt: null } },
      { $group: { _id: '$medicine', rows: { $push: { org: '$organization', mrp: '$mrpPerPiece', pps: '$piecesPerStrip', spb: '$stripsPerBox' } } } },
    ]),
    MedicineDemandDailyModel.aggregate<{ _id: Types.ObjectId; pieces: number }>([
      { $match: { day: { $gte: since } } },
      { $group: { _id: '$medicine', pieces: { $sum: '$pieces' } } },
    ]),
  ]);
  const soldOf = new Map(sold.map((s) => [String(s._id), s.pieces]));
  const stockedOf = new Map(perShop.map((p) => [String(p._id), new Set(p.rows.map((r) => String(r.org))).size]));
  const medicines = new Map(
    (await MedicineModel.find({ _id: { $in: perShop.map((p) => p._id) } }).select('price packSize dosageForm brandName strength').lean()).map((m) => [String(m._id), m]),
  );

  const out: Record<string, unknown>[] = [];
  const add = (medicine: Types.ObjectId, s: Record<string, unknown>) =>
    out.push({ medicine, stocked: stockedOf.get(String(medicine)) ?? 0, sold: soldOf.get(String(medicine)) ?? 0, status: 'open', ...s });

  for (const p of perShop) {
    const m = medicines.get(String(p._id));
    if (!m) continue;

    // The MRP a piece: what most shops charge.
    const prices = p.rows.filter((r) => r.mrp > 0).map((r) => round2(r.mrp));
    const top = mode(prices);
    if (top) {
      const conf = confidenceOf(top.n, prices.length);
      const current = m.price ?? null;
      if (!current) {
        add(p._id, { field: 'price', kind: 'fill', value: top.v, current: null, display: `৳${top.v} a piece`, basis: 'shops', agree: top.n, reporting: prices.length, confidence: conf });
      } else if (conf === 'high' && Math.abs(top.v - current) / current > 0.01) {
        // Every shop charging something else is a price that changed.
        add(p._id, { field: 'price', kind: 'update', value: top.v, current, display: `৳${current} → ৳${top.v} a piece`, basis: 'shops', agree: top.n, reporting: prices.length, confidence: conf });
      }
    }

    // Pieces in a box, for tablets and capsules — a bottle's volume cannot be read off a shop's 1 × 1.
    if (!m.packSize && isTabletLike(m.dosageForm)) {
      const packs = p.rows.map((r) => (r.pps || 1) * (r.spb || 1)).filter((n) => n > 1);
      const tp = mode(packs);
      if (tp) {
        const value = `${tp.v}'s pack`;
        add(p._id, { field: 'packSize', kind: 'fill', value, current: '', display: value, basis: 'shops', agree: tp.n, reporting: packs.length, confidence: confidenceOf(tp.n, packs.length) });
      }
    }
  }

  // A brand with no group takes the one its generic's other brands nearly all share.
  const byGeneric = await MedicineModel.aggregate<{ _id: Types.ObjectId; groups: Types.ObjectId[]; missing: Types.ObjectId[] }>([
    { $match: { generic: { $type: 'objectId' } } },
    {
      $group: {
        _id: '$generic',
        groups: { $push: '$group' },
        missing: { $push: { $cond: [{ $eq: [{ $ifNull: ['$group', null] }, null] }, '$_id', '$$REMOVE'] } },
      },
    },
    { $match: { 'missing.0': { $exists: true } } },
  ]);
  const groupNames = new Map((await MedicineGroupModel.find().select('name').lean()).map((g) => [String(g._id), g.name]));
  for (const g of byGeneric) {
    const known = g.groups.filter(Boolean);
    const top = mode(known, String);
    if (!top || top.n < 3 || top.n / known.length < 0.6) continue;
    const conf = top.n / known.length >= 0.8 ? 'high' : 'low';
    for (const id of g.missing) {
      add(id, { field: 'group', kind: 'fill', value: String(top.v), current: null, display: groupNames.get(String(top.v)) ?? 'A group', basis: 'generic', agree: top.n, reporting: known.length, confidence: conf });
    }
  }

  // Not offered again what somebody already turned down.
  const dismissed = await CatalogueSuggestionModel.find({ status: 'dismissed' }).select('medicine field value').lean();
  const no = new Set(dismissed.map((d) => `${d.medicine}|${d.field}|${JSON.stringify(d.value)}`));
  const docs = out.filter((s) => !no.has(`${s.medicine}|${s.field}|${JSON.stringify(s.value)}`));

  await CatalogueSuggestionModel.deleteMany({ status: 'open' });
  for (let i = 0; i < docs.length; i += 2000) await CatalogueSuggestionModel.insertMany(docs.slice(i, i + 2000), { ordered: false });
  logger.info({ suggestions: docs.length }, 'Catalogue suggestions rebuilt');
  return { suggestions: docs.length, builtAt: new Date() };
}

/* ------------------------------------------------------------- overview -- */

const MISSING: Record<'price' | 'packSize' | 'group' | 'dar', Record<string, unknown>> = {
  price: { price: { $in: [null, 0] } },
  packSize: { packSize: { $in: ['', null] } },
  group: { group: null },
  dar: { dar: { $in: ['', null] } },
};

export async function gapsOverview() {
  const stockedIds = await ShopProductModel.distinct('medicine', { medicine: { $type: 'objectId' }, deletedAt: null });
  const [total, stocked, missing, open, lastBuilt, noWriteup] = await Promise.all([
    MedicineModel.countDocuments({ isActive: { $ne: false } }),
    Promise.resolve(stockedIds.length),
    Promise.all(
      Object.entries(MISSING).map(async ([k, q]) => [
        k,
        {
          all: await MedicineModel.countDocuments({ ...q, isActive: { $ne: false } }),
          stocked: await MedicineModel.countDocuments({ ...q, _id: { $in: stockedIds } }),
        },
      ]),
    ).then(Object.fromEntries),
    CatalogueSuggestionModel.aggregate<{ _id: { field: string; confidence: string; kind: string }; n: number }>([
      { $match: { status: 'open' } },
      { $group: { _id: { field: '$field', confidence: '$confidence', kind: '$kind' }, n: { $sum: 1 } } },
    ]),
    CatalogueSuggestionModel.findOne({ status: 'open' }).sort({ createdAt: -1 }).select('createdAt').lean(),
    MedicineGenericModel.countDocuments({ $or: [{ 'monograph.indications': { $in: ['', null] } }, { monograph: { $exists: false } }] }),
  ]);
  return {
    medicines: total,
    stocked,
    missing,
    open: open.map((o) => ({ ...o._id, n: o.n })),
    generics: { withoutWriteup: noWriteup },
    builtAt: lastBuilt?.createdAt ?? null,
    minShops: HIGH_SHOPS,
  };
}

/* ----------------------------------------------------------- suggestions -- */

export async function listSuggestions(q: { field?: string; confidence?: string; kind?: string; stockedOnly?: boolean; page?: number; limit?: number }) {
  const find: Record<string, unknown> = { status: 'open' };
  if (q.field && (GAP_FIELDS as readonly string[]).includes(q.field)) find.field = q.field;
  if (q.confidence === 'high' || q.confidence === 'low') find.confidence = q.confidence;
  if (q.kind === 'fill' || q.kind === 'update') find.kind = q.kind;
  if (q.stockedOnly) find.stocked = { $gt: 0 };
  const limit = Math.min(200, Math.max(1, q.limit ?? 50));
  const page = Math.max(1, q.page ?? 1);
  const [rows, total] = await Promise.all([
    CatalogueSuggestionModel.find(find)
      .sort({ stocked: -1, sold: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'medicine', select: 'brandName strength dosageForm genericName company price packSize', populate: { path: 'company', select: 'name' } })
      .lean(),
    CatalogueSuggestionModel.countDocuments(find),
  ]);
  return { rows, total, page, limit };
}

/** Accept or dismiss — by id, or every open one matching a filter. */
export async function decideSuggestions(
  input: { ids?: string[]; filter?: { field?: string; confidence?: string; kind?: string; stockedOnly?: boolean }; accept: boolean },
  by: string,
) {
  const find: Record<string, unknown> = { status: 'open' };
  if (input.ids?.length) find._id = { $in: input.ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) };
  else if (input.filter) {
    if (input.filter.field) find.field = input.filter.field;
    if (input.filter.confidence) find.confidence = input.filter.confidence;
    if (input.filter.kind) find.kind = input.filter.kind;
    if (input.filter.stockedOnly) find.stocked = { $gt: 0 };
  } else throw badRequest('Say which');

  const list = await CatalogueSuggestionModel.find(find).limit(5000).lean();
  if (!input.accept) {
    await CatalogueSuggestionModel.updateMany({ _id: { $in: list.map((s) => s._id) } }, { $set: { status: 'dismissed', decidedBy: by, decidedAt: new Date() } });
    return { dismissed: list.length, applied: 0, skipped: 0 };
  }

  const meds = new Map((await MedicineModel.find({ _id: { $in: list.map((s) => s.medicine) } }).select('price packSize group').lean()).map((m) => [String(m._id), m]));
  const ops: Parameters<typeof MedicineModel.bulkWrite>[0] = [];
  const done: Types.ObjectId[] = [];
  let skipped = 0;
  for (const s of list) {
    const m = meds.get(String(s.medicine)) as Record<string, unknown> | undefined;
    if (!m) {
      skipped++;
      continue;
    }
    const now = s.field === 'group' ? (m.group ? String(m.group) : null) : (m[s.field] ?? null);
    const was = s.field === 'packSize' ? (s.current ?? '') : s.current;
    // Somebody changed it since: their edit stands.
    const unchanged = s.field === 'packSize' ? (now ?? '') === was : s.kind === 'fill' ? !now : same(now, was);
    if (!unchanged) {
      skipped++;
      continue;
    }
    const value = s.field === 'group' ? new Types.ObjectId(String(s.value)) : s.value;
    ops.push({ updateOne: { filter: { _id: s.medicine }, update: { $set: { [s.field]: value } } } });
    done.push(s._id);
  }
  if (ops.length) await MedicineModel.bulkWrite(ops, { ordered: false });
  await CatalogueSuggestionModel.updateMany({ _id: { $in: done } }, { $set: { status: 'accepted', decidedBy: by, decidedAt: new Date() } });
  // What could not be applied is not left offering itself.
  const leftover = list.filter((s) => !done.some((d) => String(d) === String(s._id))).map((s) => s._id);
  if (leftover.length) await CatalogueSuggestionModel.updateMany({ _id: { $in: leftover } }, { $set: { status: 'dismissed', decidedBy: `${by} (catalogue had changed)`, decidedAt: new Date() } });
  return { applied: done.length, skipped, dismissed: 0 };
}

/* ------------------------------------------------- generics, unwritten -- */

/** Generics with no write-up, the ones with most brands (and most stocked) first. */
export async function genericsWithoutWriteup(q: { search?: string; page?: number; limit?: number }) {
  const find: Record<string, unknown> = { $or: [{ 'monograph.indications': { $in: ['', null] } }, { monograph: { $exists: false } }] };
  if (q.search?.trim()) find.name = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const ids = (await MedicineGenericModel.find(find).select('_id').lean()).map((g) => g._id);
  const stockedIds = await ShopProductModel.distinct('medicine', { medicine: { $type: 'objectId' }, deletedAt: null });
  const counts = await MedicineModel.aggregate<{ _id: Types.ObjectId; medicines: number; stocked: number }>([
    { $match: { generic: { $in: ids } } },
    { $group: { _id: '$generic', medicines: { $sum: 1 }, stocked: { $sum: { $cond: [{ $in: ['$_id', stockedIds] }, 1, 0] } } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  const names = await MedicineGenericModel.find({ _id: { $in: ids } }).select('name drugClass').lean();
  const rows = names
    .map((g) => ({ id: String(g._id), name: g.name, drugClass: g.drugClass ?? '', medicines: byId.get(String(g._id))?.medicines ?? 0, stocked: byId.get(String(g._id))?.stocked ?? 0 }))
    .sort((a, b) => b.stocked - a.stocked || b.medicines - a.medicines || a.name.localeCompare(b.name));
  const limit = Math.min(200, Math.max(1, q.limit ?? 50));
  const page = Math.max(1, q.page ?? 1);
  return { rows: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit };
}

export const MONOGRAPH_KEYS = [
  'indications',
  'dosage',
  'sideEffects',
  'contraindications',
  'interactions',
  'pregnancy',
  'precautions',
  'pediatric',
  'administration',
  'overdose',
  'storage',
  'reconstitution',
  'pharmacology',
  'therapeuticClass',
] as const;

export async function getGenericWriteup(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Generic');
  const g = await MedicineGenericModel.findById(id).select('name drugClass monograph monographSource').lean();
  if (!g) throw notFound('Generic');
  return { id: String(g._id), name: g.name, drugClass: g.drugClass ?? '', monograph: g.monograph ?? {}, source: g.monographSource?.name ?? '' };
}

/** Written or corrected by hand, from the console. */
export async function saveGenericWriteup(id: string, input: { drugClass?: string; monograph: Partial<Record<(typeof MONOGRAPH_KEYS)[number], string>> }, by: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Generic');
  const set: Record<string, unknown> = { 'monographSource.name': `Written in the console by ${by}` };
  if (input.drugClass !== undefined) set.drugClass = input.drugClass.trim();
  for (const k of MONOGRAPH_KEYS) {
    const v = input.monograph[k];
    if (v !== undefined) set[`monograph.${k}`] = v.replace(/\r\n/g, '\n').trim();
  }
  const g = await MedicineGenericModel.findByIdAndUpdate(id, { $set: set }, { new: true }).select('name').lean();
  if (!g) throw notFound('Generic');
  return { id, name: g.name };
}
