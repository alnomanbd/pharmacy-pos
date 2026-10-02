import { describe, it, expect } from 'vitest';
import { needsTwoFactorSetup } from '../src/middlewares/auth.js';
import { PLATFORM_ROLES, SHOP_ROLES } from '../src/types/roles.js';

/**
 * Two-factor is required of operator accounts, and of nobody else.
 *
 * These accounts can suspend a shop, export any shop's data, and
 * change what every customer pays. The rule is enforced in `requireAuth` rather
 * than per route, so an endpoint added to the console next month is covered
 * without anyone remembering to cover it — and the part worth testing is the
 * exemption list, since getting it wrong in either direction either leaves a
 * hole or locks an operator out of the screen that would let them back in.
 */
describe('who has to enrol', () => {
  it('stops every operator role that has not enrolled', () => {
    for (const role of PLATFORM_ROLES) {
      expect(needsTwoFactorSetup(role, false, '/api/platform/organizations', true)).toBe(true);
    }
  });

  it('lets an operator who has enrolled through', () => {
    for (const role of PLATFORM_ROLES) {
      expect(needsTwoFactorSetup(role, true, '/api/platform/organizations')).toBe(false);
    }
  });

  /*
   * A shop may turn two-factor on and most will not. Requiring it of a
   * salesman at a counter with one shared phone would stop the product
   * being usable, and a shop account cannot reach another shop's data.
   */
  it('never blocks a shop role', () => {
    for (const role of SHOP_ROLES) {
      expect(needsTwoFactorSetup(role, false, '/api/till/bills')).toBe(false);
      expect(needsTwoFactorSetup(role, false, '/api/shop/products')).toBe(false);
    }
  });
});

describe('the way out', () => {
  /*
   * As `requireAuth` actually sees them: `req.baseUrl + req.path`, so a
   * `GET /api/two-factor` arrives as `/api/two-factor/`. Matching the front of
   * the string was the bug — the gate refused the very call that lets an
   * operator enrol, and the enrolment screen came up empty.
   */
  const paths = [
    '/api/two-factor/',
    '/api/two-factor/setup',
    '/api/two-factor/confirm',
    '/api/two-factor/disable',
    '/api/auth/me',
    '/api/auth/logout',
  ];

  it('leaves enrolment itself reachable, or nobody could ever enrol', () => {
    for (const path of paths) {
      expect(needsTwoFactorSetup('platformAdmin', false, path)).toBe(false);
    }
  });

  it('leaves changing your own password reachable', () => {
    expect(needsTwoFactorSetup('platformAdmin', false, '/api/auth/change-password')).toBe(false);
  });

  /*
   * The exemption is for enrolment, not for anything whose path merely starts
   * the same way. `/two-factorish` is not a real route, but the test pins the
   * shape of the check rather than trusting that it never will be.
   */
  it('does not exempt the rest of the console', () => {
    for (const path of [
      '/api/platform/stats',
      '/api/platform/payments',
      '/api/formulary/refs/group',
      '/api/users',
    ]) {
      expect(needsTwoFactorSetup('platformStaff', false, path, true)).toBe(true);
    }
  });
  it('asks nothing of an operator when the deployment makes it optional', () => {
    expect(needsTwoFactorSetup('platformAdmin', false, '/api/platform/organizations', false)).toBe(false);
    expect(needsTwoFactorSetup('platformStaff', false, '/api/platform/organizations', false)).toBe(false);
  });
});
