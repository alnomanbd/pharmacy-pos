import { Schema, model } from 'mongoose';
import crypto from 'node:crypto';
import { reportError } from '../integrations/errorReporter.js';
import { logger } from '../utils/logger.js';

/**
 * Crashes in the browser, where nobody would otherwise hear of them.
 *
 * A page that breaks on a salesman's laptop leaves nothing on the server: the
 * first anyone knows is a phone call. The shop app and the console send what
 * broke here — the message, the stack, the page (never its query string) and
 * the build — and the same fault from a hundred tills is one row with a count,
 * not a hundred. Kept for thirty days, shown on the console's System page, and
 * passed to Sentry when it is configured.
 *
 * Nothing about the customer or the bill is sent: the browser side reports
 * the fault, not the data it was working on.
 */

const schema = new Schema(
  {
    fingerprint: { type: String, required: true, unique: true },
    app: { type: String, enum: ['shop', 'console', 'site'], required: true },
    message: { type: String, default: '', maxlength: 500 },
    stack: { type: String, default: '', maxlength: 4000 },
    path: { type: String, default: '', maxlength: 300 },
    release: { type: String, default: '', maxlength: 40 },
    browser: { type: String, default: '', maxlength: 200 },
    count: { type: Number, default: 1 },
    firstAt: { type: Date, default: Date.now },
    lastAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
/* A month of history: long enough to see that a fix worked, short enough to stay small. */
schema.index({ lastAt: 1 }, { expireAfterSeconds: 30 * 86_400, name: 'expire_after_30_days' });
export const ClientErrorModel = model('ClientError', schema);

export interface ClientErrorInput {
  app: 'shop' | 'console' | 'site';
  message: string;
  stack?: string;
  path?: string;
  release?: string;
}

/** Digits and long ids out of a message, so "bill 13-0042 not found" groups with "bill 13-0043 not found". */
const shape = (s: string) => s.replace(/[0-9a-f]{24}/gi, '<id>').replace(/\d+/g, '<n>');

export async function recordClientError(input: ClientErrorInput, browser = '') {
  const message = input.message.slice(0, 500);
  const stack = (input.stack ?? '').slice(0, 4000);
  /* The page without its query or hash — a search box's contents live there. */
  const path = (input.path ?? '').split(/[?#]/)[0].slice(0, 300);
  const firstFrame = stack.split('\n').find((l) => /\bat\b|@/.test(l)) ?? '';
  const fingerprint = crypto
    .createHash('sha1')
    .update(`${input.app}|${shape(message)}|${shape(firstFrame.replace(/\?[^:)]*/g, ''))}`)
    .digest('hex');

  const now = new Date();
  const res = await ClientErrorModel.findOneAndUpdate(
    { fingerprint },
    {
      $inc: { count: 1 },
      $set: { lastAt: now, path, release: (input.release ?? '').slice(0, 40), browser: browser.slice(0, 200), stack },
      $setOnInsert: { fingerprint, app: input.app, message, firstAt: now },
    },
    { upsert: true, new: true },
  ).lean();

  /* New faults go to Sentry; the hundredth copy of a known one does not. */
  if (res && res.count === 1) {
    const err = new Error(`[${input.app}] ${message}`);
    err.stack = `${err.message}\n${stack}`;
    reportError(err, { route: path });
    logger.warn({ app: input.app, message, path }, 'Browser error');
  }
  return { ok: true };
}

export async function recentClientErrors(limit = 50) {
  const since = new Date(Date.now() - 86_400_000);
  const [rows, last24h] = await Promise.all([
    ClientErrorModel.find().sort({ lastAt: -1 }).limit(limit).lean(),
    ClientErrorModel.countDocuments({ lastAt: { $gte: since } }),
  ]);
  return {
    last24h,
    rows: rows.map((r) => ({
      id: String(r._id),
      app: r.app,
      message: r.message,
      stack: r.stack,
      path: r.path,
      release: r.release,
      browser: r.browser,
      count: r.count,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
    })),
  };
}

export async function clearClientError(id?: string) {
  if (id) await ClientErrorModel.deleteOne({ _id: id });
  else await ClientErrorModel.deleteMany({});
  return { ok: true };
}
