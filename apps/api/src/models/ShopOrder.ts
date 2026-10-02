import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * What the shop wants from a company, before any of it arrives.
 *
 * The missing half of the purchase. `Purchase` is the delivery as the invoice
 * states it — a fact about a day that is never edited afterwards — and until
 * now there was nothing in front of it. In this trade the order is a real
 * document with a real deadline: the company's SR comes round on his day, the
 * shopkeeper reads him a list off a scrap of paper, and whatever is not on that
 * scrap is not on the shelf next week.
 *
 * So this is the scrap of paper, and it is deliberately not much more than
 * that:
 *
 * - **Quantities are in pieces**, like everything else in the shop, and shown
 *   back in the shop's own words — "2 box 3 strip" — wherever a person reads
 *   them.
 * - **No prices.** The shop does not set them and does not know them until the
 *   invoice arrives; an order carrying a guessed rate is an order somebody
 *   argues with the rep about.
 * - **It is never the stock record.** Nothing here moves a batch or touches a
 *   balance. Ordering is not receiving, and a shop that has been promised
 *   twenty strips has twenty strips less than it thinks it does.
 *
 * `received` is never inferred from a delivery: a company sends part of an
 * order all the time, and guessing that an invoice closes an order would
 * quietly bury the half that never came. Instead the delivery is recorded
 * *from* the order, on purpose, and each line keeps what actually came — so
 * the short half is the first thing the order shows afterwards, not something
 * nobody noticed.
 */
const lineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    /** Snapshot, so an old order still reads after a rename. */
    name: { type: String, default: '', trim: true, maxlength: 160 },
    /** What was on the shelf when the line was written — why it is on the list. */
    onHandAtOrder: { type: Number, default: 0 },
    qtyPieces: { type: Number, required: true, min: 0 },
    /** What the delivery that closed the order brought, bonus included. Null
        until then, and on an order closed by hand without one. */
    qtyReceived: { type: Number, default: null },
    note: { type: String, default: '', trim: true, maxlength: 240 },
  },
  { _id: true },
);

export const ORDER_STATUS = ['open', 'sent', 'received', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Which branch of the shop this belongs to. Everything made before branches is in the Main branch. */
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierName: { type: String, default: '', trim: true, maxlength: 120 },

    lines: { type: [lineSchema], default: [] },
    note: { type: String, default: '', trim: true, maxlength: 2000 },

    status: { type: String, enum: ORDER_STATUS, default: 'open', index: true },
    /** When it was read out to the rep, and when the goods turned up. */
    sentAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    /** The delivery it arrived on, when it was recorded from this order. */
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase', default: null },
    /** Said out loud when an order is cancelled, like every other reason here. */
    closeReason: { type: String, default: '', trim: true, maxlength: 300 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

/* The screen this feeds: a company's orders, newest first. */
schema.index({ organization: 1, supplier: 1, createdAt: -1 });
schema.index({ organization: 1, status: 1, createdAt: -1 });

export type ShopOrder = InferSchemaType<typeof schema>;
export type ShopOrderDoc = HydratedDocument<ShopOrder>;

export const ShopOrderModel = model('ShopOrder', schema);
