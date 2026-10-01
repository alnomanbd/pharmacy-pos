import { describe, it, expect } from 'vitest';
import { splitQty, stripSize } from '../pages/Till';

/**
 * The counter counts in two units at once.
 *
 * "Two pata and three tablets" is one sentence, and the bill holds one number.
 * These two functions are the join between them, so they are where a wrong
 * quantity — which is a wrong amount of money and a wrong shelf — would come
 * from.
 */
const line = (qtyPieces: number, piecesPerStrip: number) => ({
  qtyPieces,
  product: { piecesPerStrip },
});

describe('strips and loose pieces', () => {
  it('splits a quantity the way it is asked for at the counter', () => {
    expect(splitQty(line(23, 10))).toEqual({ strips: 2, loose: 3 });
    expect(splitQty(line(20, 10))).toEqual({ strips: 2, loose: 0 });
    expect(splitQty(line(7, 10))).toEqual({ strips: 0, loose: 7 });
  });

  it('never shows a fraction of a strip', () => {
    const { strips, loose } = splitQty(line(45, 10));
    expect(Number.isInteger(strips)).toBe(true);
    expect(Number.isInteger(loose)).toBe(true);
    expect(strips * 10 + loose).toBe(45);
  });

  it('treats a bottle as the single piece it is', () => {
    /* A syrup is a strip of one: the strip box would repeat the piece count,
       so the row hides it and this is what tells it to. */
    expect(stripSize(line(3, 1))).toBe(1);
    expect(splitQty(line(3, 1))).toEqual({ strips: 3, loose: 0 });
  });

  it('survives a product with no pack size recorded', () => {
    expect(stripSize(line(5, 0))).toBe(1);
    expect(splitQty(line(5, 0))).toEqual({ strips: 5, loose: 0 });
  });

  it('holds the round trip a box of 6 x 10 makes', () => {
    const strip = 10;
    for (const qty of [1, 9, 10, 11, 59, 60, 61]) {
      const { strips, loose } = splitQty(line(qty, strip));
      expect(strips * strip + loose).toBe(qty);
      expect(loose).toBeLessThan(strip);
    }
  });
});
