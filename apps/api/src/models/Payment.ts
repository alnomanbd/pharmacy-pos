import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A shop paying for its subscription.
 *
 * Today every payment is **manual**: the shop sends money by bKash, Nagad,
 * Upay, Rocket or cash and then tells us about it — which number it came from,
 * the transaction id, and usually a screenshot. An operator checks it against
 * the receiving account and marks it verified, which is what extends the
 * subscription.
 *
 * That is not a stopgap shape. It is how most of this market actually pays, and
 * it stays useful after a card gateway exists — cash at the counter and a
 * personal bKash transfer will not go through SSLCommerz. So the record is the
 * same either way, and `gateway` says how it arrived: `manual` now,
 * `sslcommerz` when that is wired, with the gateway's own reference in
 * `gatewayRef` and its raw callback kept in `gatewayPayload` for reconciliation.
 *
 * Verification is deliberately a human act with a name attached. Money moving
 * on somebody's say-so needs an answer to "who accepted this".
 */
export const PAYMENT_METHODS = ['bkash', 'nagad', 'upay', 'rocket', 'bank', 'cash', 'card'] as const;
export const PAYMENT_STATUS = ['pending', 'verified', 'rejected'] as const;
export const PAYMENT_GATEWAYS = ['manual', 'sslcommerz'] as const;

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Who at the shop submitted it. */
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * Set when an operator entered the payment by hand — cash at the office, a
     * bKash payment reported over the phone — rather than the shop claiming it.
     * Such a payment is verified the moment it is recorded, by that operator.
     */
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    gateway: { type: String, enum: PAYMENT_GATEWAYS, default: 'manual', index: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT' },

    /**
     * What the shop is buying: the plan's catalogue key, and how many months.
     * Plans are rows now, not an enum — see Plan.ts.
     */
    plan: { type: String, required: true },
    months: { type: Number, default: 1, min: 1, max: 36 },

    /** The number the money was sent from — how an operator finds it. */
    senderNumber: { type: String, default: '', trim: true },
    /** The mobile-wallet transaction id. Unique per gateway; see the index below. */
    trxId: { type: String, default: '', trim: true, index: true },
    /** Storage key of the screenshot, served through /api/files. */
    receipt: { type: String, default: '' },
    note: { type: String, default: '' },
    paidAt: { type: Date },

    status: { type: String, enum: PAYMENT_STATUS, default: 'pending', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    /** What this payment bought — set when it is verified. */
    coversUntil: { type: Date, default: null },

    /**
     * The receipt number, issued when the payment is verified.
     *
     * Kept on the payment rather than in a separate collection: an invoice here
     * is one verified payment, and a second document would only be able to say
     * the same things twice and drift.
     */
    invoiceNo: { type: String, default: '', trim: true },
    invoicedAt: { type: Date, default: null },

    gatewayRef: { type: String, default: '', index: true },
    gatewayPayload: { type: Object, default: null },
  },
  { timestamps: true },
);

/**
 * One transaction id can only be claimed once.
 *
 * Sparse, because cash payments have no id, and partial on a non-empty string so
 * the blanks do not collide. Without it the same bKash reference could be
 * submitted by two shops — or twice by one — and an operator glancing at a
 * screenshot would have no reason to notice.
 */
schema.index(
  { gateway: 1, trxId: 1 },
  { unique: true, partialFilterExpression: { trxId: { $type: 'string', $ne: '' } } },
);
schema.index({ status: 1, createdAt: -1 });
// Sparse: only verified payments carry one, and no number is ever reused.
schema.index(
  { invoiceNo: 1 },
  { unique: true, partialFilterExpression: { invoiceNo: { $type: 'string', $ne: '' } } },
);

export type Payment = InferSchemaType<typeof schema>;
export type PaymentDoc = HydratedDocument<Payment>;

export const PaymentModel = model('Payment', schema);
