import { Schema, model, Types } from 'mongoose';

/*
 * Two kinds of collection.
 *
 * The platform's, read only: the catalogue and the demand tables its nightly
 * job builds. Declared here loosely (`strict: false`, no indexes) with the
 * collection named outright, so this service never depends on the platform's
 * code and never builds or changes an index on the platform's data.
 *
 * This service's own, `data_*`: who buys, their keys, their plans, what they
 * used, and what the admin changed.
 */

const readOnly = <T>(name: string, collection: string, fields: Record<string, unknown>) =>
  model<T>(name, new Schema<T>(fields, { strict: false, autoIndex: false, versionKey: false, collection }));

type Id = Types.ObjectId;
type MedicineDoc = {
  brandName?: string;
  brandKey?: string;
  genericName?: string;
  generic?: Id | null;
  company?: Id | null;
  dosageForm?: string;
  strength?: string;
  packSize?: string;
  price?: number | null;
  dar?: string;
  isActive?: boolean;
  indications?: string;
  description?: string;
  sideEffects?: string;
};
type Named = { name?: string; isActive?: boolean };

export const Medicine = readOnly<MedicineDoc>('Medicine', 'medicines', {
  brandName: String,
  brandKey: String,
  genericName: String,
  generic: Schema.Types.ObjectId,
  company: Schema.Types.ObjectId,
  dosageForm: String,
  strength: String,
  packSize: String,
  price: Number,
  dar: String,
  isActive: Boolean,
  indications: String,
  description: String,
  sideEffects: String,
});
export const Generic = readOnly<Named>('MedicineGeneric', 'medicinegenerics', { name: String, isActive: Boolean });
export const Company = readOnly<Named>('MedicineCompany', 'medicinecompanies', { name: String, isActive: Boolean });
export const DemandDaily = readOnly<{ day: string; month: string; medicine: Id; district: string; pieces: number; value: number }>('MedicineDemandDaily', 'medicinedemanddailies', {
  day: String,
  month: String,
  medicine: Schema.Types.ObjectId,
  generic: Schema.Types.ObjectId,
  genericName: String,
  company: Schema.Types.ObjectId,
  district: String,
  pieces: Number,
  value: Number,
});
export const Coverage = readOnly<{ month: string; medicine: Id; district: string; shops: number }>('MedicineCoverage', 'medicinecoverages', {
  month: String,
  medicine: Schema.Types.ObjectId,
  district: String,
  shops: Number,
});
export const DemandRun = readOnly<{ day: string; builtAt: Date }>('MedicineDemandRun', 'medicinedemandruns', { day: String, builtAt: Date });

/* ------------------------------------------------------------ our own -- */

export const SCOPES = ['catalogue', 'demand', 'districts', 'trends'] as const;
export type Scope = (typeof SCOPES)[number];

/** What a client pays for: which parts, how far back, how much. */
const planSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    scopes: { type: [String], enum: SCOPES, default: ['catalogue'] },
    /** Months of figures before this one a client may ask for. */
    historyMonths: { type: Number, default: 12 },
    requestsPerMinute: { type: Number, default: 60 },
    requestsPerDay: { type: Number, default: 1000 },
    requestsPerMonth: { type: Number, default: 20000 },
    /** Per month, in taka — what the admin quotes; nothing is billed from here. */
    priceMonthly: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'data_plans' },
);
export const Plan = model('DataPlan', planSchema);

export const CLIENT_KINDS = ['pharma', 'distributor', 'research', 'government', 'other'] as const;

/** A company, distributor or researcher that buys figures. */
const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: CLIENT_KINDS, default: 'other' },
    contactName: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '' },
    plan: { type: String, required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    /** The contract's last day; keys stop working after it. Empty: no end. */
    expiresAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'data_clients' },
);
export const Client = model('DataClient', clientSchema);

/** A key. Only its hash is kept; the key itself is shown once, when made. */
const keySchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, ref: 'DataClient', required: true, index: true },
    label: { type: String, default: '' },
    /** The first characters, to tell keys apart on screen. */
    prefix: { type: String, required: true },
    hash: { type: String, required: true, unique: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'data_keys' },
);
export const ApiKey = model('DataKey', keySchema);

/** Calls per client, per day, per endpoint. */
const usageSchema = new Schema(
  {
    client: { type: Schema.Types.ObjectId, required: true },
    day: { type: String, required: true },
    month: { type: String, required: true },
    endpoint: { type: String, required: true },
    calls: { type: Number, default: 0 },
    rows: { type: Number, default: 0 },
    refused: { type: Number, default: 0 },
  },
  { versionKey: false, collection: 'data_usage' },
);
usageSchema.index({ client: 1, day: 1, endpoint: 1 }, { unique: true });
usageSchema.index({ client: 1, month: 1 });
usageSchema.index({ day: 1 });
export const Usage = model('DataUsage', usageSchema);

/** What the admin changed, and who said they were. */
const logSchema = new Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    by: { type: String, default: '' },
    action: { type: String, required: true },
    client: { type: Schema.Types.ObjectId, default: null },
    detail: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false, collection: 'data_admin_log' },
);
export const AdminLog = model('DataAdminLog', logSchema);

export const oid = (id: unknown) => (typeof id === 'string' && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null);
