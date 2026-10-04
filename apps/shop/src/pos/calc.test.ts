import { describe, it, expect } from 'vitest';
import { evaluate, shown, plain, opFor } from './calc';

/** The counter calculator — what a salesman types, and what it should say. */
describe('the calculator', () => {
  it('does the four sums, × and ÷ before + and −', () => {
    expect(evaluate('120×3+45')).toBe(405);
    expect(evaluate('100-20÷4')).toBe(95);
    expect(evaluate('7×8')).toBe(56);
    expect(evaluate('-5+3')).toBe(-2);
  });

  it('reads % the way a shop calculator does', () => {
    expect(evaluate('200+10%')).toBe(220);
    expect(evaluate('500-20%')).toBe(400);
    expect(evaluate('10%')).toBe(0.1);
    expect(evaluate('350×10%')).toBe(35);
  });

  it('shows the answer while the next number is still being typed', () => {
    expect(evaluate('12+')).toBe(12);
    expect(evaluate('12×')).toBe(12);
  });

  it('refuses what it cannot read, and division by nothing', () => {
    expect(evaluate('5÷0')).toBeNull();
    expect(evaluate('1.2.3')).toBeNull();
    expect(evaluate('')).toBeNull();
    expect(evaluate('abc')).toBeNull();
  });

  it('gives 0.3 for 0.1 + 0.2, as a counter would', () => {
    expect(evaluate('0.1+0.2')).toBe(0.3);
  });

  it('takes * x / for × ÷ from the keyboard', () => {
    expect(opFor('*')).toBe('×');
    expect(opFor('x')).toBe('×');
    expect(opFor('/')).toBe('÷');
    expect(opFor('a')).toBeNull();
  });

  it('prints for reading, and for the cash box', () => {
    expect(shown(1234.5)).toBe('1,234.5');
    expect(shown(2 / 3)).toBe('0.6667');
    expect(plain(1234.567)).toBe('1234.57');
  });
});
