import { readFile } from 'node:fs/promises';
import { MedicineCompanyModel, MedicineModel } from '../models/index.js';
import { parseCsv } from '../services/formularyImport.service.js';
import {
  brandKey,
  canonicalBrand,
  canonicalCompany,
  canonicalDosageForm,
  canonicalStrength,
  companyKey,
  dosageFamily,
  strengthKey,
  stripRedundantStrength,
} from '../services/catalogNormalize.js';

/**
 * A second, looser look in the DGDA registry for medicines that have no
 * registration number (DAR) yet.
 *
 * The catalogue build matched on brand with generic or company and strength.
 * Here a medicine without a DAR is matched on brand, company and dosage form
 * family — and, where strengths are given on both sides, strength too — and
 * takes the DAR only when exactly one registered product fits. Two candidates
 * is a guess, and a wrong registration number is worse than none.
 *
 * Only ever fills an empty DAR; never changes one.
 *
 *   npm run catalog:dar -- --dgda=/path/Allopathic_Drug_Database.csv [--dry-run]
 */
export async function backfillDar(opts: { dgda: string; dryRun?: boolean; onProgress?: (m: string) => void }) {
  const [header, ...body] = parseCsv(await readFile(opts.dgda, 'utf8'));
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const at = { company: col('Name of the Manufacturer'), brand: col('Brand Name'), strength: col('Strength'), form: col('Dosages Description'), use: col('Use For'), dar: col('DAR') };

  type Reg = { dar: string; s: string; family: string };
  const byBrandCompany = new Map<string, Reg[]>();
  for (const r of body) {
    if (at.use >= 0 && (r[at.use] ?? '').trim().toLowerCase() === 'veterinary') continue;
    const dar = (r[at.dar] ?? '').trim();
    if (!dar) continue;
    const strength = canonicalStrength(r[at.strength] ?? '');
    const brand = canonicalBrand(stripRedundantStrength(r[at.brand] ?? '', strength));
    const company = canonicalCompany(r[at.company] ?? '');
    if (!brand || !company) continue;
    const k = `${brandKey(brand)}|${companyKey(company)}`;
    const list = byBrandCompany.get(k) ?? [];
    list.push({ dar, s: strengthKey(strength), family: dosageFamily(canonicalDosageForm(r[at.form] ?? '')) });
    byBrandCompany.set(k, list);
  }

  const companies = new Map((await MedicineCompanyModel.find().select('name').lean()).map((c) => [String(c._id), c.name]));
  const missing = await MedicineModel.find({ $or: [{ dar: '' }, { dar: null }, { dar: { $exists: false } }] })
    .select('brandName strength dosageForm company')
    .lean();

  let found = 0;
  let ambiguous = 0;
  const ops: Parameters<typeof MedicineModel.bulkWrite>[0] = [];
  for (const m of missing) {
    const company = companies.get(String(m.company)) ?? '';
    const candidates = byBrandCompany.get(`${brandKey(m.brandName)}|${companyKey(company)}`);
    if (!candidates) continue;
    const family = dosageFamily(m.dosageForm ?? '');
    const s = strengthKey(m.strength ?? '');
    let fit = candidates.filter((c) => !family || !c.family || c.family === family);
    if (s) fit = fit.filter((c) => !c.s || c.s === s);
    const dars = [...new Set(fit.map((c) => c.dar))];
    if (dars.length === 1) {
      found++;
      ops.push({ updateOne: { filter: { _id: m._id, $or: [{ dar: '' }, { dar: null }, { dar: { $exists: false } }] }, update: { $set: { dar: dars[0] } } } });
    } else if (dars.length > 1) ambiguous++;
  }
  if (!opts.dryRun) {
    for (let i = 0; i < ops.length; i += 1000) {
      await MedicineModel.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
      opts.onProgress?.(`DAR: ${Math.min(i + 1000, ops.length)} / ${ops.length}`);
    }
  }
  return { withoutDar: missing.length, found, ambiguousLeftAlone: ambiguous, stillWithout: missing.length - found };
}
