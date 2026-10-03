import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A regular who does not pay today.
 *
 * The baki khata, which every shop in this country keeps in a notebook: the
 * neighbour, the tea stall down the road, the man who settles at the end of
 * the month. Software that cannot record it is software the owner works around
 * on paper, and then half the day's sales are missing from it.
 *
 * `balance` is what they owe, kept here and moved by sales and payments. The
 * rows behind it live in `CustomerLedger`, so the figure can always be
 * explained and never simply corrected.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 40, index: true },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    note: { type: String, default: '', trim: true, maxlength: 500 },

    /** Positive means the customer owes the shop. */
    balance: { type: Number, default: 0 },
    /**
     * How much credit the owner is willing to give.
     *
     * Zero means no limit rather than none at all — a shop that has not thought
     * about a limit should not find its regulars refused at the counter.
     */
    creditLimit: { type: Number, default: 0, min: 0 },

    /** Loyalty points to spend, and every point ever earned — see services/loyalty. */
    points: { type: Number, default: 0, min: 0 },
    pointsEarned: { type: Number, default: 0, min: 0 },

    /**
     * When this account was last chased, and how often.
     *
     * Kept so the shop cannot text the same person twice on a Tuesday. A
     * reminder is a favour a shopkeeper asks of a customer they want back, and
     * the fastest way to lose that customer is to send it every morning.
     */
    lastRemindedAt: { type: Date, default: null },
    remindersSent: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
    /* ---- the bin ---- */
    /**
     * Thrown away, and recoverable.
     *
     * Deliberately not the same as `isActive`: turned off means still on the
     * shop's list and not for sale; deleted means gone from every screen. Only
     * the second one goes in the trash, and only the second one carries the name
     * of whoever did it and what they said the reason was.
     */
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedByName: { type: String, default: '' },
    deleteReason: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

schema.index({ organization: 1, name: 1 });

export type ShopCustomer = InferSchemaType<typeof schema>;
export type ShopCustomerDoc = HydratedDocument<ShopCustomer>;

export const ShopCustomerModel = model('ShopCustomer', schema);
