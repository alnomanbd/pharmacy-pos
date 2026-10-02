import { describe, it, expect } from 'vitest';
import { permissionsForOrgUpdate } from '../src/services/orgUpdateAuthz.js';

describe('changing a shop needs the matching permission', () => {
  it('suspending needs shops.suspend', () => {
    expect(permissionsForOrgUpdate({ status: 'suspended', suspendedReason: 'unpaid' })).toEqual([['shops.suspend']]);
  });
  it('approving or reopening needs approve or suspend', () => {
    expect(permissionsForOrgUpdate({ status: 'active' })).toEqual([['shops.approve', 'shops.suspend']]);
  });
  it('plan and extra days need shops.plan', () => {
    expect(permissionsForOrgUpdate({ plan: 'plus' })).toEqual([['shops.plan']]);
    expect(permissionsForOrgUpdate({ trialDays: 14 })).toEqual([['shops.plan']]);
  });
  it('a change touching two things needs both', () => {
    expect(permissionsForOrgUpdate({ status: 'active', plan: 'basic' })).toEqual([
      ['shops.approve', 'shops.suspend'],
      ['shops.plan'],
    ]);
  });
});
