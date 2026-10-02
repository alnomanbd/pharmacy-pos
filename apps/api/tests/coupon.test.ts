import { describe, it, expect } from 'vitest';
import { quote, normaliseCode, CODE_RX, type CouponRules } from '../src/services/coupon.service.js';
import { makeReferralCode, REFERRAL_CODE_RX } from '../src/services/referral.service.js';

/** Discount codes: what they take off, and every reason they refuse. */
const now = new Date('2026-10-02T10:00:00Z');
const base: CouponRules = { code: 'FIRST50', kind: 'percent', value: 50, active: true };
const ctx = { plan: 'basic', price: 1500, months: 1, paidBefore: false, usedBefore: false, now };

describe('what a code takes off', () => {
  it('takes a percentage of price × months, to the whole taka', () => {
    expect(quote(base, { ...ctx, months: 3 })).toEqual({ ok: true, discount: 2250, total: 2250, base: 4500 });
    expect(quote({ ...base, value: 33 }, ctx)).toMatchObject({ ok: true, discount: 495, total: 1005 });
  });

  it('takes a fixed amount, never more than the price', () => {
    expect(quote({ ...base, kind: 'amount', value: 500 }, ctx)).toMatchObject({ ok: true, discount: 500, total: 1000 });
    expect(quote({ ...base, kind: 'amount', value: 5000 }, ctx)).toMatchObject({ ok: true, discount: 1500, total: 0 });
  });
});

describe('when a code refuses', () => {
  const no = (c: Partial<CouponRules>, x: Partial<typeof ctx> = {}) => quote({ ...base, ...c }, { ...ctx, ...x });

  it('is off, expired or used up', () => {
    expect(no({ active: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/no longer active/) });
    expect(no({ expiresAt: new Date('2026-10-01') })).toMatchObject({ ok: false, reason: expect.stringMatching(/expired/) });
    expect(no({ maxRedemptions: 10, redemptions: 10 })).toMatchObject({ ok: false, reason: expect.stringMatching(/used up/) });
    expect(no({ maxRedemptions: 10, redemptions: 9 }).ok).toBe(true);
  });

  it('is for other plans, or needs more months', () => {
    expect(no({ plans: ['plus'] })).toMatchObject({ ok: false, reason: expect.stringMatching(/not for this plan/) });
    expect(no({ plans: ['basic', 'plus'] }).ok).toBe(true);
    expect(no({ minMonths: 3 })).toMatchObject({ ok: false, reason: expect.stringMatching(/at least 3 months/) });
    expect(no({ minMonths: 3 }, { months: 6 }).ok).toBe(true);
  });

  it('is a first-payment offer and the shop has paid, or once per shop and already used', () => {
    expect(no({ firstPaymentOnly: true }, { paidBefore: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/first payment/) });
    expect(no({ oncePerShop: true }, { usedBefore: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/already used/) });
    expect(no({ oncePerShop: false }, { usedBefore: true }).ok).toBe(true);
  });
});

describe('the codes themselves', () => {
  it('reads a typed code the way it was meant', () => {
    expect(normaliseCode(' first 50 ')).toBe('FIRST50');
    expect(CODE_RX.test('EID-500')).toBe(true);
    expect(CODE_RX.test('AB')).toBe(false);
  });

  it('makes referral codes that survive being read out: six, and no 0, O, 1, I or L', () => {
    for (let i = 0; i < 200; i++) {
      const c = makeReferralCode();
      expect(c).toMatch(REFERRAL_CODE_RX);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
});
