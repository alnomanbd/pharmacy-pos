import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Money in that is not a sale.
 *
 * A pharmacy's takings are its bills, and those are counted at the till. But
 * the same drawer takes other money most weeks: the company's cash-back on a
 * target, a service charge for a blood-pressure check or pushing an injection,
 * a commission, the rent on the corner a mobile-recharge man uses. Left out,
 * the month's profit is understated by exactly the money that paid the tea.
 */
export const INCOME_CATEGORIES = ['bonus', 'service', 'commission', 'rent', 'other'] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Which branch of the shop this belongs to. Everything made before branches is in the Main branch. */
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: INCOME_CATEGORIES, required: true },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    /** The day the money came in, as a day the ledger can hold onto. */
    incomeDate: { type: Date, default: Date.now, index: true },
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

schema.index({ organization: 1, incomeDate: -1 });

export type Income = InferSchemaType<typeof schema>;
export type IncomeDoc = HydratedDocument<Income>;

export const IncomeModel = model('Income', schema);
