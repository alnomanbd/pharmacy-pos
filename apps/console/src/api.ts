/**
 * What the Dawai operator console calls — the endpoints that look across every
 * shop. Nothing that ships to a shop carries their shape.
 */
import api, { getData } from '@dawai/shared/api/client';
import type {
  Lead,
  LeadStatus,
  OrgStatus,
  Paged,
  Payment,
  PermissionPreset,
  PlatformAccess,
  PlatformAuditEntry,
  PlatformMember,
  PlatformRevenue,
  PlatformStats,
  RevenueGranularity,
  Role,
  User,
} from '@dawai/shared/types';

export { fileObjectUrl, downloadBlob, twoFactorApi } from '@dawai/shared/api';
export type { Paged } from '@dawai/shared/types';

/** What a plan allows. `null` is unlimited. */
export interface ShopPlanLimits {
  outlets: number | null;
  terminals: number | null;
  shopUsers: number | null;
}

/** A plan in the catalogue — Trial, Basic, Plus. */
export interface ShopPlan {
  id: string;
  key: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  limits: ShopPlanLimits;
  isTrial: boolean;
  trialDays: number;
  isActive: boolean;
  sortOrder: number;
}

/** A shop, as the list and the detail page show it. */
export interface Shop {
  _id: string;
  name: string;
  status: OrgStatus;
  plan: string;
  intendedPlan?: string;
  /** The date the shop is trialled or paid up to; past it, it is read-only. */
  trialEndsAt?: string | null;
  suspendedReason?: string;
  approvedAt?: string | null;
  contactPhone?: string;
  contactEmail?: string;
  address?: Record<string, string>;
  acquisition?: { channel?: string; campaign?: string; agentCode?: string };
  createdAt: string;
  owner?: { name: string; email: string; phone: string; role: Role } | null;
  counts?: { users: number; bills: number; products: number };
  lastActivityAt?: string | null;
}

export interface SeatUsage {
  limit: number | null;
  used: number;
  full: boolean;
}

/** A month of a shop's activity, counted from its sales. */
export interface ShopMonth {
  month: string;
  bills: number;
  takings: number;
  purchases: number;
}

export const platformApi = {
  stats: () => getData<PlatformStats>(api.get('/platform/stats')),
  organizations: (params?: { q?: string; status?: OrgStatus; plan?: string; page?: number; limit?: number }) =>
    getData<Paged<Shop>>(api.get('/platform/organizations', { params })),
  organization: (id: string) =>
    getData<{
      organization: Shop;
      users: User[];
      counts: { bills: number; products: number; counters: number; users: number };
      usage: { plan: string; planName: string; terminals: SeatUsage; shopUsers: SeatUsage };
    }>(api.get(`/platform/organizations/${id}`)),
  updateOrganization: (
    id: string,
    payload: { status?: OrgStatus; plan?: string; suspendedReason?: string; trialDays?: number },
  ) => getData<Shop>(api.patch(`/platform/organizations/${id}`, payload)),

  payments: (params?: { status?: string; page?: number; limit?: number }) =>
    getData<Paged<Payment>>(api.get('/platform/payments', { params })),
  /** Our own sales: verified subscription payments, bucketed over a range. */
  revenue: (params?: { from?: string; to?: string; granularity?: RevenueGranularity }) =>
    getData<PlatformRevenue>(api.get('/platform/revenue', { params })),
  verifyPayment: (id: string) => getData<unknown>(api.post(`/platform/payments/${id}/verify`)),
  rejectPayment: (id: string, reason?: string) =>
    getData<unknown>(api.post(`/platform/payments/${id}/reject`, { reason })),
  /** The same receipt the shop can download — operators get asked for it. */
  paymentInvoice: (id: string) =>
    api.get(`/platform/payments/${id}/invoice`, { responseType: 'blob' }).then((r) => r.data as Blob),

  /**
   * Opens a shop for an owner who asked over the phone — the commonest way this
   * is sold. Created active and on a trial; the operator sets the password and
   * reads it out.
   */
  createShop: (payload: {
    organizationName: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    plan?: string;
    trialDays?: number;
  }) =>
    getData<{ id: string; name: string; owner: { id: string; name: string; email: string }; trialEndsAt: string | null }>(
      api.post('/platform/organizations', payload),
    ),

  /** A shop's own details, corrected on its behalf. */
  updateShopProfile: (
    id: string,
    payload: { name?: string; contactPhone?: string; contactEmail?: string; address?: Record<string, string> },
  ) => getData<Shop>(api.patch(`/platform/organizations/${id}/profile`, payload)),

  updateShopUser: (
    orgId: string,
    userId: string,
    payload: { name?: string; email?: string; phone?: string; isActive?: boolean },
  ) =>
    getData<{ id: string; name: string; email: string; phone: string; role: Role }>(
      api.patch(`/platform/organizations/${orgId}/users/${userId}`, payload),
    ),

  /**
   * Sets a shop user's password. The reason is kept in the audit trail, the
   * user is emailed, and their sessions all end.
   */
  setShopUserPassword: (orgId: string, userId: string, newPassword: string, reason: string) =>
    getData<{ id: string; email: string; name: string }>(
      api.post(`/platform/organizations/${orgId}/users/${userId}/password`, { newPassword, reason }),
    ),

  /** What the signed-in operator may do, so the console can hide the rest. */
  access: () => getData<PlatformAccess>(api.get('/platform/me')),

  audit: (params?: { action?: string; actor?: string; page?: number; limit?: number }) =>
    getData<Paged<PlatformAuditEntry> & { actions: string[] }>(api.get('/platform/audit', { params })),

  /** Enquiries from the marketing site. `waiting` is the unanswered count. */
  leads: (params?: { status?: string; q?: string; page?: number; limit?: number }) =>
    getData<Paged<Lead> & { waiting: number }>(api.get('/platform/leads', { params })),
  updateLead: (
    id: string,
    payload: {
      status?: LeadStatus;
      note?: string;
      owner?: string | null;
      nextFollowUpAt?: string | null;
      addNote?: string;
      lostReason?: string;
    },
  ) => getData<Lead>(api.patch(`/platform/leads/${id}`, payload)),

  team: () => getData<PlatformMember[]>(api.get('/platform/team')),
  teamPermissions: () =>
    getData<{ permissions: string[]; presets: PermissionPreset[] }>(api.get('/platform/team/permissions')),
  addTeamMember: (payload: Record<string, unknown>) =>
    getData<{ id: string; email: string; permissions: string[] }>(api.post('/platform/team', payload)),
  updateTeamMember: (id: string, payload: Record<string, unknown>) =>
    getData<unknown>(api.patch(`/platform/team/${id}`, payload)),
  removeTeamMember: (id: string) => getData<unknown>(api.delete(`/platform/team/${id}`)),

  /** The plan catalogue. Editing here changes what shops are held to. */
  plans: () => getData<ShopPlan[]>(api.get('/platform/plans')),
  createPlan: (payload: Record<string, unknown>) => getData<ShopPlan>(api.post('/platform/plans', payload)),
  updatePlan: (id: string, payload: Record<string, unknown>) =>
    getData<ShopPlan>(api.patch(`/platform/plans/${id}`, payload)),
  retirePlan: (id: string) => getData<ShopPlan>(api.post(`/platform/plans/${id}/retire`)),

  usage: (id: string, months = 6) =>
    getData<ShopMonth[]>(api.get(`/platform/organizations/${id}/usage`, { params: { months } })),
  platformUsage: (months = 6) =>
    getData<{
      months: number;
      billsByMonth: { month: string; bills: number }[];
      topShops: { id: string; name: string; bills: number }[];
    }>(api.get('/platform/usage', { params: { months } })),
  exportOrganization: (id: string) =>
    api.get(`/platform/organizations/${id}/export`, { responseType: 'blob' }).then((r) => r.data as Blob),
  /** Permanent. `confirm` must be the shop's name, typed back. */
  deleteOrganization: (id: string, confirm: string) =>
    getData<{ name: string; deleted: Record<string, number> }>(
      api.delete(`/platform/organizations/${id}`, { data: { confirm } }),
    ),
};
