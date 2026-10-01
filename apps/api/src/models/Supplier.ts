import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A company a shop buys from.
 *
 * Square, Incepta, Beximco, or the wholesaler in the next market — in this
 * trade they are all "company" to the shopkeeper, and each one is a running
 * account rather than a list of one-off purchases. What is owed to them is the
 * number an owner asks for most often, and it is the sum of everything that
 * ever happened on that account, which is why the balance is derived from the
 * ledger rather than typed anywhere.
 *
 * `openingBalance` is the exception, and it exists for a specific reason: a
 * shop that starts using this software on a Tuesday already owes money on
 * Monday's deliveries. Without somewhere to put that, the first month's figures
 * are wrong and the owner stops trusting the page.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },

    /**
     * What kind of supplier this is.
     *
     * Most shops here do not buy from a manufacturer at all. The big ones order
     * from a company's depot — the top manufacturers run twenty or thirty each
     * — and the company's SR comes round to take it. Smaller shops buy from a
     * wholesaler, which usually means Mitford, and the smallest buy a strip at
     * a time from the bigger shop down the road when something runs out.
     *
     * It is a field rather than a guess because each behaves differently: a
     * depot's delivery has an invoice number and bonus on it, and a strip
     * bought from the shop next door has neither.
     */
    kind: {
      type: String,
      enum: ['company', 'distributor', 'shop', 'other'],
      default: 'distributor',
      index: true,
    },
    /** The person who answers the phone, not the company's head office. */
    contactPerson: { type: String, default: '', trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    address: { type: String, default: '', trim: true, maxlength: 240 },

    /**
     * The representative, and the day he comes.
     *
     * A real field here rather than a note: orders in this trade are placed
     * when the rep turns up, so "who is coming on Sunday" is how a shop plans
     * its week. Stored as a day number to match the rest of the app
     * (0 = Sunday), or null when nobody visits.
     */
    /** The SR who comes round. In this trade the order is placed to a person. */
    repName: { type: String, default: '', trim: true, maxlength: 120 },
    repPhone: { type: String, default: '', trim: true, maxlength: 40 },
    repVisitDay: { type: Number, default: null, min: 0, max: 6 },

    /**
     * What was already owed on the day this shop started using the software.
     *
     * Positive means the shop owes the company. Counted into the balance beside
     * the ledger, never edited by a purchase or a payment — it is the starting
     * point, not a running total.
     */
    openingBalance: { type: Number, default: 0 },

    note: { type: String, default: '', trim: true, maxlength: 2000 },
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
  },
  { timestamps: true },
);

/* One company per name per shop: two "Incepta" rows is two balances, and the
   answer to "koto dite hobe" then depends on which one you opened. */
schema.index({ organization: 1, name: 1 }, { unique: true });

export type Supplier = InferSchemaType<typeof schema>;
export type SupplierDoc = HydratedDocument<Supplier>;

export const SupplierModel = model('Supplier', schema);
