/**
 * Telling the server when something breaks in the browser.
 *
 * Render crashes (from the ErrorBoundary), uncaught errors and unhandled
 * promise rejections go to `/api/public/client-error`, where they are grouped,
 * kept for the console's System page, and passed on to Sentry when it is set
 * up. What is sent: the message, the stack, the page without its query
 * string, and the build. Never the bill, the customer, or what was typed.
 *
 * Quiet by design: at most ten reports a page load, each distinct message
 * once, and nothing from browser extensions or the browser's own noise.
 */

type App = 'shop' | 'console' | 'site';

let app: App | null = null;
let sent = 0;
const seen = new Set<string>();
const MAX_PER_PAGE = 10;

/* Not ours, or not a fault: an extension's script, the ResizeObserver
   warning every browser emits, and a cancelled request. */
const NOISE = [/ResizeObserver loop/i, /chrome-extension:|moz-extension:|safari-extension:/i, /^Script error\.?$/i, /AbortError|The user aborted a request/i];

function release() {
  try {
    return String((import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION ?? '');
  } catch {
    return '';
  }
}

export function reportClientError(error: unknown, extraStack = '') {
  if (!app || sent >= MAX_PER_PAGE || typeof window === 'undefined') return;
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error)?.slice(0, 300) ?? 'Unknown error');
  const message = String(err.message || err.name || 'Error').slice(0, 500);
  const stack = `${err.stack ?? ''}${extraStack ? `\n--- component ---${extraStack}` : ''}`.slice(0, 4000);
  if (NOISE.some((rx) => rx.test(message) || rx.test(stack))) return;
  if (seen.has(message)) return;
  seen.add(message);
  sent++;
  try {
    void fetch('/api/public/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, message, stack, path: window.location.pathname, release: release() }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    /* Reporting must never become the second error. */
  }
}

/** Once, at start-up. */
export function installErrorReporting(name: App) {
  if (app || typeof window === 'undefined') return;
  app = name;
  window.addEventListener('error', (e) => {
    /* A failed <img> or <script> fires here too, with no error attached — not a crash. */
    if (e.error) reportClientError(e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    /* An API answer the page did not catch is the API's to report, and already is. */
    if (r && typeof r === 'object' && 'isAxiosError' in r) return;
    reportClientError(r);
  });
}
