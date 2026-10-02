import { describe, it, expect } from 'vitest';
import { endOfDay } from '../src/services/shopNote.service.js';

/** A follow-up "for today" is due all day, not from the minute it was set for. */
describe('when a follow-up is due', () => {
  it('runs to the last millisecond of the day', () => {
    const e = endOfDay(new Date(2026, 9, 2, 9, 0, 0));
    expect([e.getFullYear(), e.getMonth(), e.getDate(), e.getHours(), e.getMinutes(), e.getSeconds(), e.getMilliseconds()]).toEqual([2026, 9, 2, 23, 59, 59, 999]);
  });

  it('does not move the day it was given', () => {
    const d = new Date(2026, 9, 2, 23, 30);
    expect(endOfDay(d).getDate()).toBe(2);
    expect(d.getHours()).toBe(23);
  });
});
