import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as payments from '../services/payment.service.js';
import { invoiceFor, buildInvoicePdf, invoiceFilename } from '../services/invoice.service.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ok, created } from '../utils/response.js';
import { requireOrgAdmin } from '../services/authz.service.js';
import { assertAllowed, UPLOAD_RULES } from '../services/storage.service.js';
import { badRequest } from '../utils/AppError.js';
import { PAYMENT_METHODS } from '../models/Payment.js';
import { exportOrganization } from '../services/tenantData.service.js';
import { audit } from '../services/audit.service.js';
import { quoteForShop } from '../services/coupon.service.js';
import { translateMessage } from '../i18n/messages.js';
import { referralSummary } from '../services/referral.service.js';
import { startCheckout } from '../services/onlinePayment.service.js';
import * as leaving from '../services/leaving.service.js';

/**
 * The shop's own billing: where it stands, and telling us it has paid.
 *
 * Deliberately **not** behind `requireWritableTenant`. A shop whose trial has
 * run out is read-only everywhere else — but this is the page it has to be able
 * to use to stop being read-only. Locking the renewal behind the lock is how a
 * customer who wants to pay ends up unable to.
 */
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_RULES.image.maxBytes, files: 1 },
});

router.use(requireAuth);

const actorOf = (req: { user?: { id: string; role: string; org: string | null } }) => ({
  id: req.user!.id,
  role: req.user!.role as never,
  org: req.user!.org,
});

/** Plan, expiry, what it costs, and the numbers to send it to. */
router.get('/', async (req, res, next) => {
  try {
    ok(res, await payments.subscriptionOf(req.user!.org!));
  } catch (err) {
    next(err);
  }
});

/** What a discount code takes off this plan and these months — the Apply button. Owner only, like paying. */
router.get('/coupon', async (req, res, next) => {
  try {
    await requireOrgAdmin(actorOf(req));
    const months = Math.min(36, Math.max(1, Number(req.query.months) || 1));
    const q = await quoteForShop(req.user!.org!, { code: String(req.query.code ?? ''), plan: String(req.query.plan ?? ''), months });
    // The refusal is shown under the code box — in the screen's language.
    ok(res, q.ok ? q : { ...q, reason: translateMessage(q.reason, req.lang) });
  } catch (err) {
    next(err);
  }
});

/**
 * Starts an online payment through SSLCommerz. The price is worked out here,
 * never taken from the browser; the answer is the gateway page to go to.
 */
router.post(
  '/checkout',
  validate(z.object({ plan: z.string().trim().min(2).max(40), months: z.number().int().min(1).max(36), couponCode: z.string().trim().max(24).optional() })),
  async (req, res, next) => {
    try {
      await requireOrgAdmin(actorOf(req));
      const checkout = await startCheckout(req.user!.org!, req.user!.id, req.body);
      await audit(req, 'billing.payment.submit', { model: 'Payment', id: checkout.paymentId, label: `${checkout.amount} online` }, { after: { gateway: 'sslcommerz', amount: checkout.amount } });
      ok(res, checkout);
    } catch (err) {
      next(err);
    }
  },
);

/** Whether to ask why the shop did not renew, and its answer if it gave one. */
router.get('/leaving', async (req, res, next) => {
  try {
    await requireOrgAdmin(actorOf(req));
    ok(res, await leaving.leavingState(req.user!.org!));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/leaving',
  validate(z.object({ reason: z.enum(leaving.LEAVING_REASONS), note: z.string().trim().max(500).optional() })),
  async (req, res, next) => {
    try {
      await requireOrgAdmin(actorOf(req));
      ok(res, await leaving.answer(req.user!.org!, req.user!.id, req.body), 'Thank you');
    } catch (err) {
      next(err);
    }
  },
);

/** This shop's referral code and how many shops have signed up through it. */
router.get('/referral', async (req, res, next) => {
  try {
    await requireOrgAdmin(actorOf(req));
    ok(res, await referralSummary(req.user!.org!));
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    ok(res, await payments.listOwnPayments(req.user!.org!));
  } catch (err) {
    next(err);
  }
});

/**
 * The receipt for a verified payment, as a PDF.
 *
 * Open to any signed-in member of the shop, not just the owner: the person who
 * files the paperwork is rarely the person whose bKash sent the money.
 */
router.get('/payments/:id/invoice', async (req, res, next) => {
  try {
    const data = await invoiceFor(req.params.id, req.user!.org!);
    const buffer = await buildInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoiceFilename(data)}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
});

const submitSchema = z.object({
  /** A plan key from the catalogue; the service checks it exists and fits. */
  plan: z.string().trim().min(2).max(40),
  months: z.number().int().min(1).max(36),
  amount: z.number().positive().max(10_000_000),
  method: z.enum(PAYMENT_METHODS),
  senderNumber: z.string().trim().max(20).optional(),
  trxId: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
  paidAt: z.string().optional(),
  couponCode: z.string().trim().max(24).optional(),
});

/** Only the owner pays — it is their money and their subscription. */
router.post('/payments', validate(submitSchema), async (req, res, next) => {
  try {
    await requireOrgAdmin(actorOf(req));
    const payment = await payments.submitPayment(req.user!.org!, req.user!.id, req.body);
    /* A claim is a statement about money that somebody will act on. Who made
       it, for how much and when is the first thing asked when one is
       disputed. */
    await audit(req, 'billing.payment.submit', {
      model: 'Payment',
      id: String((payment as { _id?: unknown })._id ?? ''),
      label: `${req.body.amount ?? ''} ${req.body.method ?? ''}`.trim(),
    }, { after: { amount: req.body.amount, method: req.body.method, reference: req.body.reference } });
    created(res, payment, 'Payment submitted — we will confirm it shortly');
  } catch (err) {
    next(err);
  }
});

/** The screenshot, uploaded separately so a failed upload does not lose the claim. */
router.post('/payments/:id/receipt', upload.single('file'), async (req, res, next) => {
  try {
    await requireOrgAdmin(actorOf(req));
    if (!req.file) throw badRequest('No file was uploaded');
    assertAllowed('image', req.file);
    ok(
      res,
      await payments.attachReceipt(req.user!.org!, req.params.id, req.file),
      'Receipt attached',
    );
  } catch (err) {
    next(err);
  }
});

/**
 * A shop's own data, on demand.
 *
 * Lives here rather than under a settings route because it belongs to the same
 * conversation as the subscription: the honest answer to "what happens to my
 * records if I stop paying" is a download link, and it should be next to the
 * page that asks for money.
 */
router.get('/export', async (req, res, next) => {
  try {
    await requireOrgAdmin(actorOf(req));
    const data = await exportOrganization(req.user!.org!);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dawai-export-${stamp}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
});

export default router;
