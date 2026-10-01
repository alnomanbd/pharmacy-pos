import { describe, it, expect } from 'vitest';
import { tenantContextOf, assertTenantUsable, requireWritableTenant } from '../src/middlewares/auth.js';
import {
  PLATFORM_ROLES,
  SHOP_ROLES,
  SHOP_ADMIN_ROLES,
  OWNER_ROLES,
} from '../src/types/roles.js';

const day = 86400000;

describe('tenant context', () => {
  it('treats a shop with no status as active', () => {
    const t = tenantContextOf({ _id: 'a' });
    expect(t.status).toBe('active');
    expect(t.readOnly).toBe(false);
  });

  it('is read-only once a trial has passed', () => {
    const t = tenantContextOf({ _id: 'a', plan: 'trial', trialEndsAt: new Date(Date.now() - day) });
    expect(t.readOnly).toBe(true);
  });

  it('is not read-only while the trial is still running', () => {
    const t = tenantContextOf({ _id: 'a', plan: 'trial', trialEndsAt: new Date(Date.now() + day) });
    expect(t.readOnly).toBe(false);
  });

  it('makes a lapsed paid subscription read-only too, until it is paid', () => {
    // The date is "trialled or paid up to". A shop whose Basic month ran out
    // stops writing exactly as a lapsed trial does.
    const t = tenantContextOf({ _id: 'a', plan: 'basic', trialEndsAt: new Date(Date.now() - day) });
    expect(t.readOnly).toBe(true);
  });

  it('keeps a paid-up shop writable', () => {
    const t = tenantContextOf({ _id: 'a', plan: 'plus', trialEndsAt: new Date(Date.now() + 20 * day) });
    expect(t.readOnly).toBe(false);
  });

  it('is not read-only when no date was ever set', () => {
    expect(tenantContextOf({ _id: 'a', plan: 'trial', trialEndsAt: null }).readOnly).toBe(false);
  });
});

describe('sign-in refusals', () => {
  const ctx = (status: 'pending' | 'active' | 'suspended') =>
    ({ id: 'a', status, plan: 'basic', readOnly: false, trialEndsAt: null }) as const;

  it('lets an active shop through', () => {
    expect(() => assertTenantUsable(ctx('active'))).not.toThrow();
  });

  it('refuses a shop that has not been approved yet, and says so', () => {
    expect(() => assertTenantUsable(ctx('pending'))).toThrow(/awaiting approval/i);
  });

  it('gives the suspension reason back to the shop', () => {
    expect(() => assertTenantUsable(ctx('suspended'), 'Payment overdue')).toThrow(/Payment overdue/);
  });

  it('still refuses a suspension with no reason recorded', () => {
    expect(() => assertTenantUsable(ctx('suspended'))).toThrow(/suspended/i);
  });

  it('does not refuse an expired trial — that is read-only, not locked out', () => {
    const expired = tenantContextOf({ _id: 'a', plan: 'trial', trialEndsAt: new Date(Date.now() - day) });
    expect(() => assertTenantUsable(expired)).not.toThrow();
    expect(expired.readOnly).toBe(true);
  });
});

describe('read-only enforcement', () => {
  const run = (method: string, readOnly: boolean) => {
    let error: unknown;
    let passed = false;
    requireWritableTenant(
      { method, tenant: { id: 'a', status: 'active', plan: 'trial', readOnly, trialEndsAt: null } } as never,
      {} as never,
      ((err?: unknown) => {
        if (err) error = err;
        else passed = true;
      }) as never,
    );
    return { error, passed };
  };

  it('lets a read-only shop read its own records', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(run(method, true).passed).toBe(true);
    }
  });

  it('refuses writes from a read-only shop', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const { passed } = run(method, true);
      expect(passed).toBe(false);
    }
  });

  it('lets a normal shop write', () => {
    expect(run('POST', false).passed).toBe(true);
  });
});

describe('role sets', () => {
  it('keeps the operator apart from every shop role', () => {
    for (const set of [SHOP_ROLES, SHOP_ADMIN_ROLES, OWNER_ROLES]) {
      expect(set).not.toContain('platformAdmin');
      expect(set).not.toContain('platformStaff');
    }
    // `admin` is the shop's owner, a customer — never an operator.
    expect(PLATFORM_ROLES).not.toContain('admin');
  });

  it('keeps the salesman out of the back room', () => {
    // What a strip cost is the owner's business.
    expect(SHOP_ROLES).toContain('salesman');
    expect(SHOP_ADMIN_ROLES).not.toContain('salesman');
    expect(OWNER_ROLES).toEqual(['admin']);
  });
});
