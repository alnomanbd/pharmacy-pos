import { resetTwoFactor } from './twoFactor.service.js';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
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

const MEMBER_FIELDS = 'name email phone role permissions isActive lastLoginAt twoFactorEnabled createdAt';

/*
 * The schema needs a phone, and an operator invited without one is given a
 * placeholder that cannot collide with a real number. It is nobody's number,
 * so it is shown as blank.
 */
const PHONE_PLACEHOLDER = /^platform-\d+$/;
const shownPhone = (phone?: string | null) => (phone && !PHONE_PLACEHOLDER.test(phone) ? phone : '');

/** One colleague in the shape the console reads. */
export function memberView(m: {
  _id: unknown;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  permissions?: string[];
  isActive?: boolean | null;
  lastLoginAt?: Date | null;
  twoFactorEnabled?: boolean | null;
  createdAt?: Date | null;
}) {
  return {
    _id: String(m._id),
    id: String(m._id),
    name: m.name ?? '',
    email: m.email ?? '',
    phone: shownPhone(m.phone),
    role: m.role,
    // The owner's set is implicit, so it is filled in here rather than stored —
    // otherwise a permission added in a later version would silently not apply
    // to the one account that should always have everything.
    permissions: permissionsOf(m),
    isActive: m.isActive !== false,
    lastLoginAt: m.lastLoginAt ?? null,
    twoFactorEnabled: Boolean(m.twoFactorEnabled),
    createdAt: m.createdAt ?? null,
    isOwner: m.role === 'platformAdmin',
  };
}

export type PlatformMember = ReturnType<typeof memberView>;

export async function listTeam() {
  const members = await UserModel.find({ role: { $in: ['platformAdmin', 'platformStaff'] } })
    .select(MEMBER_FIELDS)
    .sort({ createdAt: 1 })
    .lean();
  return members.map((m) => memberView(m as Parameters<typeof memberView>[0]));
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

type Who = { id: string; role?: string };

export interface MemberPatch {
  name?: string;
  email?: string;
  phone?: string;
  permissions?: Permission[];
  preset?: string;
  isActive?: boolean;
}

/**
 * Why this change to a colleague is refused, or null when it is allowed.
 *
 * Two kinds of change with two different rules. A name, address or phone is
 * clerical: anybody who manages the team may correct a colleague's, and their
 * own — except the owner's, which only another owner may touch, since the
 * owner's email is where the owner's password reset goes. Access — the
 * permissions and the on/off switch — is never the owner's to lose here, and
 * never yours to widen.
 */
export function memberEditBlock(actor: Who, target: Who, patch: MemberPatch): string | null {
  const touchesAccess =
    patch.permissions !== undefined || patch.preset !== undefined || patch.isActive !== undefined;
  const touchesDetails = patch.name !== undefined || patch.email !== undefined || patch.phone !== undefined;

  if (target.role === 'platformAdmin') {
    if (touchesAccess) return 'The owner’s access cannot be changed here';
    if (touchesDetails && actor.role !== 'platformAdmin') {
      return 'Only an owner can change an owner’s details';
    }
  }
  if (touchesAccess && target.id === actor.id) return 'You cannot change your own access';
  return null;
}

/** Whether somebody may set this colleague's password, or why not. */
export function memberPasswordBlock(actor: Who, target: Who): string | null {
  if (target.id === actor.id) return 'Use Change password for your own';
  // Setting the owner's password is signing in as the owner.
  if (target.role === 'platformAdmin' && actor.role !== 'platformAdmin') {
    return 'Only an owner can set an owner’s password';
  }
  return null;
}

async function teamMember(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Team member');
  const member = await UserModel.findById(id);
  if (!member) throw notFound('Team member');
  if (!['platformAdmin', 'platformStaff'].includes(member.role)) {
    throw badRequest('That account is not on the platform team');
  }
  return member;
}

/** Name, email and phone, checked for clashes, onto a member document. */
async function applyDetails(
  member: Awaited<ReturnType<typeof teamMember>>,
  patch: { name?: string; email?: string; phone?: string },
) {
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    if (email !== member.email) {
      if (await UserModel.exists({ email, _id: { $ne: member._id } })) {
        throw badRequest('That email is already in use');
      }
      member.set('email', email);
    }
  }
  if (patch.phone !== undefined) {
    const phone = patch.phone.trim();
    if (!phone) {
      // Blank goes back to the placeholder the schema needs, not to ''.
      if (!PHONE_PLACEHOLDER.test(member.phone)) member.set('phone', `platform-${Date.now()}`);
    } else if (phone !== member.phone) {
      if (await UserModel.exists({ phone, _id: { $ne: member._id } })) {
        throw badRequest('That phone number is already in use');
      }
      member.set('phone', phone);
    }
  }
  if (patch.name !== undefined) member.set('name', patch.name.trim());
}

export async function updateMember(id: string, actor: Who, payload: MemberPatch) {
  const member = await teamMember(id);
  const block = memberEditBlock(actor, { id: String(member._id), role: member.role }, payload);
  if (block) throw badRequest(block);

  await applyDetails(member, payload);
  if (payload.isActive !== undefined) member.set('isActive', payload.isActive);
  if (payload.permissions || payload.preset) {
    const permissions = resolvePermissions(payload);
    if (permissions.length === 0) throw badRequest('Give them at least one permission');
    member.set('permissions', permissions);
  }

  await member.save();
  return memberView(member.toObject());
}

/**
 * Sets a colleague's console password, for the one who is locked out.
 *
 * Every session they had ends with it: if the reason was a lost laptop, the
 * laptop is signed out too.
 */
export async function setMemberPassword(id: string, actor: Who, newPassword: string) {
  const member = await teamMember(id);
  const block = memberPasswordBlock(actor, { id: String(member._id), role: member.role });
  if (block) throw badRequest(block);

  member.set('passwordHash', await bcrypt.hash(newPassword, 12));
  member.set('passwordResetTokenHash', '');
  member.set('passwordResetExpiresAt', null);
  member.set('sessions', []);
  member.set('failedLoginCount', 0);
  member.set('lockedUntil', null);
  await member.save();

  logger.warn({ id, email: member.email, by: actor.id }, 'Platform team member password set');
  return { id: String(member._id), email: member.email };
}

/**
 * A colleague's lost phone. The same guard as setting their password: an owner
 * only by an owner, and never yourself (you would use your own Security page).
 */
export async function resetMemberTwoFactor(id: string, actor: Who) {
  const member = await teamMember(id);
  const block = memberPasswordBlock(actor, { id: String(member._id), role: member.role });
  if (block) {
    throw badRequest(
      block
        .replace('Use Change password for your own', 'Use your Security page for your own')
        .replace('set an owner’s password', 'reset an owner’s two-factor'),
    );
  }
  return resetTwoFactor(String(member._id));
}

/** Your own name and phone. Email and access go through a colleague. */
export async function updateSelf(id: string, patch: { name?: string; phone?: string }) {
  const member = await teamMember(id);
  await applyDetails(member, patch);
  await member.save();
  return memberView(member.toObject());
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
