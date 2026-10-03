import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One till, one person, one evening.
 *
 * A shift opens with a counted float and closes with a counted drawer, and the
 * difference between what the screen expected and what was actually in the box
 * is the number the whole thing exists to produce. Without it "the drawer was
 * short on Tuesday" has no answer; with it, it has a name attached.
 *
 * Per user rather than per terminal: two salesmen on two machines are two
 * shifts, and their takings are never mixed. A shop where everybody shares one
 * login can still run — it is simply one shift — but then the software cannot
 * tell the owner anything they did not already know.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Which branch of the shop this belongs to. Everything made before branches is in the Main branch. */
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, default: '' },

    /** Free text: "counter 1", "the back till". Shops name them, not us. */
    /**
     * Which counter this shift was worked at.
     *
     * The name is kept beside the reference so a closed shift still reads
     * correctly after a counter is renamed or retired — the same snapshot rule
     * the bills follow.
     */
    counter: { type: Schema.Types.ObjectId, ref: 'ShopCounter', default: null, index: true },
    terminal: { type: String, default: '', trim: true, maxlength: 60 },

    openedAt: { type: Date, default: Date.now, index: true },
    /** What was in the drawer at the start, counted by hand. */
    openingFloat: { type: Number, default: 0, min: 0 },

    closedAt: { type: Date, default: null, index: true },
    /** What the screen says should be there: float + cash taken − cash refunded. */
    expectedCash: { type: Number, default: 0 },
    /** What was actually counted at the end. */
    countedCash: { type: Number, default: null },
    /** `countedCash − expectedCash`. Negative is short. */
    difference: { type: Number, default: 0 },

    /* Running totals, so closing does not have to sum a day of sales. */
    salesCount: { type: Number, default: 0 },
    salesTotal: { type: Number, default: 0 },
    cashTaken: { type: Number, default: 0 },
    digitalTaken: { type: Number, default: 0 },
    dueGiven: { type: Number, default: 0 },
    /** Baki collected in cash at this counter while it was open — in the drawer too. */
    khataTaken: { type: Number, default: 0 },

    note: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

/* The one question the till asks on every load: is this person already open? */
schema.index({ organization: 1, user: 1, closedAt: 1 });

export type Shift = InferSchemaType<typeof schema>;
export type ShiftDoc = HydratedDocument<Shift>;

export const ShiftModel = model('Shift', schema);
