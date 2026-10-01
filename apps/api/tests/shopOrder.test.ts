import { describe, it, expect } from 'vitest';
import { __testables } from '../src/services/shopOrder.service.js';

const { toWholeStrips, ALLOWED } = __testables;

/**
 * An order is read out loud to a rep, and it either arrives or it does not.
 *
 * Both of the rules that decide what it says are here: quantities are in whole
 * strips because that is the unit the trade speaks in, and an order moves
 * forwards only — there is no reopening a list somebody has already been told
 * did not come.
 */
describe('what an order asks for', () => {
  it('rounds up to a whole strip, because nobody orders seven tablets', () => {
    expect(toWholeStrips(7, 10)).toBe(10);
    expect(toWholeStrips(11, 10)).toBe(20);
    expect(toWholeStrips(20, 10)).toBe(20);
  });

  it('never asks for nothing', () => {
    expect(toWholeStrips(0, 10)).toBe(10);
    expect(toWholeStrips(1, 10)).toBe(10);
  });

  it('treats a bottle or a tube as one piece, not one strip of ten', () => {
    /* A syrup is piecesPerStrip 1 — the same rule, not a special case. */
    expect(toWholeStrips(3, 1)).toBe(3);
    expect(toWholeStrips(0, 0)).toBe(1);
  });
});

describe('where an order may go next', () => {
  it('goes forwards only', () => {
    expect(ALLOWED.open).toContain('sent');
    expect(ALLOWED.sent).toContain('received');
    expect(ALLOWED.received).toEqual([]);
    expect(ALLOWED.cancelled).toEqual([]);
  });

  it('cannot be marked received before it has been placed', () => {
    expect(ALLOWED.open).not.toContain('received');
  });

  it('can be dropped at either end of its life, but not after', () => {
    expect(ALLOWED.open).toContain('cancelled');
    expect(ALLOWED.sent).toContain('cancelled');
    expect(ALLOWED.received).not.toContain('cancelled');
  });
});
