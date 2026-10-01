import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One lot of one product, as it was received.
 *
 * Stock is held per batch and not per product, for three reasons that all
 * matter in this trade: every strip carries a batch number and an expiry, a
 * sale must take from the lot expiring soonest, and the price the shop paid
 * changes from delivery to delivery — so "what did this cost" has no answer at
 * the product level.
 *
 * `qtyOnHand` is in pieces and is the only mutable field here. Every change to
 * it is also written to `StockLedger`, which is the record; this is the running
 * total kept beside it so the till does not have to sum a ledger to find out
 * whether there are four tablets left.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true, index: true },

    /** As printed on the strip. Shops do receive lots with no number on them. */
    batchNo: { type: String, default: '', trim: true, maxlength: 60 },
    /**
     * End of the month printed on the pack.
     *
     * Null is allowed and means "not recorded" rather than "does not expire":
     * the near-expiry report says so instead of quietly treating it as safe.
     */
    expiry: { type: Date, default: null, index: true },

    /**
     * What one piece of this lot actually cost, bonus included.
     *
     * A delivery of "10 + 1" is eleven strips for the price of ten, so the cost
     * of a piece is the invoice divided by what arrived, not by what was
     * charged for. Computed once at purchase — a margin worked out from the
     * list price of a bonused line is wrong in the direction that loses money.
     */
    costPerPiece: { type: Number, default: 0, min: 0 },
    /** The printed price of this lot, which is not always the current one. */
    mrpPerPiece: { type: Number, default: 0, min: 0 },

    /*
     * Allowed below zero, and only ever by one route.
     *
     * A bill rung up while the line was down is posted afterwards, and by then
     * somebody else may have sold the last of the same strip. Those pieces are
     * in a customer's hand either way, so the count goes minus rather than the
     * sale being refused — a negative figure is a shelf that needs counting,
     * and that is a truth worth keeping. See till.service `allocate`.
     */
    qtyOnHand: { type: Number, default: 0 },

    /** The delivery it came in on, so a batch can be traced back to an invoice. */
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', default: null, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },

    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/* What the till asks for on every line: this product, in stock, soonest expiry
   first. */
schema.index({ organization: 1, product: 1, expiry: 1 });
/* And what the expiry report asks for. */
schema.index({ organization: 1, expiry: 1, qtyOnHand: 1 });

export type StockBatch = InferSchemaType<typeof schema>;
export type StockBatchDoc = HydratedDocument<StockBatch>;

export const StockBatchModel = model('StockBatch', schema);
