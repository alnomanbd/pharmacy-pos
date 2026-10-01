import { describe, it, expect } from 'vitest';
import {
  memberEditBlock,
  memberPasswordBlock,
  memberView,
} from '../src/services/platformTeam.service.js';
import { teamPasswordSchema } from '../src/validators/auth.validator.js';

/**
 * Editing the console's own people.
 *
 * Correcting a colleague's name or phone is clerical. Their access, and the
 * owner's account, are not — those are where a slip becomes an incident.
 */
const owner = { id: 'o1', role: 'platformAdmin' };
const owner2 = { id: 'o2', role: 'platformAdmin' };
const lead = { id: 's1', role: 'platformStaff' };
const clerk = { id: 's2', role: 'platformStaff' };

describe('who may edit whom', () => {
  it('lets anyone on the team correct a colleague’s details', () => {
    expect(memberEditBlock(lead, clerk, { name: 'Rahim', email: 'r@x.com', phone: '01700000000' })).toBeNull();
  });

  it('lets you correct your own details, not your own access', () => {
    expect(memberEditBlock(lead, lead, { phone: '01700000000' })).toBeNull();
    expect(memberEditBlock(lead, lead, { permissions: ['shops.view'] })).toBe('You cannot change your own access');
    expect(memberEditBlock(lead, lead, { isActive: false })).toBe('You cannot change your own access');
  });

  it('lets only an owner touch an owner’s details', () => {
    expect(memberEditBlock(owner, owner2, { name: 'Noman' })).toBeNull();
    expect(memberEditBlock(lead, owner, { email: 'me@x.com' })).toMatch(/Only an owner/);
  });

  it('never lets an owner’s access be changed here', () => {
    expect(memberEditBlock(owner2, owner, { isActive: false })).toMatch(/owner’s access/);
    expect(memberEditBlock(owner2, owner, { permissions: ['shops.view'] })).toMatch(/owner’s access/);
  });
});

describe('setting a colleague’s password', () => {
  it('is for somebody else', () => {
    expect(memberPasswordBlock(lead, lead)).toMatch(/Change password/);
    expect(memberPasswordBlock(lead, clerk)).toBeNull();
  });

  it('is not a way for staff to become the owner', () => {
    expect(memberPasswordBlock(lead, owner)).toMatch(/Only an owner/);
    expect(memberPasswordBlock(owner2, owner)).toBeNull();
  });

  it('holds to the same strength rule as every other password', () => {
    expect(teamPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
    expect(teamPasswordSchema.safeParse({ newPassword: 'password1' }).success).toBe(false);
    expect(teamPasswordSchema.safeParse({ newPassword: 'Ledger-Mitford-42' }).success).toBe(true);
  });
});

describe('a member as the console reads one', () => {
  it('shows the placeholder phone as blank and a real one as itself', () => {
    expect(memberView({ _id: 'a', role: 'platformStaff', phone: 'platform-1727000000000' }).phone).toBe('');
    expect(memberView({ _id: 'a', role: 'platformStaff', phone: '01711000000' }).phone).toBe('01711000000');
  });

  it('fills in the owner’s permissions rather than reading them', () => {
    const v = memberView({ _id: 'a', role: 'platformAdmin', permissions: [] });
    expect(v.isOwner).toBe(true);
    expect(v.permissions).toContain('catalogue.manage');
  });
});
