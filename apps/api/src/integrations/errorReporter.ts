import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger.js';

/**
 * Reporting crashes off the box.
 *
 * Without this, a production failure exists only in a log file on a server
 * nobody is watching — the first anyone hears of it is a shop ringing to say
 * the till is broken, and by then the log has rotated.
 *
 * **This application handles health data, and an error reporter is a pipe to a
 * third party.** So the default posture is inverted from the SDK's: nothing
 * about a request body, a query string, a header or a cookie leaves this process.
 * What is sent is the stack, the route pattern, and who was acting — enough to
 * find the bug, and not enough to leak a customer.
 *
 * Off unless `SENTRY_DSN` is set, in which case failures are logged as they
 * always were.
 */

let active = false;

/** Keys that must never appear in a report, wherever they are nested. */
const SECRET_KEYS = /pass|token|secret|authorization|cookie|otp|code|key/i;
/** Values that identify a person rather than a fault. */
const PII_KEYS = /name|phone|email|address|dob|nid|note|customer/i;

/** Recursively strips anything sensitive, keeping the shape for debugging. */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key)) out[key] = '[redacted]';
    else if (PII_KEYS.test(key)) out[key] = '[pii]';
    else out[key] = scrub(v, depth + 1);
  }
  return out;
}

export function initErrorReporting() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('SENTRY_DSN not set; errors are logged only');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION,
    // A fraction, not everything: traces on a till are mostly noise, and
    // each one is another chance to carry data off the box.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
    // The SDK attaches request bodies, headers and cookies by default. On an app
    // holding a shop's books, that would post its customers to a third party.
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        // The query string carries customer search terms.
        delete event.request.query_string;
      }
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      // The user is identified by id and role only — never by name or email.
      if (event.user) {
        event.user = { id: event.user.id, ...(event.user.role ? { role: event.user.role } : {}) };
      }
      return event;
    },
  });

  active = true;
  logger.info({ environment: process.env.NODE_ENV }, 'Error reporting enabled');
}

/**
 * Reports a fault.
 *
 * The context is deliberately thin: which shop, which user, which route — the
 * three things that make a stack trace reproducible, and nothing that describes
 * a person.
 */
export function reportError(
  err: unknown,
  context?: { userId?: string; orgId?: string; role?: string; route?: string },
) {
  if (!active) return;
  try {
    Sentry.withScope((scope) => {
      if (context?.userId) scope.setUser({ id: context.userId, role: context.role });
      if (context?.orgId) scope.setTag('organization', context.orgId);
      if (context?.route) scope.setTag('route', context.route);
      Sentry.captureException(err);
    });
  } catch (reportingError) {
    // A reporter that throws must never take down the request it was reporting.
    logger.warn({ err: reportingError }, 'Error reporter failed');
  }
}

export const errorReportingActive = () => active;
