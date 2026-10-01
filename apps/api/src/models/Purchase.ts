import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A delivery from a company, as the invoice states it.
 *
 * Entered the way it arrives — in boxes and strips, with the invoice number on
 * the paper — and turned into pieces, batches and a supplier balance on the way
 * in. The document is the record: once posted it is not edited, because a
 * company's ledger that can be rewritten is not a ledger. A wrong delivery is
 * corrected by a return or an adjustment, which is also how the shop's own book
 * works.
 *
 * ## Bonus
 *
 * "10 + 1" — ten strips charged, eleven delivered — is universal in this trade
 * and it is the thing generic software gets wrong. The free units are stock and
 * they cost nothing, so the cost of a piece is the line's money divided by
 * *everything that arrived*. Recorded per line, not as a discount on the total,
 * because a shop is given bonus on some lines and not others.
 */
const lineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    /** Snapshot, so an old invoice still reads correctly after a rename. */
    name: { type: String, default: '', trim: true, maxlength: 160 },

    batchNo: { type: String, default: '', trim: true, maxlength: 60 },
    expiry: { type: Date, default: null },

    /** What was charged for, in pieces. */
    qtyPieces: { type: Number, required: true, min: 0 },
    /** What came free with it, in pieces. */
    bonusPieces: { type: Number, default: 0, min: 0 },

    /** The company's price for one piece, before bonus is taken into account. */
    tradePricePerPiece: { type: Number, required: true, min: 0 },
    /** The printed price on this lot. */
    mrpPerPiece: { type: Number, default: 0, min: 0 },

    /** `qtyPieces × tradePricePerPiece`, less this line's discount. */
    lineTotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },

    /** The company's own invoice number — how the rep will refer to it. */
    invoiceNo: { type: String, default: '', trim: true, maxlength: 60, index: true },
    invoiceDate: { type: Date, default: Date.now, index: true },

    lines: { type: [lineSchema], default: [] },

    /** Sum of the lines, then the whole-invoice adjustments on top. */
    subTotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    vat: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },

    /**
     * Paid at the time of delivery. The rest is the company's balance, which
     * lives in the ledger rather than here — a purchase is a fact about one
     * day, not a running account.
     */
    paidAmount: { type: Number, default: 0, min: 0 },

    note: { type: String, default: '', trim: true, maxlength: 2000 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

/* The company's page: its deliveries, newest first. */
schema.index({ organization: 1, supplier: 1, invoiceDate: -1 });
schema.index({ organization: 1, invoiceDate: -1 });

export type Purchase = InferSchemaType<typeof schema>;
export type PurchaseDoc = HydratedDocument<Purchase>;

export const PurchaseModel = model('Purchase', schema);
