import { Types } from 'mongoose';
import { SupportThreadModel, SupportMessageModel, UserModel } from '../models/index.js';
import type { SupportSide } from '../models/Support.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Support: a shop talking to the people who run Dawai.
 *
 * The alternative is a phone number, and a phone number means the answer exists
 * only in somebody's memory — the next person to pick up starts from nothing,
 * and there is no record of what was promised. A thread is the same
 * conversation, kept.
 *
 * There is no socket server here, so both sides poll: the nav badge once a
 * minute, an open conversation every few seconds. Cheap, because the unread
 * counts are stored on the thread rather than counted from messages.
 */

/** A preview line for the thread list — one line, never the whole message. */
export const preview = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 120);

/**
 * How many conversations one shop may have open at once.
 *
 * Generous — a shop with a real problem has one or two — but finite, so a
 * script or a stuck button cannot bury the inbox.
 */
export const MAX_OPEN_PER_SHOP = 20;

export function openCapMessage(open: number): string | null {
  return open >= MAX_OPEN_PER_SHOP
    ? `You already have ${MAX_OPEN_PER_SHOP} conversations open. Reply in one of those, or wait for us to close some.`
    : null;
}

/** A bad id is a missing conversation, not a server error. */
function threadId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Conversation');
  return id;
}

/* ------------------------------------------------------------------ */
/* The shop's side                                                     */
/* ------------------------------------------------------------------ */

export async function listShopThreads(orgId: string) {
  return SupportThreadModel.find({ organization: orgId })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();
}

export async function openThread(
  orgId: string,
  userId: string,
  payload: { subject: string; body: string },
) {
  const subject = payload.subject.trim();
  const body = payload.body.trim();
  if (!subject) throw badRequest('Give it a subject so we know what it is about');
  if (!body) throw badRequest('Write your message');

  const open = await SupportThreadModel.countDocuments({ organization: orgId, status: 'open' });
  const capped = openCapMessage(open);
  if (capped) throw badRequest(capped);

  const user = await UserModel.findById(userId).select('name').lean();

  const thread = await SupportThreadModel.create({
    organization: orgId,
    openedBy: userId,
    subject,
    lastMessagePreview: preview(body),
    lastMessageFrom: 'shop',
    unreadForPlatform: 1,
  });

  const message = await SupportMessageModel.create({
    thread: thread._id,
    organization: orgId,
    side: 'shop',
    author: userId,
    authorName: user?.name ?? '',
    body,
  });

  logger.info({ org: orgId, thread: thread.id }, 'Support thread opened');
  return { thread: thread.toObject(), message: message.toObject() };
}

/** The badge in the shop's nav: how many of its threads have unread replies. */
export async function shopUnreadCount(orgId: string) {
  return SupportThreadModel.countDocuments({ organization: orgId, unreadForShop: { $gt: 0 } });
}

/* ------------------------------------------------------------------ */
/* The operator's side                                                 */
/* ------------------------------------------------------------------ */

export async function listPlatformThreads(opts: { status?: string; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));
  // Open by default: a closed thread is finished work, and an inbox that shows
  // it is an inbox nobody trusts to be the list of what is left.
  const status = opts.status === 'closed' || opts.status === 'all' ? opts.status : 'open';
  const filter = status === 'all' ? {} : { status };

  const [data, total, waiting] = await Promise.all([
    SupportThreadModel.find(filter)
      .populate('organization', 'name plan status')
      .populate('openedBy', 'name email phone')
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SupportThreadModel.countDocuments(filter),
    SupportThreadModel.countDocuments({ status: 'open', unreadForPlatform: { $gt: 0 } }),
  ]);

  return { data, total, page, limit, waiting };
}

export async function setThreadStatus(id: string, status: 'open' | 'closed', userId: string) {
  const thread = await SupportThreadModel.findById(threadId(id));
  if (!thread) throw notFound('Conversation');

  thread.set('status', status);
  thread.set('closedAt', status === 'closed' ? new Date() : null);
  thread.set('closedBy', status === 'closed' ? userId : null);
  await thread.save();
  return thread.toObject();
}

/* ------------------------------------------------------------------ */
/* Both sides                                                          */
/* ------------------------------------------------------------------ */

/**
 * Reading a thread also marks it read — for the side doing the reading only.
 *
 * A shop opening its own thread must not clear the support team's unread
 * count, or a message would vanish from the queue without anyone having seen
 * it. A shop asking for another shop's thread gets the same answer as for one
 * that does not exist.
 */
export async function readThread(id: string, side: SupportSide, orgId?: string) {
  const filter = side === 'shop' ? { _id: threadId(id), organization: orgId } : { _id: threadId(id) };
  const thread = await SupportThreadModel.findOneAndUpdate(
    filter,
    { $set: side === 'shop' ? { unreadForShop: 0 } : { unreadForPlatform: 0 } },
    { new: true },
  )
    .populate('organization', 'name plan status')
    .populate('openedBy', 'name email phone')
    .lean();
  if (!thread) throw notFound('Conversation');

  const messages = await SupportMessageModel.find({ thread: thread._id }).sort({ createdAt: 1 }).lean();
  return { thread, messages };
}

export async function postMessage(
  id: string,
  side: SupportSide,
  userId: string,
  body: string,
  orgId?: string,
) {
  const text = body.trim();
  if (!text) throw badRequest('Write something first');

  const filter = side === 'shop' ? { _id: threadId(id), organization: orgId } : { _id: threadId(id) };
  const thread = await SupportThreadModel.findOne(filter);
  if (!thread) throw notFound('Conversation');

  const user = await UserModel.findById(userId).select('name').lean();

  const message = await SupportMessageModel.create({
    thread: thread._id,
    organization: thread.organization,
    side,
    author: userId,
    authorName: user?.name ?? '',
    body: text,
  });

  thread.set('lastMessageAt', new Date());
  thread.set('lastMessagePreview', preview(text));
  thread.set('lastMessageFrom', side);
  // Answering reopens: a shop replying to a closed thread has not finished,
  // whatever the person who closed it thought.
  if (thread.status === 'closed') {
    thread.set('status', 'open');
    thread.set('closedAt', null);
    thread.set('closedBy', null);
  }
  if (side === 'shop') thread.set('unreadForPlatform', (thread.unreadForPlatform ?? 0) + 1);
  else thread.set('unreadForShop', (thread.unreadForShop ?? 0) + 1);
  await thread.save();

  return message.toObject();
}
