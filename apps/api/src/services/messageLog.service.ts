import mongoose, { Types } from 'mongoose';
import { NotificationLogModel } from '../models/NotificationLog.js';
import { maskSmsBody } from '../utils/redact.js';
import { logger } from '../utils/logger.js';

/**
 * Writes one line to the message log, and never gets in the way of sending.
 *
 * Fire and forget: the send has already happened by the time this runs, so a
 * slow or failed write must not delay or fail it. Skipped when there is no
 * database (a script, a test), rather than buffering a write that never lands.
 */
export interface MessageLogEntry {
  channel: 'email' | 'sms';
  to: string;
  subject?: string;
  /** SMS only. Masked here before it is stored, whatever the caller passed. */
  body?: string;
  success: boolean;
  provider: string;
  kind?: string;
  organization?: string | null;
  providerId?: string;
}

export function recordMessage(entry: MessageLogEntry): void {
  if (mongoose.connection.readyState !== 1) return;
  const organization =
    entry.organization && Types.ObjectId.isValid(entry.organization) ? entry.organization : null;
  void NotificationLogModel.create({
    channel: entry.channel,
    to: entry.to,
    subject: (entry.subject ?? '').slice(0, 300),
    // Always masked in the store, development included: this row outlives the session.
    body: entry.channel === 'sms' ? maskSmsBody(entry.body ?? '', true).slice(0, 1000) : '',
    status: entry.success ? 'sent' : 'failed',
    provider: entry.provider,
    kind: entry.kind ?? '',
    organization,
    providerId: entry.providerId ?? '',
  }).catch((err) => logger.warn({ err }, 'Could not write the message log'));
}

/** The console's Messages page: newest first, filtered. */
export async function listMessages(opts: {
  channel?: string;
  status?: string;
  q?: string;
  organization?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const filter: Record<string, unknown> = {};
  if (opts.channel === 'email' || opts.channel === 'sms') filter.channel = opts.channel;
  if (opts.status === 'sent' || opts.status === 'failed') filter.status = opts.status;
  if (opts.status === 'logged') filter.provider = 'log';
  if (opts.organization && Types.ObjectId.isValid(opts.organization)) filter.organization = opts.organization;
  if (opts.q?.trim()) {
    const rx = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ to: rx }, { subject: rx }, { kind: rx }];
  }
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [data, total, failed24h] = await Promise.all([
    NotificationLogModel.find(filter)
      .populate('organization', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NotificationLogModel.countDocuments(filter),
    NotificationLogModel.countDocuments({ status: 'failed', createdAt: { $gte: dayAgo } }),
  ]);
  return { data, total, page, limit, failed24h };
}
