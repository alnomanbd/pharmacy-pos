/**
 * Reading and writing the spreadsheets the formulary is bulk-edited in.
 *
 * CSV is parsed here, in a few dozen lines, because it is the format the app
 * itself exports and therefore the one that must always work — including on a
 * console machine with no internet.
 *
 * `.xlsx` is a zip of XML and needs a real library. SheetJS is **vendored** at
 * `/vendor/xlsx.full.min.js` (the patched 0.20.x build from cdn.sheetjs.com)
 * rather than installed from npm, where the published `xlsx@0.18.5` still
 * carries the prototype-pollution advisory, and rather than hot-linked, which
 * would break on an intranet. It is fetched only when someone actually picks an
 * .xlsx file, so the 900 KB never lands on anyone opening the page.
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

interface SheetJs {
  read(data: ArrayBuffer, opts: { type: 'array' }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json(sheet: unknown, opts: { header: 1; raw: false; defval: string }): string[][];
  };
}

let sheetJsPromise: Promise<SheetJs> | null = null;

/** Loads the vendored SheetJS once, on first use. */
function loadSheetJs(): Promise<SheetJs> {
  const existing = (window as unknown as { XLSX?: SheetJs }).XLSX;
  if (existing) return Promise.resolve(existing);

  if (!sheetJsPromise) {
    sheetJsPromise = new Promise<SheetJs>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/xlsx.full.min.js';
      script.onload = () => {
        const lib = (window as unknown as { XLSX?: SheetJs }).XLSX;
        if (lib) resolve(lib);
        else reject(new Error('Spreadsheet reader loaded but did not register.'));
      };
      script.onerror = () => {
        sheetJsPromise = null;
        reject(
          new Error(
            'Could not load the Excel reader. Save the file as CSV (UTF-8) in Excel and try again.',
          ),
        );
      };
      document.head.appendChild(script);
    });
  }
  return sheetJsPromise;
}

/** Reads the first sheet of an .xlsx/.xls file into a matrix of strings. */
async function parseWorkbook(file: File): Promise<string[][]> {
  const XLSX = await loadSheetJs();
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const first = book.SheetNames[0];
  if (!first) throw new Error('That workbook has no sheets.');
  return XLSX.utils
    .sheet_to_json(book.Sheets[first], { header: 1, raw: false, defval: '' })
    .filter((r) => r.some((c) => String(c).trim() !== ''));
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
