import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  toCsv,
  guessMapping,
  applyMapping,
  normaliseHeader,
  MEDICINE_COLUMNS,
} from './spreadsheet';

const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const BOM = String.fromCharCode(0xfeff);
const csv = (...lines: string[]) => lines.join(NL);

/**
 * The formulary is bulk-edited in Excel, which means every catalogue-wide change
 * passes through this file. A parser bug here does not throw — it shifts a
 * column, and a strength lands in the pack-size field of two thousand medicines.
 */
describe('parseCsv reads what Excel actually writes', () => {
  it('keeps a comma inside a quoted field', () => {
    const rows = parseCsv(csv('brand,generic', '"Saline, 0.9%",Sodium chloride'));
    expect(rows[1]).toEqual(['Saline, 0.9%', 'Sodium chloride']);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv(csv('a', '"He said ""hi"""'))[1]).toEqual(['He said "hi"']);
  });

  it('keeps a newline inside a quoted field', () => {
    const rows = parseCsv(csv('a,b', '"line one', 'line two",x'));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['line one' + NL + 'line two', 'x']);
  });

  it('strips the BOM and handles CRLF', () => {
    const rows = parseCsv(BOM + ['brandName,genericName', 'Napa,Paracetamol', ''].join(CRLF));
    expect(rows[0][0]).toBe('brandName');
    expect(rows[1]).toEqual(['Napa', 'Paracetamol']);
  });

  it('drops blank lines rather than importing empty rows', () => {
    expect(parseCsv(csv('a,b', '', '', 'x,y', ''))).toHaveLength(2);
  });
});

describe('toCsv writes what Excel can read back', () => {
  it('round-trips a value containing a comma, a quote and a newline', () => {
    const nasty = 'Saline, 0.9% "iso"' + NL + 'second line';
    const out = toCsv(MEDICINE_COLUMNS, [{ brandName: nasty, genericName: 'Sodium chloride' }]);
    const rows = parseCsv(out);
    expect(rows[0]).toEqual([...MEDICINE_COLUMNS]);
    expect(rows[1][MEDICINE_COLUMNS.indexOf('brandName')]).toBe(nasty);
  });

  it('leads with a BOM, so Excel does not mangle non-Latin text', () => {
    expect(toCsv(MEDICINE_COLUMNS, [{ brandName: 'Napa' }]).startsWith(BOM)).toBe(true);
  });
});

describe('normaliseHeader', () => {
  it('ignores case, spaces, underscores and hyphens', () => {
    const forms = ['Brand Name', 'brand_name', 'BRAND-NAME', ' brandname '];
    expect(new Set(forms.map(normaliseHeader)).size).toBe(1);
  });
});

describe('guessMapping', () => {
  it('matches our own export exactly', () => {
    const mapping = guessMapping([...MEDICINE_COLUMNS]);
    MEDICINE_COLUMNS.forEach((col, i) => expect(mapping[col]).toBe(i));
  });

  it('matches a file that uses other people’s names for the columns', () => {
    const mapping = guessMapping([
      'Brand',
      'Generic',
      'Manufacturer',
      'Therapeutic Class',
      'Dosage Form',
      'Strength',
      'Pack Size',
      'MRP',
    ]);
    expect(mapping.brandName).toBe(0);
    expect(mapping.genericName).toBe(1);
    expect(mapping.companyName).toBe(2);
    expect(mapping.groupName).toBe(3);
    expect(mapping.dosageForm).toBe(4);
    expect(mapping.strength).toBe(5);
    expect(mapping.packSize).toBe(6);
    expect(mapping.price).toBe(7);
  });

  it('reports -1 for a column the file does not have', () => {
    const mapping = guessMapping(['Brand', 'Generic']);
    expect(mapping.packSize).toBe(-1);
    expect(mapping.id).toBe(-1);
  });

  it('prefers the exact column name over an alias sitting earlier', () => {
    const mapping = guessMapping(['brand', 'brandName']);
    expect(mapping.brandName).toBe(1);
  });
});

describe('applyMapping', () => {
  it('numbers rows the way a spreadsheet does, so an error names the right line', () => {
    // `matrix` holds data rows only — the header is row 1, so the first data row
    // must report as line 2 or every failure in the import report points one row
    // up from the cell the admin has to fix.
    const mapping = guessMapping(['Brand', 'Generic']);
    const rows = applyMapping(
      [
        ['Napa', 'Paracetamol'],
        ['Ace', 'Paracetamol'],
      ],
      mapping,
    );
    expect(rows[0]._line).toBe(2);
    expect(rows[1]._line).toBe(3);
  });

  it('omits unmapped columns instead of sending empty strings for them', () => {
    // An empty string is a value: sending `packSize: ''` for a column the file
    // never had would blank the pack size of every medicine in the import.
    const rows = applyMapping([['Napa', 'Paracetamol']], guessMapping(['Brand', 'Generic']));
    expect(Object.keys(rows[0]).sort()).toEqual(['_line', 'brandName', 'genericName']);
  });

  it('trims cells and tolerates a short row', () => {
    const rows = applyMapping([['  Napa  ']], guessMapping(['Brand', 'Generic']));
    expect(rows[0].brandName).toBe('Napa');
    expect(rows[0].genericName).toBe('');
  });
});
