import { describe, expect, it } from 'vitest';
import { refundGap } from '../src/services/shopCash.service.js';

/**
 * The returns taken before refunds were written down.
 *
 * Wrong quietly in either direction: too little and a month reads richer than
 * it was, too much and a return is counted twice once the POS has written it.
 */
describe('the refund a bill is still owed on the accounts', () => {
  const line = (returnedPieces: number, pricePerPiece: number, costPerPiece = pricePerPiece * 0.8) => ({
    returnedPieces,
    pricePerPiece,
    costPerPiece,
  });

  it('writes the whole return when nothing was recorded, all of it cash', () => {
    expect(refundGap([line(4, 10), line(0, 50)], undefined, 0)).toEqual({ value: 40, cash: 40, cost: 32 });
  });

  it('takes what came off the baki out of the cash', () => {
    expect(refundGap([line(10, 12)], undefined, 100)).toEqual({ value: 120, cash: 20, cost: 96 });
  });

  it('writes nothing when a cash return came back entirely off the baki', () => {
    expect(refundGap([line(3, 10)], undefined, 30)).toEqual({ value: 30, cash: 0, cost: 24 });
  });

  it('leaves a bill alone once its refund lines add up', () => {
    expect(refundGap([line(4, 10)], { value: 40, cash: 40 }, 0)).toBeNull();
  });

  it('writes only the part a later return added', () => {
    expect(refundGap([line(6, 10)], { value: 40, cash: 40 }, 0)).toEqual({ value: 20, cash: 20, cost: 16 });
  });
});
