import { describe, it, expect } from 'vitest';
import { reminderSms } from '../src/services/subscriptionReminder.service.js';

/** The renewal SMS: one segment, plain ASCII, the date and the way to renew. */
describe('the renewal reminder SMS', () => {
  const end = new Date('2026-10-12T10:00:00Z');
  const url = 'https://shop.dawai.com.bd/subscription';

  it('says when, and how to renew, inside one 160-character SMS', () => {
    const s = reminderSms('Jonni Pharmacy', 3, end, url);
    expect(s).toBe('Dawai: Jonni Pharmacy subscription ends in 3 days (12 Oct). Renew: https://shop.dawai.com.bd/subscription');
    expect(s.length).toBeLessThanOrEqual(160);
    expect(reminderSms('Jonni Pharmacy', 1, end, url)).toMatch(/ends tomorrow/);
  });

  it('keeps a Bangla shop name out, so it stays a cheap ASCII SMS', () => {
    const s = reminderSms('জনি ফার্মেসি', 7, end, url);
    expect(s).toMatch(/^Dawai: Your shop subscription ends in 7 days/);
    expect(/^[\x20-\x7E]*$/.test(s)).toBe(true);
  });
});
