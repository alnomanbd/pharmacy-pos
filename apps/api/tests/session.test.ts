import { describe, it, expect } from 'vitest';
import { ttlToMs, REFRESH_COOKIE } from '../src/utils/cookies.js';
import { lockDurationFor } from '../src/services/auth.service.js';

/**
 * The two numbers behind the session change: how long the refresh cookie lives,
 * and how long an account stops answering after repeated failures.
 *
 * Both are the kind of arithmetic that is obviously right until it is quietly
 * wrong — a cookie that outlives its token leaves the browser sending something
 * the server already refuses, and a lock that grows the wrong way either locks
 * an owner out of their own shop or lets a word list through.
 */
describe('the refresh cookie lifetime', () => {
  it('matches the token TTL it is given, in every unit', () => {
    expect(ttlToMs('30s')).toBe(30_000);
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('12h')).toBe(43_200_000);
    expect(ttlToMs('7d')).toBe(604_800_000);
  });

  it('tolerates the spacing a hand-edited .env picks up', () => {
    expect(ttlToMs(' 7d ')).toBe(604_800_000);
    expect(ttlToMs('7 d')).toBe(604_800_000);
  });

  /*
   * A malformed JWT_REFRESH_EXPIRES must not produce `NaN`, which Express turns
   * into a session cookie — one that disappears when the browser closes, so
   * every salesman is signed out overnight and nobody can say why.
   */
  it('falls back to a week rather than to NaN', () => {
    expect(ttlToMs('')).toBe(604_800_000);
    expect(ttlToMs('soon')).toBe(604_800_000);
    expect(ttlToMs('7 weeks')).toBe(604_800_000);
  });

  it('keeps the cookie name stable, since clearing it has to match', () => {
    expect(REFRESH_COOKIE).toBe('dawai_refresh');
  });
});

describe('the account lockout', () => {
  it('costs a minute at the threshold and doubles from there', () => {
    expect(lockDurationFor(5)).toBe(60_000);
    expect(lockDurationFor(6)).toBe(120_000);
    expect(lockDurationFor(7)).toBe(240_000);
    expect(lockDurationFor(8)).toBe(480_000);
  });

  it('stops doubling at half an hour', () => {
    expect(lockDurationFor(12)).toBe(30 * 60_000);
    expect(lockDurationFor(40)).toBe(30 * 60_000);
    // Not Infinity, and not a number so large it never expires.
    expect(Number.isFinite(lockDurationFor(1000))).toBe(true);
  });

  /*
   * Below the threshold nothing is locked at all — the caller does not consult
   * this — but the arithmetic still has to stay on the first step rather than
   * going negative and producing a lock that has already expired.
   */
  it('never returns less than the first step', () => {
    expect(lockDurationFor(1)).toBe(60_000);
    expect(lockDurationFor(4)).toBe(60_000);
    expect(lockDurationFor(0)).toBe(60_000);
  });
});
