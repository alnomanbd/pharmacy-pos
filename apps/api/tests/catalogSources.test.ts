import { describe, it, expect } from 'vitest';
import { parsePackageContainer } from '../src/seed/medexConvert.js';

/**
 * Splitting "100 ml bottle: ৳ 40.12" into a pack and a price.
 *
 * The reason this is a named function with its own test file rather than a regex
 * inline: the drug index writes a *unit* price for tablets with the pack price in
 * a parenthetical, and reading the parenthetical as the price would print a
 * hundredfold number next to a medicine.
 */
describe('parsePackageContainer', () => {
  it('reads a pack and its price', () => {
    expect(parsePackageContainer('100 ml bottle: ৳ 40.12')).toEqual({
      packSize: '100 ml bottle',
      price: '40.12',
    });
  });

  it('keeps the unit price, not the pack price', () => {
    // 5.98 is what one tablet costs; 598.00 is what a hundred cost. A salesman
    // asked "how much per tablet" needs the first.
    expect(parsePackageContainer("Unit Price: ৳ 5.98,(100's pack: ৳ 598.00),")).toEqual({
      packSize: "100's pack",
      price: '5.98',
    });
  });

  it('takes the first pack when a product lists several', () => {
    expect(parsePackageContainer('60 ml bottle: ৳ 35.00,100 ml bottle: ৳ 50.00')).toEqual({
      packSize: '60 ml bottle',
      price: '35.00',
    });
  });

  it('says nothing rather than guessing when the price is unavailable', () => {
    expect(parsePackageContainer('Price Unavailable')).toEqual({ packSize: '', price: '' });
    expect(parsePackageContainer('')).toEqual({ packSize: '', price: '' });
  });

  it('strips thousand separators', () => {
    expect(parsePackageContainer("Unit Price: ৳ 1,250.00,(10's pack: ৳ 12,500.00),")).toEqual({
      packSize: "10's pack",
      price: '1250.00',
    });
  });

  it('accepts Tk and BDT as well as the taka sign', () => {
    expect(parsePackageContainer('5 gm tube: Tk. 45.50').price).toBe('45.50');
    expect(parsePackageContainer('5 gm tube: BDT 45.50').price).toBe('45.50');
    expect(parsePackageContainer('5 gm tube: 45.50').price).toBe('45.50');
  });

  it('keeps an unrecognised string as the pack, with no price', () => {
    // A wrong price is worse than a missing one.
    const r = parsePackageContainer('sold in hospital packs only');
    expect(r.price).toBe('');
    expect(r.packSize).toBe('sold in hospital packs only');
  });

  it('collapses the whitespace a spreadsheet leaves behind', () => {
    expect(parsePackageContainer('  100  ml   bottle :  ৳  40.12 ')).toEqual({
      packSize: '100 ml bottle',
      price: '40.12',
    });
  });
});
