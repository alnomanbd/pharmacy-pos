import { Types } from 'mongoose';
import { PaymentModel, OrganizationModel, UserModel } from '../models/index.js';
import { sslczConfig, createSession, validatePayment, type Validation } from '../integrations/sslcommerz.js';
import { planByKey } from './plan.service.js';
import { quoteForShop } from './coupon.service.js';
import { acceptPayment } from './payment.service.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Paying online through SSLCommerz, and renewing the moment it clears.
 *
 * 1. The owner picks a plan and months and taps "Pay online". A pending
 *    payment is created with the price worked out here — never a number the
 *    browser sent — and its id is the order id SSLCommerz carries.
 * 2. The browser goes to SSLCommerz, pays, and comes back to `success`,
 *    `fail` or `cancel`. SSLCommerz also calls `ipn` server to server, which
 *    is what still works when the owner closes the tab.
 * 3. Either way, the payment is accepted only once SSLCommerz's own
 *    validation API says it is VALID, for this order, for this amount, in
 *    taka. Accepting is idempotent: success and IPN racing renew once.
 */

/** Whether online payment is set up on this deployment. */
export const onlineEnabled = () => sslczConfig() !== null;

/** Where SSLCommerz sends the browser and its own call back: the API, through the shop's origin. */
function callbackBase() {
  return (process.env.SSLCZ_CALLBACK_BASE?.trim() || `${env.clientUrl.replace(/\/$/, '')}/api`).replace(/\/$/, '');
}

/** SSLCommerz's card_type to our method: "BKASH-BKash" → bkash. Pure. */
export function methodFromCardType(cardType = ''): 'bkash' | 'nagad' | 'rocket' | 'upay' | 'bank' | 'card' {
  const c = cardType.toLowerCase();
  if (c.includes('bkash')) return 'bkash';
  if (c.includes('nagad')) return 'nagad';
  if (c.includes('rocket') || c.includes('dbbl mobile')) return 'rocket';
  if (c.includes('upay')) return 'upay';
  if (c.includes('internet') || c.includes('ibanking') || c.includes('bank')) return 'bank';
  return 'card';
}

/**
 * Whether a validation answer pays for this payment. Pure, for the tests: the
 * whole safety of online payment is in these four comparisons.
 */
export function judgeValidation(
  v: Validation | null,
  p: { id: string; amount: number; currency: string },
): { ok: true } | { ok: false; reason: string } {
  if (!v) return { ok: false, reason: 'The gateway could not be asked about this payment' };
  if (v.status !== 'VALID' && v.status !== 'VALIDATED') return { ok: false, reason: `The gateway says the payment is ${v.status || 'not complete'}` };
  if (v.tran_id !== p.id) return { ok: false, reason: 'The payment is for a different order' };
  if ((v.currency || 'BDT').toUpperCase() !== (p.currency || 'BDT').toUpperCase()) return { ok: false, reason: 'The payment was in another currency' };
  if (Math.abs(Number(v.amount) - p.amount) > 0.5) return { ok: false, reason: `The gateway received ${v.amount}, not ${p.amount}` };
  return { ok: true };
}

export async function startCheckout(
  orgId: string,
  userId: string,
  input: { plan: string; months: number; couponCode?: string },
) {
  const cfg = sslczConfig();
  if (!cfg) throw badRequest('Online payment is not set up yet — please pay by bKash or Nagad and submit it below.');
  const plan = await planByKey(input.plan);
  if (!plan || plan.isTrial || !plan.isActive) throw badRequest('That plan is not available');

  let discount = 0;
  let code = '';
  if (input.couponCode?.trim()) {
    const q = await quoteForShop(orgId, { code: input.couponCode, plan: plan.key, months: input.months });
    if (!q.ok) throw badRequest(q.reason);
    discount = q.discount;
    code = q.code;
  }
  const amount = plan.price * input.months - discount;
  if (amount <= 0) throw badRequest('Nothing to pay — talk to us and we will apply it for you.');

  const [org, user] = await Promise.all([
    OrganizationModel.findById(orgId).select('name contactPhone contactEmail').lean(),
    UserModel.findById(userId).select('name email phone').lean(),
  ]);
  if (!org) throw notFound('Shop');

  const payment = await PaymentModel.create({
    organization: orgId,
    submittedBy: userId,
    gateway: 'sslcommerz',
    method: 'card',
    amount,
    plan: plan.key,
    months: input.months,
    note: 'Paid online',
    paidAt: new Date(),
    coupon: { code, discount },
  });

  const base = callbackBase();
  try {
    const session = await createSession(cfg, {
      tranId: String(payment._id),
      amount,
      productName: `${plan.name} — ${input.months} month${input.months === 1 ? '' : 's'}`,
      customer: { name: user?.name ?? org.name, email: user?.email ?? org.contactEmail ?? '', phone: user?.phone ?? org.contactPhone ?? '' },
      urls: {
        success: `${base}/public/sslcommerz/success`,
        fail: `${base}/public/sslcommerz/fail`,
        cancel: `${base}/public/sslcommerz/cancel`,
        ipn: `${base}/public/sslcommerz/ipn`,
      },
    });
    payment.set('gatewayRef', session.sessionKey);
    await payment.save();
    return { url: session.url, paymentId: String(payment._id), amount };
  } catch (err) {
    // A checkout that never reached the gateway is not a payment anybody should see waiting.
    await payment.deleteOne();
    throw badRequest(err instanceof Error ? err.message : 'The payment gateway did not start the payment');
  }
}

/**
 * Settles a payment from a `val_id` — the IPN and the success return both come
 * here. Returns the payment id and whether it is now accepted.
 */
export async function settle(valId: string, tranIdHint?: string) {
  const cfg = sslczConfig();
  if (!cfg || !valId) return { ok: false as const, reason: 'Online payment is not set up', paymentId: tranIdHint ?? '' };
  const v = await validatePayment(cfg, valId);
  const id = v?.tran_id || tranIdHint || '';
  if (!Types.ObjectId.isValid(id)) return { ok: false as const, reason: 'Unknown order', paymentId: '' };
  const payment = await PaymentModel.findOne({ _id: id, gateway: 'sslcommerz' });
  if (!payment) return { ok: false as const, reason: 'Unknown order', paymentId: id };
  if (payment.status === 'verified') return { ok: true as const, paymentId: id, already: true };
  // Closed by a fail or cancel return — which anybody could post — is not
  // final: if SSLCommerz says the money arrived, it is paid. Only an operator's
  // rejection (which has a reviewer) stands.
  const closedByReturn = payment.status === 'rejected' && !payment.reviewedBy;
  if (payment.status !== 'pending' && !closedByReturn) {
    return { ok: false as const, reason: `That payment is ${payment.status}`, paymentId: id };
  }

  const verdict = judgeValidation(v, { id, amount: payment.amount, currency: payment.currency || 'BDT' });
  if (!verdict.ok) {
    logger.warn({ payment: id, reason: verdict.reason }, 'SSLCommerz payment not accepted');
    return { ok: false as const, reason: verdict.reason, paymentId: id };
  }

  // Claim it before accepting, so success and IPN racing cannot both renew.
  const claimed = await PaymentModel.findOneAndUpdate(
    { _id: id, status: { $in: ['pending', 'rejected'] }, reviewedBy: null, gatewayRef: { $ne: `val:${valId}` } },
    {
      $set: {
        status: 'pending',
        rejectionReason: '',
        gatewayRef: `val:${valId}`,
        method: methodFromCardType(v!.card_type),
        trxId: v!.bank_tran_id || '',
        gatewayPayload: { val_id: v!.val_id, card_type: v!.card_type, bank_tran_id: v!.bank_tran_id, risk_level: v!.risk_level },
      },
    },
    { new: true },
  );
  if (!claimed) return { ok: true as const, paymentId: id, already: true };
  await acceptPayment(claimed, null);
  logger.info({ payment: id, amount: claimed.amount }, 'Online payment accepted');
  return { ok: true as const, paymentId: id };
}

/** The owner came back from a failed or cancelled payment: it is closed, with the reason. */
export async function close(tranId: string, reason: 'failed' | 'cancelled') {
  if (!Types.ObjectId.isValid(tranId)) return;
  await PaymentModel.updateOne(
    { _id: tranId, gateway: 'sslcommerz', status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason: reason === 'cancelled' ? 'You cancelled the online payment' : 'The online payment did not go through',
        reviewedAt: new Date(),
      },
    },
  );
}

/** Where the browser lands back in the shop app. */
export const returnUrl = (result: 'paid' | 'failed' | 'cancelled' | 'pending') =>
  `${env.clientUrl.replace(/\/$/, '')}/subscription?online=${result}`;
