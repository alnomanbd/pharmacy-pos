import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { handle, HttpError } from '../lib/http.js';
import { monthRange } from '../lib/months.js';
import { DISTRICTS, DIVISIONS, canonicalDistrict } from '../lib/districts.js';
import { requireKey, requireScope, usageNow } from '../middleware/apiKey.js';
import { oid } from '../models.js';
import { env } from '../env.js';
import * as catalogue from '../services/catalogue.js';
import * as demand from '../services/demand.js';

/**
 * The public API, version 1. Every route needs a key; what each answers
 * depends on the key's plan. See /docs for the reference a client reads.
 */
export const v1 = Router();
v1.use(requireKey);

const page = (q: Request['query'], max = 100) =>
  z
    .object({ limit: z.coerce.number().int().min(1).max(max).default(Math.min(25, max)), offset: z.coerce.number().int().min(0).max(100_000).default(0) })
    .parse({ limit: q.limit, offset: q.offset });

/** How many rows went out, for the usage record. */
const sent = <T extends object>(res: Response, body: T, count?: number) => {
  const rows = (body as { rows?: unknown }).rows;
  res.locals.rows = count ?? (Array.isArray(rows) ? rows.length : 1);
  return body;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const idParam = (v: unknown, what: string) => {
  if (v === undefined) return undefined;
  const id = oid(v);
  if (!id) throw new HttpError(400, 'bad_id', `${what} is not an id`);
  return id;
};

/** Filters every figure takes. A district needs the districts part of the plan. */
function filterOf(req: Request): demand.Filter {
  const district = str(req.query.district);
  let d: string | undefined;
  if (district) {
    if (!req.caller!.plan.scopes.includes('districts')) throw new HttpError(403, 'not_in_plan', 'Your plan does not include district figures');
    d = canonicalDistrict(district) ?? (district === 'Unknown' ? 'Unknown' : undefined);
    if (!d) throw new HttpError(400, 'bad_district', 'No such district — see /v1/meta/districts');
  }
  return { district: d, generic: idParam(str(req.query.generic), 'generic'), company: idParam(str(req.query.company), 'company') };
}

const rangeOf = (req: Request) => monthRange(req.query, req.caller!.plan.historyMonths);
const meta = (r: ReturnType<typeof rangeOf>, f: demand.Filter) => ({
  range: { from: r.from, to: r.to, partial: r.partial },
  filter: { district: f.district ?? null, generic: f.generic ? String(f.generic) : null, company: f.company ? String(f.company) : null },
  minShops: env.minShops,
});

/* -------------------------------------------------------------- about -- */

v1.get(
  '/',
  handle(async (req) => ({
    client: req.caller!.clientName,
    plan: { key: req.caller!.plan.key, name: req.caller!.plan.name, includes: req.caller!.plan.scopes, historyMonths: req.caller!.plan.historyMonths },
    minShops: env.minShops,
    figuresBuiltAt: await demand.lastBuilt(),
    docs: '/docs/',
  })),
);

v1.get(
  '/usage',
  handle(async (req) => {
    const u = await usageNow(req.caller!.clientId);
    const p = req.caller!.plan;
    return { ...u, limits: { perMinute: p.requestsPerMinute, perDay: p.requestsPerDay, perMonth: p.requestsPerMonth } };
  }),
);

v1.get(
  '/meta/districts',
  handle(async (_req, res) =>
    sent(res, { rows: DISTRICTS.map((d) => ({ name: d.name, bn: d.bn, division: d.division, divisionBn: DIVISIONS[d.division] })) }),
  ),
);

/* ---------------------------------------------------------- catalogue -- */

v1.get(
  '/catalogue/medicines',
  requireScope('catalogue'),
  handle(async (req, res) =>
    sent(
      res,
      await catalogue.searchMedicines({
        q: str(req.query.q),
        generic: str(req.query.generic),
        company: str(req.query.company),
        form: str(req.query.form),
        ...page(req.query),
      }),
    ),
  ),
);
v1.get('/catalogue/medicines/:id', requireScope('catalogue'), handle(async (req) => catalogue.getMedicine(req.params.id)));
v1.get('/catalogue/generics', requireScope('catalogue'), handle(async (req, res) => sent(res, await catalogue.listNamed('generics', { q: str(req.query.q), ...page(req.query, 500) }))));
v1.get('/catalogue/companies', requireScope('catalogue'), handle(async (req, res) => sent(res, await catalogue.listNamed('companies', { q: str(req.query.q), ...page(req.query, 500) }))));

/* ------------------------------------------------------------ figures -- */

v1.get(
  '/demand/medicines',
  requireScope('demand'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = filterOf(req);
    return sent(res, { ...meta(r, f), ...(await demand.topMedicines(r, f, page(req.query))) });
  }),
);

v1.get(
  '/demand/medicines/:id',
  requireScope('demand'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = { ...filterOf(req), medicine: idParam(req.params.id, 'medicine') };
    const out = await demand.medicineDetail(r, f, req.caller!.plan.scopes.includes('districts') && !f.district);
    if (!out.medicine) throw new HttpError(404, 'not_found', 'No such medicine');
    return sent(res, { ...meta(r, f), ...out }, out.months.length);
  }),
);

v1.get(
  '/demand/generics',
  requireScope('demand'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = filterOf(req);
    return sent(res, { ...meta(r, f), ...(await demand.byGeneric(r, f, page(req.query).limit)) });
  }),
);

v1.get(
  '/demand/generics/:id/brands',
  requireScope('demand'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = { ...filterOf(req), generic: idParam(req.params.id, 'generic') };
    return sent(res, { ...meta(r, f), ...(await demand.brandsOfGeneric(r, f, page(req.query).limit)) });
  }),
);

v1.get(
  '/demand/companies',
  requireScope('demand'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = filterOf(req);
    return sent(res, { ...meta(r, f), ...(await demand.byCompany(r, f, page(req.query).limit)) });
  }),
);

v1.get(
  '/demand/districts',
  requireScope('districts'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = { ...filterOf(req), medicine: idParam(str(req.query.medicine), 'medicine') };
    return sent(res, { ...meta(r, f), ...(await demand.byDistrict(r, f)) });
  }),
);

v1.get(
  '/trends',
  requireScope('trends'),
  handle(async (req, res) => {
    const r = rangeOf(req);
    const f = filterOf(req);
    const out = await demand.trends(r, f, page(req.query, 50).limit);
    return sent(res, { ...meta(r, f), ...out }, out.rising.length + out.falling.length);
  }),
);
