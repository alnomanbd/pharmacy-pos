import { describe, it, expect } from 'vitest';
import {
  effectiveLimits,
  signupLimitOverrides,
  customLimitMessage,
} from '../src/services/plan.service.js';
import { seatUsage } from '../src/services/platform.service.js';
import { registerSchema } from '../src/validators/auth.validator.js';

/**
 * A shop with ten counters has to be able to try ten counters. The plan sets
 * the default; a shop's own ceiling, where it has one, replaces it.
 */

const trial = { outlets: 1, terminals: 1, shopUsers: 2 };

describe('effectiveLimits', () => {
  it('is the plan’s limits when the shop has no overrides', () => {
    expect(effectiveLimits(trial)).toEqual({
      ...trial,
      overridden: { outlets: false, terminals: false, shopUsers: false },
    });
    expect(effectiveLimits(trial, null).terminals).toBe(1);
    expect(effectiveLimits(trial, { terminals: null, shopUsers: null }).overridden).toEqual({
      outlets: false,
      terminals: false,
      shopUsers: false,
    });
  });

  it('lets a per-shop number beat the plan on that axis only', () => {
    const l = effectiveLimits(trial, { terminals: 10 });
    expect(l.terminals).toBe(10);
    expect(l.shopUsers).toBe(2);
    expect(l.outlets).toBe(1);
    expect(l.overridden).toEqual({ outlets: false, terminals: true, shopUsers: false });
  });

  it('beats the plan even when the override is lower, and even an unlimited plan', () => {
    expect(effectiveLimits({ outlets: 1, terminals: 5, shopUsers: 6 }, { terminals: 3 }).terminals).toBe(3);
    const unlimited = effectiveLimits({ outlets: null, terminals: null, shopUsers: null }, { shopUsers: 12 });
    expect(unlimited.shopUsers).toBe(12);
    expect(unlimited.terminals).toBeNull();
  });

  it('treats a non-number as no override', () => {
    const l = effectiveLimits(trial, { terminals: Number.NaN, shopUsers: undefined });
    expect(l.terminals).toBe(1);
    expect(l.overridden.terminals).toBe(false);
  });

  it('does not change the plan’s own limits object', () => {
    const plan = { ...trial };
    effectiveLimits(plan, { terminals: 9 });
    expect(plan.terminals).toBe(1);
  });
});

describe('signupLimitOverrides', () => {
  it('gives a one-counter shop nothing — the trial already fits it', () => {
    expect(signupLimitOverrides(1, 2)).toEqual({ terminals: null, shopUsers: null });
    expect(signupLimitOverrides(undefined, 2)).toEqual({ terminals: null, shopUsers: null });
    expect(signupLimitOverrides(null, 2)).toEqual({ terminals: null, shopUsers: null });
  });

  it('gives a ten-counter shop ten counters and a login per counter plus the owner', () => {
    expect(signupLimitOverrides(10, 2)).toEqual({ terminals: 10, shopUsers: 11 });
  });

  it('never gives fewer logins than the trial already allows', () => {
    expect(signupLimitOverrides(2, 5)).toEqual({ terminals: 2, shopUsers: 5 });
    expect(signupLimitOverrides(4, 5)).toEqual({ terminals: 4, shopUsers: 5 });
    expect(signupLimitOverrides(5, 5)).toEqual({ terminals: 5, shopUsers: 6 });
  });

  it('leaves logins alone when the trial’s are unlimited', () => {
    expect(signupLimitOverrides(10, null)).toEqual({ terminals: 10, shopUsers: null });
  });
});

describe('the limit refusal', () => {
  it('reads naturally for a shop’s own ceiling', () => {
    expect(customLimitMessage('terminals', 10)).toBe(
      'Your shop is set up for 10 billing counters. Contact Dawai support to add more.',
    );
    expect(customLimitMessage('shopUsers', 1)).toBe(
      'Your shop is set up for one staff login. Contact Dawai support to add more.',
    );
  });
});

describe('seatUsage', () => {
  it('says whether the limit is the shop’s own', () => {
    expect(seatUsage(10, 3, true, 1)).toEqual({ limit: 10, used: 3, full: false, overridden: true, planLimit: 1 });
    expect(seatUsage(1, 1)).toEqual({ limit: 1, used: 1, full: true, overridden: false, planLimit: 1 });
  });
});

describe('registerSchema', () => {
  const base = {
    organizationName: 'Shefa Pharmacy',
    name: 'Rahim Uddin',
    email: 'rahim@example.com',
    phone: '01711000000',
    password: 'a-long-shop-password',
    acceptTerms: true as const,
  };

  it('accepts a shop with 200 counters, 100 branches and a licence', () => {
    const res = registerSchema.safeParse({ ...base, counters: 200, outlets: 100, licence: '  DL-12345  ' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.licence).toBe('DL-12345');
  });

  it('refuses 201 counters', () => {
    expect(registerSchema.safeParse({ ...base, counters: 201 }).success).toBe(false);
  });

  it('refuses 101 branches, zero branches and an over-long licence', () => {
    expect(registerSchema.safeParse({ ...base, outlets: 101 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, outlets: 0 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, licence: 'x'.repeat(81) }).success).toBe(false);
  });

  it('still accepts a sign-up that gives none of them', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });
});
