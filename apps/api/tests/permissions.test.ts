import { describe, it, expect } from 'vitest';
import { permissionsOf, hasPermission } from '../src/services/platformTeam.service.js';
import { PERMISSIONS, PERMISSION_PRESETS, ALL_PERMISSIONS } from '../src/types/permissions.js';

/**
 * Who on the platform team may do what.
 *
 * The whole reason permissions exist here is that the team has different jobs:
 * somebody checks payments, somebody answers support, somebody curates the
 * catalogue. None of them should be able to suspend a customer or delete a
 * shop's records because they happened to need a look at a payment.
 */
describe('permission resolution', () => {
  it('gives the owner everything, without storing a list', () => {
    // Stored, the owner's set would go stale the first time a permission is
    // added in a later version — and the one account that must never be locked
    // out of its own console would be.
    const owner = { role: 'platformAdmin', permissions: [] };
    expect(permissionsOf(owner)).toEqual(ALL_PERMISSIONS);
    expect(hasPermission(owner, 'shops.delete')).toBe(true);
    expect(hasPermission(owner, 'team.manage')).toBe(true);
  });

  it('gives staff exactly what they were granted', () => {
    const staff = { role: 'platformStaff', permissions: ['payments.view'] };
    expect(hasPermission(staff, 'payments.view')).toBe(true);
    expect(hasPermission(staff, 'payments.verify')).toBe(false);
    expect(hasPermission(staff, 'shops.delete')).toBe(false);
  });

  it('gives a shop user nothing at all', () => {
    // A shop owner is `admin`, which reads like a platform role and is
    // not one. Permissions must never leak across that line.
    for (const role of ['admin', 'pharmacist', 'salesman']) {
      expect(permissionsOf({ role, permissions: ['shops.delete'] })).toEqual([]);
    }
  });

  it('ignores a permission that is not in the catalogue', () => {
    // Stale rows and hand-edited databases both produce these; an unknown
    // string must not become an unchecked capability.
    const staff = { role: 'platformStaff', permissions: ['shops.view', 'shops.launch-missiles'] };
    expect(permissionsOf(staff)).toEqual(['shops.view']);
  });

  it('treats a missing permission list as no access', () => {
    expect(permissionsOf({ role: 'platformStaff' })).toEqual([]);
  });
});

describe('the presets', () => {
  it('only grant permissions that exist', () => {
    for (const [name, preset] of Object.entries(PERMISSION_PRESETS)) {
      for (const p of preset.permissions) {
        expect(PERMISSIONS, `${name} grants unknown permission ${p}`).toContain(p);
      }
    }
  });

  it('let support see a shop without being able to change it', () => {
    // A support agent who cannot look at a shop is useless; one who can delete
    // it is a liability.
    const support = { role: 'platformStaff', permissions: PERMISSION_PRESETS.support.permissions };
    expect(hasPermission(support, 'shops.view')).toBe(true);
    expect(hasPermission(support, 'shops.suspend')).toBe(false);
    expect(hasPermission(support, 'shops.delete')).toBe(false);
    expect(hasPermission(support, 'payments.verify')).toBe(false);
  });

  it('let support answer shops, and keep those conversations to them', () => {
    // A support thread carries whatever the shop chose to tell us — trouble
    // with a supplier, billing disputes, complaints about staff. It is not general
    // console furniture, so reading one is its own permission and the teams that
    // have no reason to be in the inbox do not get it.
    const support = { role: 'platformStaff', permissions: PERMISSION_PRESETS.support.permissions };
    expect(hasPermission(support, 'support.view')).toBe(true);
    expect(hasPermission(support, 'support.reply')).toBe(true);

    for (const team of ['billing', 'catalogue'] as const) {
      const member = { role: 'platformStaff', permissions: PERMISSION_PRESETS[team].permissions };
      expect(hasPermission(member, 'support.view'), `${team} should not read support`).toBe(false);
      expect(hasPermission(member, 'support.reply'), `${team} should not answer shops`).toBe(
        false,
      );
    }
  });

  it('let billing take money without touching the catalogue', () => {
    const billing = { role: 'platformStaff', permissions: PERMISSION_PRESETS.billing.permissions };
    expect(hasPermission(billing, 'payments.verify')).toBe(true);
    expect(hasPermission(billing, 'shops.plan')).toBe(true);
    expect(hasPermission(billing, 'formulary.manage')).toBe(false);
    expect(hasPermission(billing, 'shops.delete')).toBe(false);
  });

  it('let the catalogue team edit medicines and nothing else', () => {
    const cat = { role: 'platformStaff', permissions: PERMISSION_PRESETS.catalogue.permissions };
    expect(hasPermission(cat, 'formulary.manage')).toBe(true);
    expect(hasPermission(cat, 'requests.manage')).toBe(true);
    expect(hasPermission(cat, 'shops.view')).toBe(false);
    expect(hasPermission(cat, 'payments.verify')).toBe(false);
  });

  it('keep the dangerous four out of every preset', () => {
    // Deleting a shop, changing prices for everyone, granting access to the
    // console, and setting a customer's password are the owner's to do — a
    // preset that hands them out is how "just add them to support" becomes an
    // incident. `shops.credentials` is the sharpest of the four: it is the
    // difference between looking at a customer's account and signing in as
    // the customer for real.
    for (const [name, preset] of Object.entries(PERMISSION_PRESETS)) {
      for (const dangerous of [
        'shops.delete',
        'plans.manage',
        'team.manage',
        'shops.credentials',
      ] as const) {
        expect(preset.permissions, `${name} should not grant ${dangerous}`).not.toContain(
          dangerous,
        );
      }
    }
  });
});
