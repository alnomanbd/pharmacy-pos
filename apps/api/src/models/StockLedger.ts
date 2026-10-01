import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Every movement of stock, ever.
 *
 * Append-only, like the audit trail and for the same reason: when the shelf and
 * the screen disagree — and in a shop they eventually do — the question is not
 * "what is the number" but "when did it start being wrong, and who was there".
 * A running total alone cannot answer that, so the total is derived from this
 * and kept on `StockBatch` for speed.
 *
 * `qtyDelta` is in pieces and signed: positive for anything arriving, negative
 * for anything leaving. Nothing here is ever updated or deleted; a mistake is
 * corrected by a row in the other direction, which is also how a shop's own
 * paper register works.
 */
export const STOCK_MOVES = [
  'purchase',
  'purchase_return',
  'sale',
  'sale_return',
  /** Broken, spoiled, or lost. */
  'damage',
  /** Written off because it is past its date. */
  'expiry',
  /** A physical count that disagreed with the screen. */
  'adjustment',
  /** A bill that should never have existed, put back on the shelf. */
  'sale_void',
  /** Between two outlets of the same shop. */
  'transfer',
] as const;
export type StockMove = (typeof STOCK_MOVES)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: 'StockBatch', default: null, index: true },

    move: { type: String, enum: STOCK_MOVES, required: true, index: true },
    /** Signed, in pieces. */
    qtyDelta: { type: Number, required: true },
    /** What the batch held afterwards, so a row can be read on its own. */
    balanceAfter: { type: Number, default: 0 },

    /** What it cost and what it sold for, at the moment it moved. */
    costPerPiece: { type: Number, default: 0 },
    pricePerPiece: { type: Number, default: 0 },

    /** The document that caused it: a purchase, a sale, a return, a count. */
    ref: {
      model: { type: String, default: '' },
      id: { type: Schema.Types.ObjectId, default: null },
    },
    /** Required by the service for the moves a person chooses to make. */
    reason: { type: String, default: '', trim: true, maxlength: 240 },

    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/* The product's own history, newest first — the page an owner opens when a
   number looks wrong. */
schema.index({ organization: 1, product: 1, createdAt: -1 });
schema.index({ organization: 1, createdAt: -1 });

export type StockLedger = InferSchemaType<typeof schema>;
export type StockLedgerDoc = HydratedDocument<StockLedger>;

export const StockLedgerModel = model('StockLedger', schema);
