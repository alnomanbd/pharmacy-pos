import { Types } from 'mongoose';
import {
  ExpenseModel,
  type ExpenseCategory,
  type ExpenseDoc,
} from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { formatDayKey, instantFromDayKeyAndTime, parseDayKey } from '../utils/date.js';
import { dayRangeInstants } from './shopReport.service.js';
import type { Actor } from './shop.service.js';
import { assertMonthOpen } from './shopCash.service.js';

/* ------------------------------------------------------------------ utils -- */

const DAY = 86_400_000;

const money = (n: number) => Math.round(n * 100) / 100;

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

const shiftKey = (key: string, days: number) =>
  formatDayKey(new Date(parseDayKey(key).getTime() + days * DAY));

/** One line of the shop's own cost, as the screens read it. */
const view = (d: ExpenseDoc) => ({
  _id: String(d._id),
  amount: d.amount,
  category: d.category,
  note: d.note ?? '',
  dayKey: formatDayKey(new Date(d.expenseDate)),
  createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
});

/* --------------------------------------------------------------- the ledger -- */

/**
 * The shop's own cost, over a range.
 *
 * Same range question as everywhere else in the back room: this month's rent is
 * one line next to this month's sales. Deleted lines are out — a spent line
 * taken back (a rent that never happened) is not spending.
 */
export async function listExpenses(
  actor: Actor,
  opts: { from?: string; to?: string } = {},
) {
  const org = new Types.ObjectId(actor.org);
  const to = formatDayKey(parseDayKey(opts.to));
  const from = opts.from ? formatDayKey(parseDayKey(opts.from)) : shiftKey(to, -29);
  if (to < from) throw badRequest('That date range runs backwards');

  const { start, end } = dayRangeInstants(from, to);
  const filter = {
    organization: org,
    expenseDate: { $gte: start, $lte: end },
    deletedAt: null,
  };
  const [rows, count] = await Promise.all([
    ExpenseModel.find(filter).sort({ expenseDate: -1, createdAt: -1 }).lean(),
    ExpenseModel.countDocuments(filter),
  ]);

  return {
    from,
    to,
    count,
    amount: money(rows.reduce((n, r) => n + r.amount, 0)),
    data: rows.map((r) => ({
      _id: String(r._id),
      amount: r.amount,
      category: r.category,
      note: r.note ?? '',
      dayKey: formatDayKey(new Date(r.expenseDate)),
    })),
  };
}

/** One line of spending, on the day the owner says it happened. */
export async function createExpense(
  actor: Actor,
  payload: { amount: number; category: ExpenseCategory; note?: string; date?: string },
) {
  /* Midday, in the app's timezone: the day stored is the day typed, however the
     tz boundary falls. */
  const when = payload.date
    ? instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00')
    : new Date();
  await assertMonthOpen(actor.org, when);

  const doc = await ExpenseModel.create({
    organization: new Types.ObjectId(actor.org),
    amount: money(payload.amount),
    category: payload.category,
    note: payload.note ?? '',
    expenseDate: when,
    createdBy: new Types.ObjectId(actor.id),
    createdByName: actor.name,
  });
  return view(doc);
}

export async function updateExpense(
  actor: Actor,
  id: string,
  payload: {
    amount?: number;
    category?: ExpenseCategory;
    note?: string;
    date?: string;
  },
) {
  const doc = await ExpenseModel.findOne({
    _id: oid(id),
    organization: new Types.ObjectId(actor.org),
    deletedAt: null,
  });
  if (!doc) throw notFound('Expense');
  await assertMonthOpen(
    actor.org,
    doc.expenseDate,
    payload.date ? instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00') : null,
  );

  if (payload.amount !== undefined) doc.amount = money(payload.amount);
  if (payload.category !== undefined) doc.category = payload.category;
  if (payload.note !== undefined) doc.note = payload.note;
  if (payload.date !== undefined) {
    doc.expenseDate = instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00');
  }
  await doc.save();
  return view(doc);
}