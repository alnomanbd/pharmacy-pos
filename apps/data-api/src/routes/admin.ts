import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { handle, HttpError } from '../lib/http.js';
import { newKey, sameSecret } from '../lib/keys.js';
import { forget, usageNow } from '../middleware/apiKey.js';
import { AdminLog, ApiKey, Client, CLIENT_KINDS, Plan, SCOPES, Usage, oid } from '../models.js';
import { lastBuilt } from '../services/demand.js';

/**
 * Running the Data API: who buys, their keys, their plans, what they use.
 *
 * Kept apart from the platform's console on purpose — a different service, a
 * different password (`DATA_API_ADMIN_TOKEN`), and nothing here can reach a
 * shop. Whoever signs in gives a name, which goes on everything they change.
 */
export const admin = Router();

const tried = new Map<string, { n: number; until: number }>();

admin.use((req: Request, res: Response, next: NextFunction) => {
  if (!env.adminToken) return next(new HttpError(503, 'admin_closed', 'Set DATA_API_ADMIN_TOKEN to open the admin'));
  const ip = req.ip ?? '';
  const t = tried.get(ip);
  if (t && t.until > Date.now()) return next(new HttpError(429, 'slow_down', 'Too many wrong passwords. Try again in a few minutes.'));
  const token = String(req.headers['x-admin-token'] ?? '');
  if (!token || !sameSecret(token, env.adminToken)) {
    const n = (t?.n ?? 0) + 1;
    tried.set(ip, { n, until: n >= 5 ? Date.now() + 10 * 60_000 : 0 });
    return next(new HttpError(401, 'bad_token', 'Wrong admin password'));
  }
  tried.delete(ip);
  res.locals.adminName = String(req.headers['x-admin-name'] ?? '').trim().slice(0, 60) || 'admin';
  next();
});

const by = (res: Response) => String(res.locals.adminName);

const note = (res: Response, action: string, client: unknown, detail: Record<string, unknown> = {}) =>
  AdminLog.create({ by: by(res), action, client: client ?? null, detail });

const day = (offset = 0) => new Date(Date.now() + 6 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

/* ----------------------------------------------------------- overview -- */

admin.get(
  '/overview',
  handle(async () => {
    const today = day();
    const month = today.slice(0, 7);
    const since = day(-29);
    const [clients, keys, todayCalls, monthCalls, series, topClients, topEndpoints, built] = await Promise.all([
      Client.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      ApiKey.countDocuments({ revokedAt: null }),
      Usage.aggregate<{ calls: number; refused: number }>([{ $match: { day: today } }, { $group: { _id: null, calls: { $sum: '$calls' }, refused: { $sum: '$refused' } } }]),
      Usage.aggregate<{ calls: number; rows: number }>([{ $match: { month } }, { $group: { _id: null, calls: { $sum: '$calls' }, rows: { $sum: '$rows' } } }]),
      Usage.aggregate<{ _id: string; calls: number; refused: number }>([
        { $match: { day: { $gte: since } } },
        { $group: { _id: '$day', calls: { $sum: '$calls' }, refused: { $sum: '$refused' } } },
        { $sort: { _id: 1 } },
      ]),
      Usage.aggregate<{ _id: unknown; calls: number }>([{ $match: { month } }, { $group: { _id: '$client', calls: { $sum: '$calls' } } }, { $sort: { calls: -1 } }, { $limit: 8 }]),
      Usage.aggregate<{ _id: string; calls: number }>([{ $match: { month } }, { $group: { _id: '$endpoint', calls: { $sum: '$calls' } } }, { $sort: { calls: -1 } }, { $limit: 10 }]),
      lastBuilt(),
    ]);
    const names = new Map((await Client.find({ _id: { $in: topClients.map((c) => c._id) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
    const byDay = new Map(series.map((s) => [s._id, s]));
    return {
      clients: { active: clients.find((c) => c._id === 'active')?.n ?? 0, suspended: clients.find((c) => c._id === 'suspended')?.n ?? 0 },
      keys,
      today: { calls: todayCalls[0]?.calls ?? 0, refused: todayCalls[0]?.refused ?? 0 },
      month: { month, calls: monthCalls[0]?.calls ?? 0, rows: monthCalls[0]?.rows ?? 0 },
      series: Array.from({ length: 30 }, (_, i) => {
        const d = day(i - 29);
        return { day: d, calls: byDay.get(d)?.calls ?? 0, refused: byDay.get(d)?.refused ?? 0 };
      }),
      topClients: topClients.map((c) => ({ id: String(c._id), name: names.get(String(c._id)) ?? '—', calls: c.calls })),
      topEndpoints: topEndpoints.map((e) => ({ endpoint: e._id, calls: e.calls })),
      figuresBuiltAt: built,
      minShops: env.minShops,
    };
  }),
);

/* ------------------------------------------------------------ clients -- */

const clientBody = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(CLIENT_KINDS).default('other'),
  contactName: z.string().trim().max(120).default(''),
  email: z.string().trim().email().or(z.literal('')).default(''),
  phone: z.string().trim().max(40).default(''),
  plan: z.string().trim().min(1).max(40),
  status: z.enum(['active', 'suspended']).default('active'),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(''))
    .nullable()
    .optional(),
  notes: z.string().max(2000).default(''),
});

const expiry = (v?: string | null) => (v ? new Date(`${v}T23:59:59+06:00`) : null);

admin.get(
  '/clients',
  handle(async () => {
    const month = day().slice(0, 7);
    const [clients, keys, usage] = await Promise.all([
      Client.find().sort({ createdAt: -1 }).lean(),
      ApiKey.aggregate<{ _id: unknown; n: number; last: Date | null }>([{ $match: { revokedAt: null } }, { $group: { _id: '$client', n: { $sum: 1 }, last: { $max: '$lastUsedAt' } } }]),
      Usage.aggregate<{ _id: unknown; calls: number }>([{ $match: { month } }, { $group: { _id: '$client', calls: { $sum: '$calls' } } }]),
    ]);
    const k = new Map(keys.map((x) => [String(x._id), x]));
    const u = new Map(usage.map((x) => [String(x._id), x.calls]));
    return clients.map((c) => ({
      ...c,
      id: String(c._id),
      keys: k.get(String(c._id))?.n ?? 0,
      lastUsedAt: k.get(String(c._id))?.last ?? null,
      callsThisMonth: u.get(String(c._id)) ?? 0,
    }));
  }),
);

admin.post(
  '/clients',
  handle(async (req, res) => {
    const body = clientBody.parse(req.body);
    if (!(await Plan.exists({ key: body.plan }))) throw new HttpError(400, 'bad_plan', 'No such plan');
    const c = await Client.create({ ...body, expiresAt: expiry(body.expiresAt) });
    await note(res, 'client.create', c._id, { name: c.name, plan: c.plan });
    return { id: String(c._id) };
  }),
);

admin.get(
  '/clients/:id',
  handle(async (req) => {
    const _id = oid(req.params.id);
    const c = _id && (await Client.findById(_id).lean());
    if (!c || !_id) throw new HttpError(404, 'not_found', 'No such client');
    const since = day(-29);
    const [keys, series, endpoints, log, now] = await Promise.all([
      ApiKey.find({ client: _id }).select('-hash').sort({ createdAt: -1 }).lean(),
      Usage.aggregate<{ _id: string; calls: number; refused: number }>([
        { $match: { client: _id, day: { $gte: since } } },
        { $group: { _id: '$day', calls: { $sum: '$calls' }, refused: { $sum: '$refused' } } },
      ]),
      Usage.aggregate<{ _id: string; calls: number; rows: number }>([
        { $match: { client: _id, day: { $gte: since } } },
        { $group: { _id: '$endpoint', calls: { $sum: '$calls' }, rows: { $sum: '$rows' } } },
        { $sort: { calls: -1 } },
      ]),
      AdminLog.find({ client: _id }).sort({ at: -1 }).limit(30).lean(),
      usageNow(_id),
    ]);
    const byDay = new Map(series.map((s) => [s._id, s]));
    return {
      ...c,
      id: String(c._id),
      keys: keys.map((k) => ({ ...k, id: String(k._id) })),
      usage: {
        ...now,
        series: Array.from({ length: 30 }, (_, i) => {
          const d = day(i - 29);
          return { day: d, calls: byDay.get(d)?.calls ?? 0, refused: byDay.get(d)?.refused ?? 0 };
        }),
        endpoints: endpoints.map((e) => ({ endpoint: e._id, calls: e.calls, rows: e.rows })),
      },
      log,
    };
  }),
);

admin.patch(
  '/clients/:id',
  handle(async (req, res) => {
    const body = clientBody.partial().parse(req.body);
    if (body.plan && !(await Plan.exists({ key: body.plan }))) throw new HttpError(400, 'bad_plan', 'No such plan');
    const c = await Client.findById(oid(req.params.id));
    if (!c) throw new HttpError(404, 'not_found', 'No such client');
    const before = { plan: c.plan, status: c.status, expiresAt: c.expiresAt };
    const { expiresAt, ...rest } = body;
    c.set(rest);
    if (expiresAt !== undefined) c.set('expiresAt', expiry(expiresAt));
    await c.save();
    forget();
    await note(res, 'client.update', c._id, { changed: Object.keys(body), before });
    return { id: String(c._id) };
  }),
);

/* --------------------------------------------------------------- keys -- */

admin.post(
  '/clients/:id/keys',
  handle(async (req, res) => {
    const c = await Client.findById(oid(req.params.id));
    if (!c) throw new HttpError(404, 'not_found', 'No such client');
    const label = z.object({ label: z.string().trim().max(60).default('') }).parse(req.body ?? {}).label;
    const k = newKey();
    const doc = await ApiKey.create({ client: c._id, label, prefix: k.prefix, hash: k.hash, createdBy: by(res) });
    await note(res, 'key.create', c._id, { prefix: k.prefix, label });
    // The only time the key itself is ever sent.
    return { id: String(doc._id), key: k.key, prefix: k.prefix };
  }),
);

admin.post(
  '/keys/:id/revoke',
  handle(async (req, res) => {
    const k = await ApiKey.findById(oid(req.params.id));
    if (!k) throw new HttpError(404, 'not_found', 'No such key');
    if (!k.revokedAt) {
      k.revokedAt = new Date();
      await k.save();
      forget();
      await note(res, 'key.revoke', k.client, { prefix: k.prefix, label: k.label });
    }
    return { id: String(k._id), revokedAt: k.revokedAt };
  }),
);

/* -------------------------------------------------------------- plans -- */

const planBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(400).default(''),
  scopes: z.array(z.enum(SCOPES)).min(1),
  historyMonths: z.number().int().min(0).max(120),
  requestsPerMinute: z.number().int().min(1).max(10_000),
  requestsPerDay: z.number().int().min(1).max(10_000_000),
  requestsPerMonth: z.number().int().min(1).max(100_000_000),
  priceMonthly: z.number().min(0).max(100_000_000),
  isActive: z.boolean().default(true),
});

admin.get(
  '/plans',
  handle(async () => {
    const [plans, used] = await Promise.all([
      Plan.find().sort({ priceMonthly: 1 }).lean(),
      Client.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$plan', n: { $sum: 1 } } }]),
    ]);
    const n = new Map(used.map((u) => [u._id, u.n]));
    return { scopes: SCOPES, plans: plans.map((p) => ({ ...p, id: String(p._id), clients: n.get(p.key) ?? 0 })) };
  }),
);

admin.put(
  '/plans/:key',
  handle(async (req, res) => {
    const key = z
      .string()
      .regex(/^[a-z0-9-]{2,40}$/, 'a plan key is 2–40 lower-case letters, digits or dashes')
      .parse(req.params.key);
    const body = planBody.parse(req.body);
    const existed = await Plan.exists({ key });
    await Plan.updateOne({ key }, { $set: { ...body, key } }, { upsert: true });
    forget();
    await note(res, existed ? 'plan.update' : 'plan.create', null, { key, ...body });
    return { key };
  }),
);

/* ---------------------------------------------------------------- log -- */

admin.get(
  '/log',
  handle(async () => {
    const rows = await AdminLog.find().sort({ at: -1 }).limit(200).lean();
    const names = new Map((await Client.find({ _id: { $in: rows.map((r) => r.client).filter(Boolean) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
    return rows.map((r) => ({ ...r, clientName: r.client ? names.get(String(r.client)) ?? '' : '' }));
  }),
);
