import { describe, it, expect } from 'vitest';
import { vatSplit } from '../src/services/invoice.service.js';

/** VAT inside a VAT-inclusive subscription price. */
describe('the VAT inside a price', () => {
  it('is 15/115 of the total, to the paisa, and the two add back up', () => {
    const s = vatSplit(3000, 15)!;
    expect(s).toEqual({ percent: 15, vat: 391.3, net: 2608.7 });
    expect(s.vat + s.net).toBeCloseTo(3000, 5);
    expect(vatSplit(1500, 15)).toEqual({ percent: 15, vat: 195.65, net: 1304.35 });
  });

  it('is nothing at all when VAT is off', () => {
    expect(vatSplit(3000, 0)).toBeNull();
  });
});
