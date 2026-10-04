/**
 * Reading and writing the spreadsheets the formulary is bulk-edited in.
 *
 * CSV is parsed here, in a few dozen lines, because it is the format the app
 * itself exports and therefore the one that must always work — including on a
 * console machine with no internet.
 *
 * `.xlsx` is a zip of XML and needs a real library: `read-excel-file`, the
 * same one the shop app reads stock lists with. (SheetJS from npm still carries
 * a prototype-pollution advisory.) Old `.xls` files are refused with a way
 * forward rather than read badly.
 */

/** The columns the API round-trips. Kept in step with the server's list. */
export const MEDICINE_COLUMNS = [
  'id',
  'brandName',
  'genericName',
  'companyName',
  'groupName',
  'dosageForm',
  'strength',
  'packSize',
  'price',
  'description',
  'indications',
  'sideEffects',
  'status',
  // Last, as on the server, so a file exported before it existed still lines up.
  'dar',
] as const;

export type MedicineColumn = (typeof MEDICINE_COLUMNS)[number];
export type SheetRow = Record<string, string> & { _line?: number };

/** Header comparison ignores case, spaces, underscores and hyphens. */
export const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_-]/g, '');

/**
 * Parses CSV text into a matrix.
 *
 * Handles what Excel actually writes: a UTF-8 BOM, CRLF line endings, quoted
 * fields containing commas or newlines, and `""` for a literal quote.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Serialises rows for download — BOM first, so Excel reads UTF-8. */
export function toCsv(columns: readonly string[], rows: Record<string, unknown>[]) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Reads the first sheet of an .xlsx file into a matrix of strings. The reader
 * is loaded only when someone picks an Excel file, so it never lands on
 * anyone just opening the page.
 */
async function parseWorkbook(file: File): Promise<string[][]> {
  if (/\.xls$/i.test(file.name)) {
    throw new Error('That is an old Excel file (.xls). Open it in Excel and save it as .xlsx or CSV (UTF-8), then try again.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  const rows = (await readSheet(file)) as unknown[][];
  return rows
    .map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))))
    .filter((r) => r.some((c) => c.trim() !== ''));
}

export interface ParsedSheet {
  /** The file's own header row, as written. */
  headers: string[];
  /** Data rows, aligned to `headers`. */
  matrix: string[][];
}

/** Reads a picked file — CSV or Excel — into a header row plus data rows. */
export async function readSpreadsheet(file: File): Promise<ParsedSheet> {
  const isExcel = /\.xlsx?$/i.test(file.name);
  const matrix = isExcel ? await parseWorkbook(file) : parseCsv(await file.text());

  if (matrix.length === 0) throw new Error('That file has no rows.');
  const [headers, ...body] = matrix;
  return { headers: headers.map((h) => h.trim()), matrix: body };
}

/**
 * Guesses which of the file's columns is which of ours.
 *
 * An export of ours matches exactly; a list from elsewhere usually matches on
 * one of the aliases; anything left the admin maps by hand in the import dialog.
 */
const ALIASES: Partial<Record<MedicineColumn, string[]>> = {
  brandName: ['brand', 'brandname', 'medicine', 'medicinename', 'tradename', 'name', 'product'],
  genericName: ['generic', 'genericname', 'molecule', 'composition', 'activeingredient'],
  companyName: ['company', 'companyname', 'manufacturer', 'pharmaceutical', 'pharmaceuticals'],
  groupName: ['group', 'groupname', 'drugclass', 'class', 'category', 'therapeuticclass'],
  dosageForm: ['dosageform', 'form', 'type'],
  strength: ['strength', 'mg', 'dose', 'power'],
  packSize: ['packsize', 'pack', 'packaging'],
  price: ['price', 'mrp', 'unitprice', 'rate'],
  description: ['description', 'details', 'about'],
  indications: ['indications', 'indication', 'uses'],
  sideEffects: ['sideeffects', 'sideeffect', 'adversereaction', 'adverseeffects'],
  status: ['status', 'active', 'isactive'],
  dar: ['dar', 'darno', 'registration', 'registrationno', 'registrationnumber', 'regno'],
};

export function guessMapping(headers: string[]): Record<MedicineColumn, number> {
  const mapping = {} as Record<MedicineColumn, number>;
  const normalised = headers.map(normaliseHeader);

  for (const col of MEDICINE_COLUMNS) {
    let at = normalised.indexOf(normaliseHeader(col));
    if (at < 0) {
      at = normalised.findIndex((h) => (ALIASES[col] ?? []).includes(h));
    }
    mapping[col] = at;
  }
  return mapping;
}

/** Applies a mapping, producing the row objects the import endpoint takes. */
export function applyMapping(
  matrix: string[][],
  mapping: Record<MedicineColumn, number>,
): SheetRow[] {
  return matrix.map((cells, n) => {
    const row: SheetRow = { _line: n + 2 } as SheetRow;
    for (const col of MEDICINE_COLUMNS) {
      const at = mapping[col];
      if (at >= 0) row[col] = String(cells[at] ?? '').trim();
    }
    return row;
  });
}
