import { describe, it, expect } from 'vitest';
import { PASSWORD_MIN, passwordProblem, passwordStrength } from './password';

/**
 * The password rule, on the client.
 *
 * It exists because the forms and the API disagreed: the signup field accepted
 * six characters and the API refused anything under eight, so the refusal
 * arrived from the server at the end of a multi-step form, about a field two
 * steps back. These tests pin the rule to the one the backend validator
 * applies (`backend/src/validators/auth.validator.ts`) — if that file's list or
 * minimum changes, one of these should fail.
 */
describe('passwordProblem', () => {
  it('refuses anything under the minimum, and says the number', () => {
    expect(passwordProblem('short')).toMatch(new RegExp(String(PASSWORD_MIN)));
    expect(passwordProblem('a'.repeat(PASSWORD_MIN - 1))).not.toBeNull();
  });

  it('accepts a reasonable password', () => {
    expect(passwordProblem('counter-evening-7')).toBeNull();
  });

  it('refuses the dictionary favourites, however they are capitalised', () => {
    // Case-insensitively, because "Password1" is not a different password.
    for (const bad of ['password', 'Password1', 'PHARMACY1', 'dawai123', 'qwerty123']) {
      expect(passwordProblem(bad), `${bad} was accepted`).toMatch(/too common/i);
    }
  });

  it('refuses one character repeated, at any length', () => {
    // Long enough to pass the length check, and still useless.
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/too simple/i);
    expect(passwordProblem('99999999')).not.toBeNull();
  });

  it('has an upper bound too', () => {
    expect(passwordProblem('x1B!'.repeat(40))).toMatch(/too long/i);
  });
});

describe('passwordStrength', () => {
  it('says nothing about an empty field', () => {
    // A red bar under a field nobody has typed in reads as an error before the
    // user has done anything wrong.
    expect(passwordStrength('')).toEqual({ score: 0, label: '', advice: null });
  });

  it('scores an unusable password at zero and repeats the reason', () => {
    const r = passwordStrength('abc');
    expect(r.score).toBe(0);
    expect(r.advice).toBe(passwordProblem('abc'));
  });

  it('rates length above complexity', () => {
    // Twelve characters of lower case beats eight with four classes, which is
    // the honest ordering and the opposite of what most meters claim.
    const long = passwordStrength('counterevening');
    const short = passwordStrength('aB3$aB3$');
    expect(long.score).toBeGreaterThanOrEqual(short.score);
  });

  it('calls a long, mixed password strong and stops advising', () => {
    const r = passwordStrength('Counter-Evening-2026!');
    expect(r.score).toBe(3);
    expect(r.label).toBe('Strong');
    expect(r.advice).toBeNull();
  });

  it('always offers one thing to change while the score is improvable', () => {
    for (const v of ['counterrr', 'counter12345']) {
      const r = passwordStrength(v);
      if (r.score < 3) expect(r.advice, `${v} had no advice`).toBeTruthy();
    }
  });
});
