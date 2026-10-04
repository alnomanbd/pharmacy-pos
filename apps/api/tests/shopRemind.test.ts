import { describe, it, expect } from 'vitest';
import { reminderText, fillReminder, REMIND_COOLDOWN_MS } from '../src/services/shopRemind.service.js';

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

describe('the shop’s own reminder wording', () => {
  it('fills in the customer, the amount, the shop and its phone', () => {
    expect(
      fillReminder('{name} bhai, {shop} e apnar baki Tk {amount}. {phone}', {
        name: 'Rahim',
        amount: 1250.5,
        shop: 'Jonni Pharmacy',
        phone: '01711000000',
      }),
    ).toBe('Rahim bhai, Jonni Pharmacy e apnar baki Tk 1250.5. 01711000000');
  });

  it('drops a blank with nothing to fill it, and the space it leaves', () => {
    expect(fillReminder('Baki Tk {amount}. Call {phone}.', { amount: 300 })).toBe('Baki Tk 300. Call.');
    expect(fillReminder('{name}, apnar baki {amount} টাকা।', { amount: 80 })).toBe(', apnar baki 80 টাকা।');
  });

  it('leaves a blank it does not know as typed, so the preview shows it', () => {
    expect(fillReminder('Bill {bill}: Tk {amount}', { amount: 5 })).toBe('Bill {bill}: Tk 5');
  });

  it('uses the shop’s wording when there is one, and the standard line when not', () => {
    expect(reminderText('Jonni', 100, '017', 'Hi {name}, Tk {amount}', 'Karim')).toBe('Hi Karim, Tk 100');
    expect(reminderText('Jonni', 100, '017', '   ', 'Karim')).toBe(reminderText('Jonni', 100, '017'));
  });
});
