import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A shelf in this shop, and the rule for what lives on it.
 *
 * Every pharmacy racks its stock, and no two do it the same way. Some sort by
 * what the medicine *is* — one shelf of syrups, one of ointments, tablets in
 * the drawers behind. Some sort by company, because that is how the SR's order
 * sheet is arranged and how stock arrives. Some do neither and simply know that
 * Napa lives on R2. All three are correct, and software that insists on one of
 * them is software the shop works around.
 *
 * So a rack carries an optional **rule**, and the rule is a suggestion rather
 * than a law: when an item is added, a matching rack is offered, and the person
 * can put it wherever they like. What matters at the counter is that the screen
 * says where the box actually is — "R2-A" saves a minute per sale in a shop
 * with ten racks and somebody new behind the counter.
 */
export const RACK_RULES = ['form', 'company', 'manual'] as const;
export type RackRule = (typeof RACK_RULES)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    /** What is painted on the shelf: "R2", "Syrup shelf", "Fridge". */
    name: { type: String, required: true, trim: true, maxlength: 60 },
    note: { type: String, default: '', trim: true, maxlength: 240 },

    /**
     * How this shelf decides what belongs on it.
     *
     * `form` matches the dosage form (Syrup, Ointment, Tablet…), `company`
     * matches the manufacturer, and `manual` is a shelf whose contents are
     * simply what somebody put there.
     */
    rule: { type: String, enum: RACK_RULES, default: 'manual' },
    /**
     * What the rule matches, lower-cased.
     *
     * A list rather than one value because a shelf usually holds a family:
     * syrups and suspensions together, or two companies a shop buys from the
     * same distributor.
     */
    match: { type: [String], default: [] },

    /** A fridge is not an ordinary shelf, and the difference matters. */
    isCold: { type: Boolean, default: false },

    sortOrder: { type: Number, default: 0 },
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

/* One rack per name per shop: two "R2"s is two answers to "where is it". */
schema.index({ organization: 1, name: 1 }, { unique: true });
schema.index({ organization: 1, sortOrder: 1 });

export type ShopRack = InferSchemaType<typeof schema>;
export type ShopRackDoc = HydratedDocument<ShopRack>;

export const ShopRackModel = model('ShopRack', schema);
