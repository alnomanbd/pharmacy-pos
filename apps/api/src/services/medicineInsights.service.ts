import { Types } from 'mongoose';
import { MedicineModel, MedicineCompanyModel } from '../models/index.js';
import { MedicineDemandDailyModel, MedicineCoverageModel, MedicineDemandRunModel } from './medicineDemand.service.js';
import { badRequest } from '../utils/AppError.js';
import { formatDayKey, todayKey } from '../utils/date.js';

/**
 * The medicine picture, read: which medicines sell, where, rising or falling,
 * by generic and by company — over any stretch against the one before it.
 *
 * Read only from the demand tables (medicineDemand.service), never from a
 * shop's own records, and never naming a shop. Each figure carries how many
 * different shops it is made from; under `MIN_SHOPS` it is marked not
 * shareable — shown to Dawai's own team, and held back from anything that
 * leaves (the data API, exports).
 */

export const MIN_SHOPS = Number(process.env.DEMAND_MIN_SHOPS || 5);
const DAY = 86_400_000;
const money = (n: number) => Math.round(n * 100) / 100;
const shift = (k: string, d: number) => formatDayKey(new Date(new Date(`${k}T00:00:00Z`).getTime() + d * DAY));

export function insightRange(opts: { from?: string; to?: string }) {
  const ok = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const to = ok(opts.to) ? opts.to! : formatDayKey(todayKey());
  const from = ok(opts.from) ? opts.from! : shift(to, -29);
  if (from > to) throw badRequest('That range runs backwards');
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY) + 1;
  if (days > 400) throw badRequest('Pick at most about a year');
  return { from, to, days, prevFrom: shift(from, -days), prevTo: shift(from, -1) };
}

const monthsOf = (from: string, to: string) => {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

type Filter = { district?: string; generic?: string };

function match(from: string, to: string, f: Filter) {
  const q: Record<string, unknown> = { day: { $gte: from, $lte: to } };
  if (f.district) q.district = f.district;
  if (f.generic && Types.ObjectId.isValid(f.generic)) q.generic = new Types.ObjectId(f.generic);
  return q;
}

/** How many different shops a medicine's figure in this range rests on — at least the most in any one month. */
async function coverage(medicines: Types.ObjectId[], months: string[], district?: string) {
  const rows = await MedicineCoverageModel.aggregate<{ _id: Types.ObjectId; shops: number }>([
    { $match: { medicine: { $in: medicines }, month: { $in: months }, district: district || '*' } },
    { $group: { _id: '$medicine', shops: { $max: '$shops' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.shops]));
}

export async function medicineInsights(opts: { from?: string; to?: string; district?: string; generic?: string }) {
  const r = insightRange(opts);
  const f: Filter = { district: opts.district?.trim() || undefined, generic: opts.generic?.trim() || undefined };
  const months = monthsOf(r.from, r.to);

  const byMedicine = (from: string, to: string) =>
    MedicineDemandDailyModel.aggregate<{ _id: Types.ObjectId; pieces: number; value: number; bills: number; generic: Types.ObjectId | null; genericName: string; company: Types.ObjectId | null }>([
      { $match: match(from, to, f) },
      { $group: { _id: '$medicine', pieces: { $sum: '$pieces' }, value: { $sum: '$value' }, bills: { $sum: '$bills' }, generic: { $first: '$generic' }, genericName: { $first: '$genericName' }, company: { $first: '$company' } } },
    ]);

  const [now, before, districts, weekly, runs] = await Promise.all([
    byMedicine(r.from, r.to),
    byMedicine(r.prevFrom, r.prevTo),
    MedicineDemandDailyModel.aggregate<{ _id: string; pieces: number; value: number; medicines: number }>([
      { $match: match(r.from, r.to, { generic: f.generic }) },
      { $group: { _id: '$district', pieces: { $sum: '$pieces' }, value: { $sum: '$value' }, medicines: { $addToSet: '$medicine' } } },
      { $project: { pieces: 1, value: 1, medicines: { $size: '$medicines' } } },
      { $sort: { pieces: -1 } },
    ]),
    MedicineDemandDailyModel.aggregate<{ _id: string; pieces: number; value: number }>([
      { $match: match(r.from, r.to, f) },
      { $group: { _id: '$day', pieces: { $sum: '$pieces' }, value: { $sum: '$value' } } },
      { $sort: { _id: 1 } },
    ]),
    MedicineDemandRunModel.aggregate<{ _id: null; matched: number; unmatched: number; last: Date; days: number; shops: number }>([
      { $match: { day: { $gte: r.from, $lte: r.to } } },
      { $group: { _id: null, matched: { $sum: '$matchedPieces' }, unmatched: { $sum: '$unmatchedPieces' }, last: { $max: '$builtAt' }, days: { $sum: 1 }, shops: { $max: '$shops' } } },
    ]),
  ]);

  const beforeOf = new Map(before.map((b) => [String(b._id), b]));
  const ids = [...new Set([...now, ...before].map((x) => String(x._id)))].map((id) => new Types.ObjectId(id));
  const [meds, cover] = await Promise.all([
    MedicineModel.find({ _id: { $in: ids } }).select('brandName strength dosageForm genericName company').populate('company', 'name').lean(),
    coverage(ids, months, f.district),
  ]);
  const medOf = new Map(meds.map((m) => [String(m._id), m]));

  const rows = now.map((x) => {
    const id = String(x._id);
    const m = medOf.get(id);
    const b = beforeOf.get(id);
    const shops = cover.get(id) ?? 0;
    return {
      id,
      brand: m?.brandName ?? 'A medicine',
      strength: m?.strength ?? '',
      form: m?.dosageForm ?? '',
      generic: x.genericName || m?.genericName || '',
      genericId: x.generic ? String(x.generic) : null,
      company: (m?.company as { name?: string } | null)?.name ?? '',
      companyId: x.company ? String(x.company) : null,
      pieces: x.pieces,
      piecesBefore: b?.pieces ?? 0,
      value: money(x.value),
      change: b && b.pieces > 0 ? Math.round(((x.pieces - b.pieces) / b.pieces) * 1000) / 10 : null,
      shops,
      shareable: shops >= MIN_SHOPS,
    };
  });

  const top = [...rows].sort((a, b) => b.pieces - a.pieces).slice(0, 25);
  const enough = (x: { pieces: number; piecesBefore: number }) => Math.max(x.pieces, x.piecesBefore) >= 10;
  const rising = rows.filter((x) => x.piecesBefore > 0 && x.pieces > x.piecesBefore && enough(x)).sort((a, b) => b.pieces - b.piecesBefore - (a.pieces - a.piecesBefore)).slice(0, 12);
  const falling = rows.filter((x) => x.piecesBefore > 0 && x.pieces < x.piecesBefore && enough(x)).sort((a, b) => a.pieces - a.piecesBefore - (b.pieces - b.piecesBefore)).slice(0, 12);

  /* By generic and by company: a group's figure rests on at least as many shops as its widest-sold medicine. */
  const group = (keyOf: (x: (typeof rows)[number]) => string | null, nameOf: (x: (typeof rows)[number]) => string) => {
    const m = new Map<string, { id: string; name: string; pieces: number; value: number; medicines: number; shops: number; before: number }>();
    for (const x of rows) {
      const k = keyOf(x);
      if (!k) continue;
      const e = m.get(k) ?? { id: k, name: nameOf(x), pieces: 0, value: 0, medicines: 0, shops: 0, before: 0 };
      e.pieces += x.pieces;
      e.value += x.value;
      e.before += x.piecesBefore;
      e.medicines += 1;
      e.shops = Math.max(e.shops, x.shops);
      m.set(k, e);
    }
    const total = [...m.values()].reduce((a, e) => a + e.pieces, 0) || 1;
    return [...m.values()]
      .map((e) => ({ ...e, value: money(e.value), share: Math.round((e.pieces / total) * 1000) / 10, change: e.before > 0 ? Math.round(((e.pieces - e.before) / e.before) * 1000) / 10 : null, shareable: e.shops >= MIN_SHOPS }))
      .sort((a, b) => b.pieces - a.pieces)
      .slice(0, 20);
  };
  const byGeneric = group((x) => x.genericId ?? (x.generic ? `name:${x.generic.toLowerCase()}` : null), (x) => x.generic);
  const companyNames = new Map(
    (await MedicineCompanyModel.find({ _id: { $in: rows.map((x) => x.companyId).filter(Boolean) as string[] } }).select('name').lean()).map((c) => [String(c._id), c.name]),
  );
  const byCompany = group((x) => x.companyId, (x) => companyNames.get(x.companyId ?? '') ?? x.company);

  /* Within one generic: each brand's share of it — who wins the paracetamol. */
  const brands = f.generic
    ? (() => {
        const total = rows.reduce((a, x) => a + x.pieces, 0) || 1;
        return [...rows]
          .sort((a, b) => b.pieces - a.pieces)
          .slice(0, 15)
          .map((x) => ({ id: x.id, brand: x.brand, strength: x.strength, company: x.company, pieces: x.pieces, share: Math.round((x.pieces / total) * 1000) / 10, shareable: x.shareable }));
      })()
    : [];

  const totalNow = rows.reduce((a, x) => ({ pieces: a.pieces + x.pieces, value: a.value + x.value }), { pieces: 0, value: 0 });
  const totalBefore = before.reduce((a, x) => ({ pieces: a.pieces + x.pieces, value: a.value + x.value }), { pieces: 0, value: 0 });
  const run = runs[0];

  return {
    range: r,
    filter: f,
    minShops: MIN_SHOPS,
    totals: {
      pieces: { now: totalNow.pieces, before: totalBefore.pieces },
      value: { now: money(totalNow.value), before: money(totalBefore.value) },
      medicines: { now: now.length, before: before.length },
      districts: districts.length,
    },
    series: weekly.map((w) => ({ dayKey: w._id, total: money(w.value), count: w.pieces })),
    top,
    rising,
    falling,
    byGeneric,
    byCompany,
    brands,
    districts: districts.map((d) => ({ district: d._id, pieces: d.pieces, value: money(d.value), medicines: d.medicines })),
    quality: {
      matchedPieces: run?.matched ?? 0,
      unmatchedPieces: run?.unmatched ?? 0,
      lastBuilt: run?.last ?? null,
      daysBuilt: run?.days ?? 0,
      shopsCounted: run?.shops ?? 0,
    },
  };
}

/** Generics and districts to filter by, from what has actually been counted. */
export async function insightFilters() {
  const [districts, generics] = await Promise.all([
    MedicineDemandDailyModel.distinct('district'),
    MedicineDemandDailyModel.aggregate<{ _id: Types.ObjectId; name: string; pieces: number }>([
      { $match: { generic: { $ne: null } } },
      { $group: { _id: '$generic', name: { $first: '$genericName' }, pieces: { $sum: '$pieces' } } },
      { $sort: { pieces: -1 } },
      { $limit: 300 },
    ]),
  ]);
  return { districts: (districts as string[]).sort(), generics: generics.map((g) => ({ id: String(g._id), name: g.name })) };
}
