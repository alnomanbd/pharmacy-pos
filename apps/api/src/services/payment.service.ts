import { PaymentModel, OrganizationModel, UserModel } from '../models/index.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import { storage, keys } from './storage.service.js';
import { invoiceNumberFor } from './invoice.service.js';
import { logger } from '../utils/logger.js';
import * as notify from './notification.service.js';
import { purchasablePlans, planByKey } from './plan.service.js';

/**
 * Subscriptions, and the money that pays for them.
 *
 * Payment is manual: a shop sends money by bKash, Nagad, Upay, Rocket or cash
 * and reports it; an operator checks it against the receiving account and marks
 * it verified. Verification is the only thing that extends a subscription —
 * submitting a claim buys nothing, or the honour system would be the product's
 * billing system.
 *
 * A card gateway changes only where the claim comes from. `verifyPayment` is
 * what SSLCommerz's callback will call once it exists, having already set
 * `gateway: 'sslcommerz'` and its own reference; the extension logic below does
 * not need to know the difference.
 */

export interface PaymentClaim {
  /** A `Plan.key` from the catalogue. */
  plan: string;
  months: number;
  amount: number;
  method: 'bkash' | 'nagad' | 'upay' | 'rocket' | 'bank' | 'cash' | 'card';
  senderNumber?: string;
  trxId?: string;
  note?: string;
  paidAt?: string;
}

/**
 * Records a payment a shop says it has made.
 *
 * Nothing about the subscription changes here. The shop sees "submitted, being
 * checked", which is the truthful state — the money has not been confirmed to
 * exist yet.
 */
export async function submitPayment(orgId: string, userId: string, claim: PaymentClaim) {
  const org = await OrganizationModel.findById(orgId).select('name').lean();
  if (!org) throw notFound('Shop');

  const plan = await planByKey(claim.plan);
  if (!plan || plan.isTrial) throw badRequest('That plan is not available');

  const expected = plan.price * claim.months;
  if (claim.amount <= 0) throw badRequest('Enter the amount you sent');

  // Not a hard equality: a shop may round up, or pay a part now. A shortfall
  // is flagged for the operator rather than refused at the door, because the
  // money has already left their account by this point.
  const shortfall = expected - claim.amount;

  if (claim.trxId?.trim()) {
    const clash = await PaymentModel.findOne({
      gateway: 'manual',
      trxId: claim.trxId.trim(),
    }).lean();
    if (clash) {
      throw conflict('That transaction id has already been submitted');
    }
  }

  const payment = await PaymentModel.create({
    organization: orgId,
    submittedBy: userId,
    gateway: 'manual',
    method: claim.method,
    amount: claim.amount,
    plan: claim.plan,
    months: claim.months,
    senderNumber: claim.senderNumber?.trim() || '',
    trxId: claim.trxId?.trim() || '',
    note: claim.note?.trim() || '',
    paidAt: claim.paidAt ? new Date(claim.paidAt) : new Date(),
  });

  logger.info(
    { org: orgId, payment: payment.id, amount: claim.amount, expected, shortfall },
    'Payment submitted for review',
  );

  const submitter = await UserModel.findById(userId).select('name email').lean();
  if (submitter?.email) {
    void notify.paymentReceived({
      email: submitter.email,
      name: submitter.name,
      amount: claim.amount,
      method: claim.method,
      trxId: claim.trxId,
    });
  }
  void notify.paymentAwaitingReview(org?.name ?? 'A shop', claim.amount, claim.method);

  return { payment: payment.toObject(), expected, shortfall: shortfall > 0 ? shortfall : 0 };
}

/** Attaches the screenshot. Separate from submit so the upload can fail alone. */
export async function attachReceipt(
  orgId: string,
  paymentId: string,
  file: { buffer: Buffer; mimetype: string },
) {
  const payment = await PaymentModel.findOne({ _id: paymentId, organization: orgId });
  if (!payment) throw notFound('Payment');
  if (payment.status !== 'pending') throw badRequest('That payment has already been reviewed');

  const stored = await storage.save(keys.payment(orgId, paymentId), file);
  const previous = payment.receipt;
  payment.set('receipt', stored.key);
  await payment.save();
  if (previous && previous !== stored.key) await storage.remove(previous).catch(() => undefined);

  return stored;
}

export async function listOwnPayments(orgId: string) {
  return PaymentModel.find({ organization: orgId }).sort({ createdAt: -1 }).limit(50).lean();
}

/** The operator's queue. Pending first, because that is the work. */
export async function listPayments(opts: { status?: string; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));
  const filter = opts.status ? { status: opts.status } : {};

  const [data, total] = await Promise.all([
    PaymentModel.find(filter)
      .populate('organization', 'name plan status trialEndsAt')
      .populate('submittedBy', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PaymentModel.countDocuments(filter),
  ]);

  return { data, total, page, limit };
}

/**
 * Accepts a payment and extends the shop's subscription.
 *
 * The new expiry runs from **whichever is later**, today or the shop's current
 * expiry — paying early must not throw away the days already bought, and paying
 * late must not backdate the renewal into the past.
 *
 * Verifying also lifts a suspension, because the usual reason a shop is
 * suspended is that it had not paid.
 */
export async function verifyPayment(paymentId: string, reviewerId: string) {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) throw notFound('Payment');
  if (payment.status !== 'pending') throw badRequest(`That payment is already ${payment.status}`);
  return acceptPayment(payment, reviewerId);
}

/** The new expiry for `months` bought on top of whatever is left — see `verifyPayment`. */
export function extendedUntil(currentEnd: Date | null | undefined, months: number, now = new Date()): Date {
  const from = currentEnd && currentEnd > now ? currentEnd : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  return until;
}

async function acceptPayment(payment: InstanceType<typeof PaymentModel>, reviewerId: string) {

  const org = await OrganizationModel.findById(payment.organization);
  if (!org) throw notFound('Shop');

  const now = new Date();
  const coversUntil = extendedUntil(org.trialEndsAt, payment.months, now);

  org.set('plan', payment.plan);
  org.set('trialEndsAt', coversUntil);
  if (org.status === 'suspended') {
    org.set('status', 'active');
    org.set('isActive', true);
    org.set('suspendedReason', '');
  }
  await org.save();

  payment.set('status', 'verified');
  payment.set('reviewedBy', reviewerId);
  payment.set('reviewedAt', now);
  payment.set('coversUntil', coversUntil);
  await payment.save();

  // The receipt number is part of accepting the money, not an afterthought:
  // the shop's confirmation email quotes it.
  const invoiceNo = await invoiceNumberFor(payment.id);

  logger.info(
    { org: org.id, payment: payment.id, plan: payment.plan, coversUntil, invoiceNo },
    'Payment verified, subscription extended',
  );

  // The shop hears about it — the person who claimed it, or the owner when an
  // operator recorded it and there is nobody at the shop who did.
  const submitter = await UserModel.findById(payment.submittedBy).select('name email organization').lean();
  const recipient =
    submitter && String(submitter.organization) === String(org._id)
      ? submitter
      : await UserModel.findOne({ organization: org._id, role: 'admin', isActive: { $ne: false } })
          .select('name email')
          .sort({ createdAt: 1 })
          .lean();
  if (recipient?.email) {
    void notify.paymentVerified({
      email: recipient.email,
      name: recipient.name,
      shop: org.name,
      amount: payment.amount,
      plan: payment.plan,
      coversUntil,
      invoiceNo,
    });
  }

  return { payment: payment.toObject(), organization: org.toObject() };
}

/**
 * A payment an operator takes by hand: cash at the office, or a bKash payment
 * an owner reports over the phone instead of in the app.
 *
 * Recorded and accepted in one step, by the operator entering it — they are the
 * one who has checked the money, which is everything verifying means. It
 * extends the subscription exactly as a verified claim does, gets a receipt
 * number, and the owner is emailed the confirmation.
 */
export async function recordPayment(orgId: string, operatorId: string, claim: PaymentClaim) {
  const org = await OrganizationModel.findById(orgId).select('name').lean();
  if (!org) throw notFound('Shop');

  const plan = await planByKey(claim.plan);
  if (!plan || plan.isTrial) throw badRequest('Pick a paid plan');
  if (!(claim.amount > 0)) throw badRequest('Enter the amount received');

  const trxId = claim.trxId?.trim() || '';
  if (trxId && (await PaymentModel.exists({ gateway: 'manual', trxId }))) {
    throw conflict('That transaction id has already been recorded');
  }

  const payment = await PaymentModel.create({
    organization: orgId,
    submittedBy: operatorId,
    recordedBy: operatorId,
    gateway: 'manual',
    method: claim.method,
    amount: claim.amount,
    plan: claim.plan,
    months: claim.months,
    senderNumber: claim.senderNumber?.trim() || '',
    trxId,
    note: claim.note?.trim() || '',
    paidAt: claim.paidAt ? new Date(claim.paidAt) : new Date(),
  });

  logger.info({ org: orgId, payment: payment.id, amount: claim.amount, by: operatorId }, 'Payment recorded by an operator');
  const result = await acceptPayment(payment, operatorId);
  return { ...result, expected: plan.price * claim.months };
}

export async function rejectPayment(paymentId: string, reviewerId: string, reason: string) {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) throw notFound('Payment');
  if (payment.status !== 'pending') throw badRequest(`That payment is already ${payment.status}`);

  payment.set('status', 'rejected');
  // The shop is shown this, so a rejection is answerable rather than silent.
  payment.set('rejectionReason', (reason || '').trim() || 'Could not be matched to a received payment');
  payment.set('reviewedBy', reviewerId);
  payment.set('reviewedAt', new Date());
  await payment.save();

  const submitter = await UserModel.findById(payment.submittedBy).select('name email').lean();
  if (submitter?.email) {
    void notify.paymentRejected({
      email: submitter.email,
      name: submitter.name,
      amount: payment.amount,
      reason: payment.rejectionReason,
    });
  }

  return payment.toObject();
}

/**
 * Where a shop stands: what it is on, until when, and what it would cost.
 *
 * Read by the shop's own billing page, so it answers "what do I owe and where
 * do I send it" without the owner having to ask anybody.
 */
export async function subscriptionOf(orgId: string) {
  const org = await OrganizationModel.findById(orgId)
    .select('plan status trialEndsAt suspendedReason intendedPlan')
    .lean();
  if (!org) throw notFound('Shop');

  const endsAt = org.trialEndsAt ?? null;
  const daysLeft = endsAt
    ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000)
    : null;

  const [pending, owner] = await Promise.all([
    PaymentModel.countDocuments({ organization: orgId, status: 'pending' }),
    UserModel.findOne({ organization: orgId }).select('name').sort({ createdAt: 1 }).lean(),
  ]);

  return {
    plan: org.plan,
    status: org.status,
    endsAt,
    daysLeft,
    expired: daysLeft !== null && daysLeft < 0,
    suspendedReason: org.suspendedReason || '',
    pendingPayments: pending,
    /** What the shop said it was signing up for — offered first. */
    intendedPlan: org.intendedPlan || '',
    /** The plans a shop can buy, read from the catalogue the operator maintains. */
    plans: await purchasablePlans(),
    /** What they are on now, so the page can say so by name. */
    planName: (await planByKey(org.plan || 'trial'))?.name ?? org.plan,
    /** Where to send the money. Configured per deployment, not per shop. */
    payTo: {
      bkash: process.env.PAY_BKASH || '',
      nagad: process.env.PAY_NAGAD || '',
      upay: process.env.PAY_UPAY || '',
      rocket: process.env.PAY_ROCKET || '',
      bank: process.env.PAY_BANK || '',
    },
    ownerName: owner?.name ?? '',
  };
}
