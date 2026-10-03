import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * How this shop prints, and what is on its paper.
 *
 * A receipt is the only thing most customers ever keep from a pharmacy, and it
 * is the shop's name in their pocket — so it carries the shop's own particulars
 * rather than ours. The drug licence number is on it because it is on the
 * shop's wall and belongs on its paper.
 *
 * ## Why the width is a setting
 *
 * Thermal printers here come in two sizes and nobody chooses which one the shop
 * already owns: **80mm** is the counter printer in a busy shop, **58mm** is the
 * small one, and a shop that bought something unusual needs to say so — hence a
 * custom width in millimetres. Getting this wrong is not cosmetic: a bill
 * printed for 80mm on a 58mm roll loses the right-hand column, which is the
 * money.
 */
const schema = new Schema(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },

    /* ---- what is printed at the top ---- */
    shopName: { type: String, default: '', trim: true, maxlength: 120 },
    /** In Bangla, for the shops whose sign is in Bangla. Printed under it. */
    shopNameBn: { type: String, default: '', trim: true, maxlength: 120 },
    address: { type: String, default: '', trim: true, maxlength: 240 },
    phone: { type: String, default: '', trim: true, maxlength: 60 },
    /** The DGDA drug licence. On the wall, so on the paper. */
    drugLicenceNo: { type: String, default: '', trim: true, maxlength: 60 },
    /** A stored key, like the organization's logo. Printed small, at the top. */
    logo: { type: String, default: '' },
    /** The shop's own letterhead, scanned: drawn across the top and the foot of the A4 sheet. */
    letterheadHeader: { type: String, default: '' },
    letterheadFooter: { type: String, default: '' },

    /* ---- what is printed at the bottom ---- */
    footer: {
      type: String,
      default: 'Medicine once sold is not returnable without the bill.',
      trim: true,
      maxlength: 240,
    },
    /** "আপনার সুস্থতা কামনা করি" — a line shops like to add. */
    footerBn: { type: String, default: '', trim: true, maxlength: 240 },

    /* ---- the paper ---- */
    /**
     * `80` and `58` are the two thermal rolls sold here; `custom` is for
     * anything else, and then `paperWidthMm` is what it actually is.
     */
    paperSize: { type: String, enum: ['80', '58', 'custom'], default: '80' },
    paperWidthMm: { type: Number, default: 80, min: 40, max: 210 },

    /** Print the bill straight after saving, rather than waiting to be asked. */
    autoPrint: { type: Boolean, default: true },
    /**
     * Ask before a bill is saved.
     *
     * **On by default.** The button takes stock off the shelf and money into
     * the day's takings, and it sits under the hand that is also reaching for
     * the search box — a stray click should not be able to finish a sale. The
     * dialog shows the figures rather than asking "are you sure", because what
     * goes wrong at a till is a mis-keyed amount and a dialog that does not
     * show the amount cannot catch one.
     *
     * A shop that wants the speed can turn it off, and then the bill number in
     * the corner and the paper coming out of the printer are the confirmation.
     */
    confirmSale: { type: Boolean, default: true },
    /** Some shops hand a copy to the customer and keep one. */
    copies: { type: Number, default: 1, min: 1, max: 3 },
    /** Bangla on the receipt, for a shop whose customers read it. */
    printBangla: { type: Boolean, default: false },
    /** A line for the customer to see what they saved. */
    showSavings: { type: Boolean, default: false },

    /* ---- VAT ---- */
    /**
     * Off by default, and off is the right answer for most pharmacies here.
     *
     * Medicine is VAT-exempt in Bangladesh, so a shop that sells only medicine
     * charges none — but the same counter sells baby food, cosmetics, soap and
     * syringes, and a VAT-registered shop has to charge on those. So the rate
     * lives here, zero means the whole feature is invisible, and what it applies
     * to is decided per line by `ShopProduct.isMedicine` rather than by asking
     * the shop to tag two thousand products.
     *
     * `vatOnMedicine` is the escape hatch for a shop whose accountant says
     * otherwise — it is their registration, not ours.
     */
    vatPercent: { type: Number, default: 0, min: 0, max: 100 },
    vatOnMedicine: { type: Boolean, default: false },
    /** The BIN, printed on the paper beside the drug licence. */
    vatBin: { type: String, default: '', trim: true, maxlength: 40 },

    /* ---- the A4 paper, which is a different document from the roll ---- */
    /**
     * How the invoice and the delivery sheet look.
     *
     * Separate from the thermal settings above because they are a different
     * document for a different reader: the roll is handed across a counter and
     * this is filed, claimed against, and sometimes stapled to a cheque. A shop
     * that has had a letterhead printed for twenty years has opinions about it,
     * and the ones that cost nothing to honour are here.
     *
     * Everything has a default that produces a correct document, so a shop that
     * never opens this screen still gets a sheet it can hand over.
     */
    /** Orders from customers through the shop's own link — see onlineOrder.service. */
    onlineOrders: {
      enabled: { type: Boolean, default: false },
      code: { type: String, default: '', index: true },
      pickup: { type: Boolean, default: true },
      delivery: { type: Boolean, default: true },
      deliveryCharge: { type: Number, default: 40, min: 0 },
      freeDeliveryOver: { type: Number, default: 0, min: 0 },
      note: { type: String, default: '', trim: true, maxlength: 300 },
    },
    invoice: {
      /** A4 is the filing standard here; A5 suits a shop that prints halves. */
      paper: { type: String, enum: ['A4', 'A5'], default: 'A4' },
      /**
       * The band at the top and the rule at the foot.
       *
       * A hex colour, because a shop's letterhead is its own — and validated as
       * one, since anything else ends up as a black band or a thrown error in
       * the middle of a print.
       */
      accent: { type: String, default: '#065f46', trim: true, maxlength: 9 },
      /** The shop's logo in the band, when one has been uploaded. */
      showLogo: { type: Boolean, default: true },
      /** The square. Off for a shop that finds it fussy. */
      showQr: { type: Boolean, default: true },
      /** Batch numbers on a customer's invoice — some shops prefer not to. */
      showBatch: { type: Boolean, default: true },
      /** A line for whoever signs it off; empty hides the rule entirely. */
      signatureLabel: { type: String, default: 'For the shop', trim: true, maxlength: 60 },
      /**
       * The small print, in the shop's own words.
       *
       * Its own field rather than the thermal `footer`: 80mm has room for one
       * short line and an A4 sheet has room for the actual terms.
       */
      terms: { type: String, default: '', trim: true, maxlength: 600 },
      /**
       * Whose letterhead the sheet is printed on.
       *
       * - `dawai`: the band and rule drawn here, in the shop's colour.
       * - `image`: the shop's own letterhead, uploaded as a header and a footer
       *   picture, printed on plain paper.
       * - `pad`: paper the shop already had printed. Nothing is drawn where the
       *   pad's own header and footer are — only the space they take is kept.
       */
      style: { type: String, enum: ['dawai', 'image', 'pad'], default: 'dawai' },
      /** How much of a pre-printed pad its header and footer take, in millimetres. */
      padTopMm: { type: Number, default: 45, min: 0, max: 120 },
      padBottomMm: { type: Number, default: 20, min: 0, max: 80 },
    },
  },
  { timestamps: true },
);

export type ShopSettings = InferSchemaType<typeof schema>;
export type ShopSettingsDoc = HydratedDocument<ShopSettings>;

export const ShopSettingsModel = model('ShopSettings', schema);
