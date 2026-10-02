/**
 * What the API answers with.
 *
 * One copy, imported by both browser apps. Two copies is how the shop app and
 * the operator console come to believe different things about the same
 * endpoint, and the disagreement only ever shows up in production.
 *
 * Conventions, all of them consequences of this being the wire format rather
 * than the database:
 *
 * - `_id` is a string. Mongo hands out ObjectIds; JSON does not have them.
 * - Dates are ISO strings. Nothing here has been through `new Date()` yet.
 * - A reference is `string` when the endpoint left it alone and the populated
 *   shape when it filled it in, so those read as `string | Something`.
 */

/* -------------------------------- enums ---------------------------------- */
/* Kept in step with apps/api/src/types/enums.ts by hand. They are unions of
 * string literals on both sides, so a value the server stops accepting becomes
 * a type error here rather than a runtime surprise. */

export type Role =
  | 'platformAdmin'
  | 'platformStaff'
  /* The shop's three. The owner is `admin`; a pharmacist runs the counter and
     the stock; a salesman sells and never sees a purchase price. */
  | 'admin'
  | 'pharmacist'
  | 'salesman';
export type OrgStatus = 'pending' | 'active' | 'suspended';
/**
 * Five live states and two endings, plus the three the first version shipped.
 *
 * `replied` and `closed` are kept because rows already carry them — a pipeline
 * that renames its states retroactively loses the history it exists to hold —
 * and `spam` is a state rather than a deletion, because a spam run is the thing
 * you most want to look back over when tuning the honeypot.
 */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'demo'
  | 'trial'
  | 'won'
  | 'lost'
  | 'replied'
  | 'closed'
  | 'spam';

/** One dated call note. A pipeline is the record of the calls, not the states. */
export interface LeadNote {
  body: string;
  by?: string;
  at: string;
}
export type RevenueGranularity = 'day' | 'week' | 'month';
export type PaymentMethod = 'bkash' | 'nagad' | 'upay' | 'rocket' | 'bank' | 'cash' | 'card';
export type PaymentStatus = 'pending' | 'verified' | 'rejected';
export type PaymentGateway = 'manual' | 'sslcommerz' | 'bkash';
/** A page of a catalogue list. `limit: 0` came back as the whole list. */
export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** The signed-in person, as the session holds them. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId?: string | null;
  organizationName?: string;
  organizationStatus?: OrgStatus;
  plan?: string;
  trialEndsAt?: string | null;
  readOnly?: boolean;
  permissions?: string[];
  photo?: string;
  twoFactorEnabled?: boolean;
  /** Set by the API: this account may not work until it has a second factor. */
  twoFactorRequired?: boolean;
  isEmailVerified?: boolean;
}

/**
 * What a sign-in or a refresh hands back.
 *
 * No refresh token: it is set as an httpOnly cookie the page cannot read. The
 * access token is the only credential that reaches JavaScript, and it is held
 * in memory for fifteen minutes.
 */
export interface SessionResponse {
  user: AuthUser;
  accessToken: string;
}

/** A staff account: the owner, a pharmacist or a salesman. */
export interface User {
  _id: string;
  organization?: string;
  role: Role;
  name: string;
  email: string;
  phone: string;
  photo?: string;
  permissions?: string[];
  twoFactorEnabled?: boolean;
  isEmailVerified?: boolean;
  isActive?: boolean;
  deletedAt?: string | null;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  _id: string;
  organization?: string | { _id: string; name: string };
  submittedBy?: string | Pick<User, '_id' | 'name' | 'email'>;
  gateway?: PaymentGateway;
  method: PaymentMethod;
  amount: number;
  currency?: string;
  plan: string;
  months: number;
  senderNumber?: string;
  trxId?: string;
  receipt?: string;
  note?: string;
  paidAt?: string;
  status: PaymentStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  coversUntil?: string | null;
  /** Set when an operator entered it by hand; such a payment is accepted on entry. */
  recordedBy?: string | null;
  /** A discount code used on it, and what it took off. */
  coupon?: { code: string; discount: number } | null;
  invoiceNo?: string;
  invoicedAt?: string | null;
  createdAt: string;
}

/** Which end of a support conversation a line came from. */
export type SupportSide = 'shop' | 'platform';

/** One support conversation between a shop and the Dawai team. */
export interface SupportThread {
  _id: string;
  /** Populated in the console's inbox; a bare id in the shop's own list. */
  organization: string | { _id: string; name: string; plan?: string; status?: OrgStatus };
  openedBy?: string | { _id: string; name: string; email?: string; phone?: string };
  subject: string;
  status: 'open' | 'closed';
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFrom: SupportSide;
  unreadForPlatform: number;
  unreadForShop: number;
  closedAt?: string | null;
  createdAt: string;
}

export interface SupportMessage {
  _id: string;
  thread: string;
  side: SupportSide;
  authorName: string;
  body: string;
  createdAt: string;
}

/** An enquiry from the marketing site, before they are a customer. */
export interface Lead {
  /** The console reads leads through a serializer, which hands back `id`. */
  id: string;
  name: string;
  email: string;
  shop?: string;
  phone?: string;
  topic?: string;
  message: string;
  lang?: 'en' | 'bn';
  source?: string;
  status: LeadStatus;
  note: string;
  handledAt: string | null;
  createdAt: string;

  /* ---- the sales side ---- */
  /** The operator working it, by id. Null until somebody takes it. */
  owner?: string | null;
  /** When to ring back. What turns this screen from an inbox into a queue. */
  nextFollowUpAt?: string | null;
  notes?: LeadNote[];
  lostReason?: string;
  /** Where the click came from, carried onto the organization at signup. */
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  fbclid?: string;
  referrer?: string;
  landingPage?: string;
  convertedOrganization?: string | null;
}

/* ------------------------------ the console ------------------------------- */

/** The console's front page: how many shops there are and what needs doing. */
export interface PlatformStats {
  total: number;
  signupsThisWeek: number;
  byStatus: Record<string, number>;
  byPlan: Record<string, number>;
  /** Sign-ups awaiting approval — the number the nav badge shows. */
  pending: number;
  pendingPayments: number;
}

export interface RevenuePoint {
  /** The bucket's key: `2026-09-03`, `2026-W36` or `2026-09`. */
  period: string;
  /** How to print it on an axis. */
  label: string;
  total: number;
  count: number;
}

/** A total and how many sales made it. */
export interface RevenueFigure {
  total: number;
  count: number;
}

export interface PlatformRevenue {
  currency: string;
  range: { from: string; to: string; granularity: RevenueGranularity };
  /** Answers "how did we do" regardless of the range the page is set to. */
  summary: {
    today: RevenueFigure;
    week: RevenueFigure;
    month: RevenueFigure;
    year: RevenueFigure;
    allTime: RevenueFigure;
    pending: RevenueFigure;
  };
  period: {
    total: number;
    count: number;
    /** What one sale is worth on average — the number a price change moves. */
    average: number;
    newCustomers: number;
    renewals: number;
  };
  subscribers: {
    paying: number;
    /** Paying shops whose subscription runs out inside a month. Call them. */
    expiringIn30Days: number;
    onTrial: number;
  };
  series: RevenuePoint[];
  byPlan: { plan: string; name: string; total: number; count: number; months: number }[];
  byMethod: { method: string; total: number; count: number }[];
  topShops: {
    id: string;
    name: string;
    plan: string;
    total: number;
    count: number;
    lastPaidAt: string | null;
  }[];
}

/** What the signed-in operator may do, so the console can hide the rest. */
export interface PlatformAccess {
  role: Role;
  permissions: string[];
  isOwner?: boolean;
}

export interface PlatformMember {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  /** The owner's set is implicit rather than stored, and filled in on read. */
  permissions: string[];
  isOwner: boolean;
  twoFactorEnabled?: boolean;
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

/** A named bundle of permissions, offered when adding a team member. */
export interface PermissionPreset {
  key: string;
  label: string;
  description?: string;
  permissions: string[];
}

/**
 * One entry of the platform's own audit trail.
 *
 * The diff is kept rather than a sentence, because "changed the plan" without
 * saying from what is not an audit trail.
 */
export interface PlatformAuditEntry {
  _id: string;
  action: string;
  actorName: string;
  actorRole: string;
  target: { model: string; id: string; label: string };
  before: unknown;
  after: unknown;
  ip: string;
  createdAt: string;
}
