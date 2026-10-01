import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A shop asking for a medicine the shared catalogue does not have.
 *
 * The catalogue is the platform's — one bad edit would reach every shop — so a
 * shop cannot write to it. But a pharmacist who cannot find a brand while a
 * customer waits will otherwise add it as a loose, uncatalogued item and the
 * catalogue never improves, so the gap has to go *somewhere*.
 *
 * This is that somewhere: raised from the shop app, reviewed in the console,
 * and on approval linked to a catalogue row every shop then has. The details
 * are free text on purpose — the shop knows the brand on the strip, not our
 * generic or company ids.
 */
export const MEDICINE_REQUEST_STATUS = ['pending', 'added', 'rejected'] as const;
export type MedicineRequestStatus = (typeof MEDICINE_REQUEST_STATUS)[number];

const schema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    brandName: { type: String, required: true, trim: true },
    genericName: { type: String, default: '', trim: true },
    companyName: { type: String, default: '', trim: true },
    strength: { type: String, default: '', trim: true },
    dosageForm: { type: String, default: '', trim: true },
    packSize: { type: String, default: '', trim: true },
    note: { type: String, default: '' },
    status: { type: String, enum: MEDICINE_REQUEST_STATUS, default: 'pending', index: true },
    /** Filled when an operator links the request to a catalogue row. */
    medicine: { type: Schema.Types.ObjectId, ref: 'Medicine', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true },
);

// The console's queue: one status, newest first.
schema.index({ status: 1, createdAt: -1 });

export type MedicineRequest = InferSchemaType<typeof schema>;
export type MedicineRequestDoc = HydratedDocument<MedicineRequest>;

export const MedicineRequestModel = model('MedicineRequest', schema);
