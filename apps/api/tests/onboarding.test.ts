import { describe, it, expect } from 'vitest';
import { stepsFrom, MIN_PRODUCTS } from '../src/services/onboarding.service.js';
import { isStuck } from '../src/services/retention.service.js';

/** The getting-started checklist, and when a new shop counts as stuck. */
const none = { details: false, products: 0, purchases: 0, sales: 0, users: 1, customers: 0 };

describe('the checklist', () => {
  it('starts at nothing done for a shop that has only signed up', () => {
    expect(stepsFrom(none)).toMatchObject({ done: 0, total: 6 });
  });

  it('ticks each step from what the shop actually did', () => {
    const s = stepsFrom({ details: true, products: MIN_PRODUCTS, purchases: 1, sales: 3, users: 2, customers: 1 });
    expect(s.done).toBe(6);
    expect(s.steps.every((x) => x.done)).toBe(true);
  });

  it('does not count one test product as a stock list, nor the owner alone as staff', () => {
    const s = stepsFrom({ ...none, products: MIN_PRODUCTS - 1 });
    expect(s.steps.find((x) => x.key === 'medicines')!.done).toBe(false);
    expect(s.steps.find((x) => x.key === 'staff')!.done).toBe(false);
  });
});

describe('stuck in setup', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  it('is a shop past its first three days with fewer than half the steps done', () => {
    expect(isStuck(daysAgo(5), 2, 6, now)).toBe(true);
    expect(isStuck(daysAgo(5), 3, 6, now)).toBe(false);
  });

  it('is too soon to say in the first three days, and no longer onboarding after two months', () => {
    expect(isStuck(daysAgo(1), 0, 6, now)).toBe(false);
    expect(isStuck(daysAgo(61), 0, 6, now)).toBe(false);
  });
});
