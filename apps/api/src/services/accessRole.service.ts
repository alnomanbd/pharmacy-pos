import { Types } from 'mongoose';
import { AccessRoleModel } from '../models/AccessRole.js';
import { UserModel } from '../models/index.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/AppError.js';
import { PERMISSIONS, PERMISSION_PRESETS, ALL_PERMISSIONS, type Permission } from '../types/permissions.js';
import {
  SHOP_PERMISSIONS,
  ALL_SHOP_PERMISSIONS,
  BUILT_IN_SHOP_ROLES,
  SHOP_PERMISSION_GROUPS,
  BACK_ROOM,
  type ShopPermission,
} from '../types/shopPermissions.js';

/**
 * Roles, for the console's team and for each shop's staff — and the one
 * question every request asks: what may this person do?
 *
 * A person's permissions come from their role, read fresh (cached for a few
 * seconds) on each request, so an owner who takes "Give discounts" off the
 * Cashier role takes it off every cashier at once. Nobody can make or hand
 * out a role with more than they hold themselves, and nobody changes their
 * own role.
 */

/* ------------------------------------------------------------------ */
/* Reading a role, quickly                                              */
/* ------------------------------------------------------------------ */

const TTL = 15_000;
const cache = new Map<string, { at: number; role: { scope: string; organization: string | null; permissions: string[]; name: string } | null }>();

async function roleById(id: unknown) {
  if (!id) return null;
  const key = String(id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.role;
  const r = await AccessRoleModel.findById(key).select('scope organization permissions name').lean();
  const role = r ? { scope: r.scope, organization: r.organization ? String(r.organization) : null, permissions: r.permissions ?? [], name: r.name } : null;
  cache.set(key, { at: Date.now(), role });
  return role;
}
const forget = (id: unknown) => cache.delete(String(id));

type Who = { role?: string; permissions?: string[]; accessRole?: unknown; organization?: unknown };

/** A console member's permissions: the owner's all, else their role's, else what they were given one by one. */
export async function platformPermissionsOf(user: Who): Promise<Permission[]> {
  if (user.role === 'platformAdmin') return ALL_PERMISSIONS;
  if (user.role !== 'platformStaff') return [];
  const role = await roleById(user.accessRole);
  const list = role && role.scope === 'platform' ? role.permissions : user.permissions ?? [];
  return list.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
}

/** A shop person's permissions: the owner's all, else their shop role's, else their built-in role's. */
export async function shopPermissionsOf(user: Who): Promise<ShopPermission[]> {
  if (user.role === 'admin') return ALL_SHOP_PERMISSIONS;
  if (user.role !== 'pharmacist' && user.role !== 'salesman') return [];
  const role = await roleById(user.accessRole);
  if (role && role.scope === 'shop' && role.organization === String(user.organization ?? '')) {
    return role.permissions.filter((p): p is ShopPermission => (SHOP_PERMISSIONS as readonly string[]).includes(p));
  }
  return BUILT_IN_SHOP_ROLES[user.role].permissions;
}

/** The name a person's role goes by. */
export async function roleNameOf(user: Who) {
  if (user.role === 'admin') return 'Owner';
  if (user.role === 'platformAdmin') return 'Owner';
  const role = await roleById(user.accessRole);
  if (role) return role.name;
  if (user.role === 'pharmacist' || user.role === 'salesman') return BUILT_IN_SHOP_ROLES[user.role].name;
  return 'Custom';
}

/* ------------------------------------------------------------------ */
/* Shop roles                                                          */
/* ------------------------------------------------------------------ */

export interface ShopRoleView {
  id: string;
  name: string;
  description: string;
  permissions: ShopPermission[];
  builtIn: boolean;
  people: number;
}

const clean = <T extends string>(list: string[] | undefined, allowed: readonly T[]) =>
  [...new Set((list ?? []).filter((p): p is T => (allowed as readonly string[]).includes(p)))];

/** Every role a shop has: Owner and the two built in first, then its own. */
export async function listShopRoles(org: string): Promise<ShopRoleView[]> {
  const [own, counts] = await Promise.all([
    AccessRoleModel.find({ scope: 'shop', organization: org }).sort({ name: 1 }).lean(),
    UserModel.aggregate<{ _id: { role: string; accessRole: Types.ObjectId | null }; n: number }>([
      { $match: { organization: new Types.ObjectId(org), deletedAt: null } },
      { $group: { _id: { role: '$role', accessRole: { $ifNull: ['$accessRole', null] } }, n: { $sum: 1 } } },
    ]),
  ]);
  const count = (role: string, accessRole: string | null) =>
    counts.filter((c) => (accessRole ? String(c._id.accessRole) === accessRole : c._id.role === role && !c._id.accessRole)).reduce((n, c) => n + c.n, 0);
  return [
    { id: 'owner', name: 'Owner', description: 'Everything, always — the account’s owner.', permissions: ALL_SHOP_PERMISSIONS, builtIn: true, people: count('admin', null) },
    ...(['pharmacist', 'salesman'] as const).map((k) => ({
      id: k,
      name: BUILT_IN_SHOP_ROLES[k].name,
      description: BUILT_IN_SHOP_ROLES[k].description,
      permissions: BUILT_IN_SHOP_ROLES[k].permissions,
      builtIn: true,
      people: count(k, null),
    })),
    ...own.map((r) => ({
      id: String(r._id),
      name: r.name,
      description: r.description ?? '',
      permissions: clean(r.permissions, SHOP_PERMISSIONS),
      builtIn: false,
      people: count('', String(r._id)),
    })),
  ];
}

export function shopPermissionCatalogue() {
  return SHOP_PERMISSION_GROUPS;
}

type ShopActor = { org: string; id: string; name: string; shopPermissions: ShopPermission[] };

/** Nobody hands out what they do not hold. */
function assertWithin(held: string[], wanted: string[]) {
  const extra = wanted.filter((p) => !held.includes(p));
  if (extra.length) throw forbidden(`You cannot give a permission you do not have yourself (${extra.join(', ')})`);
}

export async function saveShopRole(actor: ShopActor, id: string | null, input: { name?: string; description?: string; permissions?: string[] }) {
  const permissions = input.permissions === undefined ? undefined : clean(input.permissions, SHOP_PERMISSIONS);
  if (permissions) assertWithin(actor.shopPermissions, permissions);
  const name = input.name?.trim();
  if (name !== undefined && !name) throw badRequest('Give the role a name');
  if (name && ['owner', 'pharmacist', 'salesman'].includes(name.toLowerCase())) throw badRequest(`“${name}” is one of the built-in roles — pick another name`);
  try {
    if (!id) {
      if (!name) throw badRequest('Give the role a name');
      const r = await AccessRoleModel.create({
        scope: 'shop',
        organization: actor.org,
        name,
        description: input.description?.trim() ?? '',
        permissions: permissions ?? [],
        createdByName: actor.name,
      });
      return String(r._id);
    }
    if (!Types.ObjectId.isValid(id)) throw badRequest('The built-in roles cannot be changed — make a role of your own');
    const r = await AccessRoleModel.findOne({ _id: id, scope: 'shop', organization: actor.org });
    if (!r) throw notFound('Role');
    /* Taking from a role is fine; adding to it is the same rule as making one. */
    if (name !== undefined) r.name = name;
    if (input.description !== undefined) r.description = input.description.trim();
    if (permissions) r.permissions = permissions;
    await r.save();
    forget(r._id);
    await restampBaseRole(r._id, permissions);
    return String(r._id);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('There is already a role with that name');
    throw err;
  }
}

/** The coarse role kept on each person in step with what their custom role now allows. */
async function restampBaseRole(roleId: unknown, permissions?: string[]) {
  if (!permissions) return;
  const base = permissions.some((p) => (BACK_ROOM as string[]).includes(p)) ? 'pharmacist' : 'salesman';
  await UserModel.updateMany({ accessRole: roleId, role: { $in: ['pharmacist', 'salesman'] } }, { $set: { role: base } });
}

export async function deleteShopRole(actor: ShopActor, id: string) {
  if (!Types.ObjectId.isValid(id)) throw badRequest('The built-in roles cannot be deleted');
  const r = await AccessRoleModel.findOne({ _id: id, scope: 'shop', organization: actor.org });
  if (!r) throw notFound('Role');
  const people = await UserModel.countDocuments({ accessRole: r._id, deletedAt: null });
  if (people) throw badRequest(`${people} ${people === 1 ? 'person has' : 'people have'} this role — give them another one first`);
  await r.deleteOne();
  forget(r._id);
  return { ok: true };
}

/**
 * What to store on a person given a role on the Staff screen: a built-in
 * role is the coarse role itself; a shop role is that role, and the coarse
 * role that matches what it allows.
 */
export async function assignmentFor(actor: ShopActor, roleId: string) {
  if (roleId === 'owner') throw badRequest('There is one owner — the account’s own');
  if (roleId === 'pharmacist' || roleId === 'salesman') {
    assertWithin(actor.shopPermissions, BUILT_IN_SHOP_ROLES[roleId].permissions);
    return { role: roleId, accessRole: null };
  }
  if (!Types.ObjectId.isValid(roleId)) throw badRequest('Pick a role');
  const r = await AccessRoleModel.findOne({ _id: roleId, scope: 'shop', organization: actor.org }).lean();
  if (!r) throw notFound('Role');
  assertWithin(actor.shopPermissions, r.permissions ?? []);
  const base = (r.permissions ?? []).some((p) => (BACK_ROOM as string[]).includes(p)) ? 'pharmacist' : 'salesman';
  return { role: base as 'pharmacist' | 'salesman', accessRole: r._id };
}

/* ------------------------------------------------------------------ */
/* Platform roles                                                      */
/* ------------------------------------------------------------------ */

export interface PlatformRoleView {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  people: number;
  preset: string;
}

/** The console's roles. The first time anybody looks, the ready-made sets become roles of their own. */
export async function listPlatformRoles(): Promise<PlatformRoleView[]> {
  if ((await AccessRoleModel.countDocuments({ scope: 'platform' })) === 0) {
    await AccessRoleModel.insertMany(
      Object.entries(PERMISSION_PRESETS).map(([key, p]) => ({
        scope: 'platform',
        organization: null,
        name: p.label,
        description: p.description,
        permissions: p.permissions,
        preset: key,
        createdByName: 'Dawai',
      })),
    ).catch(() => undefined);
  }
  const [roles, counts] = await Promise.all([
    AccessRoleModel.find({ scope: 'platform' }).sort({ name: 1 }).lean(),
    UserModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { role: 'platformStaff', accessRole: { $ne: null } } },
      { $group: { _id: '$accessRole', n: { $sum: 1 } } },
    ]),
  ]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  return roles.map((r) => ({
    id: String(r._id),
    name: r.name,
    description: r.description ?? '',
    permissions: clean(r.permissions, PERMISSIONS),
    people: n.get(String(r._id)) ?? 0,
    preset: r.preset ?? '',
  }));
}

type PlatformActor = { id: string; name?: string; permissions: string[] };

export async function savePlatformRole(actor: PlatformActor, id: string | null, input: { name?: string; description?: string; permissions?: string[] }) {
  const permissions = input.permissions === undefined ? undefined : clean(input.permissions, PERMISSIONS);
  if (permissions) assertWithin(actor.permissions, permissions);
  const name = input.name?.trim();
  if (name !== undefined && !name) throw badRequest('Give the role a name');
  try {
    if (!id) {
      if (!name) throw badRequest('Give the role a name');
      const r = await AccessRoleModel.create({ scope: 'platform', organization: null, name, description: input.description?.trim() ?? '', permissions: permissions ?? [], createdByName: actor.name ?? '' });
      return String(r._id);
    }
    if (!Types.ObjectId.isValid(id)) throw notFound('Role');
    const r = await AccessRoleModel.findOne({ _id: id, scope: 'platform' });
    if (!r) throw notFound('Role');
    if (name !== undefined) r.name = name;
    if (input.description !== undefined) r.description = input.description.trim();
    if (permissions) r.permissions = permissions;
    await r.save();
    forget(r._id);
    return String(r._id);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('There is already a role with that name');
    throw err;
  }
}

export async function deletePlatformRole(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Role');
  const r = await AccessRoleModel.findOne({ _id: id, scope: 'platform' });
  if (!r) throw notFound('Role');
  const people = await UserModel.countDocuments({ accessRole: r._id });
  if (people) throw badRequest(`${people} ${people === 1 ? 'member has' : 'members have'} this role — give them another one first`);
  await r.deleteOne();
  forget(r._id);
  return { ok: true };
}

/** A platform role, checked to be one, for assigning to a member. */
export async function platformRoleFor(actor: PlatformActor, roleId: string) {
  if (!Types.ObjectId.isValid(roleId)) throw badRequest('Pick a role');
  const r = await AccessRoleModel.findOne({ _id: roleId, scope: 'platform' }).lean();
  if (!r) throw notFound('Role');
  assertWithin(actor.permissions, r.permissions ?? []);
  return r;
}
