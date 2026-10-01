import { describe, it, expect } from 'vitest';
import { toLocalDate, todayLocal, fromLocalDate } from './date';

/**
 * The bug these exist to prevent, spelled out: `toISOString()` reports the UTC
 * date, so in Dhaka (UTC+6) every hour before 6am resolves to *yesterday*. A
 * day's sales opened at 2am would ask the API for the previous day's bills and
 * show an empty till — the kind of failure that is invisible in a test suite
 * written at midday and obvious to the salesman on the night shift.
 */
describe('calendar dates are local, never UTC', () => {
  it('reports the local day, not the UTC one, for an early-morning instant', () => {
    // 02:30 local. In any timezone ahead of UTC this is the previous day in UTC.
    const early = new Date(2026, 8, 2, 2, 30);
    expect(toLocalDate(early)).toBe('2026-09-02');
    // The exact assertion that would fail if anyone reached for toISOString.
    if (early.getTimezoneOffset() < 0) {
      expect(early.toISOString().slice(0, 10)).toBe('2026-09-01');
    }
  });

  it('reports the local day for a late-evening instant', () => {
    // 23:30 local — the previous trap, in the other direction, for a timezone
    // behind UTC.
    const late = new Date(2026, 8, 2, 23, 30);
    expect(toLocalDate(late)).toBe('2026-09-02');
  });

  it('zero-pads month and day', () => {
    expect(toLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('todayLocal agrees with toLocalDate for now', () => {
    expect(todayLocal()).toBe(toLocalDate(new Date()));
  });

  it('round-trips a date string through local midnight', () => {
    const value = '2026-09-02';
    const parsed = fromLocalDate(value);
    expect(toLocalDate(parsed)).toBe(value);
    expect(parsed.getHours()).toBe(0);
    // The weekday the UI prints comes off this, so an off-by-one date here
    // shifts a whole day of the report.
    expect(parsed.getDate()).toBe(2);
    expect(parsed.getMonth()).toBe(8);
  });
});
