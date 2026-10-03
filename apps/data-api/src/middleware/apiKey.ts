import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import { ApiKey, Client, Plan, Usage, type Scope } from '../models.js';
import { hashKey, keyFrom } from '../lib/keys.js';
import { HttpError } from '../lib/http.js';
import { logger } from '../lib/logger.js';

/**
 * Who is calling, what their plan lets them do, and how much they have used.
 *
 * A key is looked up by its hash and held for a short while, as are clients
 * and plans, so a busy client is not three database reads a call. A key
 * revoked, a client suspended or a plan changed from the admin takes effect at
 * once in this process (`forget`) and within `TTL` in any other.
 *
 * Counting is per client, not per key: a client with three keys shares one
 * allowance. Each call is counted when its answer is sent — refused ones
 * separately — and written to `data_usage` by day and endpoint.
 */

const TTL = 30_000;

export type Caller = {
  clientId: Types.ObjectId;
  clientName: string;
  keyId: Types.ObjectId;
  plan: { key: string; name: string; scopes: Scope[]; historyMonths: number; requestsPerMinute: number; requestsPerDay: number; requestsPerMonth: number };
};

declare module 'express-serve-static-core' {
  interface Request {
    caller?: Caller;
  }
}

const keyCache = new Map<string, { at: number; caller: Caller | null; reason?: string }>();

/** Drops what is held, after the admin changes a key, client or plan. */
export function forget() {
  keyCache.clear();
}

async function lookup(hash: string): Promise<{ caller: Caller | null; reason?: string }> {
  const key = await ApiKey.findOne({ hash }).lean();
  if (!key || key.revokedAt) return { caller: null, reason: 'That key is not valid' };
  const client = await Client.findById(key.client).lean();
  if (!client) return { caller: null, reason: 'That key is not valid' };
  if (client.status !== 'active') return { caller: null, reason: 'This account is suspended. Please contact Dawai.' };
  if (client.expiresAt && client.expiresAt.getTime() < Date.now()) return { caller: null, reason: 'This account’s contract has ended. Please contact Dawai.' };
  const plan = await Plan.findOne({ key: client.plan, isActive: true }).lean();
  if (!plan) return { caller: null, reason: 'This account has no active plan. Please contact Dawai.' };
  void ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => undefined);
  return {
    caller: {
      clientId: client._id,
      clientName: client.name,
      keyId: key._id,
      plan: {
        key: plan.key,
        name: plan.name,
        scopes: plan.scopes as Scope[],
        historyMonths: plan.historyMonths,
        requestsPerMinute: plan.requestsPerMinute,
        requestsPerDay: plan.requestsPerDay,
        requestsPerMonth: plan.requestsPerMonth,
      },
    },
  };
}

/* ------------------------------------------------------------- counts -- */

type Counts = { day: string; dayCalls: number; month: string; monthCalls: number; minute: number; minuteCalls: number };
const counts = new Map<string, Counts>();

const dhakaDay = (now = new Date()) => new Date(now.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);

async function countsOf(clientId: Types.ObjectId): Promise<Counts> {
  const day = dhakaDay();
  const month = day.slice(0, 7);
  const id = String(clientId);
  const held = counts.get(id);
  if (held && held.day === day) return held;
  const [d, m] = await Promise.all([
    Usage.aggregate<{ calls: number }>([{ $match: { client: clientId, day } }, { $group: { _id: null, calls: { $sum: '$calls' } } }]),
    Usage.aggregate<{ calls: number }>([{ $match: { client: clientId, month } }, { $group: { _id: null, calls: { $sum: '$calls' } } }]),
  ]);
  const fresh = { day, dayCalls: d[0]?.calls ?? 0, month, monthCalls: m[0]?.calls ?? 0, minute: 0, minuteCalls: 0 };
  counts.set(id, fresh);
  return fresh;
}

/** Today and this month, for `/v1/usage` and the admin. */
export async function usageNow(clientId: Types.ObjectId) {
  const c = await countsOf(clientId);
  return { day: c.day, callsToday: c.dayCalls, month: c.month, callsThisMonth: c.monthCalls };
}

function record(clientId: Types.ObjectId, endpoint: string, ok: boolean, rows: number) {
  const day = dhakaDay();
  void Usage.updateOne(
    { client: clientId, day, endpoint },
    { $setOnInsert: { month: day.slice(0, 7) }, $inc: ok ? { calls: 1, rows } : { refused: 1 } },
    { upsert: true },
  ).catch((err) => logger.warn({ err }, 'Could not record usage'));
}

/* --------------------------------------------------------- middleware -- */

export async function requireKey(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = keyFrom(req.headers);
    if (!raw) throw new HttpError(401, 'no_key', 'Send your key as `Authorization: Bearer dwk_…`');
    const hash = hashKey(raw);
    let held = keyCache.get(hash);
    if (!held || Date.now() - held.at > TTL) {
      held = { at: Date.now(), ...(await lookup(hash)) };
      keyCache.set(hash, held);
    }
    if (!held.caller) throw new HttpError(401, 'bad_key', held.reason ?? 'That key is not valid');
    const caller = held.caller;
    req.caller = caller;

    const c = await countsOf(caller.clientId);
    const minute = Math.floor(Date.now() / 60_000);
    if (c.minute !== minute) Object.assign(c, { minute, minuteCalls: 0 });
    res.setHeader('X-RateLimit-Limit-Day', String(caller.plan.requestsPerDay));
    res.setHeader('X-RateLimit-Remaining-Day', String(Math.max(0, caller.plan.requestsPerDay - c.dayCalls)));

    const endpoint = endpointOf(req);
    const refuse = (code: string, message: string, retryAfter?: number) => {
      record(caller.clientId, endpoint, false, 0);
      if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
      throw new HttpError(429, code, message);
    };
    if (c.minuteCalls >= caller.plan.requestsPerMinute) refuse('rate_limited', `At most ${caller.plan.requestsPerMinute} calls a minute`, 60 - (Math.floor(Date.now() / 1000) % 60));
    if (c.dayCalls >= caller.plan.requestsPerDay) refuse('daily_quota', `Your plan allows ${caller.plan.requestsPerDay} calls a day`);
    if (c.monthCalls >= caller.plan.requestsPerMonth) refuse('monthly_quota', `Your plan allows ${caller.plan.requestsPerMonth} calls a month`);

    c.minuteCalls++;
    c.dayCalls++;
    c.monthCalls++;
    res.on('finish', () => {
      const ok = res.statusCode < 400;
      if (!ok) {
        // A refused call is not charged.
        c.dayCalls--;
        c.monthCalls--;
      }
      record(caller.clientId, endpoint, ok, ok ? Number(res.locals.rows ?? 0) : 0);
    });
    next();
  } catch (err) {
    next(err);
  }
}

/** Only for plans that include this part. */
export const requireScope = (scope: Scope) => (req: Request, _res: Response, next: NextFunction) => {
  if (req.caller?.plan.scopes.includes(scope)) return next();
  next(new HttpError(403, 'not_in_plan', `Your plan does not include ${scope}. Please contact Dawai to add it.`));
};

/** `/v1/demand/medicines/:id` → `demand/medicines/:id`: the route, not the id, so usage groups. */
function endpointOf(req: Request) {
  return req.path
    .replace(/^\/+/, '')
    .split('/')
    .map((p) => (/^[0-9a-f]{24}$/i.test(p) ? ':id' : p))
    .join('/')
    .slice(0, 80) || 'index';
}
