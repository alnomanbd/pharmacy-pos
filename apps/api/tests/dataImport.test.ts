import { describe, it, expect } from 'vitest';
import { numberOf, expiryOf, readStockRow, readCustomerRow } from '../src/services/dataImport.service.js';

const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);

describe('reading a spreadsheet', () => {
  it('reads numbers as people type them', () => {
    expect(numberOf('1,250')).toBe(1250);
    expect(numberOf('৳ 30.5')).toBe(30.5);
    expect(numberOf('১২০')).toBe(120);
    expect(numberOf('')).toBeUndefined();
    expect(numberOf('abc')).toBeNaN();
  });

  it('reads an expiry in the ways a pack or a sheet writes it', () => {
    expect(day(expiryOf('2027-06-15'))).toBe('2027-06-15');
    expect(day(expiryOf('03/04/2027'))).toBe('2027-04-03'); // day first
    expect(day(expiryOf('06/2027'))).toBe('2027-06-30'); // end of the month
    expect(day(expiryOf('Jun 2027'))).toBe('2027-06-30');
    expect(day(expiryOf('June-27'))).toBe('2027-06-30');
    expect(day(expiryOf('15 Feb 2028'))).toBe('2028-02-15');
    expect(day(expiryOf(46553))).toBe('2027-06-15'); // an Excel serial
    expect(expiryOf('')).toBeUndefined();
    expect(expiryOf('31/02/2027')).toBeNull();
    expect(expiryOf('soon')).toBeNull();
  });

  it('turns a stock row into pieces and per-piece prices', () => {
    const r = readStockRow({ name: 'Napa', strength: '500 mg', piecesPerStrip: '10', stripsPerBox: 20, mrpPerStrip: '12', costPerStrip: 9, qtyBoxes: 2, qtyStrips: 3, expiry: '12/2027' });
    expect(r.errors).toEqual([]);
    expect(r.qty).toBe(2 * 20 * 10 + 30);
    expect(r.mrpPerPiece).toBe(1.2);
    expect(r.costPerPiece).toBe(0.9);
    expect(day(r.expiry)).toBe('2027-12-31');
  });

  it('says what is wrong with a stock row', () => {
    expect(readStockRow({ name: '', qtyPieces: 'ten', expiry: 'later' }).errors).toEqual([
      'No name',
      'Quantity is not a number',
      '"later" is not a date',
    ]);
  });

  it('reads a customer row', () => {
    const c = readCustomerRow({ name: 'Kabir', phone: '01799-000222', openingBalance: '1,200' });
    expect(c.errors).toEqual([]);
    expect(c.phone).toBe('01799000222');
    expect(c.openingBalance).toBe(1200);
    expect(readCustomerRow({ name: 'X', phone: '12345' }).errors[0]).toMatch(/not a mobile number/);
  });
});
