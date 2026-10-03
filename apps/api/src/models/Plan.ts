import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A plan a shop can be on — Trial, Basic, Plus — edited by the operator in the
 * console, because pricing is the thing a young product changes most.
 *
 * The `key` is what a shop stores, so it is stable: renaming a plan changes its
 * label, never its key.
 */
const limitSchema = new Schema(
  {
    /**
     * `null` is unlimited, `0` would mean none — so the difference matters and
     * neither is a default. Each limit is checked before the write it guards,
     * and the refusal names the plan.
     */
    /** Shop locations. One for almost everybody. */
    outlets: { type: Number, default: null },
    /** Billing counters (tills) the shop can set up — what a second counter costs. */
    terminals: { type: Number, default: null },
    /** Staff who can sign in: the owner, a pharmacist, the salesmen. */
    shopUsers: { type: Number, default: null },
  },
  { _id: false },
);

const schema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    /** Per month, in `currency`. */
    price: { type: Number, required: true, min: 0 },
    /**
     * Branches the price covers, and what each one beyond costs a month. A
     * ৳3,000 plan with 1 included and ৳1,000 per extra branch is ৳5,000 for a
     * shop with three. `limits.outlets` is still the most a shop may have.
     */
    includedBranches: { type: Number, default: 1, min: 1 },
    extraBranchPrice: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'BDT' },
    limits: { type: limitSchema, default: () => ({}) },
    /** What the plan switches on beyond the counter itself — see plan.service#FEATURES. */
    features: {
      onlineOrders: { type: Boolean, default: false },
    },
    /** The plan a new shop starts on; there is exactly one. */
    isTrial: { type: Boolean, default: false },
    trialDays: { type: Number, default: 14 },
    /** Off: not offered to new shops, still honoured for the ones on it. */
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

schema.index({ sortOrder: 1 });

export type Plan = InferSchemaType<typeof schema>;
export type PlanDoc = HydratedDocument<Plan>;

export const PlanModel = model('Plan', schema);
