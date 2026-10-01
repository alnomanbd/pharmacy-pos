import { describe, it, expect } from 'vitest';
import { reminderText, REMIND_COOLDOWN_MS } from '../src/services/shopRemind.service.js';

/**
 * A reminder is a favour asked of a customer the shop wants back.
 *
 * Which makes the text itself the whole feature: one segment so it costs one
 * charge, romanised so a feature phone renders it, and polite enough that the
 * person still walks in next week.
 */
describe('the line that chases a baki', () => {
  it('leads with the shop, because that is what says who is asking', () => {
    expect(reminderText('Bismillah Pharmacy', 1240.5)).toMatch(/^Bismillah Pharmacy: /);
  });

  it('says the figure the khata says', () => {
    expect(reminderText('Shop', 1240.5)).toContain('Tk 1240.5');
    expect(reminderText('Shop', 1240.567)).toContain('Tk 1240.57');
  });

  it('adds the shop’s number only when there is one to call', () => {
    expect(reminderText('Shop', 100, '01711000223')).toContain('Call 01711000223.');
    expect(reminderText('Shop', 100)).not.toContain('Call');
    expect(reminderText('Shop', 100, '   ')).not.toContain('Call');
  });

  it('names the shop even when the settings never did', () => {
    expect(reminderText('', 100)).toMatch(/^Your pharmacy: /);
  });

  it('stays inside one SMS segment on a long name and a big balance', () => {
    const text = reminderText('Bismillah Medicine Corner & Pharmacy', 125_000, '01711000223');
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it('carries no Bengali script, which would halve the segment', () => {
    /* UCS-2 drops an SMS to 70 characters and doubles the shop's cost, for a
       message plenty of counters' phones then render as boxes. */
    expect(/[ঀ-৿]/.test(reminderText('Shop', 500))).toBe(false);
  });

  it('will not chase the same person twice in three days', () => {
    expect(REMIND_COOLDOWN_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });
});
