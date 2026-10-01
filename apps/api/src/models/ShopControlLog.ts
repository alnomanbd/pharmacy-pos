import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One line of the controlled-drugs register.
 *
 * The law keeps a classified register of a handful of drugs, and a shop that
 * cannot answer "who had the codeine, and which doctor advised it" is out of
 * business — or worse. The rule is enforced at the counter by `createSale`: a
 * bill that carries a controlled product has to name the buyer there and then,
 * and this is the line that is kept.
 *
 * One entry per controlled product per sale. The buyer's name is required; the
 * doctor and phone are asked and kept when given, because both are the
 * questions an inspector actually asks.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'ShopProduct', required: true },
    name: { type: String, default: '', trim: true, maxlength: 160 },
    strength: { type: String, default: '', trim: true, maxlength: 60 },
    qtyPieces: { type: Number, required: true, min: 0 },
    buyerName: { type: String, required: true, trim: true, maxlength: 120 },
    buyerPhone: { type: String, default: '', trim: true, maxlength: 40 },
    doctorName: { type: String, default: '', trim: true, maxlength: 120 },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
    billNo: { type: String, default: '', trim: true, maxlength: 60 },
    soldAt: { type: Date, default: Date.now, index: true },
    salesmanName: { type: String, default: '' },
  },
  { timestamps: true },
);

schema.index({ organization: 1, soldAt: -1 });
schema.index({ organization: 1, product: 1 });

export type ShopControlLog = InferSchemaType<typeof schema>;
export type ShopControlLogDoc = HydratedDocument<ShopControlLog>;

export const ShopControlLogModel = model('ShopControlLog', schema);