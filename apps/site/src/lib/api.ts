import { siteConfig } from '@/lib/site';

/**
 * The marketing site's only conversation with the Dawai API: a sign-up and an
 * enquiry. Both are public endpoints (`/api/auth/register`, `/api/public/contact`)
 * allowed for this origin by the API's CORS list.
 *
 * Always resolves — a form wants "it worked" or "here is why not", never an
 * unhandled rejection — and the reason is the server's own sentence when it
 * sent one, because those are written for the person looking at the form.
 */
export async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string; fields?: Record<string, string[]> }> {
  try {
    const res = await fetch(`${siteConfig.apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as {
      message?: string;
      errors?: { fieldErrors?: Record<string, string[]> } | null;
    } | null;
    const fields = json?.errors?.fieldErrors;
    /* "Validation failed" says nothing to a shop owner; the first field's own
       sentence ("That email address does not look right") does. */
    const first = fields ? Object.values(fields).flat()[0] : undefined;
    return { ok: false, message: first || json?.message || '', fields };
  } catch {
    return { ok: false, message: '' };
  }
}

/** Where the visitor came from, read off the URL — a label for the operator, never trusted. */
export function attribution() {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const pick = (k: string) => q.get(k)?.slice(0, 120) || undefined;
  const utm = {
    source: pick('utm_source'),
    medium: pick('utm_medium'),
    campaign: pick('utm_campaign'),
    content: pick('utm_content'),
    term: pick('utm_term'),
  };
  return {
    utm: Object.values(utm).some(Boolean) ? utm : undefined,
    fbclid: pick('fbclid'),
    referrer: document.referrer ? document.referrer.slice(0, 300) : undefined,
    landingPage: window.location.pathname.slice(0, 160),
  };
}
