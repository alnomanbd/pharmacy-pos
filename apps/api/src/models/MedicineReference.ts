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

const genericSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const MedicineGenericModel = model('MedicineGeneric', genericSchema);
export type MedicineGeneric = InferSchemaType<typeof genericSchema>;
export type MedicineGenericDoc = HydratedDocument<MedicineGeneric>;
