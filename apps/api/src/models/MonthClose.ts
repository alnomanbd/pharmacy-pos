import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A month the owner has closed.
 *
 * Closing does two things. It keeps the month's figures as they stood that
 * day — profit, cash in and out, what was owed and on the shelf — so the
 * number the owner wrote in the notebook is the number the screen shows a year
 * later. And it locks the month's hand-entered money: an expense, an income, a
 * drawing or a deposit dated inside it can no longer be added, changed or
 * deleted without reopening the month, which is itself on the activity trail.
 *
 * Sales and deliveries are not locked. They are the shop working, and a closed
 * month that refused a late-posted bill would lose the money rather than keep
 * the book tidy.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** `YYYY-MM`, in the shop's own calendar. */
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    closed: { type: Boolean, default: true },
    /** The accounts as they stood when it was closed. */
    snapshot: { type: Schema.Types.Mixed, default: {} },
    /** Cash in the drawer, counted by hand when it was closed. */
    countedCash: { type: Number, default: null },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    closedByName: { type: String, default: '' },
    reopenedAt: { type: Date, default: null },
    reopenedByName: { type: String, default: '' },
    reopenReason: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

schema.index({ organization: 1, month: 1 }, { unique: true });

export type MonthClose = InferSchemaType<typeof schema>;
export type MonthCloseDoc = HydratedDocument<MonthClose>;

export const MonthCloseModel = model('MonthClose', schema);
