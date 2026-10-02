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

/** Where a shop's referral code waits, this tab only, between the landing page and the sign-up. */
const REF_KEY = 'dawai.ref';
const REF_RX = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * Remembers `?ref=` from a shop's sign-up link.
 *
 * The link is often opened on the home page and the visitor only reaches the
 * sign-up form three pages later, by which time the address has lost it.
 */
export function rememberReferral() {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams(window.location.search);
  const ref = q.get('ref')?.trim().toUpperCase();
  const agent = q.get('agent')?.trim().toUpperCase();
  try {
    if (ref && REF_RX.test(ref)) sessionStorage.setItem(REF_KEY, ref);
    // A field agent's link: `?agent=RAHIM`. Same lifetime as a referral.
    if (agent && AGENT_RX.test(agent)) sessionStorage.setItem(AGENT_KEY, agent);
  } catch {
    /* Without storage it still works when the link goes straight to the form. */
  }
}

const AGENT_KEY = 'dawai.agent';
const AGENT_RX = /^[A-Z0-9-]{3,24}$/;

/** The field agent's code to send with a sign-up, from the address or from earlier in the visit. */
export function agentCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUrl = new URLSearchParams(window.location.search).get('agent')?.trim().toUpperCase();
  if (fromUrl && AGENT_RX.test(fromUrl)) return fromUrl;
  try {
    const kept = sessionStorage.getItem(AGENT_KEY);
    return kept && AGENT_RX.test(kept) ? kept : undefined;
  } catch {
    return undefined;
  }
}

/** The referral code to send with a sign-up, from the address or from earlier in the visit. */
export function referralCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUrl = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase();
  if (fromUrl && REF_RX.test(fromUrl)) return fromUrl;
  try {
    const kept = sessionStorage.getItem(REF_KEY);
    return kept && REF_RX.test(kept) ? kept : undefined;
  } catch {
    return undefined;
  }
}
