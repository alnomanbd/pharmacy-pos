import { describe, it, expect } from 'vitest';
import { chargedMonths } from '../src/services/siteSettings.service.js';

describe('a year paid at once', () => {
  it('charges every month under a year', () => {
    expect(chargedMonths(1, 2)).toBe(1);
    expect(chargedMonths(6, 2)).toBe(6);
    expect(chargedMonths(11, 2)).toBe(11);
  });
  it('takes the free months off each full year', () => {
    expect(chargedMonths(12, 2)).toBe(10);
    expect(chargedMonths(18, 2)).toBe(16);
    expect(chargedMonths(24, 2)).toBe(20);
  });
  it('charges everything when the offer is off', () => {
    expect(chargedMonths(12, 0)).toBe(12);
  });
});
