import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import * as plans from '../services/plan.service.js';
import * as leads from '../services/lead.service.js';
import { validate } from '../middlewares/validate.js';
import { ok, created } from '../utils/response.js';
import { isProduction } from '../config/env.js';
import * as online from '../services/onlinePayment.service.js';
import { publicStatus } from '../services/status.service.js';
import { publicSiteSettings, liveStats, getSiteSettings } from '../services/siteSettings.service.js';
import { publishedList, publishedOne } from '../services/help.service.js';
import { startDemo } from '../services/impersonation.service.js';

/**
 * The marketing site's endpoints.
 *
 * Everything here takes **no credentials at all** and is served to whoever
 * asks, so it is deliberately the smallest surface that makes the public site
 * work: the plan catalogue it prints, and the enquiry form it posts.
 *
 * That is also why it is its own router rather than a couple of unauthenticated
 * routes bolted onto `/platform` or `/billing`. A file whose every route is
 * public can be read in one sitting and audited as a unit; an anonymous route
 * hiding among thirty authenticated ones is the kind of thing that survives a
 * review.
 *
 * Two things are true of every response here:
 *
 * - **It says nothing about any shop.** Plans are the price list, not who is
 *   on them. There is no count, no customer name, no "12 shops on Pharmacy
 *   Plus" — that is business information, and this endpoint is a billboard.
 * - **It cannot be used to enumerate.** Nothing takes an id. `GET /plans`
 *   returns the whole (small, cached) list, so there is no per-record lookup to
 *   walk.
 */
const router = Router();

/* -------------------------------------------------------------------------- */
/* The price list                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What the pricing page prints.
 *
 * The landing site used to carry a hand-kept copy of this in
 * `landing-website/src/lib/plans.ts`, which meant an operator who changed a
 * price in the console changed it everywhere except the page customers read it
 * on. Now there is one source: this.
 *
 * Retired plans are left out — the site should not offer something nobody can
 * buy — but the trial *is* included, because "14 days free" is the first thing
 * the page says and it is a fact about the catalogue, not a slogan.
 */
router.get('/plans', async (_req, res, next) => {
  try {
    const rows = await plans.publicPlans();
    /*
     * Cacheable, and briefly. The pricing page is the most-hit page on the
     * marketing site and this list changes perhaps monthly, so a minute at the
     * edge removes essentially all of the load; `stale-while-revalidate` means
     * nobody ever waits for the refresh.
     */
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    ok(res, rows);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* The enquiry form                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Tighter than the outer public ceiling, and per address rather than per
 * window: this is a write, it sends no email, and one person filing five
 * enquiries in an hour is already unusual. The service adds a per-email
 * duplicate window on top, which is what actually catches a double-click.
 */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 8 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many messages from this connection. Please write to us by email instead.',
    data: null,
  },
});

/*
 * The messages are written for the person looking at the form, not for a
 * developer reading a log: this schema runs in front of a public page, and
 * "Invalid email" arriving under somebody's typo is the difference between a
 * corrected address and an abandoned enquiry.
 */
const contactSchema = z.object({
  name: z.string().min(1, 'Please tell us your name.').max(120),
  email: z.string().email('That email address does not look right.').max(200),
  shop: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  topic: z.string().max(120).optional(),
  message: z
    .string()
    .min(10, 'Please say a little more about what you need — a line or two is plenty.')
    .max(4000, 'That is longer than the form takes. Please email us the details instead.'),
  lang: z.enum(['en', 'bn']).optional(),
  /*
   * The honeypot. Named for what it looks like to a bot filling every field it
   * can see, and never rendered visibly by the form. Accepted by the schema —
   * rejecting it here would answer 400 and tell the bot which field to leave
   * alone; the service files it as spam and answers like a success instead.
   */
  trap: z.string().max(200).optional(),
  /*
   * Where the visitor came from, read off the URL by the marketing site.
   *
   * Optional and length-capped: it arrives from a public form, so it is
   * attacker-controlled text like everything else here, and it is only ever
   * read back as a label in the console.
   */
  utm: z
    .object({
      source: z.string().max(80).optional(),
      medium: z.string().max(80).optional(),
      campaign: z.string().max(120).optional(),
      content: z.string().max(120).optional(),
      term: z.string().max(120).optional(),
    })
    .optional(),
  fbclid: z.string().max(300).optional(),
  referrer: z.string().max(300).optional(),
  landingPage: z.string().max(160).optional(),
});

router.post('/contact', contactLimiter, validate(contactSchema), async (req, res, next) => {
  try {
    const result = await leads.submitLead(req.body, {
      /* `req.ip` honours `trust proxy`, which the server sets when deployed
         behind one — otherwise every enquiry would be recorded from the load
         balancer and the rate limit would be shared by the whole internet. */
      ip: req.ip,
      userAgent: req.get('user-agent') ?? '',
      source: 'landing',
    });
    created(res, result, 'Thanks — we have it, and we will reply.');
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ how to reach us ----------------------------- */

/** The website's contact details, as set in the console — the WhatsApp number. */
router.get('/site', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    ok(res, await publicSiteSettings());
  } catch (err) {
    next(err);
  }
});

/** The home page's live band — totals across every shop, or null when it is switched off. */
router.get('/stats', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    ok(res, await liveStats());
  } catch (err) {
    next(err);
  }
});

/*
 * "Try the demo": a one-time code for a read-only look at the demo shop.
 * Limited per address — each code is a session, and a script asking for
 * thousands is not a visitor.
 */
const demoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: isProduction ? 20 : 500, standardHeaders: true, legacyHeaders: false });
router.post('/demo', demoLimiter, async (_req, res, next) => {
  try {
    ok(res, await startDemo());
  } catch (err) {
    next(err);
  }
});

/*
 * Guides: the help articles the shops read, on the website too — while the
 * console has them on (Website → Guides on the website).
 */
router.get('/guides', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=120');
    ok(res, (await getSiteSettings()).guidesOnWebsite ? await publishedList() : []);
  } catch (err) {
    next(err);
  }
});
router.get('/guides/:slug', async (req, res, next) => {
  try {
    if (!(await getSiteSettings()).guidesOnWebsite) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=120');
    ok(res, await publishedOne(String(req.params.slug)));
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- status ---------------------------------- */

/** The public status page's data: each part's state, open incidents, the last two weeks. */
router.get('/status', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=30');
    ok(res, await publicStatus());
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ SSLCommerz -------------------------------- */

/*
 * Where SSLCommerz sends the owner's browser back, and where it calls us
 * itself. Public, because neither carries a session; nothing here is believed
 * until SSLCommerz's own validation API confirms it — see onlinePayment.service.
 */
const field = (body: unknown, k: string) => {
  const v = (body as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'string' ? v.slice(0, 120) : '';
};

/** Server to server: still settles a payment when the owner closed the tab. */
router.post('/sslcommerz/ipn', async (req, res) => {
  try {
    const r = await online.settle(field(req.body, 'val_id'), field(req.body, 'tran_id'));
    res.status(200).json({ received: true, accepted: r.ok });
  } catch {
    res.status(200).json({ received: true, accepted: false });
  }
});

router.post('/sslcommerz/success', async (req, res) => {
  try {
    const r = await online.settle(field(req.body, 'val_id'), field(req.body, 'tran_id'));
    res.redirect(303, online.returnUrl(r.ok ? 'paid' : 'pending'));
  } catch {
    res.redirect(303, online.returnUrl('pending'));
  }
});

router.post('/sslcommerz/fail', async (req, res) => {
  await online.close(field(req.body, 'tran_id'), 'failed').catch(() => undefined);
  res.redirect(303, online.returnUrl('failed'));
});

router.post('/sslcommerz/cancel', async (req, res) => {
  await online.close(field(req.body, 'tran_id'), 'cancelled').catch(() => undefined);
  res.redirect(303, online.returnUrl('cancelled'));
});

export default router;
