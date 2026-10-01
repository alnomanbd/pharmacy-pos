import { describe, it, expect } from 'vitest';
import { organizationUpdateSchema } from '../src/validators/organization.validator.js';

/**
 * The allow-list on what a shop may change about itself.
 *
 * `PATCH /users/organization/me` used to `$set` its request body straight onto
 * the organisation document, with no schema. `status`, `plan` and `trialEndsAt`
 * live on that same document — so a shop's own admin could
 * lift its suspension or move itself to a bigger plan by naming those fields.
 * These tests are the fence.
 */
describe('organizationUpdateSchema', () => {
  it('accepts what a shop owns', () => {
    const ok = organizationUpdateSchema.safeParse({
      name: 'Jonni Pharmacy',
      contactPhone: '01700000000',
      contactEmail: 'shop@example.com',
      address: { area: 'Satmatha', city: 'Bogura' },
      settings: { smsEnabled: false },
    });
    expect(ok.success).toBe(true);
  });

  it('refuses the platform’s own fields', () => {
    for (const forbidden of [
      { status: 'active' },
      { plan: 'enterprise' },
      { subscription: { endsAt: '2030-01-01' } },
      { accountType: 'platform' },
      { owner: '6a9741e30878b59b53b58fab' },
    ]) {
      const res = organizationUpdateSchema.safeParse(forbidden);
      expect(res.success, `${Object.keys(forbidden)[0]} was accepted`).toBe(false);
    }
  });

  it('refuses a settings key it does not know', () => {
    // Strict, not lenient: a settings page that reports "saved" while dropping
    // half of what it sent is worse than an error.
    const res = organizationUpdateSchema.safeParse({ settings: { invoicePrefix: 'X' } });
    expect(res.success).toBe(false);
  });

  it('refuses an empty request', () => {
    expect(organizationUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('allows clearing the contact email, since a shop may not have one', () => {
    expect(organizationUpdateSchema.safeParse({ contactEmail: '' }).success).toBe(true);
    expect(organizationUpdateSchema.safeParse({ contactEmail: 'not-an-email' }).success).toBe(false);
  });
});
