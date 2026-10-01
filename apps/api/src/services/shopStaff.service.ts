import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { UserModel, SaleModel, ShiftModel, OrganizationModel } from '../models/index.js';
import { assertWithinLimit } from './plan.service.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import { todayKey, formatDayKey } from '../utils/date.js';
import type { Actor } from './shop.service.js';

/**
 * The people who work in the shop.
 *
 * A pharmacy hires and loses salesmen, and each one needs their own account —
 * not because of privacy but because of money: every bill carries who made it,
 * and the cash is counted against a name at the end of the day. A shop where
 * everybody shares one login can still use this software; it simply cannot be
 * told anything it did not already know.
 *
 * Two roles and one rule between them. A `pharmacist` runs the shop: stock,
 * deliveries, prices, write-offs. A `salesman` sells and nothing else — no
 * trade price, no margin, no report but their own day. That line is drawn by
 * which router a route lives in (`/api/shop` versus `/api/till`), so it cannot
 * be crossed by a screen forgetting to hide a column.
 */

const SHOP_STAFF_ROLES = ['pharmacist', 'salesman'] as const;
export type ShopStaffRole = (typeof SHOP_STAFF_ROLES)[number];

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

/**
 * Everyone on the shop's payroll, with what they have taken today.
 *
 * The two questions an owner has about staff are "who has an account" and "who
 * is at a counter right now", and they are the same list.
 */
export async function listStaff(actor: Actor) {
  const users = await UserModel.find({
    organization: actor.org,
    role: { $in: ['admin', ...SHOP_STAFF_ROLES] },
  })
    .select('name email phone role isActive lastLoginAt createdAt')
    .sort({ createdAt: 1 })
    .lean();

  const ids = users.map((u) => u._id);
  /* A month is the stretch an owner judges a salesman over — one evening's
     bills say more about the evening than about the person. */
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const [openShifts, today, month] = await Promise.all([
    ShiftModel.find({ organization: actor.org, user: { $in: ids }, closedAt: null })
      .select('user terminal openedAt salesTotal salesCount')
      .lean(),
    SaleModel.aggregate<{ _id: Types.ObjectId; total: number; count: number }>([
      {
        $match: {
          organization: new Types.ObjectId(actor.org),
          dayKey: formatDayKey(todayKey()),
          salesman: { $in: ids },
        },
      },
      { $group: { _id: '$salesman', total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    SaleModel.aggregate<{ _id: Types.ObjectId; total: number; count: number }>([
      {
        $match: {
          organization: new Types.ObjectId(actor.org),
          soldAt: { $gte: monthAgo },
          status: { $ne: 'void' },
          salesman: { $in: ids },
        },
      },
      { $group: { _id: '$salesman', total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
  ]);
  const monthBy = new Map(month.map((m) => [String(m._id), m]));

  const shiftOf = new Map(openShifts.map((s) => [String(s.user), s]));
  const soldBy = new Map(today.map((t) => [String(t._id), t]));

  return users.map((u) => ({
    ...u,
    _id: String(u._id),
    openShift: shiftOf.get(String(u._id))
      ? {
          terminal: shiftOf.get(String(u._id))!.terminal,
          openedAt: shiftOf.get(String(u._id))!.openedAt,
        }
      : null,
    today: {
      total: soldBy.get(String(u._id))?.total ?? 0,
      count: soldBy.get(String(u._id))?.count ?? 0,
    },
    month: {
      total: Math.round((monthBy.get(String(u._id))?.total ?? 0) * 100) / 100,
      count: monthBy.get(String(u._id))?.count ?? 0,
    },
  }));
}

/**
 * Adds a salesman or a pharmacist.
 *
 * The owner types the password and reads it out; the person can change it once
 * they are in. That is how hiring works in a shop — there is no corporate email
 * to send an invitation to, and a link nobody clicks is an account nobody uses.
 *
 * Email is required because it is the sign-in name, not because anybody writes
 * to it. A shop with one email between four people will find that out here
 * rather than after a month of bills with the wrong name on them.
 */
export async function createStaff(
  actor: Actor,
  input: { name: string; email: string; phone: string; role: ShopStaffRole; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!SHOP_STAFF_ROLES.includes(input.role)) {
    throw badRequest('A shop account is a pharmacist or a salesman');
  }
  if (await UserModel.findOne({ email }).lean()) {
    throw conflict('Somebody already signs in with that email');
  }
  if (phone && (await UserModel.findOne({ phone }).lean())) {
    throw conflict('Somebody already signs in with that phone number');
  }

  // Staff logins are what a plan sells; the owner counts as one.
  const org = await OrganizationModel.findById(actor.org).select('plan').lean();
  const active = await UserModel.countDocuments({ organization: actor.org, isActive: true, deletedAt: null });
  await assertWithinLimit(org?.plan || 'trial', 'shopUsers', active);

  const user = await UserModel.create({
    organization: actor.org,
    role: input.role,
    name: input.name.trim(),
    email,
    phone,
    passwordHash: await bcrypt.hash(input.password, 12),
  });

  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
  };
}

/**
 * Corrects a name, moves somebody between the two roles, or switches them off.
 *
 * Switched off rather than deleted, always. A salesman who leaves still made
 * three hundred of the bills in the drawer, and a deleted account takes the
 * name off all of them — which is the one thing the whole design exists to
 * prevent.
 */
export async function updateStaff(
  actor: Actor,
  id: string,
  input: { name?: string; phone?: string; role?: ShopStaffRole; isActive?: boolean },
) {
  const user = await UserModel.findOne({ _id: oid(id), organization: actor.org });
  if (!user) throw notFound('That person');

  if (String(user._id) === actor.id && input.isActive === false) {
    throw badRequest('You cannot switch off your own account');
  }
  if (user.role === 'admin' && input.role) {
    throw badRequest('The account owner’s own role is not changed from here');
  }
  if (input.role && !SHOP_STAFF_ROLES.includes(input.role)) {
    throw badRequest('A shop account is a pharmacist or a salesman');
  }

  // Switching somebody back on takes a login again, so it is held to the plan.
  if (input.isActive === true && !user.isActive) {
    const org = await OrganizationModel.findById(actor.org).select('plan').lean();
    const active = await UserModel.countDocuments({ organization: actor.org, isActive: true, deletedAt: null });
    await assertWithinLimit(org?.plan || 'trial', 'shopUsers', active);
  }

  if (input.name !== undefined) user.name = input.name.trim();
  if (input.phone !== undefined) user.phone = input.phone.trim();
  if (input.role !== undefined) user.set('role', input.role);
  if (input.isActive !== undefined) {
    user.isActive = input.isActive;
    /* Switching somebody off ends their sessions with it. Otherwise the
       machine they were signed in on keeps selling under their name until the
       token expires, which is the window somebody walks out through. */
    if (!input.isActive) user.set('sessions', []);
  }

  await user.save();
  return { _id: String(user._id), name: user.name, role: user.role, isActive: user.isActive };
}

/**
 * Sets somebody's password, because they have forgotten it.
 *
 * The owner does it at the counter and says the new one out loud. Every session
 * ends with it: a password change that leaves the old sessions running is not a
 * password change, it is a second password.
 */
export async function setStaffPassword(actor: Actor, id: string, password: string) {
  const user = await UserModel.findOne({ _id: oid(id), organization: actor.org });
  if (!user) throw notFound('That person');
  if (user.role === 'admin' && String(user._id) !== actor.id) {
    throw badRequest('The owner’s password is changed by the owner, or by us');
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.set('sessions', []);
  await user.save();

  return { _id: String(user._id), name: user.name };
}
