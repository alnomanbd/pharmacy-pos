import { describe, it, expect } from 'vitest';
import { toBangla } from './banglish';
import { BANGLA_WORDS } from './banglaWords';

/**
 * The word list, and why it is not redundant with the rules.
 *
 * Each case here is a word the rules get *wrong* — not wrong as in broken, but
 * wrong as in correctly transliterating a sound whose Bengali spelling is
 * something else. A salesman should not have to know which side of that line a
 * word falls on.
 */
describe('the Bangla word list', () => {
  it('spells the words the rules cannot reach', () => {
    // `jor` sounds like জর and is written জ্বর; `ekbar` transliterates to
    // এক্বার because adjacent consonants make a conjunct; ঔষধ is not phonetic
    // at all; and তোমাকে needs a capital `O` in the scheme.
    expect(toBangla('jor')).toBe('জ্বর');
    expect(toBangla('ekbar')).toBe('একবার');
    expect(toBangla('osudh')).toBe('ঔষধ');
    expect(toBangla('tomake')).toBe('তোমাকে');
  });

  it('accepts more than one way of spelling the same word', () => {
    // The point is that the typist does not have to guess which spelling this
    // app wanted.
    expect(toBangla('jwor')).toBe(toBangla('jor'));
    expect(toBangla('ekobar')).toBe(toBangla('ekbar'));
    expect(toBangla('bisram')).toBe(toBangla('bishram'));
    expect(toBangla('besi')).toBe(toBangla('beshi'));
  });

  it('is case-insensitive', () => {
    expect(toBangla('Jor')).toBe('জ্বর');
    expect(toBangla('JOR')).toBe('জ্বর');
  });

  it('still transliterates a word it does not carry', () => {
    // The list is a shortcut, not a gate: an unlisted word must convert rather
    // than fail.
    expect(BANGLA_WORDS['bortoman']).toBeUndefined();
    expect(toBangla('bortoman')).toBe('বর্তমান');
  });

  it('converts a phrase word by word', () => {
    // Keys are single words; the field buffers one word at a time, so a
    // sentence mixes listed and unlisted words freely.
    expect(toBangla('gorom pani khaben')).toBe('গরম পানি খাবেন');
  });

  it('carries no Latin letters in its output', () => {
    // A typo in the table would print Banglish on a customer's bill.
    for (const [key, value] of Object.entries(BANGLA_WORDS)) {
      expect(value, `${key} maps to something with Latin in it`).not.toMatch(/[A-Za-z]/);
      expect(value.trim(), `${key} maps to blank`).not.toBe('');
    }
  });

  it('has no key that is not plain lowercase Latin', () => {
    // The lookup lowercases its input, so an uppercase or Bangla key would be
    // unreachable — dead weight that looks like support.
    for (const key of Object.keys(BANGLA_WORDS)) {
      expect(key, `${key} can never be matched`).toMatch(/^[a-z]+$/);
    }
  });
});
