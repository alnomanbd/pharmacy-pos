import { describe, it, expect } from 'vitest';
import { rangeOf, __testables } from '../src/services/shopReport.service.js';

const { shiftKey, daysBetween, dayRangeInstants } = __testables;

/**
 * The comparison is the whole report.
 *
 * Every figure on the owner's page is "this against the one before", so the
 * range arithmetic is the part that can silently make the whole screen lie —
 * an off-by-one at a month end compares 30 days against 29 and reports a fall
 * in trade that never happened. It is also the only part of this service that
 * can be tested without a database, which is why it is the part that is
 * exported for tests.
 */
describe('the range an owner is shown', () => {
  it('defaults to thirty days ending today', () => {
    const r = rangeOf({ to: '2026-09-18' });
    expect(r.from).toBe('2026-08-20');
    expect(r.to).toBe('2026-09-18');
    expect(r.days).toBe(30);
  });

  it('compares against the same number of days, immediately before', () => {
    const r = rangeOf({ from: '2026-09-01', to: '2026-09-30' });
    expect(r.days).toBe(30);
    expect(r.previousTo).toBe('2026-08-31');
    expect(r.previousFrom).toBe('2026-08-02');
    /* Thirty against thirty — not September against August, which would be
       thirty against thirty-one and a fall in trade nobody had. */
    expect(daysBetween(r.previousFrom, r.previousTo)).toBe(r.days);
  });

  it('holds across a month end and a leap day', () => {
    expect(shiftKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftKey('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('reads a backwards range as the typo it is', () => {
    const r = rangeOf({ from: '2026-09-30', to: '2026-09-01' });
    expect(r.from).toBe('2026-09-01');
    expect(r.to).toBe('2026-09-30');
  });

  it('counts a single day as one day, not none', () => {
    const r = rangeOf({ from: '2026-09-18', to: '2026-09-18' });
    expect(r.days).toBe(1);
    expect(r.previousFrom).toBe('2026-09-17');
    expect(r.previousTo).toBe('2026-09-17');
  });

  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(() => rangeOf({ from: '2026-02-30', to: '2026-03-01' })).toThrow();
    expect(() => rangeOf({ from: '2026-13-01', to: '2026-13-02' })).toThrow();
  });

  it('bounds a day as one wall-clock day in the app timezone', () => {
    /* Deliveries carry real instants, not day keys, so goods-in has to resolve
       a day key to the instants that day "is", in the shop's own timezone. A
       day that came out shorter or longer than twenty-four hours would be
       filing deliveries on the wrong date entirely. */
    const { start, end } = dayRangeInstants('2026-09-18', '2026-09-18');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('bounds a whole range without a gap or an overlap', () => {
    const { start, end } = dayRangeInstants('2026-09-01', '2026-09-30');
    const oneDay = { start: dayRangeInstants('2026-09-01', '2026-09-01').start, end: dayRangeInstants('2026-09-30', '2026-09-30').end };
    expect(start.getTime()).toBe(oneDay.start.getTime());
    expect(end.getTime()).toBe(oneDay.end.getTime());
  });
});
