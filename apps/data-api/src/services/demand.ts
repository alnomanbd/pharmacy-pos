import type { PipelineStage, Types } from 'mongoose';
import { Company, Coverage, DemandDaily, DemandRun, Generic, Medicine } from '../models.js';
import { monthsBetween, type MonthRange } from '../lib/months.js';
import { env } from '../env.js';

/**
 * The figures, and the rule they leave under.
 *
 * Everything this service says about sales is built from one kind of cell:
 * one medicine, in one district, in one month — and a cell is used only if at
 * least `minShops` different shops sold that medicine in that district that
 * month (the platform's coverage table). Cells under it are dropped before
 * anything is added up, never shown as a remainder. So:
 *
 * - a country total is the sum of the districts that pass, not a separate
 *   count, and cannot be subtracted from to find a district that did not;
 * - a range is whole months, so no two ranges differ by a day;
 * - a generic's or a company's figure is the sum of its medicines' cells that
 *   pass, and no more.
 *
 * Shops are never named, counted per figure, or otherwise told apart.
 */

export type Filter = { district?: string; generic?: Types.ObjectId; company?: Types.ObjectId; medicine?: Types.ObjectId };

const money = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

/** The stages that make cells and drop every cell under the rule. Callers add their own grouping after. */
export function cellStages(months: string[], f: Filter, minShops = env.minShops): PipelineStage[] {
  const match: Record<string, unknown> = { month: { $in: months } };
  if (f.district) match.district = f.district;
  if (f.generic) match.generic = f.generic;
  if (f.company) match.company = f.company;
  if (f.medicine) match.medicine = f.medicine;
  return [
    { $match: match },
    {
      $group: {
        _id: { month: '$month', medicine: '$medicine', district: '$district' },
        pieces: { $sum: '$pieces' },
        value: { $sum: '$value' },
        generic: { $first: '$generic' },
        company: { $first: '$company' },
      },
    },
    {
      $lookup: {
        from: Coverage.collection.collectionName,
        let: { m: '$_id.month', med: '$_id.medicine', d: '$_id.district' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$month', '$$m'] }, { $eq: ['$medicine', '$$med'] }, { $eq: ['$district', '$$d'] }] } } },
          { $project: { _id: 0, shops: 1 } },
        ],
        as: 'cover',
      },
    },
    { $match: { 'cover.0.shops': { $gte: minShops } } },
    { $project: { cover: 0 } },
  ];
}

async function sumBy<K extends string>(months: string[], f: Filter, key: Record<K, string>) {
  return DemandDaily.aggregate<{ _id: Record<K, unknown>; pieces: number; value: number; medicines?: number }>([
    ...cellStages(months, f),
    { $group: { _id: key, pieces: { $sum: '$pieces' }, value: { $sum: '$value' }, meds: { $addToSet: '$_id.medicine' } } },
    { $project: { pieces: 1, value: 1, medicines: { $size: '$meds' } } },
    { $sort: { pieces: -1 } },
  ]);
}

/* ------------------------------------------------------------ naming -- */

async function medicinesById(ids: unknown[]) {
  const meds = await Medicine.find({ _id: { $in: ids } }).select('brandName genericName generic strength dosageForm company').lean();
  const companies = await namesOf(Company, meds.map((m) => m.company));
  return new Map(
    meds.map((m) => [
      String(m._id),
      {
        id: String(m._id),
        brand: m.brandName ?? '',
        strength: m.strength ?? '',
        form: m.dosageForm ?? '',
        generic: m.genericName ?? '',
        genericId: m.generic ? String(m.generic) : null,
        company: companies.get(String(m.company)) ?? '',
        companyId: m.company ? String(m.company) : null,
      },
    ]),
  );
}

async function namesOf(model: typeof Company | typeof Generic, ids: unknown[]) {
  const rows = await model.find({ _id: { $in: ids.filter(Boolean) } }).select('name').lean();
  return new Map(rows.map((r) => [String(r._id), r.name ?? '']));
}

/* ----------------------------------------------------------- figures -- */

/** The most-bought medicines in a range. */
export async function topMedicines(r: MonthRange, f: Filter, page: { limit: number; offset: number }) {
  const rows = await sumBy(r.months, f, { medicine: '$_id.medicine' });
  const total = rows.reduce((a, x) => a + x.pieces, 0);
  const slice = rows.slice(page.offset, page.offset + page.limit);
  const names = await medicinesById(slice.map((x) => x._id.medicine));
  return {
    total: { pieces: total, value: money(rows.reduce((a, x) => a + x.value, 0)), medicines: rows.length },
    rows: slice.map((x, i) => ({
      rank: page.offset + i + 1,
      medicine: names.get(String(x._id.medicine)) ?? { id: String(x._id.medicine) },
      pieces: x.pieces,
      value: money(x.value),
      share: pct(x.pieces, total),
    })),
  };
}

/** One medicine: month by month, and (if allowed) by district. */
export async function medicineDetail(r: MonthRange, f: Filter, withDistricts: boolean) {
  const [series, districts, names] = await Promise.all([
    sumBy(r.months, f, { month: '$_id.month' }),
    withDistricts ? sumBy(r.months, { ...f, district: undefined }, { district: '$_id.district' }) : Promise.resolve([]),
    medicinesById([f.medicine]),
  ]);
  const byMonth = new Map(series.map((s) => [s._id.month as string, s]));
  const total = series.reduce((a, x) => a + x.pieces, 0);
  return {
    medicine: names.get(String(f.medicine)) ?? null,
    total: { pieces: total, value: money(series.reduce((a, x) => a + x.value, 0)) },
    /** A month missing here had too few shops to say, or no sales — the two are not told apart. */
    months: r.months.map((m) => {
      const s = byMonth.get(m);
      return { month: m, pieces: s?.pieces ?? null, value: s ? money(s.value) : null };
    }),
    districts: withDistricts ? districts.map((d) => ({ district: d._id.district as string, pieces: d.pieces, value: money(d.value), share: pct(d.pieces, total) })) : undefined,
  };
}

/** Each generic's share. */
export async function byGeneric(r: MonthRange, f: Filter, limit: number) {
  const rows = (await sumBy(r.months, f, { generic: '$generic' })).filter((x) => x._id.generic);
  const total = rows.reduce((a, x) => a + x.pieces, 0);
  const slice = rows.slice(0, limit);
  const names = await namesOf(Generic, slice.map((x) => x._id.generic));
  return {
    total: { pieces: total },
    rows: slice.map((x) => ({ generic: { id: String(x._id.generic), name: names.get(String(x._id.generic)) ?? '' }, pieces: x.pieces, value: money(x.value), medicines: x.medicines, share: pct(x.pieces, total) })),
  };
}

/** Each company's share. */
export async function byCompany(r: MonthRange, f: Filter, limit: number) {
  const rows = (await sumBy(r.months, f, { company: '$company' })).filter((x) => x._id.company);
  const total = rows.reduce((a, x) => a + x.pieces, 0);
  const slice = rows.slice(0, limit);
  const names = await namesOf(Company, slice.map((x) => x._id.company));
  return {
    total: { pieces: total },
    rows: slice.map((x) => ({ company: { id: String(x._id.company), name: names.get(String(x._id.company)) ?? '' }, pieces: x.pieces, value: money(x.value), medicines: x.medicines, share: pct(x.pieces, total) })),
  };
}

/** Within one generic, each brand's share — who sells the paracetamol. */
export async function brandsOfGeneric(r: MonthRange, f: Filter, limit: number) {
  const [top, name] = await Promise.all([topMedicines(r, f, { limit, offset: 0 }), namesOf(Generic, [f.generic])]);
  return { generic: { id: String(f.generic), name: name.get(String(f.generic)) ?? '' }, total: top.total, rows: top.rows };
}

/** Each district's share. */
export async function byDistrict(r: MonthRange, f: Filter) {
  const rows = await sumBy(r.months, { ...f, district: undefined }, { district: '$_id.district' });
  const total = rows.reduce((a, x) => a + x.pieces, 0);
  return {
    total: { pieces: total },
    rows: rows.map((x) => ({ district: x._id.district as string, pieces: x.pieces, value: money(x.value), medicines: x.medicines, share: pct(x.pieces, total) })),
  };
}

/** Rising and falling: this range against the same length before it, both under the rule. */
export async function trends(r: MonthRange, f: Filter, limit: number) {
  const prevMonths = monthsBetween(r.prevFrom, r.prevTo);
  const [now, before] = await Promise.all([
    sumBy(r.months, f, { medicine: '$_id.medicine' }),
    sumBy(prevMonths, f, { medicine: '$_id.medicine' }),
  ]);
  const was = new Map(before.map((b) => [String(b._id.medicine), b.pieces]));
  const moved = now
    .map((x) => ({ id: String(x._id.medicine), pieces: x.pieces, before: was.get(String(x._id.medicine)) ?? 0 }))
    .filter((x) => x.before > 0 && Math.max(x.pieces, x.before) >= 20);
  const rising = moved.filter((x) => x.pieces > x.before).sort((a, b) => b.pieces - b.before - (a.pieces - a.before)).slice(0, limit);
  const falling = moved.filter((x) => x.pieces < x.before).sort((a, b) => a.pieces - a.before - (b.pieces - b.before)).slice(0, limit);
  const names = await medicinesById([...rising, ...falling].map((x) => x.id));
  const shape = (x: (typeof moved)[number]) => ({ medicine: names.get(x.id) ?? { id: x.id }, pieces: x.pieces, piecesBefore: x.before, change: change(x.pieces, x.before) });
  return { previous: { from: r.prevFrom, to: r.prevTo }, rising: rising.map(shape), falling: falling.map(shape) };
}

/** When the figures were last rebuilt. */
export async function lastBuilt() {
  const run = await DemandRun.findOne().sort({ builtAt: -1 }).select('builtAt day').lean();
  return run?.builtAt ?? null;
}

