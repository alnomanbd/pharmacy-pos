import { describe, it, expect } from 'vitest';
import { assertPlanExists, limitMessage, type PlanShape } from '../src/services/plan.service.js';

const plan = (over: Partial<PlanShape> = {}): PlanShape => ({
  id: 'p1',
  key: 'basic',
  name: 'Pharmacy Basic',
  description: '',
  price: 1500,
  currency: 'BDT',
  limits: { outlets: 1, terminals: 1, shopUsers: 2 },
  isTrial: false,
  trialDays: 14,
  isActive: true,
  sortOrder: 1,
  ...over,
});

describe('assertPlanExists', () => {
  it('accepts a plan the catalogue has', () => {
    expect(() => assertPlanExists(plan(), 'basic')).not.toThrow();
  });

  it('refuses a key the catalogue does not have, and names it', () => {
    expect(() => assertPlanExists(null, 'gold')).toThrow(/"gold"/);
  });

  it('answers with a bad request, not a server error', () => {
    try {
      assertPlanExists(null, 'gold');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
  });
});

describe('the plan-limit refusal', () => {
  it('names the plan and what it includes, in the singular', () => {
    expect(limitMessage('terminals', 1, 'Pharmacy Basic')).toBe(
      'Pharmacy Basic includes one billing counter. Upgrade the plan to add more.',
    );
  });

  it('counts in the plural', () => {
    expect(limitMessage('shopUsers', 10, 'Pharmacy Plus')).toMatch(/10 staff logins/);
  });
});
