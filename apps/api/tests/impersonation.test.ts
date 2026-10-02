import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { cannotViewAs, IMPERSONATION_TTL, HANDOFF_TTL_MS, STALE_LINK } from '../src/services/impersonation.service.js';
import { signAccessToken, verifyAccessToken } from '../src/utils/tokens.js';

/**
 * The support view: an operator looking through a shop's own app, read-only.
 */
describe('who can be viewed as', () => {
  const shop = { organization: 'org1', isActive: true };

  it('lets an active shop user be viewed', () => {
    for (const role of ['admin', 'pharmacist', 'salesman']) expect(cannotViewAs({ ...shop, role })).toBeNull();
  });

  it('never an operator', () => {
    expect(cannotViewAs({ ...shop, role: 'platformAdmin' })).toMatch(/Operator/);
    expect(cannotViewAs({ ...shop, role: 'platformStaff' })).toMatch(/Operator/);
  });

  it('not a deactivated account, nor one with no shop', () => {
    expect(cannotViewAs({ ...shop, role: 'admin', isActive: false })).toMatch(/deactivated/);
    expect(cannotViewAs({ role: 'admin', isActive: true, organization: null })).toMatch(/not attached/);
  });
});

describe('the session it opens', () => {
  it('carries the read-only flag and the operator, and lasts thirty minutes', () => {
    const token = signAccessToken({ sub: 'u1', org: 'o1', role: 'admin', imp: true, by: 'op1' }, IMPERSONATION_TTL);
    const payload = verifyAccessToken(token);
    expect(payload.imp).toBe(true);
    expect(payload.by).toBe('op1');
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
    expect(exp - iat).toBe(30 * 60);
  });

  it('leaves an ordinary session without the flag', () => {
    expect(verifyAccessToken(signAccessToken({ sub: 'u1', org: 'o1', role: 'admin' })).imp).toBeUndefined();
  });

  it('hands over through a code that lives a minute and says nothing about why it failed', () => {
    expect(HANDOFF_TTL_MS).toBe(60_000);
    expect(STALE_LINK).toBe('That support link is no longer valid');
  });
});
