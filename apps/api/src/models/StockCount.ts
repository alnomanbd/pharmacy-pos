import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Counting the shelf.
 *
 * Every shop's screen and every shop's shelf disagree eventually — a strip
 * handed over and not rung up, a box broken open, a bill posted from offline
 * against stock somebody else had already sold. The count is how the two are
 * put back together, and it is a document rather than an edit box for three
 * reasons:
 *
 * - **It takes an evening.** Somebody walks the racks with a phone, a shelf at
 *   a time, and the shop is still selling while they do. A count that had to be
 *   finished in one screen would be a count nobody finishes.
 * - **What was expected has to be kept.** The difference is the number worth
 *   looking at, and it cannot be recovered once the batch has been set to what
 *   was counted.
 * - **Applying it moves money.** Pieces that are not there were paid for, and
 *   the value of the difference is the figure an owner wants — so the whole
 *   thing is one record with one person's name on it, not a scatter of
 *   adjustments.
 *
 * ## The rule that matters
 *
 * Applying a count adds `counted − expected` to whatever the batch holds *now*.
 * It does not set the batch to what was counted. The shop went on selling
 * during the count, and setting the figure would quietly erase every bill rung
 * up while somebody was walking the racks.
 */
const lineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    /* Snapshots, so the sheet reads the same in a year. */
    name: { type: String, default: '', trim: true, maxlength: 160 },
    batchNo: { type: String, default: '', trim: true, maxlength: 60 },
    rackLabel: { type: String, default: '', trim: true, maxlength: 40 },
    expiry: { type: Date, default: null },

    /** What the screen said when the count was started. */
    expected: { type: Number, default: 0 },
    /** What was on the shelf. Null until somebody has actually counted it. */
    counted: { type: Number, default: null },
    /** What it cost, so the difference can be valued. */
    costPerPiece: { type: Number, default: 0 },
  },
  { _id: true },
);

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    /** One rack, or the whole shop when null. */
    rack: { type: Schema.Types.ObjectId, ref: 'ShopRack', default: null },
    rackLabel: { type: String, default: '', trim: true, maxlength: 40 },

    status: { type: String, enum: ['open', 'applied', 'abandoned'], default: 'open', index: true },

    lines: { type: [lineSchema], default: [] },

    startedAt: { type: Date, default: Date.now },
    startedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startedByName: { type: String, default: '' },

    appliedAt: { type: Date, default: null },
    appliedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    appliedByName: { type: String, default: '' },

    /** Filled in when it is applied: what the difference came to. */
    shortPieces: { type: Number, default: 0 },
    extraPieces: { type: Number, default: 0 },
    valueDelta: { type: Number, default: 0 },

    note: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

/* The open count, and the history. */
schema.index({ organization: 1, status: 1, startedAt: -1 });

export type StockCount = InferSchemaType<typeof schema>;
export type StockCountDoc = HydratedDocument<StockCount>;

export const StockCountModel = model('StockCount', schema);
