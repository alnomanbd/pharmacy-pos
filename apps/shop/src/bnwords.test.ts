import { describe, expect, it } from 'vitest';
import { bnNumerals } from './i18n/ui';

describe('bnNumerals', () => {
  it('turns the digits and the names of months and days over together', () => {
    expect(bnNumerals('Jun 2026')).toBe('জুন ২০২৬');
    expect(bnNumerals('25 Sept, 3:23 am')).toBe('২৫ সেপ্টে, ৩:২৩ এএম');
    expect(bnNumerals('Friday, 25 September 2026')).toBe('শুক্রবার, ২৫ সেপ্টেম্বর ২০২৬');
  });

  it('leaves words that only contain a month name alone', () => {
    expect(bnNumerals('Mayday Marvel')).toBe('Mayday Marvel');
  });
});
