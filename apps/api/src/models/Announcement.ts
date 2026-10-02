import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A message from the team to shops, shown across the top of the shop app.
 *
 * "Maintenance tonight from 11 pm", "New: barcode labels", "Prices change on
 * 1 November". Until this existed the only way to tell every shop something was
 * to email each owner, which nobody at the counter reads.
 *
 * Aimed by plan (none chosen means every shop), and live between `startsAt` and
 * `endsAt`, so a maintenance notice can be written today for Friday and take
 * itself down afterwards. Bangla is optional; a shop reading in Bangla sees it
 * when it is there and the English when it is not.
 */
export const ANNOUNCEMENT_TONES = ['info', 'warning', 'success'] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];

const schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, default: '', trim: true, maxlength: 600 },
    titleBn: { type: String, default: '', trim: true, maxlength: 120 },
    bodyBn: { type: String, default: '', trim: true, maxlength: 600 },
    tone: { type: String, enum: ANNOUNCEMENT_TONES, default: 'info' },
    /** Plan keys it is for. Empty: every shop. `trial` aims it at shops on the trial. */
    plans: { type: [String], default: [] },
    /** Optional button: "Read more", "Renew now". */
    linkLabel: { type: String, default: '', trim: true, maxlength: 40 },
    linkUrl: { type: String, default: '', trim: true, maxlength: 300 },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    /** Off: drafted, or taken down early. */
    active: { type: Boolean, default: true },
    /** Whether a shop may close it. A maintenance notice usually should not be. */
    dismissible: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

schema.index({ active: 1, startsAt: 1, endsAt: 1 });

export type Announcement = InferSchemaType<typeof schema>;
export type AnnouncementDoc = HydratedDocument<Announcement>;
export const AnnouncementModel = model('Announcement', schema);
