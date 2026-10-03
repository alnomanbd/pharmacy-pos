import { describe, it, expect } from 'vitest';
import { rulesOf, pointsEarned, redeemFor, pointsClawedBack } from '../src/services/loyalty.js';

const on = rulesOf({ enabled: true });

describe('loyalty points', () => {
  it('is off until the shop turns it on', () => {
    expect(pointsEarned(rulesOf(null), 5000)).toBe(0);
    expect(redeemFor(rulesOf({}), 100, 1000)).toEqual({ points: 0, value: 0 });
  });

  it('earns a point per ৳100 paid, rounding down', () => {
    expect(pointsEarned(on, 99)).toBe(0);
    expect(pointsEarned(on, 100)).toBe(1);
    expect(pointsEarned(on, 1299.5)).toBe(12);
    expect(pointsEarned(rulesOf({ enabled: true, spendPerPoint: 50 }), 1000)).toBe(20);
  });

  it('lets points pay for at most the set share of a bill', () => {
    expect(redeemFor(on, 80, 1000)).toEqual({ points: 80, value: 80 });
    expect(redeemFor(on, 900, 1000)).toEqual({ points: 500, value: 500 });
    expect(redeemFor(rulesOf({ enabled: true, pointValue: 0.5, maxRedeemPercent: 10 }), 1000, 300)).toEqual({ points: 60, value: 30 });
  });

  it('takes back points in proportion to what was returned, never more than earned', () => {
    expect(pointsClawedBack(10, 0, 500, 1000)).toBe(5);
    expect(pointsClawedBack(10, 5, 1000, 1000)).toBe(5);
    expect(pointsClawedBack(10, 10, 100, 1000)).toBe(0);
    expect(pointsClawedBack(0, 0, 100, 1000)).toBe(0);
  });
});
