import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * The running account with one company.
 *
 * Every purchase, every payment and every return, in date order, with a
 * balance after each. "Incepta-ke koto dite hobe" is then the last row's
 * balance rather than a sum somebody has to trust — and when the rep arrives
 * with his own book, the two can be read side by side.
 *
 * Append-only for the same reason the stock ledger is: a balance that can be
 * edited is a balance nobody can argue with, which sounds like an advantage
 * until the argument is with a supplier.
 *
 * Sign convention, once, so nothing has to guess: **positive increases what the
 * shop owes**. A delivery is positive, a payment is negative, a return is
 * negative.
 */
export const SUPPLIER_ENTRIES = ['opening', 'purchase', 'payment', 'purchase_return', 'adjustment'] as const;
export type SupplierEntry = (typeof SUPPLIER_ENTRIES)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },

    entry: { type: String, enum: SUPPLIER_ENTRIES, required: true },
    /** Signed: positive is owed to the company, negative reduces it. */
    amount: { type: Number, required: true },
    /** What the account stood at after this row. */
    balanceAfter: { type: Number, default: 0 },

    /** The day it happened, which is not always the day it was typed in. */
    at: { type: Date, default: Date.now, index: true },

    /** How a payment was made: cash, bKash, cheque, bank. */
    method: { type: String, default: '', trim: true, maxlength: 40 },
    /** Cheque number, trx id, or the company's invoice number. */
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

/* The statement: one company, in date order. */
schema.index({ organization: 1, supplier: 1, at: 1 });

export type SupplierLedger = InferSchemaType<typeof schema>;
export type SupplierLedgerDoc = HydratedDocument<SupplierLedger>;

export const SupplierLedgerModel = model('SupplierLedger', schema);
