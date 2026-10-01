import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * The regular's account, row by row.
 *
 * The same shape and the same sign convention as the supplier's ledger, for the
 * same reason: a balance that can be edited is a balance nobody can argue with,
 * and the argument here is with a customer standing at the counter.
 *
 * **Positive increases what the customer owes.** A sale on account is positive,
 * a payment is negative, a return is negative.
 */
export const CUSTOMER_ENTRIES = ['opening', 'sale', 'payment', 'sale_return', 'adjustment'] as const;
export type CustomerEntry = (typeof CUSTOMER_ENTRIES)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'ShopCustomer', required: true, index: true },

    entry: { type: String, enum: CUSTOMER_ENTRIES, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: 0 },
    at: { type: Date, default: Date.now, index: true },

    method: { type: String, default: '', trim: true, maxlength: 40 },
    reference: { type: String, default: '', trim: true, maxlength: 80 },
    note: { type: String, default: '', trim: true, maxlength: 500 },

    ref: {
      model: { type: String, default: '' },
      id: { type: Schema.Types.ObjectId, default: null },
    },

    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ organization: 1, customer: 1, at: 1 });

export type CustomerLedger = InferSchemaType<typeof schema>;
export type CustomerLedgerDoc = HydratedDocument<CustomerLedger>;

export const CustomerLedgerModel = model('CustomerLedger', schema);
