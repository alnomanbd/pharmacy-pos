import { describe, it, expect } from 'vitest';
import { slugify, SLUG_RX, STARTERS, HELP_CATEGORIES } from '../src/services/help.service.js';

/** Help articles: their addresses, and the starter set. */
describe('help articles', () => {
  it('makes a readable address from a title', () => {
    expect(slugify('Add the medicines you sell!')).toBe('add-the-medicines-you-sell');
    expect(SLUG_RX.test('add-medicines')).toBe(true);
    expect(SLUG_RX.test('Add Medicines')).toBe(false);
  });

  it('ships starters with an address, a category, and both languages', () => {
    expect(STARTERS.length).toBe(8);
    const slugs = new Set(STARTERS.map((s) => s.slug));
    expect(slugs.size).toBe(STARTERS.length);
    for (const s of STARTERS) {
      expect(SLUG_RX.test(s.slug!)).toBe(true);
      expect(HELP_CATEGORIES).toContain(s.category);
      expect(s.titleBn && s.bodyBn && s.body).toBeTruthy();
    }
  });
});
