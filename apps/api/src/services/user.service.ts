import { UserModel, OrganizationModel } from '../models/index.js';
import { notFound, conflict } from '../utils/AppError.js';
import { assertWithinLimit } from './plan.service.js';
import bcrypt from 'bcryptjs';
import type { Role } from '../types/enums.js';

export async function listUsers(orgId: string) {
  return UserModel.find({ organization: orgId })
    .select('-passwordHash -refreshTokens')
    .lean();
}

export async function createUser(orgId: string, payload: {
  name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
}) {
  if (await UserModel.findOne({ email: payload.email.toLowerCase() })) throw conflict('Email already exists');
  if (await UserModel.findOne({ phone: payload.phone })) throw conflict('Phone already exists');

  // Staff logins are what a plan sells; checked before the account exists.
  const org = await OrganizationModel.findById(orgId).select('plan').lean();
  const used = await UserModel.countDocuments({ organization: orgId, isActive: true, deletedAt: null });
  await assertWithinLimit(org?.plan || 'trial', 'shopUsers', used);
  const passwordHash = await bcrypt.hash(payload.password, 12);
  const user = await UserModel.create({
    organization: orgId,
    name: payload.name,
    email: payload.email.toLowerCase(),
    phone: payload.phone,
    role: payload.role,
    passwordHash,
  });
  const safe = user.toObject() as Record<string, unknown>;
  delete safe.passwordHash;
  delete safe.refreshTokens;
  return safe;
}

export async function updateUser(
  orgId: string,
  id: string,
  payload: {
    name?: string;
    phone?: string;
    role?: Role;
    photo?: string;
    password?: string;
  },
) {
  const set: Record<string, unknown> = { ...payload };
  if (payload.password) {
    set.passwordHash = await bcrypt.hash(payload.password, 12);
    delete set.password;
  }
  const user = await UserModel.findOneAndUpdate(
    { _id: id, organization: orgId },
    { $set: set },
    { new: true },
  )
    .select('-passwordHash -refreshTokens')
    .lean();
  if (!user) throw notFound('User');
  return user;
}

/**
 * One person's full record, for the staff profile.
 *
 * The list endpoint returns everybody, and a profile is read one at a time —
 * so this exists to be authorised differently rather than to fetch differently:
 * the route lets somebody read *their own* record without being an
 * administrator, which the list never does.
 */
export async function getUserProfile(orgId: string, id: string) {
  const user = await UserModel.findOne({ _id: id, organization: orgId })
    .select('-passwordHash -refreshTokens')
    .lean();
  if (!user) throw notFound('User');
  return user;
}

/**
 * Updates the signed-in user's own record.
 *
 * Deliberately not `updateUser` with the id filled in: that function takes
 * whatever the admin schema allows, `role` included. The narrower schema
 * (`updateMeSchema`) and this narrower function are the pair that make
 * self-service safe — there is no argument here that could carry a role, so no
 * future edit can accidentally let one through.
 */
export async function updateOwnProfile(userId: string, payload: Record<string, unknown>) {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    // Dates arrive as strings, and an empty one means "cleared".
    if ((key === 'dateOfBirth' || key === 'joinedAt') && typeof value === 'string') {
      set[key] = value ? new Date(value) : null;
      continue;
    }
    set[key] = value;
  }

  const user = await UserModel.findByIdAndUpdate(userId, { $set: set }, { new: true })
    .select('-passwordHash -refreshTokens')
    .lean();
  if (!user) throw notFound('User');
  return user;
}

export async function softDeleteUser(orgId: string, id: string) {
  const user = await UserModel.findOneAndUpdate(
    { _id: id, organization: orgId },
    { $set: { isActive: false, deletedAt: new Date() } },
    { new: true },
  )
    .select('-passwordHash -refreshTokens')
    .lean();
  if (!user) throw notFound('User');
  return user;
}

export async function getOrganization(orgId: string) {
  const org = await OrganizationModel.findById(orgId).lean();
  if (!org) throw notFound('Organization');
  return org;
}

export async function updateOrganization(orgId: string, payload: Record<string, unknown>) {
  /*
   * `settings` is flattened into dotted paths.
   *
   * `$set: { settings: { smsEnabled: false } }` replaces the whole settings
   * subdocument — so saving one switch would silently wipe every other setting
   * that lives in the same object. `$set: { 'settings.smsEnabled': ... }`
   * touches only what was sent.
   *
   * The payload is allow-listed by `organizationUpdateSchema` before it gets
   * here, so these keys are known.
   */
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'settings' && value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        update[`settings.${k}`] = v;
      }
    } else {
      update[key] = value;
    }
  }

  const org = await OrganizationModel.findByIdAndUpdate(orgId, { $set: update }, { new: true }).lean();
  if (!org) throw notFound('Organization');
  return org;
}
