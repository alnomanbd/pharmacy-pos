import { describe, it, expect } from 'vitest';
import { extendedUntil } from '../src/services/payment.service.js';

/**
 * How far a payment extends a subscription — the same rule whether a shop
 * claimed it or an operator recorded it by hand.
 */
const now = new Date('2026-10-02T10:00:00Z');

describe('extending a subscription', () => {
  it('adds to the days left when paying early, so none are thrown away', () => {
    expect(extendedUntil(new Date('2026-10-20T10:00:00Z'), 1, now).toISOString()).toBe('2026-11-20T10:00:00.000Z');
  });

  it('starts from today when paying late, so a renewal is never backdated', () => {
    expect(extendedUntil(new Date('2026-09-01T10:00:00Z'), 3, now).toISOString()).toBe('2027-01-02T10:00:00.000Z');
  });

  it('starts from today when there was no end date at all', () => {
    expect(extendedUntil(null, 12, now).toISOString()).toBe('2027-10-02T10:00:00.000Z');
  });
});
