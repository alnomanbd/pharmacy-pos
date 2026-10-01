import { describe, it, expect } from 'vitest';
import { expiryMonth, monthPassed } from './expiry';

/** The expiry is typed the way the foil reads, and has to come out a month. */
describe('expiry off the strip', () => {
  it('reads MM/YY and MM/YYYY', () => {
    expect(expiryMonth('03/27')).toBe('2027-03');
    expect(expiryMonth('3/2027')).toBe('2027-03');
    expect(expiryMonth(' 11-28 ')).toBe('2028-11');
    expect(expiryMonth('12.2030')).toBe('2030-12');
  });

  it('refuses what is not a month', () => {
    expect(expiryMonth('13/27')).toBeNull();
    expect(expiryMonth('00/27')).toBeNull();
    expect(expiryMonth('2027-03-31')).toBeNull();
    expect(expiryMonth('march')).toBeNull();
    expect(expiryMonth('')).toBeNull();
  });

  it('counts the month we are in as still in date', () => {
    const now = new Date(2026, 8, 25);
    expect(monthPassed('2026-09', now)).toBe(false);
    expect(monthPassed('2026-08', now)).toBe(true);
    expect(monthPassed('2027-01', now)).toBe(false);
  });
});
