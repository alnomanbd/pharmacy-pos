import type { Permission } from '../types/permissions.js';

/**
 * What a change to a shop asks of the operator making it, field by field.
 *
 * One route (`PATCH /platform/organizations/:id`) carries four authorities:
 * approving, suspending, re-pricing and extending. It used to have no check at
 * all, so anyone on the team could do all four. Each group returned is any-of,
 * and every group must be held.
 */
export function permissionsForOrgUpdate(body: {
  status?: string;
  plan?: string;
  suspendedReason?: string;
  trialDays?: number;
}): Permission[][] {
  const needs: Permission[][] = [];
  if (body.status === 'suspended' || body.suspendedReason !== undefined) needs.push(['shops.suspend']);
  // Opening a pending shop is approval; reopening a suspended one is either.
  if (body.status === 'active') needs.push(['shops.approve', 'shops.suspend']);
  if (body.status === 'pending') needs.push(['shops.approve']);
  if (body.plan !== undefined || body.trialDays !== undefined) needs.push(['shops.plan']);
  return needs;
}
