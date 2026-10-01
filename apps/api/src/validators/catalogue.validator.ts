import { z } from 'zod';

/**
 * What the console may write into the shared catalogue, and what a shop may
 * ask to have added to it.
 */

const objectId = z.string().trim().regex(/^[a-f0-9]{24}$/i, 'Not a valid id');
/** A link to a reference row: an id, or null to clear it. */
const refId = objectId.nullable().optional();
const text = (max: number) => z.string().trim().max(max).optional();

const medicineFields = {
  brandName: z.string().trim().min(1, 'A brand name is required').max(160),
  genericName: z.string().trim().min(1, 'A generic name is required').max(200),
  strength: text(80),
  dosageForm: text(80),
  packSize: text(80),
  // Null clears it: "we do not know the price" is not the same as "free".
  price: z.number().min(0).max(10_000_000).nullable().optional(),
  dar: text(60),
  description: text(5000),
  indications: text(5000),
  sideEffects: text(5000),
  companyId: refId,
  genericId: refId,
  groupId: refId,
  isActive: z.boolean().optional(),
};

export const medicineInputSchema = z.object(medicineFields);
export type MedicineInput = z.infer<typeof medicineInputSchema>;

export const medicinePatchSchema = medicineInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type MedicinePatch = z.infer<typeof medicinePatchSchema>;

/** A company, generic or group: a name and nothing else. */
export const refNameSchema = z.object({ name: z.string().trim().min(1).max(200) });

/** What a shop sends when the catalogue does not have what is on its shelf. */
export const medicineRequestSchema = z.object({
  brandName: z.string().trim().min(1, 'Which brand?').max(160),
  genericName: text(200),
  companyName: text(160),
  strength: text(80),
  dosageForm: text(80),
  packSize: text(80),
  note: text(500),
});
export type MedicineRequestInput = z.infer<typeof medicineRequestSchema>;

/**
 * Approving is one of two things, never both: pointing at a row that already
 * exists (the shop missed it, or it was added since), or creating it.
 */
export const approveRequestSchema = z.union([
  z.object({ medicineId: objectId }),
  z.object({ medicine: medicineInputSchema }),
]);
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;

export const rejectRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Say why').max(300),
});
