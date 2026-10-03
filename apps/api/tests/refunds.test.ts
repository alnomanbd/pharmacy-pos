import { describe, it, expect } from 'vitest';
import { refundsSoFar } from '../src/services/till.service.js';
import { refundGap } from '../src/services/shopCash.service.js';

describe('what a bill has already given back', () => {
  it('reads the bill’s own record', () => {
    expect(refundsSoFar({ refunds: { value: 40, againstDue: 10, cash: 30, other: 0, vat: 0, cost: 20 }, lines: [], due: 10 })).toEqual({
      value: 40, againstDue: 10, cash: 30, other: 0, vat: 0, cost: 20,
    });
  });

  it('works out a bill returned before the record was kept, the old way', () => {
    const r = refundsSoFar({ lines: [{ returnedPieces: 3, pricePerPiece: 10, costPerPiece: 6 }], due: 20 });
    expect(r).toMatchObject({ value: 30, againstDue: 20, cash: 10, cost: 18 });
  });
});

describe('refunds missing from the accounts', () => {
  it('trusts the bill’s record over the shelf price, so a discounted return is not written twice', () => {
    /* 5 pieces at ৳10 on a bill with ৳10 off: ৳40 refunded and already written. */
    expect(refundGap([{ returnedPieces: 5, pricePerPiece: 10 }], { value: 40, cash: 0 }, 0, { value: 40, cash: 0, cost: 35 })).toBeNull();
    expect(refundGap([{ returnedPieces: 5, pricePerPiece: 10 }], undefined, 0, { value: 40, cash: 0, cost: 35 })).toEqual({ value: 40, cash: 0, cost: 35 });
  });
});
