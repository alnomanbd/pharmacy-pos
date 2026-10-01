import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A place somebody stands and sells.
 *
 * It used to be a word typed into the open-the-day box, which meant "Counter 1",
 * "counter1" and "C-1" were three different counters as far as the day's figures
 * were concerned — and a shop with two tills could never be told which one was
 * short at the end of the evening.
 *
 * So it is a row. A shop sets its counters up once, whoever opens the day picks
 * one, and every shift, every bill and every cash count hangs off the same
 * thing. That is the whole feature: not a new capability, a name that stays the
 * same.
 *
 * The printer settings live here too, because in a real shop the front counter
 * has the 80mm roll and the one by the door has the little 58mm one, and the
 * paper is a property of the machine rather than of the shop.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    /** What it is called out loud — "Counter 1", "Front", "Upstairs". */
    name: { type: String, required: true, trim: true, maxlength: 60 },
    note: { type: String, default: '', trim: true, maxlength: 240 },

    /**
     * The roll on *this* machine, when it is not the shop's usual one.
     *
     * Null means "whatever the shop is set to", which is the answer for almost
     * every shop and keeps one setting in one place.
     */
    paperWidthMm: { type: Number, default: null, min: 40, max: 210 },

    /** What the box should start the day with, so nobody types it each morning. */
    openingFloat: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true, index: true },
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
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/* One name per shop: two counters called the same thing is the bug this fixes. */
schema.index({ organization: 1, name: 1 }, { unique: true });

export type ShopCounter = InferSchemaType<typeof schema>;
export type ShopCounterDoc = HydratedDocument<ShopCounter>;

export const ShopCounterModel = model('ShopCounter', schema);
