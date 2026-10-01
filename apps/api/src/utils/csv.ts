/**
 * CSV, for a file somebody opens in Excel.
 *
 * The catalogue's exporter has carried its own copy of these two rules since
 * the import was written; this is the same pair, general enough for the shop's
 * exports to share rather than copy a third time.
 *
 * - **A cell is quoted when it has to be.** A comma, a quote or a newline in a
 *   product name — and there are plenty, mostly brackets and commas — turns an
 *   unquoted file into a file with the columns shifted from that row down.
 * - **The file starts with a BOM.** Without it Excel opens UTF-8 as the system
 *   codepage, and every Bangla name in the file arrives as mojibake. It is one
 *   character and it is the difference between a file a shop can use and a file
 *   they email back asking what happened.
 */

const cell = (value: unknown) => {
  if (value == null) return '';
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface CsvColumn<T> {
  /** What the header row says — the accountant's words, not the model's. */
  header: string;
  value: (row: T) => unknown;
}

/** Tells Excel the file is UTF-8, so Bangla names open as Bangla. */
const BOM = String.fromCharCode(0xfeff);

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const head = `${BOM}${columns.map((c) => cell(c.header)).join(',')}\r\n`;
  const body = rows
    .map((row) => `${columns.map((c) => cell(c.value(row))).join(',')}\r\n`)
    .join('');
  return head + body;
}

/**
 * A filename with the range in it.
 *
 * Four exports land in one downloads folder over a month, and "export.csv (3)"
 * is a file nobody can identify a week later.
 */
export function csvFilename(what: string, from?: string, to?: string) {
  const stamp = from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10);
  return `${what}-${stamp}.csv`;
}
