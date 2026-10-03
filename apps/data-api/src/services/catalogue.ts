import { Company, Generic, Medicine, oid } from '../models.js';
import { HttpError } from '../lib/http.js';

/**
 * The medicine catalogue — every registered brand, its generic, strength,
 * form, maker and listed price. Public facts, gathered and kept tidy; no shop
 * data at all.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function searchMedicines(q: { q?: string; generic?: string; company?: string; form?: string; limit: number; offset: number }) {
  const find: Record<string, unknown> = { isActive: { $ne: false } };
  const text = q.q?.trim();
  if (text) {
    const re = new RegExp(`^${escape(text.toLowerCase())}`);
    find.$or = [{ brandKey: re }, { genericName: new RegExp(`^${escape(text)}`, 'i') }];
  }
  if (q.generic) find.generic = oid(q.generic) ?? null;
  if (q.company) find.company = oid(q.company) ?? null;
  if (q.form) find.dosageForm = new RegExp(`^${escape(q.form)}$`, 'i');
  const [rows, total] = await Promise.all([
    Medicine.find(find)
      .select('brandName genericName generic strength dosageForm packSize price company dar')
      .sort({ brandName: 1, strength: 1 })
      .skip(q.offset)
      .limit(q.limit)
      .lean(),
    Medicine.countDocuments(find),
  ]);
  const companies = await Company.find({ _id: { $in: rows.map((r) => r.company).filter(Boolean) } }).select('name').lean();
  const companyOf = new Map(companies.map((c) => [String(c._id), c.name ?? '']));
  return { total, rows: rows.map((m) => shape(m, companyOf)) };
}

export async function getMedicine(id: string) {
  const _id = oid(id);
  if (!_id) throw new HttpError(404, 'not_found', 'No such medicine');
  const m = await Medicine.findOne({ _id, isActive: { $ne: false } }).lean();
  if (!m) throw new HttpError(404, 'not_found', 'No such medicine');
  const company = m.company ? await Company.findById(m.company).select('name').lean() : null;
  return {
    ...shape(m, new Map(company ? [[String(company._id), company.name ?? '']] : [])),
    indications: m.indications ?? '',
    description: m.description ?? '',
    sideEffects: m.sideEffects ?? '',
  };
}

type Row = { _id: unknown; brandName?: string | null; genericName?: string | null; generic?: unknown; strength?: string | null; dosageForm?: string | null; packSize?: string | null; price?: number | null; company?: unknown; dar?: string | null };

function shape(m: Row, companyOf: Map<string, string>) {
  return {
    id: String(m._id),
    brand: m.brandName ?? '',
    generic: m.genericName ?? '',
    genericId: m.generic ? String(m.generic) : null,
    strength: m.strength ?? '',
    form: m.dosageForm ?? '',
    packSize: m.packSize ?? '',
    price: m.price ?? null,
    company: companyOf.get(String(m.company)) ?? '',
    companyId: m.company ? String(m.company) : null,
    dar: m.dar ?? '',
  };
}

export async function listNamed(kind: 'generics' | 'companies', q: { q?: string; limit: number; offset: number }) {
  const model = kind === 'generics' ? Generic : Company;
  const find: Record<string, unknown> = { isActive: { $ne: false } };
  if (q.q?.trim()) find.name = new RegExp(escape(q.q.trim()), 'i');
  const [rows, total] = await Promise.all([model.find(find).select('name').sort({ name: 1 }).skip(q.offset).limit(q.limit).lean(), model.countDocuments(find)]);
  return { total, rows: rows.map((r) => ({ id: String(r._id), name: r.name ?? '' })) };
}
