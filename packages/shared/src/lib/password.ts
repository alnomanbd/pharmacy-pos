/**
 * The password rule, on the client side of it.
 *
 * The server has had a real policy for a while — eight characters, no
 * dictionary favourites, nothing that is one character repeated (see
 * `backend/src/validators/auth.validator.ts`). The forms did not: the signup
 * field said `minLength={6}`, so the browser happily accepted `abc123`, the
 * request went out, and the API refused it. On the registration form that
 * refusal arrived at the *end* of a multi-step flow, under a "Create account"
 * button, about a field two steps back — which is the worst place in the
 * product to discover a rule.
 *
 * This is the same rule, worded the same way, checked as somebody types. It is
 * deliberately a **mirror, not the source**: the server stays the authority
 * (a client check is a courtesy and can be bypassed), so if the two ever drift
 * the request is still refused — the point here is that it usually will not
 * have to be.
 */

/** Kept in step with `WORST` in the backend validator. */
const WORST = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'admin123',
  'welcome1',
  'iloveyou',
  'abc12345',
  'pharmacy1',
  'dawai123',
  'passw0rd',
  '11111111',
  'letmein1',
]);

export const PASSWORD_MIN = 8;

/** What the field says before anything is typed. */
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters`;

/**
 * The problem with a password, in the words the server would use, or `null`.
 *
 * Messages match the API's exactly, so a reader who does hit the server-side
 * refusal (an old tab, a scripted client) is not told two different things
 * about the same password.
 */
export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (value.length > 128) return 'That password is too long';
  if (WORST.has(value.toLowerCase())) return 'That password is too common — pick another';
  if (/^(.)\1+$/.test(value)) return 'That password is too simple — pick another';
  return null;
}

/**
 * A four-step strength read, for the meter under the field.
 *
 * Not a score out of a hundred and not an entropy estimate: those invite an
 * argument about the arithmetic and tell a person nothing they can act on. It
 * counts the things a person can *do* — make it longer, mix in a digit, a
 * capital, a symbol — and the label says which one is missing.
 */
export interface PasswordRead {
  /** 0 unusable, 1 weak, 2 fair, 3 strong. */
  score: 0 | 1 | 2 | 3;
  label: string;
  /** The one change that would help most, or null when there is nothing to add. */
  advice: string | null;
}

export function passwordStrength(value: string): PasswordRead {
  if (!value) return { score: 0, label: '', advice: null };
  if (passwordProblem(value)) {
    return { score: 0, label: 'Too weak', advice: passwordProblem(value) };
  }

  const has = {
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    digit: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
  const kinds = Object.values(has).filter(Boolean).length;
  /*
   * Length does more for a password than any character class, so the top band
   * cannot be reached on complexity alone.
   *
   * The first version of this could: `kinds === 4` scored full marks, so
   * `aB3$aB3$` (eight characters) beat `counterevening` (fourteen) — the exact
   * inversion the advice below warns against, and the unit test caught it.
   */
  const long = value.length >= 12;
  const veryLong = value.length >= 16;

  if (veryLong || (long && kinds >= 2) || (kinds === 4 && value.length >= 10)) {
    return { score: 3, label: 'Strong', advice: null };
  }
  if (long || kinds >= 3) {
    return {
      score: 2,
      label: 'Fair',
      advice: long ? 'Add a capital, a digit or a symbol to make it stronger' : 'A longer password is stronger than a complicated one',
    };
  }
  return {
    score: 1,
    label: 'Weak',
    advice: 'Longer is better — four unrelated words are easy to remember and hard to guess',
  };
}
