import { describe, it, expect } from 'vitest';
import { summarise } from '../src/services/stockCount.service.js';

/**
 * What a count comes to.
 *
 * The arithmetic is trivial and the two rules around it are not: a lot nobody
 * counted must be left alone, and a lot counted as zero must be written off.
 * They look the same on a sheet — both are "no number on the shelf" — and
 * treating the first as the second writes off a whole rack somebody ran out of
 * time on.
 */
const line = (expected: number, counted: number | null, cost = 1) => ({
  expected,
  counted,
  costPerPiece: cost,
});

describe('what a count comes to', () => {
  it('adds up what is missing and what is extra separately', () => {
    /* Separately, because they mean different things: short is stock that left
       without a bill, extra is stock that arrived without a delivery. A single
       net figure hides both. */
    const totals = summarise([line(100, 94), line(50, 55), line(20, 20)]);
    expect(totals.shortPieces).toBe(6);
    expect(totals.extraPieces).toBe(5);
    expect(totals.differing).toBe(2);
    expect(totals.counted).toBe(3);
  });

  it('values the difference at what the shop paid, not what it charges', () => {
    const totals = summarise([line(100, 90, 0.86)]);
    expect(totals.valueDelta).toBe(-8.6);
  });

  it('leaves a lot nobody counted out of it entirely', () => {
    const totals = summarise([line(100, null), line(40, 40)]);
    expect(totals.counted).toBe(1);
    expect(totals.shortPieces).toBe(0);
    expect(totals.valueDelta).toBe(0);
  });

  it('treats a lot counted as zero as a write-off, not as uncounted', () => {
    /* The one that matters. An empty box on a shelf the screen says holds 30 is
       30 pieces gone, and the count is the only place that can say so. */
    const totals = summarise([line(30, 0, 2)]);
    expect(totals.shortPieces).toBe(30);
    expect(totals.valueDelta).toBe(-60);
  });

  it('says nothing differed when the shelf and the screen agree', () => {
    const totals = summarise([line(10, 10), line(4, 4)]);
    expect(totals.differing).toBe(0);
    expect(totals.valueDelta).toBe(0);
  });
});
