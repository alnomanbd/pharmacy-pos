import { Schema, model, Types } from 'mongoose';
import { MedicineModel, OrganizationModel, SaleModel, ShopProductModel } from '../models/index.js';
import { formatDayKey, todayKey } from '../utils/date.js';
import { logger } from '../utils/logger.js';
import { canonicalDistrict, findDistrict } from '../utils/districts.js';

/**
 * How much of each medicine sells, and where — the medicine picture, counted
 * across every shop that has not switched itself out.
 *
 * Built every night from the bills into tables of their own, so nothing that
 * reads it — the console's Medicine insights, and later the data API — ever
 * touches a shop's own records, and it stays quick with thousands of shops:
 *
 * - **daily**: day × catalogue medicine × district → pieces, value, bills, and
 *   how many shops sold it that day. Generic and company are copied onto the
 *   row, so "by generic" and "by company" are one group-by.
 * - **monthly coverage**: month × medicine × district → how many *different*
 *   shops sold it — what the privacy rule reads: no figure is shown from fewer
 *   than five shops.
 *
 * Only items linked to the shared catalogue are counted (almost all are);
 * what is not is tallied as unmatched, a measure of the data's quality.
 * Rebuilding a day replaces it, so running it twice changes nothing — and the
 * last few days are rebuilt each night, because returns arrive after the sale.
 */

const dailySchema = new Schema(
  {
    day: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    generic: { type: Schema.Types.ObjectId, ref: 'MedicineGeneric', default: null, index: true },
    genericName: { type: String, default: '' },
    company: { type: Schema.Types.ObjectId, ref: 'MedicineCompany', default: null, index: true },
    district: { type: String, required: true, index: true },
    pieces: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
    bills: { type: Number, default: 0 },
    shops: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false },
);
dailySchema.index({ day: 1, medicine: 1, district: 1 }, { unique: true });
export const MedicineDemandDailyModel = model('MedicineDemandDaily', dailySchema);

const coverageSchema = new Schema(
  {
    month: { type: String, required: true, index: true },
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
    /** A district, or `*` for the whole country. */
    district: { type: String, required: true, index: true },
    shops: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false },
);
coverageSchema.index({ month: 1, medicine: 1, district: 1 }, { unique: true });
export const MedicineCoverageModel = model('MedicineCoverage', coverageSchema);

const runSchema = new Schema(
  {
    day: { type: String, required: true, unique: true },
    shops: { type: Number, default: 0 },
    rows: { type: Number, default: 0 },
    matchedPieces: { type: Number, default: 0 },
    unmatchedPieces: { type: Number, default: 0 },
    builtAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
export const MedicineDemandRunModel = model('MedicineDemandRun', runSchema);

/* ------------------------------------------------------------------ */

/**
 * The district a shop is counted in: the district it named, else its city if
 * that is a district's name — any spelling, either script, made the official
 * one. `Unknown` when neither names a district, so typos never become places.
 */
export function districtOf(address?: { district?: string | null; city?: string | null } | null) {
  return canonicalDistrict(address?.district) ?? canonicalDistrict(address?.city) ?? 'Unknown';
}

/** Shops that may be counted, with their district. Switched out: not counted from that day. */
async function countedShops() {
  const orgs = await OrganizationModel.find({ 'dataSharing.optedOut': { $ne: true } }).select('address').lean();
  return new Map(orgs.map((o) => [String(o._id), districtOf(o.address as { district?: string; city?: string })]));
}

/** What each shop sold of each product in a span of days, net of returns. */
async function soldByShopProduct(dayFrom: string, dayTo: string, shops: Types.ObjectId[]) {
  return SaleModel.aggregate<{ _id: { org: Types.ObjectId; product: Types.ObjectId }; pieces: number; value: number; bills: number }>([
    { $match: { dayKey: { $gte: dayFrom, $lte: dayTo }, organization: { $in: shops }, deletedAt: null, status: { $ne: 'void' } } },
    { $unwind: '$lines' },
    {
      $project: {
        org: '$organization',
        product: '$lines.product',
        sale: '$_id',
        pieces: { $subtract: ['$lines.qtyPieces', { $ifNull: ['$lines.returnedPieces', 0] }] },
        value: {
          $cond: [
            { $gt: ['$lines.qtyPieces', 0] },
            { $multiply: ['$lines.lineTotal', { $divide: [{ $subtract: ['$lines.qtyPieces', { $ifNull: ['$lines.returnedPieces', 0] }] }, '$lines.qtyPieces'] }] },
            0,
          ],
        },
      },
    },
    { $group: { _id: { org: '$org', product: '$product' }, pieces: { $sum: '$pieces' }, value: { $sum: '$value' }, bills: { $addToSet: '$sale' } } },
    { $project: { pieces: 1, value: 1, bills: { $size: '$bills' } } },
  ]);
}

async function catalogueOf(productIds: Types.ObjectId[]) {
  const products = await ShopProductModel.find({ _id: { $in: productIds } }).select('medicine').lean();
  const medOf = new Map(products.filter((p) => p.medicine).map((p) => [String(p._id), p.medicine as Types.ObjectId]));
  const meds = await MedicineModel.find({ _id: { $in: [...new Set([...medOf.values()].map(String))] } })
    .select('generic genericName company')
    .lean();
  const info = new Map(meds.map((m) => [String(m._id), { generic: (m.generic as Types.ObjectId) ?? null, genericName: m.genericName ?? '', company: (m.company as Types.ObjectId) ?? null }]));
  return { medOf, info };
}

/** Rebuilds one day. */
export async function rollupDay(day: string) {
  const shops = await countedShops();
  const shopIds = [...shops.keys()].map((id) => new Types.ObjectId(id));
  const rows = await soldByShopProduct(day, day, shopIds);
  const { medOf, info } = await catalogueOf([...new Set(rows.map((r) => String(r._id.product)))].map((id) => new Types.ObjectId(id)));

  const cells = new Map<string, { medicine: Types.ObjectId; district: string; pieces: number; value: number; bills: number; shops: Set<string> }>();
  let matched = 0;
  let unmatched = 0;
  const sellers = new Set<string>();
  for (const r of rows) {
    const pieces = Math.max(0, r.pieces);
    if (pieces <= 0) continue;
    const org = String(r._id.org);
    sellers.add(org);
    const med = medOf.get(String(r._id.product));
    if (!med) {
      unmatched += pieces;
      continue;
    }
    matched += pieces;
    const district = shops.get(org) ?? 'Unknown';
    const k = `${med}|${district}`;
    const c = cells.get(k) ?? { medicine: med, district, pieces: 0, value: 0, bills: 0, shops: new Set<string>() };
    c.pieces += pieces;
    c.value += r.value;
    c.bills += r.bills;
    c.shops.add(org);
    cells.set(k, c);
  }

  const docs = [...cells.values()].map((c) => {
    const i = info.get(String(c.medicine));
    return {
      day,
      month: day.slice(0, 7),
      medicine: c.medicine,
      generic: i?.generic ?? null,
      genericName: i?.genericName ?? '',
      company: i?.company ?? null,
      district: c.district,
      pieces: c.pieces,
      value: Math.round(c.value * 100) / 100,
      bills: c.bills,
      shops: c.shops.size,
    };
  });
  await MedicineDemandDailyModel.deleteMany({ day });
  if (docs.length) await MedicineDemandDailyModel.insertMany(docs, { ordered: false });
  await MedicineDemandRunModel.updateOne(
    { day },
    { $set: { shops: sellers.size, rows: docs.length, matchedPieces: matched, unmatchedPieces: unmatched, builtAt: new Date() } },
    { upsert: true },
  );
  return { day, rows: docs.length, shops: sellers.size, matched, unmatched };
}

/** Rebuilds a month's coverage: how many different shops sold each medicine, by district and in all. */
export async function rollupCoverage(month: string) {
  const shops = await countedShops();
  const shopIds = [...shops.keys()].map((id) => new Types.ObjectId(id));
  const rows = await soldByShopProduct(`${month}-01`, `${month}-31`, shopIds);
  const { medOf } = await catalogueOf([...new Set(rows.map((r) => String(r._id.product)))].map((id) => new Types.ObjectId(id)));
  const cells = new Map<string, { medicine: Types.ObjectId; district: string; shops: Set<string> }>();
  const add = (medicine: Types.ObjectId, district: string, org: string) => {
    const k = `${medicine}|${district}`;
    const c = cells.get(k) ?? { medicine, district, shops: new Set<string>() };
    c.shops.add(org);
    cells.set(k, c);
  };
  for (const r of rows) {
    if (r.pieces <= 0) continue;
    const med = medOf.get(String(r._id.product));
    if (!med) continue;
    const org = String(r._id.org);
    add(med, shops.get(org) ?? 'Unknown', org);
    add(med, '*', org);
  }
  await MedicineCoverageModel.deleteMany({ month });
  const docs = [...cells.values()].map((c) => ({ month, medicine: c.medicine, district: c.district, shops: c.shops.size }));
  if (docs.length) await MedicineCoverageModel.insertMany(docs, { ordered: false });
  return { month, rows: docs.length };
}

/**
 * Old spellings made the official one — "Bogra" to "Bogura", "চট্টগ্রাম" to
 * "Chattogram" — and the division filled in, on every shop whose district
 * names one. Text that names no
 * district is left as typed for someone to fix from the console. Run at start;
 * a shop already tidy is not touched.
 */
export async function tidyDistricts() {
  const orgs = await OrganizationModel.find({ 'address.district': { $nin: ['', null] } }).select('address.district address.division').lean();
  let fixed = 0;
  for (const o of orgs) {
    const was = o.address?.district ?? '';
    const now = findDistrict(was);
    if (now && (now.name !== was || o.address?.division !== now.division)) {
      await OrganizationModel.updateOne({ _id: o._id }, { $set: { 'address.district': now.name, 'address.division': now.division } });
      fixed++;
    }
  }
  if (fixed) logger.info({ fixed }, 'District spellings tidied');
  return fixed;
}

const shiftDay = (day: string, by: number) => formatDayKey(new Date(new Date(`${day}T00:00:00Z`).getTime() + by * 86_400_000));

/**
 * The nightly job: the last few days again (returns come in after the sale)
 * and their months' coverage. The first time it ever runs, it goes back
 * `firstRunDays` so the picture starts with history rather than a blank.
 */
export async function rollupRecent(opts: { days?: number; firstRunDays?: number } = {}) {
  const today = formatDayKey(todayKey());
  const first = (await MedicineDemandRunModel.countDocuments({})) === 0;
  const back = first ? opts.firstRunDays ?? 180 : opts.days ?? 3;
  const days = Array.from({ length: back }, (_, i) => shiftDay(today, -i)).reverse();
  let rows = 0;
  for (const d of days) rows += (await rollupDay(d)).rows;
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  for (const m of months) await rollupCoverage(m);
  logger.info({ days: days.length, rows, months: months.length }, 'Medicine demand rebuilt');
  return { days: days.length, rows, months: months.length };
}
