import { describe, it, expect } from 'vitest';
import { toPieces, costPerPiece } from '../src/services/shop.service.js';

/**
 * The two sums a pharmacy's money rests on, and the gate in front of them.
 *
 * Both of these are the difference between software a Bangladeshi shop can use
 * and software it cannot, and neither is obvious enough to leave untested.
 */
describe('counting in pieces', () => {
  const strip = { piecesPerStrip: 10, stripsPerBox: 10 };

  it('turns a delivery written in boxes and strips into pieces', () => {
    // How an invoice actually reads: "2 box + 3 strip".
    expect(toPieces({ boxes: 2, strips: 3 }, strip)).toBe(230);
  });

  it('counts loose pieces too, because that is how one is sold', () => {
    expect(toPieces({ strips: 1, pieces: 4 }, strip)).toBe(14);
  });

  it('treats a bottle of syrup as one piece rather than as a special case', () => {
    const bottle = { piecesPerStrip: 1, stripsPerBox: 1 };
    expect(toPieces({ boxes: 12 }, bottle)).toBe(12);
    expect(toPieces({ pieces: 3 }, bottle)).toBe(3);
  });

  it('defaults a missing pack structure to one piece per unit', () => {
    expect(toPieces({ strips: 5 }, {})).toBe(5);
  });
});

describe('what a piece cost', () => {
  it('spreads the money across everything that arrived, bonus included', () => {
    /*
     * "10 + 1": ten strips charged at ৳9 a strip, eleven delivered. The cost of
     * a piece is 90 ÷ 110, not 90 ÷ 100 — a margin worked out from the charged
     * quantity overstates itself on every bonused line, which is most of them.
     */
    expect(costPerPiece(90, 100, 10)).toBeCloseTo(90 / 110, 6);
    expect(costPerPiece(90, 100, 10)).toBeLessThan(90 / 100);
  });

  it('is the plain division when there is no bonus', () => {
    expect(costPerPiece(180, 200, 0)).toBeCloseTo(0.9, 6);
  });

  it('refuses to divide by a delivery of nothing', () => {
    expect(costPerPiece(500, 0, 0)).toBe(0);
  });
});

