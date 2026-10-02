import { describe, it, expect } from 'vitest';
import { monthlyPrice, effectiveLimits } from '../src/services/plan.service.js';

/** What a plan costs a shop with more than one branch. */
describe('the monthly price with branches', () => {
  const plus = { price: 3000, includedBranches: 1, extraBranchPrice: 1000 };

  it('is the plan price for a single-branch shop — most shops pay exactly what they did', () => {
    expect(monthlyPrice(plus, 1)).toEqual({ base: 3000, extraBranches: 0, extraBranchPrice: 1000, extras: 0, total: 3000 });
  });

  it('adds the extra-branch price for each branch beyond those included', () => {
    expect(monthlyPrice(plus, 3).total).toBe(5000);
    expect(monthlyPrice({ ...plus, includedBranches: 2 }, 3)).toMatchObject({ extraBranches: 1, total: 4000 });
  });

  it('charges nothing more when the plan sets no extra-branch price, and treats a plan without the fields as one included branch', () => {
    expect(monthlyPrice({ price: 1500, includedBranches: 1, extraBranchPrice: 0 }, 4).total).toBe(1500);
    expect(monthlyPrice({ price: 1500 }, 1).total).toBe(1500);
  });
});

describe('a shop’s own branch ceiling', () => {
  it('replaces the plan’s branch limit, like counters and staff', () => {
    const l = effectiveLimits({ outlets: 1, terminals: 5, shopUsers: 10 }, { outlets: 4 });
    expect(l.outlets).toBe(4);
    expect(l.overridden.outlets).toBe(true);
  });
});
