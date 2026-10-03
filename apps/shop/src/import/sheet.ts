/**
 * Reading the shop's own spreadsheet in the browser.
 *
 * A CSV from the old software or an Excel file somebody has kept for years:
 * read into rows, the header row found, and each of its columns matched to
 * what Dawai needs by the names people actually give them — "MRP", "Exp",
 * "Qty", "বাকি". The person checks the guesses before anything is sent.
 */

export type Cell = string | number | boolean | Date | null;
export type Kind = 'stock' | 'customers';

export interface Field {
  key: string;
  label: string;
  required?: boolean;
  /** Header names this field goes by, lower case. */
  names: string[];
  example: string;
}

export const FIELDS: Record<Kind, Field[]> = {
  stock: [
    { key: 'name', label: 'Name', required: true, names: ['name', 'brand', 'brand name', 'product', 'product name', 'item', 'item name', 'medicine', 'medicine name', 'description', 'ওষুধ', 'ওষুধের নাম', 'নাম', 'পণ্য'], example: 'Napa' },
    { key: 'strength', label: 'Strength', names: ['strength', 'power', 'dose', 'mg', 'শক্তি'], example: '500 mg' },
    { key: 'dosageForm', label: 'Form', names: ['form', 'dosage form', 'dosage', 'type', 'ধরন'], example: 'Tablet' },
    { key: 'genericName', label: 'Generic', names: ['generic', 'generic name', 'জেনেরিক'], example: 'Paracetamol' },
    { key: 'companyName', label: 'Company', names: ['company', 'manufacturer', 'mfr', 'mfg', 'brand owner', 'কোম্পানি'], example: 'Beximco' },
    { key: 'piecesPerStrip', label: 'Pieces per strip', names: ['pieces per strip', 'pcs per strip', 'pcs/strip', 'per strip', 'strip size', 'unit per strip', 'pack size'], example: '10' },
    { key: 'stripsPerBox', label: 'Strips per box', names: ['strips per box', 'strip per box', 'strip/box', 'per box', 'box size'], example: '20' },
    { key: 'mrpPerStrip', label: 'MRP per strip', names: ['mrp per strip', 'strip mrp', 'strip price', 'price per strip'], example: '' },
    { key: 'mrpPerPiece', label: 'MRP per piece', names: ['mrp', 'mrp per piece', 'unit mrp', 'price', 'unit price', 'sale price', 'selling price', 'retail price', 'মূল্য', 'দাম', 'বিক্রয়মূল্য'], example: '1.20' },
    { key: 'costPerStrip', label: 'Cost per strip', names: ['cost per strip', 'strip cost', 'tp per strip'], example: '' },
    { key: 'costPerPiece', label: 'Cost per piece', names: ['cost', 'cost per piece', 'unit cost', 'purchase price', 'buy price', 'cost price', 'tp', 'trade price', 'ক্রয়মূল্য'], example: '0.90' },
    { key: 'qtyBoxes', label: 'Boxes in stock', names: ['boxes', 'box', 'box qty', 'qty box'], example: '' },
    { key: 'qtyStrips', label: 'Strips in stock', names: ['strips', 'strip', 'strip qty', 'qty strip'], example: '' },
    { key: 'qtyPieces', label: 'Pieces in stock', names: ['qty', 'quantity', 'stock', 'pieces', 'pcs', 'on hand', 'in stock', 'balance', 'closing stock', 'পরিমাণ', 'স্টক'], example: '200' },
    { key: 'batchNo', label: 'Batch', names: ['batch', 'batch no', 'batch number', 'lot', 'lot no', 'ব্যাচ'], example: 'B2401' },
    { key: 'expiry', label: 'Expiry', names: ['expiry', 'exp', 'expiry date', 'exp date', 'expire', 'expires', 'মেয়াদ', 'মেয়াদোত্তীর্ণ'], example: '06/2027' },
    { key: 'barcode', label: 'Barcode', names: ['barcode', 'bar code', 'ean', 'upc'], example: '' },
    { key: 'rack', label: 'Rack', names: ['rack', 'shelf', 'location', 'র‍্যাক', 'তাক'], example: 'R1' },
    { key: 'reorderLevel', label: 'Reorder level', names: ['reorder', 'reorder level', 'min stock', 'minimum stock', 'alert qty'], example: '' },
  ],
  customers: [
    { key: 'name', label: 'Name', required: true, names: ['name', 'customer', 'customer name', 'নাম', 'কাস্টমার'], example: 'Kabir Bhai' },
    { key: 'phone', label: 'Phone', names: ['phone', 'mobile', 'cell', 'contact', 'phone number', 'mobile no', 'ফোন', 'মোবাইল'], example: '01711000000' },
    { key: 'address', label: 'Address', names: ['address', 'area', 'ঠিকানা'], example: 'Mirpur 10' },
    { key: 'openingBalance', label: 'Owes now (৳)', names: ['due', 'balance', 'owed', 'owes', 'baki', 'opening balance', 'outstanding', 'বাকি'], example: '450' },
    { key: 'creditLimit', label: 'Credit limit (৳)', names: ['limit', 'credit limit', 'max due'], example: '' },
    { key: 'note', label: 'Note', names: ['note', 'notes', 'remark', 'remarks', 'মন্তব্য'], example: '' },
  ],
};

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

/** RFC 4180, give or take: quoted fields, doubled quotes, and whichever of , ; or tab the file uses. */
export function parseCsv(input: string): string[][] {
  const textIn = input.replace(/^\uFEFF/, '');
  const nl = textIn.indexOf('\n');
  const firstLine = nl < 0 ? textIn : textIn.slice(0, nl);
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn[i];
    if (quoted) {
      if (c === '"') {
        if (textIn[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && textIn[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

export async function readFile(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    const data = (await readSheet(file)) as Cell[][];
    return data.filter((r) => r.some((v) => v !== null && String(v).trim() !== ''));
  }
  if (name.endsWith('.xls')) throw new Error('old-excel');
  return parseCsv(await file.text());
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[_.\-/()#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The best guess at which column is which: exact names first across every
 * field, then a column whose header contains a name — and no column used
 * twice, so "MRP per strip" is not also taken as the piece price.
 */
export function guessMapping(kind: Kind, headers: Cell[]): Record<string, number> {
  const h = headers.map(norm);
  const used = new Set<number>();
  const map: Record<string, number> = {};
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of FIELDS[kind]) {
      if (map[f.key] !== undefined) continue;
      for (const n of [f.label, ...f.names].map(norm)) {
        const i = h.findIndex((x, idx) => !used.has(idx) && (pass === 'exact' ? x === n : n.length > 2 && x.includes(n)));
        if (i >= 0) {
          map[f.key] = i;
          used.add(i);
          break;
        }
      }
    }
  }
  return map;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The rows as the server takes them: one object per row, keyed by field. */
export function rowsFor(data: Cell[][], mapping: Record<string, number>): Record<string, unknown>[] {
  return data.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [key, i] of Object.entries(mapping)) {
      if (i < 0) continue;
      const v = r[i];
      if (v === null || v === undefined || v === '') continue;
      o[key] = v instanceof Date ? isoDay(v) : v;
    }
    return o;
  });
}

/** A file to fill in, with the columns in the order the screen lists them. */
export function templateCsv(kind: Kind) {
  const f = FIELDS[kind];
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '\uFEFF' + [f.map((x) => q(x.label)).join(','), f.map((x) => q(x.example)).join(',')].join('\r\n') + '\r\n';
}
