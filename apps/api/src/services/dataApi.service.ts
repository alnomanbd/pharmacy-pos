import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * The console's way into the Data API — the separate service that sells the
 * catalogue and the medicine figures (apps/data-api).
 *
 * The Data API keeps its own clients, keys, plans and usage; this only
 * forwards an operator's request to its admin endpoints, server to server,
 * with the admin password the browser never sees and the operator's name for
 * its change log. Whether they may is decided here first (`dataapi.*`).
 */

export const dataApiConfigured = () => Boolean(env.dataApi.url && env.dataApi.token);

/** Only these, so the console cannot be used to reach anything else on that service. */
const ALLOWED = [
  /^\/overview$/,
  /^\/readiness$/,
  /^\/clients$/,
  /^\/clients\/[0-9a-f]{24}$/,
  /^\/clients\/[0-9a-f]{24}\/keys$/,
  /^\/keys\/[0-9a-f]{24}\/revoke$/,
  /^\/plans$/,
  /^\/plans\/[a-z0-9-]{2,40}$/,
  /^\/log$/,
  /^\/preview\/[a-z]+$/,
];

export async function callDataApi(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  opts: { query?: Record<string, unknown>; body?: unknown; operator?: string } = {},
) {
  if (!dataApiConfigured()) {
    throw new AppError(503, 'DATA_API_OFF', 'The Data API is not connected. Set DATA_API_URL and DATA_API_ADMIN_TOKEN on the API.');
  }
  if (!ALLOWED.some((re) => re.test(path))) throw new AppError(404, 'NOT_FOUND', 'Not found');

  const url = new URL(`${env.dataApi.url.replace(/\/+$/, '')}/admin/api${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (typeof v === 'string' && v) url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-admin-token': env.dataApi.token,
        'x-admin-name': (opts.operator ?? 'console').slice(0, 60),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError(502, 'DATA_API_DOWN', 'The Data API did not answer. Is it running?');
  }
  const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string; code?: string } };
  if (!res.ok) {
    // Its admin password being wrong is our configuration, not the operator's mistake.
    if (res.status === 401) throw new AppError(502, 'DATA_API_AUTH', 'The Data API refused the admin password set on this server.');
    throw new AppError(res.status >= 500 ? 502 : res.status, json.error?.code?.toUpperCase() || 'DATA_API', json.error?.message || 'The Data API refused that');
  }
  return json.data;
}
