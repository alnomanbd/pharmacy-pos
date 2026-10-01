import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Something this shop sells.
 *
 * Mostly a medicine from the shared catalogue, which is why `medicine` is a
 * reference rather than a copy — the catalogue is platform property and a shop
 * never edits it. What belongs to the shop is everything the catalogue cannot
 * know: what it charges, how it breaks a pack down, where the box sits on the
 * shelf, and when to reorder.
 *
 * It is *not* only medicine. Every pharmacy in this country also sells
 * syringes, baby food, soap and cosmetics, and a product list that cannot hold
 * them is a product list the shop keeps a second, paper copy of.
 *
 * ## Units
 *
 * Everything is counted in the smallest sellable unit — a piece — because a
 * customer buys four tablets out of a strip of ten. The pack structure is kept
 * beside it so purchase can be entered the way a delivery actually arrives:
 *
 *     box = `stripsPerBox` strips, strip = `piecesPerStrip` pieces
 *
 * A bottle of syrup or a tube of ointment is one piece with both counts at 1,
 * which keeps one rule for everything instead of two kinds of product.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    /** The catalogue row this came from, when it is a medicine. */
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', default: null, index: true },
    /**
     * Snapshotted from the catalogue at the time it was added.
     *
     * Deliberately a copy: a shop's own list should not change under it because
     * the platform corrected a brand name, and the till has to be able to find
     * and print a product without a lookup on every keystroke.
     */
    name: { type: String, required: true, trim: true, maxlength: 160, index: true },
    genericName: { type: String, default: '', trim: true, maxlength: 160 },
    companyName: { type: String, default: '', trim: true, maxlength: 120 },
    strength: { type: String, default: '', trim: true, maxlength: 60 },
    dosageForm: { type: String, default: '', trim: true, maxlength: 60 },

    /** False for the syringes, baby food and cosmetics on the same shelf. */
    isMedicine: { type: Boolean, default: true, index: true },

    /**
     * What the scanner reads off the pack.
     *
     * Kept as text rather than a number: an EAN-13 with a leading zero is not
     * the same code once it has been through `Number`, and plenty of local
     * packs carry a code that is not an EAN at all. Empty means this shop has
     * not scanned it yet, which is most of the list on the day they start.
     */
    barcode: { type: String, default: '', trim: true, maxlength: 64 },

    /* ---- how a pack comes apart ---- */
    piecesPerStrip: { type: Number, default: 1, min: 1, max: 1000 },
    stripsPerBox: { type: Number, default: 1, min: 1, max: 1000 },

    /**
     * The price a customer pays for one piece.
     *
     * Derived from the MRP printed on the pack when the product is created, and
     * then owned by the shop: the printed price changes with a new batch, and
     * the shop decides when to follow it.
     */
    mrpPerPiece: { type: Number, default: 0, min: 0 },

    /**
     * Where it is.
     *
     * `rack` is the shelf as a record — every pharmacy arranges them
     * differently, so the shelves themselves are rows (see ShopRack) rather
     * than a fixed list. `rackLabel` is what gets printed and shown at the
     * counter: it is filled from the rack, and kept as plain text so a shop
     * that never sets its racks up can still type "R3-B" against an item and
     * have it appear on the screen where it matters.
     */
    rack: { type: Schema.Types.ObjectId, ref: 'ShopRack', default: null, index: true },
    rackLabel: { type: String, default: '', trim: true, maxlength: 40 },

    /**
     * Tell the owner when on-hand falls to this.
     *
     * In pieces, like everything else. Zero means never — plenty of a shop's
     * long tail is stocked once and not chased.
     */
    reorderLevel: { type: Number, default: 0, min: 0 },

    /** Prescription-only, for the shop's own conscience and the law's. */
    prescriptionOnly: { type: Boolean, default: false },

    /**
     * A controlled drug — one of the few the law keeps a classified register of.
     *
     * Different from `prescriptionOnly`, which is a rule about selling. A
     * controlled drug is one the shop has to be able to say *who took* — the
     * buyer and the advising doctor are kept on the classified register that
     * this flag feeds, at the counter, on the bill itself.
     */
    controlled: { type: Boolean, default: false },

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

/* The till searches by name constantly; the list is per shop. */
schema.index({ organization: 1, name: 1 });
/*
 * A scanned code has to land on exactly one row, or the counter is being asked
 * a question it cannot answer. Partial, because "no code yet" is the normal
 * state of most of a shop's list and every one of those would otherwise
 * collide with every other.
 */
schema.index(
  { organization: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $gt: '' } } },
);
/* The same catalogue medicine must not be added twice to one shop, or its
   stock is split across two rows and neither is the truth. */
schema.index(
  { organization: 1, medicine: 1 },
  { unique: true, partialFilterExpression: { medicine: { $type: 'objectId' } } },
);

export type ShopProduct = InferSchemaType<typeof schema>;
export type ShopProductDoc = HydratedDocument<ShopProduct>;

export const ShopProductModel = model('ShopProduct', schema);
