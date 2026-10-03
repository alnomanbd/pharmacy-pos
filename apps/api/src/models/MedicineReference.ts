import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const groupSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const MedicineGroupModel = model('MedicineGroup', groupSchema);
export type MedicineGroup = InferSchemaType<typeof groupSchema>;
export type MedicineGroupDoc = HydratedDocument<MedicineGroup>;

const companySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const MedicineCompanyModel = model('MedicineCompany', companySchema);
export type MedicineCompany = InferSchemaType<typeof companySchema>;
export type MedicineCompanyDoc = HydratedDocument<MedicineCompany>;

const monographText = { type: String, default: '' };

const genericSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
    /** e.g. "Non opioid analgesics". */
    drugClass: { type: String, default: '' },
    /**
     * What the medicine is for and how it is used, as plain text with "• "
     * bullets — every brand of this generic shows it. Imported by
     * `catalog:monographs` (seed/monographs.ts); never HTML.
     */
    monograph: {
      indications: monographText,
      therapeuticClass: monographText,
      pharmacology: monographText,
      dosage: monographText,
      administration: monographText,
      interactions: monographText,
      contraindications: monographText,
      sideEffects: monographText,
      pregnancy: monographText,
      precautions: monographText,
      pediatric: monographText,
      overdose: monographText,
      reconstitution: monographText,
      storage: monographText,
    },
    /** Where the text came from, and the name it was found under there. */
    monographSource: {
      name: { type: String, default: '' },
      matchedAs: { type: String, default: '' },
    },
  },
  { timestamps: true },
);
export const MedicineGenericModel = model('MedicineGeneric', genericSchema);
export type MedicineGeneric = InferSchemaType<typeof genericSchema>;
export type MedicineGenericDoc = HydratedDocument<MedicineGeneric>;
