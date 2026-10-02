import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One location of a shop: its own counters, its own stock on its own shelves,
 * its own takings — under one owner, one medicine list and one set of
 * suppliers.
 *
 * Most pharmacies are one shop, and for them this is invisible: every shop
 * has a "Main branch", made for it automatically, that everything belongs to.
 * A second branch is what turns on the switcher, transfers and per-branch
 * reports — and, if the plan says so, the price of an extra branch.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** On the receipt instead of the shop's, so a customer knows which branch sold it. Empty: the shop's. */
    address: { type: String, default: '', trim: true, maxlength: 240 },
    phone: { type: String, default: '', trim: true, maxlength: 60 },
    /** The first branch, which every record made before branches existed belongs to. Cannot be closed. */
    isMain: { type: Boolean, default: false },
    /** Closed branches keep their history and stop taking new bills. */
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

schema.index({ organization: 1, name: 1 }, { unique: true });
schema.index({ organization: 1, isMain: 1 });

export type Branch = InferSchemaType<typeof schema>;
export type BranchDoc = HydratedDocument<Branch>;
export const BranchModel = model('Branch', schema);
