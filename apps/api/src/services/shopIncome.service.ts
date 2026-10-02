import { Types } from 'mongoose';
import { IncomeModel, type IncomeCategory, type IncomeDoc } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { formatDayKey, instantFromDayKeyAndTime, parseDayKey } from '../utils/date.js';
import { dayRangeInstants } from './shopReport.service.js';
import type { Actor } from './shop.service.js';
import { branchMatch, writeBranchOf } from './branchScope.service.js';
import { assertMonthOpen } from './shopCash.service.js';

/*
 * Money in that is not a sale — the mirror of shopExpense.service, kept apart
 * so neither list has to carry a sign on every line.
 */

const DAY = 86_400_000;
const money = (n: number) => Math.round(n * 100) / 100;
const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};
const shiftKey = (key: string, days: number) => formatDayKey(new Date(parseDayKey(key).getTime() + days * DAY));

const view = (d: IncomeDoc) => ({
  _id: String(d._id),
  amount: d.amount,
  category: d.category,
  note: d.note ?? '',
  dayKey: formatDayKey(new Date(d.incomeDate)),
  createdByName: d.createdByName ?? '',
});

export async function listIncome(actor: Actor, opts: { from?: string; to?: string } = {}) {
  const org = new Types.ObjectId(actor.org);
  const to = formatDayKey(parseDayKey(opts.to));
  const from = opts.from ? formatDayKey(parseDayKey(opts.from)) : shiftKey(to, -29);
  if (to < from) throw badRequest('That date range runs backwards');

  const { start, end } = dayRangeInstants(from, to);
  const rows = await IncomeModel.find({ organization: org, incomeDate: { $gte: start, $lte: end }, deletedAt: null, ...branchMatch(actor.branch) })
    .sort({ incomeDate: -1, createdAt: -1 })
    .lean();

  return {
    from,
    to,
    count: rows.length,
    amount: money(rows.reduce((n, r) => n + r.amount, 0)),
    data: rows.map((r) => ({
      _id: String(r._id),
      amount: r.amount,
      category: r.category,
      note: r.note ?? '',
      dayKey: formatDayKey(new Date(r.incomeDate)),
      createdByName: r.createdByName ?? '',
    })),
  };
}

/** One line of money in, on the day the owner says it came. */
export async function createIncome(
  actor: Actor,
  payload: { amount: number; category: IncomeCategory; note?: string; date?: string },
) {
  const when = payload.date ? instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00') : new Date();
  await assertMonthOpen(actor.org, when);
  const doc = await IncomeModel.create({
    organization: new Types.ObjectId(actor.org),
    branch: await writeBranchOf(actor),
    amount: money(payload.amount),
    category: payload.category,
    note: payload.note ?? '',
    incomeDate: when,
    createdBy: new Types.ObjectId(actor.id),
    createdByName: actor.name,
  });
  return view(doc);
}

export async function updateIncome(
  actor: Actor,
  id: string,
  payload: { amount?: number; category?: IncomeCategory; note?: string; date?: string },
) {
  const doc = await IncomeModel.findOne({ _id: oid(id), organization: new Types.ObjectId(actor.org), deletedAt: null, ...branchMatch(actor.branch) });
  if (!doc) throw notFound('Income');
  await assertMonthOpen(
    actor.org,
    doc.incomeDate,
    payload.date ? instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00') : null,
  );
  if (payload.amount !== undefined) doc.amount = money(payload.amount);
  if (payload.category !== undefined) doc.category = payload.category;
  if (payload.note !== undefined) doc.note = payload.note;
  if (payload.date !== undefined) doc.incomeDate = instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00');
  await doc.save();
  return view(doc);
}
