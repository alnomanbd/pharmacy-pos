import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const schema = new Schema(
  {
    genericName: { type: String, required: true, index: true },
    generic: { type: Schema.Types.ObjectId, ref: 'MedicineGeneric', index: true },
    brandName: { type: String, required: true, index: true },
    /**
     * Lowercased `brandName`, kept in step by the hooks below.
     *
     * A spreadsheet import matches thousands of rows against this catalogue by
     * brand, and a spreadsheet does not agree with the database about casing
     * ("NAPA", "Napa"). A case-insensitive regex per row cannot use an index and
     * turns a 25k-row import into minutes of collection scans; a stored
     * lowercase key makes the same lookup one indexed `$in`.
     */
    brandKey: { type: String, default: '', index: true },
    company: { type: Schema.Types.ObjectId, ref: 'MedicineCompany', index: true },
    group: { type: Schema.Types.ObjectId, ref: 'MedicineGroup', index: true },
    dosageForm: { type: String, default: '' },
    strength: { type: String, default: '' },
    packSize: { type: String, default: '' },
    price: { type: Number },
    /**
     * Monograph text, shown when a brand is opened in the formulary and beside
     * it when a product is picked. Free text rather than structured fields:
     * the DGDA/BNF sources these are copied from are prose, and a pharmacist
     * reading "what is this and what does it do" wants the prose.
     */
    description: { type: String, default: '' },
    indications: { type: String, default: '' },
    sideEffects: { type: String, default: '' },
    /**
     * DGDA registration number ("Drug Administration Registration").
     *
     * The one identifier in this whole catalogue issued by somebody other than
     * us. It is what makes repeated enrichment safe: two exports spell "The ACME
     * Laboratories Ltd." three ways between them, but a product's DAR is the
     * same number in both, so an import can recognise a row it has already seen
     * rather than adding it again under a slightly different name.
     *
     * Not unique, deliberately. The published registry itself carries a handful
     * of repeated DARs (175 of 36,254), and refusing them would mean refusing
     * real registered products over somebody else's data-entry error.
     */
    dar: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ brandName: 'text', genericName: 'text' });
schema.index({ generic: 1, isActive: 1 });
// The import's natural key: brand + strength + company + form identifies a
// product, because one brand is sold by several companies, at several strengths,
// and in several forms. `dar`, where a row has one, beats all four.
schema.index({ brandKey: 1, strength: 1, company: 1, dosageForm: 1 });
// Sparse: most rows in a catalogue seeded before the registry import have no DAR,
// and an index over tens of thousands of empty strings buys nothing.
schema.index({ dar: 1 }, { sparse: true });

export const brandKeyOf = (brandName: string) => brandName.trim().toLowerCase();

// Both hooks, because the catalogue is written two ways: document saves from the
// admin UI, and `updateOne(..., { upsert: true })` from the bulk importer.
schema.pre('save', function syncBrandKey(next) {
  if (this.isModified('brandName')) this.set('brandKey', brandKeyOf(this.get('brandName') || ''));
  next();
});

schema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function syncBrandKeyOnUpdate(next) {
  const update = this.getUpdate() as Record<string, any> | null;
  const brandName = update?.$set?.brandName ?? update?.brandName;
  if (typeof brandName === 'string') {
    this.set('brandKey', brandKeyOf(brandName));
  }
  next();
});

export type Medicine = InferSchemaType<typeof schema>;
export type MedicineDoc = HydratedDocument<Medicine>;

export const MedicineModel = model('Medicine', schema);
