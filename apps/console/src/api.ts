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
  SupportMessage,
  SupportThread,
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
  /** What the shop said about itself on the sign-up form. `null`: not given. */
  signup?: ShopSignup | null;
  /** The shop's own ceilings. `null` on an axis: the plan's limit applies. */
  limitOverrides?: ShopLimitOverrides | null;
  createdAt: string;
  owner?: { name: string; email: string; phone: string; role: Role } | null;
  counts?: { users: number; bills: number; products: number };
  lastActivityAt?: string | null;
}

export interface ShopSignup {
  counters?: number | null;
  outlets?: number | null;
  licence?: string;
}

/** A number is the shop's own ceiling; `null` puts that axis back on the plan. */
export interface ShopLimitOverrides {
  terminals?: number | null;
  shopUsers?: number | null;
}

export interface SeatUsage {
  limit: number | null;
  used: number;
  full: boolean;
  /** The limit is the shop's own, not its plan's ("custom"). */
  overridden?: boolean;
  /** What the plan alone allows; "use plan default" goes back to this. */
  planLimit?: number | null;
}

/** Where a shop stands against its limits. */
export interface ShopPlanUsage {
  plan: string;
  planName: string;
  terminals: SeatUsage;
  shopUsers: SeatUsage;
}

/** A month of a shop's activity, counted from its sales. */
export interface ShopMonth {
  month: string;
  bills: number;
  takings: number;
  purchases: number;
}

/** An incident on the public status page. */
export interface IncidentRow {
  _id: string;
  title: string;
  titleBn?: string;
  body?: string;
  bodyBn?: string;
  components: string[];
  impact: 'degraded' | 'outage' | 'maintenance';
  state: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: string;
  resolvedAt: string | null;
}

/** A help article, as the console edits it. */
export interface HelpRow {
  _id: string;
  slug: string;
  category: string;
  title: string;
  titleBn?: string;
  body?: string;
  bodyBn?: string;
  videoUrl?: string;
  order?: number;
  published: boolean;
  updatedAt: string;
}

/** A field agent, with their shops and what they are owed. */
export interface AgentRow {
  _id: string;
  name: string;
  code: string;
  phone: string;
  email: string;
  area: string;
  commissionPercent: number;
  payoutNote: string;
  active: boolean;
  shops: number;
  payingShops: number;
  owed: number;
  paid: number;
}

export interface AgentCommissionRow {
  _id: string;
  organization: string | { _id: string; name: string };
  paymentAmount: number;
  percent: number;
  amount: number;
  status: 'owed' | 'paid';
  paidAt: string | null;
  payoutRef: string;
  createdAt: string;
}

export interface AgentDetail {
  agent: AgentRow;
  shops: { _id: string; name: string; status: OrgStatus; plan: string; createdAt: string }[];
  commissions: AgentCommissionRow[];
}

/** The System page: an overall verdict, each check, and the numbers behind them. */
export interface SystemStatus {
  verdict: 'ok' | 'warning' | 'critical';
  checks: { key: string; label: string; verdict: 'ok' | 'warning' | 'critical'; detail: string }[];
  api: { version: string; node: string; environment: string; startedAt: string; uptimeMs: number; memoryMb: { rss: number; heap: number } };
  database: { up: boolean; pingMs: number | null; version: string; dataSizeMb: number | null; collections: number | null };
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    lastRun: { startedAt: string; finishedAt: string | null; ok: boolean; error: string; result: unknown } | null;
    lastFailure: { startedAt: string; error: string } | null;
  };
  messages: {
    email: { provider: string; sent24h?: number; failed24h?: number; lastFailureAt?: string | null };
    sms: { provider: string; sent24h?: number; failed24h?: number; lastFailureAt?: string | null };
  };
  backup: { configured: boolean; lastAt: string | null };
  checkedAt: string;
}

/** The console's first page. `money` is null without revenue.view. */
export interface PlatformOverview {
  shops: { paying: number; onTrial: number; pending: number; suspended: number; total: number };
  signups: { thisMonth: number; lastMonth: number; byMonth: { month: string; count: number }[] };
  conversion: { signedUp: number; paid: number; rate: number | null };
  lost30d: number;
  /** Why shops said they did not renew, last 90 days, most common first. */
  leaving: { reason: string; label: string; count: number }[];
  todo: {
    pendingPayments: number;
    pendingApprovals: number;
    supportWaiting: number;
    newDemoRequests: number;
    pendingMedicineRequests: number;
    followUpsDue: number;
    renewalsDue7d: number;
  };
  money: { mrr: number; thisMonth: number; lastMonth: number; byMonth: { month: string; total: number }[] } | null;
}

/** A discount code shops type in when they pay. */
export interface CouponRow {
  _id: string;
  code: string;
  description: string;
  kind: 'percent' | 'amount';
  value: number;
  plans: string[];
  minMonths: number;
  firstPaymentOnly: boolean;
  oncePerShop: boolean;
  maxRedemptions: number | null;
  redemptions: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

/** A shop that signed up through another shop's link. */
export interface ReferralRow {
  _id: string;
  name: string;
  status: OrgStatus;
  plan: string;
  createdAt: string;
  referredBy: string | { _id: string; name: string; referralCode?: string } | null;
  referralReward?: { at: string | null; note: string } | null;
  firstPaidAt: string | null;
  rewarded: boolean;
}

/** An announcement shown across the top of the shop app. */
export interface AnnouncementRow {
  _id: string;
  title: string;
  body: string;
  titleBn: string;
  bodyBn: string;
  tone: 'info' | 'warning' | 'success';
  plans: string[];
  linkLabel: string;
  linkUrl: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  dismissible: boolean;
  createdByName: string;
  state: 'live' | 'scheduled' | 'ended' | 'off';
}

/** One email or SMS from the message log. */
export interface MessageLogRow {
  _id: string;
  channel: 'email' | 'sms';
  to: string;
  subject: string;
  /** SMS only, masked. */
  body: string;
  status: 'sent' | 'failed' | 'pending';
  /** `log` means nothing is configured and it was only written to the log. */
  provider: string;
  kind: string;
  organization: string | { _id: string; name: string } | null;
  createdAt: string;
}

/** The team's own note on a shop. */
export interface ShopNote {
  _id: string;
  organization: string | { _id: string; name: string };
  author: string;
  authorName: string;
  body: string;
  pinned: boolean;
  followUpAt: string | null;
  doneAt: string | null;
  createdAt: string;
}

/** One of the Renewals page's four piles. */
export type RetentionPile = 'trialsEnding' | 'renewalsDue' | 'lapsed' | 'inactive' | 'stuck';

/** A shop on the Renewals page. */
export interface RetentionRow {
  _id: string;
  name: string;
  plan: string;
  planName: string;
  price: number;
  trial: boolean;
  status: OrgStatus;
  endsAt: string | null;
  /** 0 is today; negative is in the past. */
  daysLeft: number | null;
  lastActivityAt: string | null;
  owner: { name: string; email: string; phone: string };
  lastManualReminder: { at: string; kind: string } | null;
  /** Getting-started steps done, of the total. */
  setup: { done: number; total: number } | null;
  /** Why it did not renew, in its own words, when it said. */
  leaving: { label: string; note: string } | null;
}

/** A shop's getting-started checklist. */
export interface ShopSetup {
  steps: { key: string; label: string; href: string; done: boolean }[];
  done: number;
  total: number;
  dismissed: boolean;
}

export type RetentionBoard = Record<RetentionPile, RetentionRow[]> & {
  windowDays: number;
  counts: Record<RetentionPile, number>;
};

/** The platform's own counts, plus the medicine requests the nav badge shows. */
export type ConsoleStats = PlatformStats & { pendingMedicineRequests?: number };

/** A company, generic or group in the shared catalogue. */
export interface CatalogueRef {
  _id: string;
  name: string;
  /** How many medicines use it. */
  count?: number;
}

export type RefKind = 'companies' | 'generics' | 'groups';

/** A row of the shared medicine catalogue every shop picks from. */
export interface CatalogueMedicine {
  _id: string;
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  packSize: string;
  price: number | null;
  dar: string;
  description?: string;
  indications?: string;
  sideEffects?: string;
  isActive: boolean;
  company: CatalogueRef | null;
  generic: CatalogueRef | null;
  group: CatalogueRef | null;
  /** How many shops stock it; only an unstocked medicine may be deleted. */
  usedByShops: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicineInput {
  brandName: string;
  genericName: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  price?: number | null;
  dar?: string;
  description?: string;
  indications?: string;
  sideEffects?: string;
  companyId?: string | null;
  genericId?: string | null;
  groupId?: string | null;
  isActive?: boolean;
}

export interface CatalogueStats {
  medicines: number;
  active: number;
  companies: number;
  generics: number;
  groups: number;
  pendingRequests: number;
}

export type MedicineRequestStatus = 'pending' | 'added' | 'rejected';

/** A shop asking for a medicine the catalogue does not have. */
export interface MedicineRequest {
  _id: string;
  organization: { _id: string; name: string } | string | null;
  requestedBy: { _id: string; name: string } | string | null;
  brandName: string;
  genericName?: string;
  companyName?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  note?: string;
  status: MedicineRequestStatus;
  medicine?: { _id: string; brandName: string; strength?: string; dosageForm?: string } | string | null;
  reviewedBy?: { _id: string; name: string } | string | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export const platformApi = {
  stats: () => getData<ConsoleStats>(api.get('/platform/stats')),
  organizations: (params?: { q?: string; status?: OrgStatus; plan?: string; page?: number; limit?: number }) =>
    getData<Paged<Shop>>(api.get('/platform/organizations', { params })),
  organization: (id: string) =>
    getData<{
      organization: Shop;
      users: User[];
      counts: { bills: number; products: number; counters: number; users: number };
      usage: ShopPlanUsage;
    }>(api.get(`/platform/organizations/${id}`)),
  /** Sets (a number) or clears (`null`) a shop's own counter / staff-login ceilings. Needs `shops.plan`. */
  updateLimits: (id: string, limitOverrides: ShopLimitOverrides) =>
    getData<{ limitOverrides: { terminals: number | null; shopUsers: number | null }; usage: ShopPlanUsage }>(
      api.patch(`/platform/organizations/${id}/limits`, { limitOverrides }),
    ),
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
  /** A one-time code for a read-only look through the shop's app, as this user. */
  impersonateShopUser: (orgId: string, userId: string) =>
    getData<{
      code: string;
      expiresInMs: number;
      viewing: {
        user: { id: string; name: string; email: string; role: Role };
        shop: { id: string; name: string; status: OrgStatus };
      };
    }>(api.post(`/platform/organizations/${orgId}/users/${userId}/impersonate`)),

  setShopUserPassword: (orgId: string, userId: string, newPassword: string, reason: string) =>
    getData<{ id: string; email: string; name: string }>(
      api.post(`/platform/organizations/${orgId}/users/${userId}/password`, { newPassword, reason }),
    ),

  /** What the signed-in operator may do, so the console can hide the rest. */
  access: () => getData<PlatformAccess>(api.get('/platform/me')),

  audit: (params?: { action?: string; actor?: string; page?: number; limit?: number }) =>
    getData<Paged<PlatformAuditEntry> & { actions: string[] }>(api.get('/platform/audit', { params })),

  overview: () => getData<PlatformOverview>(api.get('/platform/overview')),
  incidents: () => getData<IncidentRow[]>(api.get('/platform/incidents')),
  createIncident: (payload: Record<string, unknown>) => getData<IncidentRow>(api.post('/platform/incidents', payload)),
  updateIncident: (id: string, payload: Record<string, unknown>) => getData<IncidentRow>(api.patch(`/platform/incidents/${id}`, payload)),
  helpArticles: () => getData<HelpRow[]>(api.get('/platform/help')),
  createHelpArticle: (payload: Record<string, unknown>) => getData<HelpRow>(api.post('/platform/help', payload)),
  updateHelpArticle: (id: string, payload: Record<string, unknown>) => getData<HelpRow>(api.patch(`/platform/help/${id}`, payload)),
  deleteHelpArticle: (id: string) => getData<unknown>(api.delete(`/platform/help/${id}`)),
  addHelpStarters: () => getData<{ added: number }>(api.post('/platform/help/starters')),
  agents: () => getData<AgentRow[]>(api.get('/platform/agents')),
  agent: (id: string) => getData<AgentDetail>(api.get(`/platform/agents/${id}`)),
  createAgent: (payload: Record<string, unknown>) => getData<AgentRow>(api.post('/platform/agents', payload)),
  updateAgent: (id: string, payload: Record<string, unknown>) => getData<AgentRow>(api.patch(`/platform/agents/${id}`, payload)),
  payAgent: (id: string, commissionIds: string[], payoutRef: string) =>
    getData<{ marked: number; total: number }>(api.post(`/platform/agents/${id}/payout`, { commissionIds, payoutRef })),
  assignAgent: (shopId: string, code: string | null) =>
    getData<unknown>(api.patch(`/platform/organizations/${shopId}/agent`, { code })),
  system: () => getData<SystemStatus>(api.get('/platform/system')),

  coupons: () => getData<CouponRow[]>(api.get('/platform/coupons')),
  createCoupon: (payload: Record<string, unknown>) => getData<CouponRow>(api.post('/platform/coupons', payload)),
  updateCoupon: (id: string, payload: Record<string, unknown>) =>
    getData<CouponRow>(api.patch(`/platform/coupons/${id}`, payload)),
  referrals: () => getData<ReferralRow[]>(api.get('/platform/referrals')),
  markReferralRewarded: (shopId: string, note: string) =>
    getData<unknown>(api.post(`/platform/organizations/${shopId}/referral-reward`, { note })),

  announcements: () => getData<AnnouncementRow[]>(api.get('/platform/announcements')),
  createAnnouncement: (payload: Record<string, unknown>) =>
    getData<AnnouncementRow>(api.post('/platform/announcements', payload)),
  updateAnnouncement: (id: string, payload: Record<string, unknown>) =>
    getData<AnnouncementRow>(api.patch(`/platform/announcements/${id}`, payload)),
  deleteAnnouncement: (id: string) => getData<unknown>(api.delete(`/platform/announcements/${id}`)),

  /** The email and SMS log. `failed24h` is what failed in the last day. */
  messages: (params?: { q?: string; channel?: string; status?: string; organization?: string; page?: number; limit?: number }) =>
    getData<Paged<MessageLogRow> & { failed24h: number }>(api.get('/platform/messages', { params })),

  shopNotes: (shopId: string) => getData<ShopNote[]>(api.get(`/platform/organizations/${shopId}/notes`)),
  addShopNote: (shopId: string, payload: { body: string; followUpAt?: string | null; pinned?: boolean }) =>
    getData<ShopNote>(api.post(`/platform/organizations/${shopId}/notes`, payload)),
  updateShopNote: (shopId: string, noteId: string, payload: { body?: string; followUpAt?: string | null; pinned?: boolean; done?: boolean }) =>
    getData<ShopNote>(api.patch(`/platform/organizations/${shopId}/notes/${noteId}`, payload)),
  deleteShopNote: (shopId: string, noteId: string) =>
    getData<unknown>(api.delete(`/platform/organizations/${shopId}/notes/${noteId}`)),
  /** Follow-ups due by the end of today, across every shop. */
  followUps: (limit = 20) => getData<{ data: ShopNote[]; total: number }>(api.get('/platform/follow-ups', { params: { limit } })),

  /** A payment taken by hand (cash, or reported by phone): recorded and accepted at once. */
  recordPayment: (
    shopId: string,
    payload: {
      plan: string;
      months: number;
      amount: number;
      method: string;
      trxId?: string;
      senderNumber?: string;
      note?: string;
      couponCode?: string;
    },
  ) => getData<{ payment: Payment; expected: number }>(api.post(`/platform/organizations/${shopId}/payments`, payload)),

  /** Trials and paid time ending within `days`, lapsed shops, and shops gone quiet. */
  retention: (days = 7) => getData<RetentionBoard>(api.get('/platform/retention', { params: { days } })),
  /** Email (and optionally SMS) one shop's owner a renewal or come-back reminder. */
  shopSetup: (id: string) => getData<ShopSetup>(api.get(`/platform/organizations/${id}/setup`)),
  remindShop: (id: string, kind: 'renewal' | 'inactive' | 'setup', sms = false) =>
    getData<{ sent: string[]; shop: string }>(api.post(`/platform/organizations/${id}/remind`, { kind, sms })),

  /** Shops' support conversations. `waiting` is the open ones with an unread line. */
  support: (params?: { status?: string; page?: number; limit?: number }) =>
    getData<Paged<SupportThread> & { waiting: number }>(api.get('/platform/support', { params })),
  supportThread: (id: string) =>
    getData<{ thread: SupportThread; messages: SupportMessage[] }>(api.get(`/platform/support/${id}`)),
  supportReply: (id: string, body: string) =>
    getData<SupportMessage>(api.post(`/platform/support/${id}/messages`, { body })),
  supportStatus: (id: string, status: 'open' | 'closed') =>
    getData<SupportThread>(api.patch(`/platform/support/${id}/status`, { status })),

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

  /* ---------- the shared medicine catalogue ---------- */
  catalogueStats: () => getData<CatalogueStats>(api.get('/platform/catalogue/stats')),
  catalogueMedicines: (params?: {
    q?: string;
    company?: string;
    generic?: string;
    group?: string;
    dosageForm?: string;
    active?: 'true' | 'false';
    page?: number;
    limit?: number;
  }) => getData<Paged<CatalogueMedicine>>(api.get('/platform/catalogue/medicines', { params })),
  catalogueMedicine: (id: string) =>
    getData<CatalogueMedicine>(api.get(`/platform/catalogue/medicines/${id}`)),
  createMedicine: (payload: MedicineInput) =>
    getData<CatalogueMedicine>(api.post('/platform/catalogue/medicines', payload)),
  updateMedicine: (id: string, payload: Partial<MedicineInput>) =>
    getData<CatalogueMedicine>(api.patch(`/platform/catalogue/medicines/${id}`, payload)),
  /** Refused while any shop stocks it — deactivate it instead. */
  deleteMedicine: (id: string) =>
    getData<{ id: string; deleted: true }>(api.delete(`/platform/catalogue/medicines/${id}`)),
  dosageForms: () => getData<string[]>(api.get('/platform/catalogue/dosage-forms')),
  catalogueRefs: (kind: RefKind, params?: { q?: string; page?: number; limit?: number }) =>
    getData<Paged<CatalogueRef>>(api.get(`/platform/catalogue/${kind}`, { params })),
  createRef: (kind: RefKind, name: string) =>
    getData<CatalogueRef>(api.post(`/platform/catalogue/${kind}`, { name })),
  renameRef: (kind: RefKind, id: string, name: string) =>
    getData<CatalogueRef>(api.patch(`/platform/catalogue/${kind}/${id}`, { name })),
  /** Refused while any medicine uses it. */
  deleteRef: (kind: RefKind, id: string) => getData<unknown>(api.delete(`/platform/catalogue/${kind}/${id}`)),

  /* ---------- what shops asked to be added ---------- */
  medicineRequests: (params?: { status?: MedicineRequestStatus; page?: number; limit?: number }) =>
    getData<Paged<MedicineRequest>>(api.get('/platform/medicine-requests', { params })),
  /** Either link to a row already in the catalogue, or create one. */
  approveMedicineRequest: (id: string, body: { medicineId: string } | { medicine: MedicineInput }) =>
    getData<MedicineRequest>(api.post(`/platform/medicine-requests/${id}/approve`, body)),
  rejectMedicineRequest: (id: string, reason: string) =>
    getData<MedicineRequest>(api.post(`/platform/medicine-requests/${id}/reject`, { reason })),

  /** The signed-in operator's own name and phone. */
  updateMe: (payload: { name?: string; phone?: string }) =>
    getData<PlatformMember>(api.patch('/platform/me', payload)),
  /** Sets another member's password and ends their sessions. Not for yourself. */
  /** A lost phone: clears a shop user's two-factor. The reason is audited. */
  resetShopUserTwoFactor: (orgId: string, userId: string, reason: string) =>
    getData<{ id: string; email: string; name: string }>(
      api.post(`/platform/organizations/${orgId}/users/${userId}/two-factor/reset`, { reason }),
    ),
  /** A colleague's lost phone. They set it up again on their next sign-in. */
  resetTeamMemberTwoFactor: (id: string) =>
    getData<{ id: string }>(api.post(`/platform/team/${id}/two-factor/reset`)),
  setTeamMemberPassword: (id: string, newPassword: string) =>
    getData<{ id: string }>(api.post(`/platform/team/${id}/password`, { newPassword })),

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
