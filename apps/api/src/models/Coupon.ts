import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A discount code a shop types in when it pays: "FIRST50" for half off the
 * first month, "EID500" for ৳500 off at Eid.
 *
 * Counted when the money is accepted, not when a code is typed — a rejected
 * payment must not use up a code that is limited to fifty shops. Every rule
 * the code carries (which plans, how many months at least, first payment only,
 * once per shop, how many shops in all, until when) is checked when the shop
 * applies it and again when the payment is submitted. Once the money is in it
 * is accepted as quoted, even if the code ran out in between.
 */
export const COUPON_KINDS = ['percent', 'amount'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

const schema = new Schema(
  {
    /** Upper case, letters, digits and dashes. What the shop types. */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    description: { type: String, default: '', trim: true, maxlength: 200 },
    kind: { type: String, enum: COUPON_KINDS, required: true },
    /** Percent off (1–100), or taka off the whole payment. */
    value: { type: Number, required: true, min: 0 },
    /** Plan keys it works on. Empty: every paid plan. */
    plans: { type: [String], default: [] },
    minMonths: { type: Number, default: 1, min: 1, max: 36 },
    /** Only on a shop's first accepted payment — a welcome offer. */
    firstPaymentOnly: { type: Boolean, default: false },
    /** Once per shop. On by default: most codes are not meant to be used monthly. */
    oncePerShop: { type: Boolean, default: true },
    /** How many accepted payments in all may use it. Null: no limit. */
    maxRedemptions: { type: Number, default: null },
    redemptions: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type Coupon = InferSchemaType<typeof schema>;
export type CouponDoc = HydratedDocument<Coupon>;
export const CouponModel = model('Coupon', schema);
