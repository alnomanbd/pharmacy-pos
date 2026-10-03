import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One bill.
 *
 * The record of what left the shop, who rang it up, and how it was paid. Three
 * things about its shape are deliberate:
 *
 * - **A line is per batch, not per product.** Four tablets can come out of two
 *   different lots with two different costs and two different expiry dates, and
 *   a return has to put them back where they came from. The till hides this —
 *   the customer sees one line — but the record does not.
 * - **The cost is copied onto the line.** Margin is worked out from what this
 *   shop actually paid for these pieces, which is a fact about the batch on the
 *   day it sold and changes with the next delivery.
 * - **Payment is a list.** ৳500 in cash and ৳320 on bKash is one bill, and a
 *   single `method` field forces the salesman to lie about one of them.
 */
const lineSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'StockBatch', default: null },
    /** Snapshots, so an old bill reads correctly after a rename. */
    name: { type: String, default: '', trim: true, maxlength: 160 },
    batchNo: { type: String, default: '', trim: true, maxlength: 60 },

    qtyPieces: { type: Number, required: true, min: 0 },
    pricePerPiece: { type: Number, required: true, min: 0 },
    /** What it cost this shop. Never shown to a salesman. */
    costPerPiece: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, default: 0, min: 0 },

    /** Whether this line carried VAT, so an old bill still adds up. */
    vat: { type: Number, default: 0, min: 0 },

    /** Pieces put back by a return against this bill. */
    returnedPieces: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const paymentSchema = new Schema(
  {
    method: {
      type: String,
      enum: ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank', 'due'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, default: '', trim: true, maxlength: 80 },
  },
  { _id: false },
);

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    /** Which branch of the shop this belongs to. Everything made before branches is in the Main branch. */
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    /* Which branch sold it, as the receipt prints it — kept on the bill so a
       reprint next year still names the branch that sold it, under the
       address it had then. Empty for a shop with one branch and no address of its own. */
    branchInfo: {
      type: new Schema({ name: String, address: String, phone: String }, { _id: false }),
      default: undefined,
    },

    /**
     * The number printed on the bill.
     *
     * Per shop and per day — "13-0042" — because that is how a customer refers
     * to it when they come back, and a global counter would print a number
     * nobody can find in a day's pile of paper.
     */
    billNo: { type: String, default: '', index: true },

    soldAt: { type: Date, default: Date.now, index: true },
    /**
     * The shop's day, as `YYYY-MM-DD` in the app timezone.
     *
     * A string rather than an instant, because "what did Friday come to" is a
     * question about a calendar day in Dhaka and not about a window of UTC —
     * and because `YYYY-MM-DD` sorts and compares as a range without any
     * conversion, which is what the sales register needs.
     *
     * Always written through `formatDayKey(todayKey(...))`. Handing it the Date
     * that `todayKey` returns stores the locale rendering of that Date, which
     * looks fine for today and makes every range query silently wrong.
     */
    dayKey: { type: String, default: '', index: true },

    salesman: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    salesmanName: { type: String, default: '' },
    shift: { type: Schema.Types.ObjectId, ref: 'Shift', default: null, index: true },
    /**
     * Which counter rang it up, copied off the shift.
     *
     * On the bill rather than only on the shift because "which till sold this"
     * is asked about a bill, long after the shift has been closed and counted.
     */
    counter: { type: Schema.Types.ObjectId, ref: 'ShopCounter', default: null, index: true },
    terminal: { type: String, default: '', index: true },

    /** Only for a regular who is buying on account, or who asked for a record. */
    customer: { type: Schema.Types.ObjectId, ref: 'ShopCustomer', default: null, index: true },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },


    lines: { type: [lineSchema], default: [] },

    subTotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    /**
     * VAT, when the shop charges it.
     *
     * Zero on almost every bill in this country: medicine is exempt, so only a
     * VAT-registered shop selling baby food, cosmetics and the rest has a figure
     * here. Kept with the rate it was worked out at, because the rate changes
     * and an old bill has to still add up.
     */
    vat: { type: Number, default: 0, min: 0 },
    vatPercent: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    /** What cost the shop — the sum of the lines' cost, kept for the margin. */
    cost: { type: Number, default: 0, min: 0 },

    payments: { type: [paymentSchema], default: [] },
    /**
     * What the shop kept.
     *
     * Never more than the total. A customer pays a ৳570 bill with a ৳1000 note
     * and the shop keeps ৳570 — the other ৳430 goes straight back over the
     * counter. Recording the note as the payment would put ৳430 that is not in
     * the box into the day's cash, and the evening's count would come up short
     * by exactly that.
     */
    paid: { type: Number, default: 0, min: 0 },
    /** The note that was handed over, when it was bigger than the bill. */
    cashTendered: { type: Number, default: 0, min: 0 },
    /** And what went back with the customer. Printed on the paper. */
    changeGiven: { type: Number, default: 0, min: 0 },
    /** What went on the customer's account. */
    due: { type: Number, default: 0, min: 0 },

    /**
     * The counter's own reference for this bill, when it was rung up offline.
     *
     * A shop's internet goes at the worst moment and the queue does not stop,
     * so the till keeps selling and posts the bills when the line comes back.
     * That replay can happen twice — the browser retried, or the same till was
     * opened in a second tab — and a bill posted twice is stock taken off the
     * shelf twice. This is the key that makes posting it again do nothing: it
     * is generated on the machine that made the sale, and it is unique per
     * shop (see the partial index below).
     */
    clientRef: { type: String, default: '', trim: true, maxlength: 64 },
    /** Rung up while the line was down, and posted afterwards. */
    wasOffline: { type: Boolean, default: false },

    /**
     * Loyalty points on this bill: what it earned, what was spent on it and
     * the taka those took off (already inside `discount`), and how many a
     * return has taken back.
     */
    loyalty: {
      type: new Schema(
        { earned: Number, redeemed: Number, value: Number, reversed: { type: Number, default: 0 } },
        { _id: false },
      ),
      default: undefined,
    },

    status: {
      type: String,
      enum: ['completed', 'returned', 'void'],
      default: 'completed',
      index: true,
    },

    /**
     * Every hand that has been on this bill after it was rung up.
     *
     * A bill is a financial document, so nothing about it is ever quietly
     * replaced: an edit and a void both leave a row here with who did it, when,
     * why, and what the totals were on either side. The owner's question is
     * never "what does this bill say now" — it is "who changed it and what did
     * they say the reason was", and only this can answer that.
     *
     * Voiding does not remove the bill. The number was printed on a customer's
     * slip and the register has to be able to explain it.
     */
    history: {
      type: [
        new Schema(
          {
            at: { type: Date, default: Date.now },
            action: {
              type: String,
              enum: ['edit', 'void', 'revert', 'hold', 'unhold', 'delete', 'restore', 'return'],
              required: true,
            },
            actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
            actorName: { type: String, default: '' },
            actorRole: { type: String, default: '' },
            /** Required by the service. An unexplained change is the thing this exists to prevent. */
            reason: { type: String, default: '', trim: true, maxlength: 300 },
            totalBefore: { type: Number, default: 0 },
            totalAfter: { type: Number, default: 0 },
            note: { type: String, default: '', trim: true, maxlength: 300 },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
    note: { type: String, default: '', trim: true, maxlength: 500 },

    /**
     * Held for a look.
     *
     * Neither cancelled nor settled: somebody has questioned this bill and it is
     * not to be touched until they have finished. It moves no stock and no money
     * — the flag is the whole of it — but a salesman cannot correct their way
     * out of one, and the register shows it apart from the rest.
     */
    onHold: { type: Boolean, default: false, index: true },
    holdReason: { type: String, default: '', trim: true, maxlength: 300 },

    /* ---- the bin ---- */
    /**
     * In the trash, and recoverable.
     *
     * A bill is cancelled before it is deleted — never the other way round —
     * because a deleted bill that still counted would be money nobody could
     * find. The row itself is never removed: the number was printed on a
     * customer's slip, and the register has to be able to explain it even when
     * the answer is "somebody threw it away, and here is who".
     */
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedByName: { type: String, default: '' },
    deleteReason: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

/* The day's takings, and one salesman's own day. */
schema.index({ organization: 1, dayKey: 1 });
schema.index({ organization: 1, salesman: 1, soldAt: -1 });
/*
 * Finding a bill a customer has come back with — and only one of it.
 *
 * A number is printed on a customer's slip, so two bills carrying the same one
 * is the worst kind of wrong: both are real, both are paid, and nobody can say
 * which is which. The index is what stops it; the service takes the next free
 * number when it loses the race. Scoped by day because the bill number restarts
 * every morning, which is how a paper pad works.
 */
schema.index({ organization: 1, dayKey: 1, billNo: 1 }, { unique: true });
schema.index({ organization: 1, billNo: 1 });
/*
 * One bill per counter reference, per shop.
 *
 * Partial rather than sparse: almost every bill is rung up online and carries
 * an empty string here, and a plain unique index would let exactly one of them
 * exist. This one only covers the bills that were made offline, which are the
 * only ones that can arrive twice.
 */
schema.index(
  { organization: 1, clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: 'string', $gt: '' } } },
);

export type Sale = InferSchemaType<typeof schema>;
export type SaleDoc = HydratedDocument<Sale>;

export const SaleModel = model('Sale', schema);
