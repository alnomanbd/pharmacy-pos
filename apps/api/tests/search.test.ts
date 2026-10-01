import { describe, it, expect } from 'vitest';
import { escapeRegex, prefixRegex, containsRegex } from '../src/utils/search.js';

describe('search term escaping', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeRegex('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o',
    );
  });

  it('does not throw on terms that used to crash the medicine search', () => {
    // "Vitamin (" or a lone "[" reached new RegExp() unescaped and threw a
    // SyntaxError, surfacing as a 500 on a plain keystroke.
    for (const term of ['Vitamin (', '[', '*', '\\', 'a)b', '+++']) {
      expect(() => containsRegex(term)).not.toThrow();
      expect(() => prefixRegex(term)).not.toThrow();
    }
  });

  it('matches parentheses literally rather than as a group', () => {
    const rx = containsRegex('Vitamin (B)');
    expect(rx.test('Neuro-B Vitamin (B) Complex')).toBe(true);
    expect(rx.test('Vitamin B')).toBe(false);
  });

  it('treats a dot as a dot, not a wildcard', () => {
    const rx = containsRegex('B.12');
    expect(rx.test('Vitamin B.12')).toBe(true);
    expect(rx.test('Vitamin B012')).toBe(false);
  });

  it('anchors prefix matches and ignores surrounding whitespace', () => {
    const rx = prefixRegex('  napa ');
    expect(rx.test('Napa Extra')).toBe(true);
    expect(rx.test('Renapa')).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(prefixRegex('NAPA').test('napa extend')).toBe(true);
    expect(containsRegex('cetamol').test('Paracetamol')).toBe(true);
  });

  it('does not let a term inject an alternation into the pattern', () => {
    const rx = prefixRegex('napa|zimax');
    expect(rx.test('Zimax 500')).toBe(false);
    expect(rx.test('napa|zimax combo')).toBe(true);
  });
});
