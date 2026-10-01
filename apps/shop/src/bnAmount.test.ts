import { describe, expect, it } from 'vitest';
import { bnAmountInWords } from './components/bnWords';

describe('an amount in Bangla words', () => {
  it('uses the word of its own for every number under a hundred', () => {
    expect(bnAmountInWords(21)).toBe('একুশ');
    expect(bnAmountInWords(99)).toBe('নিরানব্বই');
  });

  it('reads hundreds, thousands, lakhs and crores the way a counter does', () => {
    expect(bnAmountInWords(350)).toBe('তিনশত পঞ্চাশ');
    expect(bnAmountInWords(1200)).toBe('এক হাজার দুইশত');
    expect(bnAmountInWords(120350)).toBe('এক লাখ বিশ হাজার তিনশত পঞ্চাশ');
    expect(bnAmountInWords(25_000_000)).toBe('দুই কোটি পঞ্চাশ লাখ');
  });

  it('leaves the poisha off, and says nothing is zero', () => {
    expect(bnAmountInWords(38.75)).toBe('আটত্রিশ');
    expect(bnAmountInWords(0)).toBe('শূন্য');
  });
});
