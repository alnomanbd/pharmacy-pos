import { describe, it, expect } from 'vitest';
import { parseCsv, guessMapping, rowsFor, templateCsv, FIELDS } from './sheet';

describe('reading a CSV', () => {
  it('handles quotes, doubled quotes, CRLF and a byte-order mark', () => {
    const rows = parseCsv('\uFEFFName,Note\r\n"Napa, Extra","He said ""fast"""\r\n\r\nSeclo,\n');
    expect(rows).toEqual([
      ['Name', 'Note'],
      ['Napa, Extra', 'He said "fast"'],
      ['Seclo', ''],
    ]);
  });

  it('works out the separator the file uses', () => {
    expect(parseCsv('a;b;c\n1;2;3')[1]).toEqual(['1', '2', '3']);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });
});

describe('matching columns', () => {
  it('matches the names an old system gives them, each column once', () => {
    const m = guessMapping('stock', ['Item Name', 'MRP per strip', 'MRP', 'Exp. Date', 'Qty', 'Batch No', 'Company']);
    expect(m).toMatchObject({ name: 0, mrpPerStrip: 1, mrpPerPiece: 2, expiry: 3, qtyPieces: 4, batchNo: 5, companyName: 6 });
  });

  it('reads Bangla headers', () => {
    expect(guessMapping('customers', ['নাম', 'মোবাইল', 'বাকি'])).toEqual({ name: 0, phone: 1, openingBalance: 2 });
  });

  it('reads back its own template', () => {
    const [header] = parseCsv(templateCsv('stock'));
    const m = guessMapping('stock', header);
    expect(Object.keys(m).sort()).toEqual(FIELDS.stock.map((f) => f.key).sort());
  });

  it('turns rows into objects, dates as days, blanks left out', () => {
    const rows = rowsFor([['Napa', new Date(2027, 5, 30), '']], { name: 0, expiry: 1, batchNo: 2 });
    expect(rows).toEqual([{ name: 'Napa', expiry: '2027-06-30' }]);
  });
});
