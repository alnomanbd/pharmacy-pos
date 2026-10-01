import { describe, it, expect } from 'vitest';
import { bdMobile } from '../src/utils/phone.js';

/**
 * The customer's phone is how the till knows them next time and where the
 * reminder goes, so a wrong one is worse than none.
 */
describe('a Bangladeshi mobile number', () => {
  it('takes the forms a counter actually types, and stores one', () => {
    for (const typed of ['01711223344', '+8801711223344', '8801711223344', '017-1122 3344']) {
      expect(bdMobile(typed)).toBe('01711223344');
    }
  });

  it('refuses a number with too many digits', () => {
    expect(bdMobile('018274634678234')).toBeNull();
  });

  it('refuses one too short, a landline and an operator that does not exist', () => {
    expect(bdMobile('0171122334')).toBeNull();
    expect(bdMobile('029123456')).toBeNull();
    expect(bdMobile('01211223344')).toBeNull();
  });

  it('refuses letters rather than stripping them', () => {
    expect(bdMobile('0171122334x4')).toBeNull();
    expect(bdMobile('')).toBeNull();
  });
});
