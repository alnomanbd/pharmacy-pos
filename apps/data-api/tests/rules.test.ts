import { describe, expect, it } from 'vitest';
import { addMonths, monthRange, thisMonth } from '../src/lib/months.js';
import { hashKey, keyFrom, newKey, sameSecret } from '../src/lib/keys.js';
import { cellStages } from '../src/services/demand.js';
import { HttpError } from '../src/lib/http.js';

const NOW = new Date('2026-10-03T10:00:00Z');

describe('months', () => {
  it('counts in Dhaka time and steps across years', () => {
    expect(thisMonth(new Date('2026-09-30T19:00:00Z'))).toBe('2026-10');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-11', 3)).toBe('2026-02');
  });

  it('defaults to the last three whole months, with the same length before', () => {
    const r = monthRange({}, 12, NOW);
    expect(r).toMatchObject({ from: '2026-07', to: '2026-09', prevFrom: '2026-04', prevTo: '2026-06', partial: false });
    expect(r.months).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('takes whole months only, so no two ranges differ by a day', () => {
    expect(() => monthRange({ from: '2026-09-01', to: '2026-09' }, 12, NOW)).toThrow(HttpError);
    expect(() => monthRange({ from: '2026-09', to: '2026-08' }, 12, NOW)).toThrow(HttpError);
    expect(() => monthRange({ to: '2026-11' }, 12, NOW)).toThrow(HttpError);
  });

  it('reaches back only as far as the plan', () => {
    expect(monthRange({ from: '2025-10', to: '2025-12' }, 12, NOW).from).toBe('2025-10');
    expect(() => monthRange({ from: '2025-09', to: '2025-12' }, 12, NOW)).toThrow(/reaches back to 2025-10/);
  });

  it('marks this month partial', () => {
    expect(monthRange({ from: '2026-10', to: '2026-10' }, 12, NOW).partial).toBe(true);
  });
});

describe('keys', () => {
  it('is long, random and kept only as a hash', () => {
    const a = newKey();
    const b = newKey();
    expect(a.key).toMatch(/^dwk_[A-Za-z0-9]{40}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashKey(a.key));
    expect(a.hash).not.toContain(a.key.slice(4));
    expect(a.prefix).toBe(a.key.slice(0, 12));
  });

  it('is read from a bearer header or X-API-Key, and nothing malformed', () => {
    const { key } = newKey();
    expect(keyFrom({ authorization: `Bearer ${key}` })).toBe(key);
    expect(keyFrom({ 'x-api-key': key })).toBe(key);
    expect(keyFrom({ authorization: 'Bearer dwk_short' })).toBeNull();
    expect(keyFrom({})).toBeNull();
  });

  it('compares admin secrets in full', () => {
    expect(sameSecret('a'.repeat(40), 'a'.repeat(40))).toBe(true);
    expect(sameSecret('a'.repeat(40), 'a'.repeat(39))).toBe(false);
    expect(sameSecret('a'.repeat(40), 'b'.repeat(40))).toBe(false);
  });
});

describe('the five-shop rule', () => {
  it('drops every cell under it before anything is added up', () => {
    const stages = cellStages(['2026-09'], { district: 'Bogura' }, 5);
    expect(stages[0]).toEqual({ $match: { month: { $in: ['2026-09'] }, district: 'Bogura' } });
    // Cells are one medicine, one district, one month…
    expect((stages[1] as { $group: { _id: unknown } }).$group._id).toEqual({ month: '$month', medicine: '$medicine', district: '$district' });
    // …joined to how many shops sold it there that month, and kept only at five or more.
    expect(stages[3]).toEqual({ $match: { 'cover.0.shops': { $gte: 5 } } });
  });

  it('never counts the country from its own row, only from the districts that pass', () => {
    const lookup = cellStages(['2026-09'], {}, 5)[2] as { $lookup: { pipeline: { $match: { $expr: { $and: unknown[] } } }[] } };
    expect(lookup.$lookup.pipeline[0].$match.$expr.$and).toContainEqual({ $eq: ['$district', '$$d'] });
    expect(JSON.stringify(cellStages(['2026-09'], {}, 5))).not.toContain('"*"');
  });
});
