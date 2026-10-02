import { Types } from 'mongoose';
import { ShopCounterModel, ShiftModel, SaleModel } from '../models/index.js';
import { assertOrgWithinLimit } from './plan.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { todayKey, formatDayKey } from '../utils/date.js';
import type { Actor } from './shop.service.js';

/**
 * The shop's counters.
 *
 * Small, and worth having for one reason: a counter that is a typed word is a
 * different counter every time somebody spells it differently, and then nobody
 * can be told which till was short at the end of the evening.
 *
 * The list doubles as the shop's view of its own floor — who is standing where,
 * what each has taken today, and which boxes are still open — because that is
 * the only question an owner opens this page to ask.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

const money = (n: number) => Math.round(n * 100) / 100;

/** The counters, each with whoever is on it and what it has taken today. */
export async function listCounters(actor: Actor) {
  const counters = await ShopCounterModel.find({ organization: actor.org, deletedAt: null })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const open = await ShiftModel.find({ organization: actor.org, closedAt: null })
    .select('counter terminal user userName openedAt salesCount salesTotal cashTaken openingFloat')
    .lean();

  /* Matched on the reference where there is one and on the name where there is
     not — every shift opened before counters existed carries only a word. */
  const byCounter = new Map(open.filter((s) => s.counter).map((s) => [String(s.counter), s]));
  const byName = new Map(open.filter((s) => !s.counter).map((s) => [s.terminal, s]));

  /*
   * The last day each counter closed, and how the count came out.
   *
   * "Was the night counter short?" is asked the next morning, after the shift
   * is gone from the open list — so the most recent closed one rides along,
   * difference and all.
   */
  const closed = await ShiftModel.aggregate<{
    _id: Types.ObjectId | null;
    terminal: string;
    userName: string;
    closedAt: Date;
    difference: number;
    salesTotal: number;
    salesCount: number;
  }>([
    { $match: { organization: new Types.ObjectId(actor.org), closedAt: { $ne: null } } },
    { $sort: { closedAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ['$counter', '$terminal'] },
        terminal: { $first: '$terminal' },
        userName: { $first: '$userName' },
        closedAt: { $first: '$closedAt' },
        difference: { $first: '$difference' },
        salesTotal: { $first: '$salesTotal' },
        salesCount: { $first: '$salesCount' },
      },
    },
  ]);
  const lastClosed = new Map(closed.map((c) => [String(c._id), c]));

  const today = formatDayKey(todayKey());
  const takings = await SaleModel.aggregate<{ _id: string; total: number; count: number }>([
    {
      $match: {
        organization: new Types.ObjectId(actor.org),
        dayKey: today,
        status: { $ne: 'void' },
      },
    },
    { $group: { _id: '$terminal', total: { $sum: '$total' }, count: { $sum: 1 } } },
  ]);
  const soldAt = new Map(takings.map((t) => [t._id ?? '', t]));

  return counters.map((c) => {
    const shift = byCounter.get(String(c._id)) ?? byName.get(c.name) ?? null;
    const day = soldAt.get(c.name);
    const last = lastClosed.get(String(c._id)) ?? lastClosed.get(c.name) ?? null;
    return {
      ...c,
      _id: String(c._id),
      openShift: shift
        ? {
            _id: String(shift._id),
            userName: shift.userName,
            openedAt: shift.openedAt,
            salesCount: shift.salesCount,
            salesTotal: money(shift.salesTotal ?? 0),
            expectedCash: money((shift.openingFloat ?? 0) + (shift.cashTaken ?? 0)),
          }
        : null,
      today: { bills: day?.count ?? 0, total: money(day?.total ?? 0) },
      lastClosed: last
        ? {
            userName: last.userName,
            closedAt: last.closedAt,
            difference: money(last.difference ?? 0),
            salesTotal: money(last.salesTotal ?? 0),
            salesCount: last.salesCount ?? 0,
          }
        : null,
    };
  });
}

/** What the counter's own screen needs: the names, and nothing else. */
export async function pickableCounters(actor: Actor) {
  const rows = await ShopCounterModel.find({
    organization: actor.org,
    isActive: { $ne: false },
    deletedAt: null,
  })
    .select('name openingFloat paperWidthMm')
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  /* Who is already standing at each one — picking a counter somebody else has
     open was only refused after the button, with the cash already counted. */
  const open = await ShiftModel.find({
    organization: actor.org,
    closedAt: null,
    counter: { $in: rows.map((r) => r._id) },
    user: { $ne: new Types.ObjectId(actor.id) },
  })
    .select('counter userName')
    .lean();
  const busy = new Map(open.map((o) => [String(o.counter), o.userName ?? '']));
  return rows.map((r) => ({ ...r, _id: String(r._id), busyWith: busy.get(String(r._id)) ?? null }));
}

export async function createCounter(
  actor: Actor,
  input: { name: string; note?: string; openingFloat?: number; paperWidthMm?: number | null },
) {
  const name = input.name?.trim();
  if (!name) throw badRequest('What is this counter called?');

  const clash = await ShopCounterModel.findOne({ organization: actor.org, name });
  if (clash) throw badRequest(`There is already a counter called ${name}`);

  // A second till is what Plus sells, so the count is checked before it exists.
  const live = await ShopCounterModel.countDocuments({ organization: actor.org, isActive: { $ne: false } });
  await assertOrgWithinLimit(actor.org, 'terminals', live);

  const made = await ShopCounterModel.create({
    organization: actor.org,
    name,
    note: input.note?.trim() ?? '',
    openingFloat: input.openingFloat ?? 0,
    paperWidthMm: input.paperWidthMm ?? null,
  });
  return made.toObject();
}

export async function updateCounter(
  actor: Actor,
  id: string,
  input: {
    name?: string;
    note?: string;
    openingFloat?: number;
    paperWidthMm?: number | null;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  const counter = await ShopCounterModel.findOne({ _id: oid(id), organization: actor.org });
  if (!counter) throw notFound('Counter');

  // Turning a counter back on is a till again, held to the plan like a new one.
  if (input.isActive === true && counter.isActive === false) {
    const live = await ShopCounterModel.countDocuments({ organization: actor.org, isActive: { $ne: false } });
    await assertOrgWithinLimit(actor.org, 'terminals', live);
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw badRequest('What is this counter called?');
    const clash = await ShopCounterModel.findOne({
      organization: actor.org,
      name,
      _id: { $ne: counter._id },
    });
    if (clash) throw badRequest(`There is already a counter called ${name}`);
    counter.name = name;
  }

  if (input.note !== undefined) counter.note = input.note.trim();
  if (input.openingFloat !== undefined) counter.openingFloat = input.openingFloat;
  if (input.paperWidthMm !== undefined) counter.paperWidthMm = input.paperWidthMm;
  if (input.sortOrder !== undefined) counter.sortOrder = input.sortOrder;

  if (input.isActive === false) {
    /* A counter with a till open on it cannot be retired: the money in that box
       has not been counted yet, and the shift would have nowhere to belong. */
    const busy = await ShiftModel.findOne({
      organization: actor.org,
      closedAt: null,
      $or: [{ counter: counter._id }, { terminal: counter.name }],
    });
    if (busy) throw badRequest(`${counter.name} still has the POS open — close the day on it first`);
    counter.isActive = false;
  } else if (input.isActive === true) {
    counter.isActive = true;
  }

  await counter.save();
  return counter.toObject();
}
