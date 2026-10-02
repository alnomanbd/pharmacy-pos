import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Money that moves without being a sale, a delivery or a cost.
 *
 * - **drawing** — the owner takes cash home from the drawer. Not an expense:
 *   the shop did not spend it, the owner took their share. It leaves the cash
 *   and never touches the profit.
 * - **capital** — the owner puts money in (to pay a big delivery, say). The
 *   mirror of a drawing: cash in, not income.
 * - **bank_deposit** / **bank_withdrawal** — cash carried to the bank and back.
 *   Money changing pockets: less in the drawer, more in the account.
 * - **refund** — cash handed back to a customer for a returned strip. Written
 *   by the till when a return is taken, never typed here; `returnValue` and
 *   `returnCost` carry what the return took off the sale and its stock, so the
 *   profit can be corrected by exactly as much.
 */
export const CASH_MOVE_KINDS = ['drawing', 'capital', 'bank_deposit', 'bank_withdrawal', 'refund'] as const;
export type CashMoveKind = (typeof CASH_MOVE_KINDS)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Which branch of the shop this belongs to. Everything made before branches is in the Main branch. */
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    kind: { type: String, enum: CASH_MOVE_KINDS, required: true, index: true },
    /** Cash that moved, always positive — the kind says which way. */
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    /** A bill number for a refund, a slip number for a deposit. */
    reference: { type: String, default: '', trim: true, maxlength: 80 },
    moveDate: { type: Date, default: Date.now, index: true },
    /* ---- a refund's effect on the sale, for the profit ---- */
    returnValue: { type: Number, default: 0, min: 0 },
    returnCost: { type: Number, default: 0, min: 0 },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
    /* ---- the bin ---- */
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedByName: { type: String, default: '' },
    deleteReason: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

schema.index({ organization: 1, moveDate: -1 });

/* A refund is paid out of the drawer the bill was rung up at. */
schema.pre('save', async function () {
  if (this.branch || !this.sale) return;
  const sale = await model('Sale').findById(this.sale).select('branch').lean<{ branch?: unknown }>();
  if (sale?.branch) this.set('branch', sale.branch);
});

export type CashMove = InferSchemaType<typeof schema>;
export type CashMoveDoc = HydratedDocument<CashMove>;

export const CashMoveModel = model('CashMove', schema);
