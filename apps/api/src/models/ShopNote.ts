import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * What the team knows about a shop that the shop's records do not say.
 *
 * "Called 2 Oct, wants a label printer, call back Sunday." Without somewhere to
 * write that, it lives in one operator's head or a notebook, and the next
 * person to pick up the phone starts from nothing. Demo requests had notes; the
 * shops that actually pay did not.
 *
 * Internal only: no shop user ever reads these.
 */
const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Kept as written — an operator can be renamed or removed. */
    authorName: { type: String, default: '' },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    /** Pinned notes sit above the rest: "pays in cash only", "owner is hard of hearing". */
    pinned: { type: Boolean, default: false },
    /** When somebody should get back to the shop. Shows in the bell once due. */
    followUpAt: { type: Date, default: null, index: true },
    doneAt: { type: Date, default: null },
    doneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

schema.index({ organization: 1, pinned: -1, createdAt: -1 });
schema.index({ followUpAt: 1, doneAt: 1 });

export type ShopNote = InferSchemaType<typeof schema>;
export type ShopNoteDoc = HydratedDocument<ShopNote>;
export const ShopNoteModel = model('ShopNote', schema);
