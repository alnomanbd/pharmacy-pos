import { describe, it, expect } from 'vitest';
import { buildCsv, csvFilename, type CsvColumn } from '../src/utils/csv.js';

interface Row {
  name: string;
  total: number;
  when: Date | null;
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: 'Item', value: (r) => r.name },
  { header: 'Total', value: (r) => r.total },
  { header: 'Expiry', value: (r) => r.when },
];

/**
 * Two rules, and both of them are the difference between a usable file and one
 * the accountant emails back.
 */
describe('the spreadsheet a shop hands over', () => {
  it('starts with the BOM Excel needs to read Bangla', () => {
    const csv = buildCsv(COLUMNS, []);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Item,Total,Expiry');
  });

  it('quotes a name with a comma in it, instead of shifting every column after it', () => {
    const csv = buildCsv(COLUMNS, [{ name: 'Napa Extra, 500mg', total: 12, when: null }]);
    expect(csv).toContain('"Napa Extra, 500mg",12,');
  });

  it('doubles a quote inside a cell, the way a spreadsheet reads it back', () => {
    const csv = buildCsv(COLUMNS, [{ name: 'Say "ah"', total: 1, when: null }]);
    expect(csv).toContain('"Say ""ah""",1,');
  });

  it('writes a date as a calendar day, not as an instant nobody can sort', () => {
    const csv = buildCsv(COLUMNS, [
      { name: 'Seclo', total: 3, when: new Date('2027-04-30T00:00:00.000Z') },
    ]);
    expect(csv).toContain('Seclo,3,2027-04-30');
  });

  it('leaves an empty cell empty rather than writing null into it', () => {
    const csv = buildCsv(COLUMNS, [{ name: 'Monas', total: 0, when: null }]);
    expect(csv.trimEnd().endsWith('Monas,0,')).toBe(true);
  });

  it('names the file after what is in it, and the range when there is one', () => {
    expect(csvFilename('bills', '2026-09-01', '2026-09-30')).toBe(
      'bills-2026-09-01_2026-09-30.csv',
    );
    expect(csvFilename('stock')).toMatch(/^stock-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
