import bcrypt from 'bcryptjs';
import { UserModel } from '../models/index.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import {
  PERMISSIONS,
  PERMISSION_PRESETS,
  ALL_PERMISSIONS,
  type Permission,
} from '../types/permissions.js';

/**
 * The people who run the deployment.
 *
 * One operator account was never a plan: somebody checks payments, somebody
 * answers support, somebody curates the catalogue, and handing all three the
 * owner's login means any of them can suspend a customer or delete a shop's
 * records by accident.
 *
 * Platform users have **no organization** — that is what separates them from a
 * shop's staff, and it is why they skip the tenant checks in `requireAuth`.
 */

/** A platform user has every permission if they own the place, else their own. */
export function permissionsOf(user: { role?: string; permissions?: string[] }): Permission[] {
  if (user.role === 'platformAdmin') return ALL_PERMISSIONS;
  if (user.role !== 'platformStaff') return [];
  return (user.permissions ?? []).filter((p): p is Permission =>
    (PERMISSIONS as readonly string[]).includes(p),
  );
}

export function hasPermission(
  user: { role?: string; permissions?: string[] },
  permission: Permission,
) {
  return permissionsOf(user).includes(permission);
}

export async function listTeam() {
  const members = await UserModel.find({ role: { $in: ['platformAdmin', 'platformStaff'] } })
    .select('name email phone role permissions isActive lastLoginAt twoFactorEnabled createdAt')
    .sort({ createdAt: 1 })
    .lean();

  return members.map((m) => ({
    ...m,
    // The owner's set is implicit, so it is filled in here rather than stored —
    // otherwise a permission added in a later version would silently not apply
    // to the one account that should always have everything.
    permissions: permissionsOf(m as { role?: string; permissions?: string[] }),
    isOwner: m.role === 'platformAdmin',
  }));
}

export async function inviteMember(payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  permissions?: Permission[];
  preset?: string;
}) {
  const email = payload.email.toLowerCase().trim();
  if (await UserModel.findOne({ email })) throw conflict('That email already has an account');

  const permissions = resolvePermissions(payload);
  if (permissions.length === 0) {
    // An account with nothing granted can sign in and see an empty console,
    // which reads as a broken product rather than as a locked door.
    throw badRequest('Give them at least one permission, or choose a preset');
  }

  const member = await UserModel.create({
    role: 'platformStaff',
    name: payload.name.trim(),
    email,
    // Platform staff do not work in a shop and have no counter. The schema requires
    // a phone, so a given one is used and otherwise a placeholder that cannot
    // collide with a real number.
    phone: payload.phone?.trim() || `platform-${Date.now()}`,
    passwordHash: await bcrypt.hash(payload.password, 12),
    permissions,
    isEmailVerified: true,
  });

  logger.info({ email, permissions }, 'Platform team member added');
  return { id: member.id, email, permissions };
}

export async function updateMember(
  id: string,
  actorId: string,
  payload: { permissions?: Permission[]; preset?: string; isActive?: boolean; name?: string },
) {
  const member = await UserModel.findById(id);
  if (!member) throw notFound('Team member');
  if (!['platformAdmin', 'platformStaff'].includes(member.role)) {
    throw badRequest('That account is not on the platform team');
  }
  if (member.role === 'platformAdmin') {
    // The owner's permissions are implicit and their access is not something a
    // colleague — or a slip — should be able to take away.
    throw badRequest('The owner’s access cannot be changed here');
  }
  if (String(member._id) === actorId) throw badRequest('You cannot change your own access');

  if (payload.name !== undefined) member.set('name', payload.name.trim());
  if (payload.isActive !== undefined) member.set('isActive', payload.isActive);
  if (payload.permissions || payload.preset) {
    const permissions = resolvePermissions(payload);
    if (permissions.length === 0) throw badRequest('Give them at least one permission');
    member.set('permissions', permissions);
  }

  await member.save();
  return { id: member.id, permissions: permissionsOf(member.toObject()) };
}

export async function removeMember(id: string, actorId: string) {
  const member = await UserModel.findById(id);
  if (!member) throw notFound('Team member');
  if (member.role === 'platformAdmin') {
    throw badRequest('The owner cannot be removed here — use `npm run user:remove`');
  }
  if (String(member._id) === actorId) throw badRequest('You cannot remove yourself');

  await UserModel.deleteOne({ _id: id });
  logger.warn({ id, email: member.email }, 'Platform team member removed');
  return { id };
}

/** A preset is a starting point; explicit permissions win if both are given. */
function resolvePermissions(payload: { permissions?: Permission[]; preset?: string }): Permission[] {
  if (payload.permissions?.length) {
    return payload.permissions.filter((p): p is Permission =>
      (PERMISSIONS as readonly string[]).includes(p),
    );
  }
  if (payload.preset) return PERMISSION_PRESETS[payload.preset]?.permissions ?? [];
  return [];
}

export const presets = () =>
  Object.entries(PERMISSION_PRESETS).map(([key, v]) => ({ key, ...v }));

export const allPermissions = () => [...PERMISSIONS];
