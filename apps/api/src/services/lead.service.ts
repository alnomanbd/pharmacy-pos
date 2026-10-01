import { LeadModel } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Enquiries from the public site.
 *
 * Two rules shape everything here, and both come from this being the one
 * writable endpoint in the app that takes no credentials:
 *
 * 1. **Nothing the sender types is trusted as identity.** The row records what
 *    they wrote *and* what the request itself said (IP, user agent), because
 *    when a form is abused those are the only fields that mean anything.
 * 2. **A rejected enquiry still answers 200.** Telling a bot which of the
 *    honeypot, the length check or the duplicate window caught it is telling it
 *    how to get through. A caught submission is stored as `spam` and the sender
 *    sees the same thank-you as anyone else — see `submitLead`.
 */

export interface LeadInput {
  name: string;
  email: string;
  shop?: string;
  phone?: string;
  topic?: string;
  message: string;
  lang?: 'en' | 'bn';
  /** The hidden field. A human never fills it; a form-filling bot always does. */
  trap?: string;
  /**
   * Where they came from, read off the URL by the marketing site.
   *
   * Captured at the form rather than worked out later, because it cannot be
   * worked out later: by the time this person signs up, the click that brought
   * them is weeks gone. `fbclid` is the one value that survives the gap between
   * an ad and a subscription.
   */
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  fbclid?: string;
  referrer?: string;
  landingPage?: string;
}

export interface LeadMeta {
  ip?: string;
  userAgent?: string;
  source?: string;
}

/** How long the same address is asked to wait before filing another enquiry. */
const DUPLICATE_WINDOW_MS = 60_000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Everything about an enquiry that can be decided without touching the
 * database: is it usable, and is it obviously a bot?
 *
 * Pure, and exported, for two reasons. It is the part with rules in it — and a
 * rule nobody can test is a rule that quietly stops working. And keeping it
 * separate from the write makes the honeypot's design explicit: screening
 * *classifies*, it does not refuse. `submitLead` stores a `spam` verdict and
 * answers like a success, because a bot that receives an error learns which
 * field to stop filling in.
 */
export type Screened =
  | { verdict: 'store'; row: LeadRow }
  | { verdict: 'spam'; row: LeadRow; reason: string };

export interface LeadRow {
  name: string;
  email: string;
  shop: string;
  phone: string;
  topic: string;
  message: string;
  lang: 'en' | 'bn';
  source: string;
  ip: string;
  userAgent: string;
  /**
   * Where they came from, as the marketing site read it off the URL.
   *
   * On the row rather than worked out later, because it cannot be worked out
   * later: the click that produced this enquiry is weeks gone by the time
   * anybody signs up. `fbclid` is the one value that survives that gap.
   */
  utm: { source: string; medium: string; campaign: string; content: string; term: string };
  fbclid: string;
  referrer: string;
  landingPage: string;
}

export function screenLead(input: LeadInput, meta: LeadMeta = {}): Screened {
  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  const message = (input.message ?? '').trim();

  /*
   * These three are the only genuine refusals, and each one is something the
   * person looking at the form can see and fix. Everything else that is wrong
   * with a submission is handled by classifying it, not by arguing with it.
   */
  if (!name) throw badRequest('Please tell us your name.');
  if (!EMAIL.test(email)) throw badRequest('That email address does not look right.');
  if (message.length < 10) {
    throw badRequest('Please say a little more about what you need — a line or two is plenty.');
  }

  const row: LeadRow = {
    name,
    email,
    shop: (input.shop ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    topic: (input.topic ?? '').trim(),
    message,
    lang: input.lang === 'bn' ? 'bn' : 'en',
    source: meta.source || 'landing',
    ip: meta.ip ?? '',
    userAgent: (meta.userAgent ?? '').slice(0, 300),
    utm: {
      source: (input.utm?.source ?? '').slice(0, 80),
      medium: (input.utm?.medium ?? '').slice(0, 80),
      campaign: (input.utm?.campaign ?? '').slice(0, 120),
      content: (input.utm?.content ?? '').slice(0, 120),
      term: (input.utm?.term ?? '').slice(0, 120),
    },
    fbclid: (input.fbclid ?? '').slice(0, 300),
    referrer: (input.referrer ?? '').slice(0, 300),
    landingPage: (input.landingPage ?? '').slice(0, 160),
  };

  if ((input.trap ?? '').trim()) {
    return { verdict: 'spam', row, reason: 'Honeypot field was filled.' };
  }

  return { verdict: 'store', row };
}

/**
 * Takes an enquiry from the public form.
 *
 * Answers the same `accepted` in every case the sender should not learn about —
 * caught by the honeypot, or a repeat inside the duplicate window. Only
 * `screenLead`'s three refusals reach the caller as an error.
 */
export async function submitLead(input: LeadInput, meta: LeadMeta = {}) {
  const screened = screenLead(input, meta);

  if (screened.verdict === 'spam') {
    await LeadModel.create({ ...screened.row, status: 'spam', note: screened.reason });
    logger.warn({ email: screened.row.email, ip: screened.row.ip }, 'Lead classified as spam');
    return { accepted: true as const };
  }

  const { row } = screened;

  /* Someone double-clicking Send should not produce two enquiries, and a script
     hammering the form should not produce a thousand. Per address, and short
     enough that a person with a genuine second question is not locked out. */
  const recent = await LeadModel.findOne({
    email: row.email,
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  })
    .select('_id')
    .lean();
  if (recent) {
    logger.info({ email: row.email }, 'Lead ignored: duplicate inside the window');
    return { accepted: true as const };
  }

  const lead = await LeadModel.create(row);
  logger.info({ id: String(lead._id), email: row.email, topic: row.topic }, 'Lead received');
  return { accepted: true as const };
}

/* -------------------------------------------------------------------------- */
/* The operator's side                                                         */
/* -------------------------------------------------------------------------- */

const shape = (l: Record<string, unknown>) => ({
  id: String(l._id),
  name: String(l.name ?? ''),
  email: String(l.email ?? ''),
  shop: String(l.shop ?? ''),
  phone: String(l.phone ?? ''),
  topic: String(l.topic ?? ''),
  message: String(l.message ?? ''),
  lang: (l.lang as 'en' | 'bn') ?? 'en',
  source: String(l.source ?? 'landing'),
  status: String(l.status ?? 'new'),
  utm: (l.utm as Record<string, string>) ?? {},
  fbclid: String(l.fbclid ?? ''),
  referrer: String(l.referrer ?? ''),
  landingPage: String(l.landingPage ?? ''),
  owner: l.owner ? String(l.owner) : null,
  nextFollowUpAt: (l.nextFollowUpAt as Date | null) ?? null,
  notes: (l.notes as { body: string; at: Date }[]) ?? [],
  convertedOrganization: l.convertedOrganization ? String(l.convertedOrganization) : null,
  lostReason: String(l.lostReason ?? ''),
  note: String(l.note ?? ''),
  createdAt: l.createdAt as Date,
  handledAt: (l.handledAt as Date | null) ?? null,
});

export async function listLeads(params: {
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));

  const filter: Record<string, unknown> = {};
  /* Spam is in the collection but out of the default view: the operator opens
     this screen to answer people, not to read what a bot posted. */
  if (params.status && params.status !== 'all') filter.status = params.status;
  else filter.status = { $ne: 'spam' };

  if (params.q?.trim()) {
    const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { shop: rx }, { message: rx }];
  }

  const [rows, total, waiting] = await Promise.all([
    LeadModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LeadModel.countDocuments(filter),
    LeadModel.countDocuments({ status: 'new' }),
  ]);

  return {
    data: rows.map((r) => shape(r as Record<string, unknown>)),
    total,
    page,
    limit,
    /* What the nav badge counts: enquiries nobody has looked at yet. */
    waiting,
  };
}

export async function updateLead(
  id: string,
  input: {
    status?: string;
    note?: string;
    /** Who is working it. A pipeline with no owner is a list nobody calls. */
    owner?: string | null;
    /** When to ring back. This is what makes the console a queue of calls. */
    nextFollowUpAt?: string | null;
    /** One dated call note, appended. The record of what was actually said. */
    addNote?: string;
    lostReason?: string;
  },
  operatorId?: string,
) {
  const lead = await LeadModel.findById(id);
  if (!lead) throw notFound('Enquiry');

  if (input.status) {
    lead.set('status', input.status);
    /* Who dealt with it and when — the two questions asked about any enquiry
       that turns into a customer, or into a complaint. */
    lead.set('handledBy', operatorId ?? null);
    lead.set('handledAt', new Date());
  }
  if (input.note !== undefined) lead.set('note', input.note);
  if (input.owner !== undefined) lead.set('owner', input.owner || null);
  if (input.nextFollowUpAt !== undefined) {
    lead.set('nextFollowUpAt', input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null);
  }
  if (input.lostReason !== undefined) lead.set('lostReason', input.lostReason);
  if (input.addNote?.trim()) {
    // Appended, never replaced: the second call is not a correction of the
    // first, and a pipeline is the record of both.
    lead.get('notes').push({ body: input.addNote.trim(), by: operatorId, at: new Date() });
  }

  await lead.save();
  return shape(lead.toObject() as Record<string, unknown>);
}

/** For the console's alert bell: how many nobody has looked at yet. */
export async function newLeadCount() {
  return LeadModel.countDocuments({ status: 'new' });
}

/**
 * Marks the enquiry that became a shop.
 *
 * Called at signup, matched on the email address, and deliberately quiet: a
 * shop that never filled the form in is the ordinary case, not an error.
 * Without it there is no chain from an ad to a paying customer, and no
 * conversion figure can be computed.
 */
export async function convertLeadForEmail(email: string, organizationId: string) {
  const lead = await LeadModel.findOne({
    email: email.toLowerCase(),
    status: { $ne: 'spam' },
    convertedOrganization: null,
  }).sort({ createdAt: 1 });
  if (!lead) return null;

  lead.set('status', 'won');
  lead.set('convertedOrganization', organizationId);
  lead.set('convertedAt', new Date());
  await lead.save();
  return lead.toObject();
}
