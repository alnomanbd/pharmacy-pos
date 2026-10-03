import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A role: a named set of permissions, given to people.
 *
 * Two kinds, kept apart by `scope`:
 *
 * - **platform** — the console's team (types/permissions.ts). No organization.
 *   Started from the ready-made sets (Support, Billing, …) and editable.
 * - **shop** — one shop's own roles for its staff (types/shopPermissions.ts),
 *   made by its owner: a Cashier, a Store keeper. The built-in Pharmacist and
 *   Salesman are not stored; they are the defaults in code.
 *
 * Changing a role's permissions changes them for everybody who has it, on
 * their next request — that is the point of a role.
 */
const schema = new Schema(
  {
    scope: { type: String, enum: ['platform', 'shop'], required: true, index: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', trim: true, maxlength: 240 },
    permissions: { type: [String], default: [] },
    /** Where a platform role came from, when it started as one of the ready-made sets. */
    preset: { type: String, default: '' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);
schema.index({ scope: 1, organization: 1, name: 1 }, { unique: true });

export type AccessRole = InferSchemaType<typeof schema>;
export const AccessRoleModel = model('AccessRole', schema);
