import { Types } from 'mongoose';
import { MedicineModel, ShopProductModel, StockBatchModel, StockLedgerModel, ShopCustomerModel } from '../models/index.js';
import { brandKeyOf } from '../models/Medicine.js';
import { badRequest } from '../utils/AppError.js';
import { bdMobile } from '../utils/phone.js';
import { createProduct, type Actor } from './shop.service.js';
import { createCustomer } from './till.service.js';
import { writeBranchOf } from './branchScope.service.js';

/**
 * Moving a shop in from its old software or its spreadsheet.
 *
 * A shop that has to type two thousand medicines and three hundred regulars
 * before it can sell does not move. This takes the list it already has —
 * from Excel, from a CSV the old software exported — and turns each row into
 * a product with its opening stock, or a customer with what they already owe.
 *
 * The screen reads the file and matches its columns; this checks every row
 * and either says what would happen (`dryRun`) or does it. Rows are taken one
 * at a time, so one bad row is reported and the rest still go in. Nothing is
 * ever overwritten: a product already on the list gets the new stock as
 * another lot, and a customer whose number is already on the book is left
 * as they are.
 */

/** Per request; the screen sends a bigger file in parts. */
export const MAX_ROWS = 1000;

const money = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Reading what a spreadsheet holds                                     */
/* ------------------------------------------------------------------ */

/** A number as people type it: "1,250", "৳ 30", "১২০". Blank is undefined; nonsense is NaN. */
export function numberOf(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v)
    .trim()
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/[,\s৳]|tk\.?|taka/gi, '');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const endOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0));
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * An expiry date in any of the ways a pack or a spreadsheet writes it.
 *
 * "06/2027" and "Jun 2027" are the end of that month, because that is what a
 * pack printed with only a month means. A day-first date is read day-first —
 * 03/04/2027 is the 3rd of April here, never March. An Excel date that
 * arrives as its serial number is converted. Undefined for blank; null for
 * something that is not a date.
 */
export function expiryOf(v: unknown): Date | null | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    /* An Excel serial: days since 1899-12-30. */
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return null;
  }
  const s = String(v).trim().toLowerCase();
  if (!s) return undefined;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/))) return valid(fullYear(+m[3]), +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{2}|\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? endOfMonth(fullYear(+m[2]), +m[1]) : null;
  if ((m = s.match(/^(\d{4})[/.\-](\d{1,2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? endOfMonth(+m[1], +m[2]) : null;
  if ((m = s.match(/^([a-z]{3})[a-z]*[\s\-/,.]*'?(\d{2}|\d{4})$/))) {
    const i = MONTHS.indexOf(m[1]);
    return i >= 0 ? endOfMonth(fullYear(+m[2]), i + 1) : null;
  }
  if ((m = s.match(/^(\d{1,2})[\s\-]([a-z]{3})[a-z]*[\s\-,]*(\d{2}|\d{4})$/))) {
    const i = MONTHS.indexOf(m[2]);
    return i >= 0 ? valid(fullYear(+m[3]), i + 1, +m[1]) : null;
  }
  return null;
}

function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

const text = (v: unknown, max = 160) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));

const yes = (v: unknown) => /^(y|yes|true|1|হ্যাঁ)$/i.test(text(v));

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export type ImportRow = Record<string, unknown>;

export interface RowResult {
  row: number;
  name: string;
  status: 'new' | 'existing' | 'skipped' | 'error';
  message?: string;
}

/** One stock row, read and checked — nothing written. */
export function readStockRow(r: ImportRow) {
  const errors: string[] = [];
  const name = text(r.name);
  if (!name) errors.push('No name');

  const num = (key: string, label: string) => {
    const n = numberOf(r[key]);
    if (n !== undefined && (Number.isNaN(n) || n < 0)) {
      errors.push(`${label} is not a number`);
      return undefined;
    }
    return n;
  };
  const piecesPerStrip = Math.max(1, Math.round(num('piecesPerStrip', 'Pieces per strip') ?? 1));
  const stripsPerBox = Math.max(1, Math.round(num('stripsPerBox', 'Strips per box') ?? 1));

  /* Prices may be given per piece or per strip, whichever the file has. */
  const mrpPiece = num('mrpPerPiece', 'MRP');
  const mrpStrip = num('mrpPerStrip', 'MRP per strip');
  const costPiece = num('costPerPiece', 'Cost');
  const costStrip = num('costPerStrip', 'Cost per strip');
  const mrpPerPiece = mrpPiece ?? (mrpStrip !== undefined ? mrpStrip / piecesPerStrip : 0);
  const costPerPiece = costPiece ?? (costStrip !== undefined ? costStrip / piecesPerStrip : 0);

  /* Quantity in pieces, or in strips and boxes, added together. */
  const pieces = num('qtyPieces', 'Quantity') ?? 0;
  const strips = num('qtyStrips', 'Strips') ?? 0;
  const boxes = num('qtyBoxes', 'Boxes') ?? 0;
  const qty = Math.round(pieces + strips * piecesPerStrip + boxes * stripsPerBox * piecesPerStrip);

  const expiry = expiryOf(r.expiry);
  if (expiry === null) errors.push(`"${text(r.expiry, 30)}" is not a date`);

  return {
    errors,
    name,
    strength: text(r.strength, 60),
    dosageForm: text(r.dosageForm, 60),
    genericName: text(r.genericName),
    companyName: text(r.companyName),
    barcode: text(r.barcode, 60),
    rackLabel: text(r.rack, 60),
    reorderLevel: Math.max(0, Math.round(num('reorderLevel', 'Reorder level') ?? 0)),
    isMedicine: r.isMedicine === undefined || text(r.isMedicine) === '' ? true : yes(r.isMedicine),
    piecesPerStrip,
    stripsPerBox,
    mrpPerPiece: money(mrpPerPiece),
    costPerPiece: money(costPerPiece),
    qty,
    batchNo: text(r.batchNo, 60),
    expiry: expiry ?? null,
  };
}

const keyOf = (name: string, strength: string) => `${name.toLowerCase().replace(/\s+/g, ' ')}|${strength.toLowerCase().replace(/\s+/g, '')}`;

export async function importStock(actor: Actor, rows: ImportRow[], opts: { dryRun?: boolean } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('The file has no rows');
  if (rows.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows at a time — split the file`);

  /* What is already on the list, by barcode and by name + strength. */
  const existing = await ShopProductModel.find({ organization: actor.org, deletedAt: null })
    .select('name strength barcode piecesPerStrip')
    .lean();
  const byKey = new Map(existing.map((p) => [keyOf(p.name, p.strength ?? ''), p._id as Types.ObjectId]));
  const byBarcode = new Map(existing.filter((p) => p.barcode).map((p) => [String(p.barcode), p._id as Types.ObjectId]));
  const branch = opts.dryRun ? null : await writeBranchOf(actor);

  const results: RowResult[] = [];
  const summary = { new: 0, existing: 0, errors: 0, lots: 0, pieces: 0, value: 0 };

  for (let i = 0; i < rows.length; i++) {
    const r = readStockRow(rows[i]);
    const label = [r.name, r.strength].filter(Boolean).join(' ');
    if (r.errors.length) {
      results.push({ row: i + 1, name: label, status: 'error', message: r.errors.join('; ') });
      summary.errors++;
      continue;
    }
    const key = keyOf(r.name, r.strength);
    let productId = (r.barcode && byBarcode.get(r.barcode)) || byKey.get(key) || null;
    const isNew = !productId;

    try {
      if (!opts.dryRun && !productId) {
        /* Linked to the catalogue when the brand and strength name exactly one medicine. */
        const candidates = await MedicineModel.find({ brandKey: brandKeyOf(r.name), isActive: { $ne: false } })
          .select('_id strength dosageForm')
          .limit(20)
          .lean();
        const same = candidates.filter(
          (m) =>
            (m.strength ?? '').toLowerCase().replace(/\s+/g, '') === r.strength.toLowerCase().replace(/\s+/g, '') &&
            (!r.dosageForm || (m.dosageForm ?? '').toLowerCase().startsWith(r.dosageForm.toLowerCase().slice(0, 3))),
        );
        const linked = r.strength && same.length === 1 ? String(same[0]._id) : undefined;
        const already = linked ? await ShopProductModel.findOne({ organization: actor.org, medicine: linked }).select('_id').lean() : null;
        if (already) {
          productId = already._id as Types.ObjectId;
        } else {
          const p = await createProduct(actor, {
            ...(linked ? { medicineId: linked } : {}),
            name: r.name,
            strength: r.strength,
            dosageForm: r.dosageForm,
            genericName: r.genericName,
            companyName: r.companyName,
            isMedicine: r.isMedicine,
            piecesPerStrip: r.piecesPerStrip,
            stripsPerBox: r.stripsPerBox,
            mrpPerPiece: r.mrpPerPiece,
            rackLabel: r.rackLabel,
            reorderLevel: r.reorderLevel,
            barcode: r.barcode && !byBarcode.has(r.barcode) ? r.barcode : undefined,
          });
          productId = p._id as Types.ObjectId;
        }
      }
      /* The same name twice in the file is one product with two lots. */
      if (productId) byKey.set(key, productId);
      else if (opts.dryRun) byKey.set(key, new Types.ObjectId());
      if (r.barcode && productId) byBarcode.set(r.barcode, productId);

      if (r.qty > 0) {
        if (!opts.dryRun) {
          const batch = await StockBatchModel.create({
            organization: actor.org,
            branch,
            product: productId,
            batchNo: r.batchNo,
            expiry: r.expiry,
            costPerPiece: r.costPerPiece,
            mrpPerPiece: r.mrpPerPiece,
            qtyOnHand: r.qty,
          });
          await StockLedgerModel.create({
            organization: actor.org,
            branch,
            product: productId,
            batch: batch._id,
            move: 'opening',
            qtyDelta: r.qty,
            balanceAfter: r.qty,
            costPerPiece: r.costPerPiece,
            reason: 'Opening stock, imported',
            actor: actor.id,
            actorName: actor.name,
          });
        }
        summary.lots++;
        summary.pieces += r.qty;
        summary.value += r.qty * r.costPerPiece;
      }
      if (isNew) summary.new++;
      else summary.existing++;
      results.push({ row: i + 1, name: label, status: isNew ? 'new' : 'existing' });
    } catch (err) {
      results.push({ row: i + 1, name: label, status: 'error', message: (err as Error).message });
      summary.errors++;
    }
  }
  summary.value = money(summary.value);
  return { dryRun: !!opts.dryRun, summary, rows: results };
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export function readCustomerRow(r: ImportRow) {
  const errors: string[] = [];
  const name = text(r.name, 120);
  if (!name) errors.push('No name');
  const typed = text(r.phone, 40);
  const phone = typed ? bdMobile(typed) : '';
  if (typed && !phone) errors.push(`"${typed}" is not a mobile number`);
  const owed = numberOf(r.openingBalance);
  if (owed !== undefined && Number.isNaN(owed)) errors.push('What they owe is not a number');
  const limit = numberOf(r.creditLimit);
  if (limit !== undefined && (Number.isNaN(limit) || limit < 0)) errors.push('Credit limit is not a number');
  return {
    errors,
    name,
    phone: phone ?? '',
    address: text(r.address, 240),
    note: text(r.note, 500),
    openingBalance: owed && owed > 0 ? money(owed) : 0,
    creditLimit: limit && limit > 0 ? money(limit) : 0,
  };
}

export async function importCustomers(actor: Actor, rows: ImportRow[], opts: { dryRun?: boolean } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw badRequest('The file has no rows');
  if (rows.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} rows at a time — split the file`);

  const onBook = new Set(
    (await ShopCustomerModel.find({ organization: actor.org, deletedAt: null, phone: { $ne: '' } }).select('phone').lean()).map((c) => c.phone),
  );
  const results: RowResult[] = [];
  const summary = { new: 0, existing: 0, errors: 0, owed: 0 };

  for (let i = 0; i < rows.length; i++) {
    const r = readCustomerRow(rows[i]);
    if (r.errors.length) {
      results.push({ row: i + 1, name: r.name, status: 'error', message: r.errors.join('; ') });
      summary.errors++;
      continue;
    }
    if (r.phone && onBook.has(r.phone)) {
      results.push({ row: i + 1, name: r.name, status: 'skipped', message: 'Already on the book' });
      summary.existing++;
      continue;
    }
    try {
      if (!opts.dryRun) await createCustomer(actor, r);
      if (r.phone) onBook.add(r.phone);
      summary.new++;
      summary.owed += r.openingBalance;
      results.push({ row: i + 1, name: r.name, status: 'new' });
    } catch (err) {
      results.push({ row: i + 1, name: r.name, status: 'error', message: (err as Error).message });
      summary.errors++;
    }
  }
  summary.owed = money(summary.owed);
  return { dryRun: !!opts.dryRun, summary, rows: results };
}
