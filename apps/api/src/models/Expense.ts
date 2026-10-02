import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** What the shop costs to stand open: the rent, the power, the staff, the van. */
export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'utility',
  'transport',
  'supplies',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Money that went out and is not coming back.
 *
 * The reports read the ledger — what a sale earned, what a delivery cost — and
 * a ledger is honest about none of it, because none of it asks what the shop
 * itself cost. A month's rent is not a company's invoice and a salary is not a
 * sale that turned out badly; both are the price of standing open, and an owner
 * who cannot say "I kept this after the shop itself cost that" is reading half
 * the month.
 *
 * One line, dated the day the money went out. A note carries the rest — the
 * landlord's name, the shop's own routine — because the number alone says what
 * but not why.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Which branch of the shop this belongs to. Everything made before branches is in the Main branch. */
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    /** The day the money went out, as a day the ledger can hold onto. */
    expenseDate: { type: Date, default: Date.now, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
    /* ---- the bin ----
       The Recycle Bin writes these on every kind it holds. Without them in the
       schema Mongoose dropped them on save, so deleting an expense said it had
       gone and left it on the list. */
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedByName: { type: String, default: '' },
    deleteReason: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

schema.index({ organization: 1, expenseDate: -1 });

export type Expense = InferSchemaType<typeof schema>;
export type ExpenseDoc = HydratedDocument<Expense>;

export const ExpenseModel = model('Expense', schema);