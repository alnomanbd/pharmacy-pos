import { uiLang } from './middlewares/uiLang.js';
import { limitReply } from './i18n/messages.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.js';

const app = express();

/*
 * Whether to believe `X-Forwarded-For`.
 *
 * Every rate limit below keys on `req.ip`, and the public contact form is a
 * write that anybody can reach — so behind a proxy this has to be set (see
 * `TRUST_PROXY` in config/env.ts), and with nothing in front of the app it must
 * stay off, or a caller can spoof their address and walk around the limit by
 * changing a header.
 */
if (env.trustProxy) {
  const hops = Number(env.trustProxy);
  app.set('trust proxy', Number.isFinite(hops) && String(hops) === env.trustProxy ? hops : env.trustProxy);
}

app.use(helmet());
app.use(
  cors({
    /*
     * Three origins, not one: the shop app (`CLIENT_URL`), the operator
     * console (`CONSOLE_URL`) and the public marketing site (`SITE_URL`).
     *
     * In production the first two proxy `/api` on their own host and so never
     * reach this list at all; they are named anyway for
     * deployments that serve the API on a host of its own. The marketing site
     * always needs it — it is a different host calling `/api/public/*` from the
     * browser, and a single-origin policy here is what made its contact form
     * fail with nothing in the server log to show for it: a CORS refusal
     * happens in the browser.
     */
    origin: [env.clientUrl, env.consoleUrl, ...env.siteUrls],
    credentials: false,
    /*
     * Response headers the browser is allowed to read.
     *
     * A cross-origin fetch can see only the CORS-safelisted headers unless they
     * are named here — so `X-Pdf-Unicode`, which tells the settings page whether
     * this server can draw Bangla, was set by the API and then silently
     * unreadable in the frontend. `Content-Disposition` is exposed for the same
     * reason: the download filename comes from it.
     */
    exposedHeaders: ['X-Pdf-Unicode', 'Content-Disposition'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(uiLang);
app.use(express.urlencoded({ extended: true }));
/*
 * The session's refresh token arrives as an httpOnly cookie rather than in the
 * body — see backend/src/utils/cookies.ts for why, and for why there is no CSRF
 * token alongside it.
 */
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitReply('Too many requests. Please try again shortly.'),
});
app.use('/api/auth', authLimiter);

/**
 * Signing in has its own, far tighter ceiling.
 *
 * The surrounding limit covers the whole auth surface, most of which is cheap
 * and harmless to retry. This one covers the endpoint that is worth attacking,
 * and it is per address — the per-account lock in `auth.service.ts` is what
 * covers the same password list arriving from a thousand of them.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  // Successful sign-ins do not count: a busy shop where five people share a
  // connection should not run out of logins by using the product.
  skipSuccessfulRequests: true,
  message: limitReply('Too many sign-in attempts from this network. Please try again later.'),
});
app.use('/api/auth/login', loginLimiter);

/**
 * The reference catalogs are the heaviest reads in the app — 25.9k medicine
 * brands, and the search runs on every keystroke at the till.
 * Only /api/auth was limited before, so these were an unmetered way to load the
 * database. The ceiling is high enough for real typing (ringing up a bill is
 * tens of requests, not hundreds per minute) and low enough to stop a
 * script.
 */
const referenceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 120 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitReply('Too many search requests. Please slow down.'),
});
app.use('/api/medicines', referenceLimiter);

/**
 * The marketing site's endpoints take no credentials, so they need their own
 * ceiling. Generous for the price list (one cached read per visit); the enquiry
 * form carries a far tighter per-hour limit inside its router, because it writes.
 */
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 240 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitReply('Too many requests. Please try again shortly.'),
});
app.use('/api/public', publicLimiter);

/* A sign-up creates an account and sends two emails, so it is held far tighter
   than a sign-in: a real shop signs up once. */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitReply('Too many sign-ups from this network. Please try again later.'),
});
app.use('/api/auth/register', registerLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

