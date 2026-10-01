import { describe, it, expect } from 'vitest';
import { fefoOrder, effectiveSoldAt, isExpired } from '../src/services/till.service.js';
import { SHOP_ROLES, SHOP_ADMIN_ROLES } from '../src/types/roles.js';

/**
 * The till's two rules that are easy to get wrong quietly.
 *
 * Neither fails loudly when it is broken: the wrong batch leaves the shelf and
 * nobody notices until a customer holds up an expired strip, and a salesman who
 * can see trade price does not announce it.
 */
describe('first expiry, first out', () => {
  const lot = (batchNo: string, expiry: string | null) => ({ batchNo, expiry });

  it('hands out the lot that goes out of date soonest', () => {
    const order = fefoOrder([
      lot('late', '2029-12-31'),
      lot('soon', '2027-06-30'),
      lot('middle', '2028-01-31'),
    ]);
    expect(order.map((b) => b.batchNo)).toEqual(['soon', 'middle', 'late']);
  });

  it('puts a lot with no expiry recorded last, not first', () => {
    /*
     * The one that matters. Mongo sorts null first, so a lot nobody typed a
     * date for would be sold before the one expiring next month — and "no date
     * recorded" is not the same as "does not expire".
     */
    const order = fefoOrder([lot('unknown', null), lot('soon', '2027-06-30')]);
    expect(order.map((b) => b.batchNo)).toEqual(['soon', 'unknown']);
  });

  it('leaves the caller’s array alone', () => {
    const input = [lot('late', '2029-12-31'), lot('soon', '2027-06-30')];
    fefoOrder(input);
    expect(input.map((b) => b.batchNo)).toEqual(['late', 'soon']);
  });
});

describe('an expired lot is not for sale', () => {
  const now = new Date('2026-09-25T10:00:00Z');

  it('knows a lot past its date from one still in it', () => {
    expect(isExpired({ expiry: '2026-08-31T17:59:59.999Z' }, now)).toBe(true);
    expect(isExpired({ expiry: '2026-09-30T17:59:59.999Z' }, now)).toBe(false);
  });

  it('does not call a lot with no date expired', () => {
    /* Unknown is not safe, but it is not refused either — it sells last. */
    expect(isExpired({ expiry: null }, now)).toBe(false);
  });
});

describe('who may do what in the shop', () => {
  it('lets a salesman at the till', () => {
    expect(SHOP_ROLES).toContain('salesman');
  });

  it('keeps the salesman out of the back room', () => {
    // Stock, deliveries and prices are where trade price lives, and the margin
    // on every strip is the owner's business.
    expect(SHOP_ADMIN_ROLES).not.toContain('salesman');
    expect(SHOP_ADMIN_ROLES).toContain('pharmacist');
  });

});

/**
 * When a bill rung up offline says it was sold.
 *
 * The counter's clock is the only witness to an evening the server did not
 * see, and it is a witness worth listening to — but not without limits. Half
 * the machines in a shop have never had their clock set.
 */
describe('the time on a bill posted late', () => {
  const now = new Date('2026-01-02T21:00:00.000Z');

  it('keeps the time the counter says it was sold', () => {
    const at = new Date('2026-01-02T20:40:00.000Z');
    expect(effectiveSoldAt(at.toISOString(), now).toISOString()).toBe(at.toISOString());
  });

  it('refuses a bill dated in the future', () => {
    /* Otherwise a machine whose clock is a week fast puts a bill at the top of
       every report until next week arrives. */
    const at = new Date('2026-01-09T21:00:00.000Z');
    expect(effectiveSoldAt(at.toISOString(), now).toISOString()).toBe(now.toISOString());
  });

  it('will not backdate further than a day', () => {
    const at = new Date('2025-06-01T10:00:00.000Z');
    expect(effectiveSoldAt(at.toISOString(), now).getTime()).toBe(now.getTime() - 86_400_000);
  });

  it('falls back to now when the counter sent nothing, or nonsense', () => {
    expect(effectiveSoldAt(undefined, now).toISOString()).toBe(now.toISOString());
    expect(effectiveSoldAt('not a date', now).toISOString()).toBe(now.toISOString());
  });
});
