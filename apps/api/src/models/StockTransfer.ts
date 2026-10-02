import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Stock carried from one branch to another.
 *
 * Done at once, not "in transit": in this trade the boy takes the box across
 * town on a motorbike within the hour, and a shelf that says the strips are
 * nowhere for that hour helps nobody. Each lot moved keeps its batch number,
 * expiry and cost, so a strip is still traceable to the invoice it came on.
 */
const lineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    name: { type: String, default: '' },
    /** The lot it left, and the lot it joined at the other end. */
    fromBatch: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    toBatch: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    batchNo: { type: String, default: '' },
    expiry: { type: Date, default: null },
    pieces: { type: Number, required: true, min: 1 },
    costPerPiece: { type: Number, default: 0 },
  },
  { _id: false },
);

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    fromName: { type: String, default: '' },
    toName: { type: String, default: '' },
    lines: { type: [lineSchema], default: [] },
    /** What the stock moved is worth at cost — the figure an owner checks the two branches against. */
    value: { type: Number, default: 0 },
    note: { type: String, default: '', trim: true, maxlength: 240 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ organization: 1, createdAt: -1 });

export type StockTransfer = InferSchemaType<typeof schema>;
export type StockTransferDoc = HydratedDocument<StockTransfer>;

export const StockTransferModel = model('StockTransfer', schema);
