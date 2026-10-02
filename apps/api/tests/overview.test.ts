import { describe, it, expect } from 'vitest';
import { mrrOf, conversionRate } from '../src/services/overview.service.js';

/** The overview's two headline numbers. */
const now = new Date('2026-10-02T10:00:00Z');
const plans: Record<string, { price: number; isTrial: boolean }> = {
  trial: { price: 0, isTrial: true },
  basic: { price: 1500, isTrial: false },
  plus: { price: 3000, isTrial: false },
};

describe('monthly recurring revenue', () => {
  it('adds up the plan price of every shop paid up today', () => {
    const shops = [
      { plan: 'basic', paidUntil: new Date('2026-11-01') },
      { plan: 'plus', paidUntil: new Date('2027-01-01') },
      { plan: 'plus', paidUntil: new Date('2026-09-30') }, // lapsed
      { plan: 'trial', paidUntil: new Date('2026-10-10') }, // not paying
      { plan: 'gone', paidUntil: new Date('2027-01-01') }, // a plan that no longer exists
    ];
    expect(mrrOf(shops, (k) => plans[k], now)).toEqual({ mrr: 4500, paying: 2 });
  });
});

describe('trial to paid', () => {
  it('is a whole percent, and nothing at all with nobody to count', () => {
    expect(conversionRate(8, 3)).toBe(38);
    expect(conversionRate(0, 0)).toBeNull();
  });
});
