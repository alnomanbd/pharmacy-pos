import { Types } from 'mongoose';
import {
  CashMoveModel,
  MonthCloseModel,
  SaleModel,
  StockLedgerModel,
  CustomerLedgerModel,
  type CashMoveKind,
  type CashMoveDoc,
} from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { calendarPartsInAppTz, formatDayKey, instantFromDayKeyAndTime, parseDayKey } from '../utils/date.js';
import { dayRangeInstants } from './shopReport.service.js';
import type { Actor } from './shop.service.js';
import { branchMatch, writeBranchOf } from './branchScope.service.js';

/*
 * The owner's money, the bank, refunds, and the month's close.
 *
 * Kept together because the lock is shared: a closed month refuses a new
 * drawing as firmly as it refuses a new expense.
 */

const DAY = 86_400_000;
const money = (n: number) => Math.round(n * 100) / 100;
const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};
const shiftKey = (key: string, days: number) =>
  formatDayKey(new Date(parseDayKey(key).getTime() + days * DAY));

/** `YYYY-MM` of an instant, in the shop's own calendar. */
export function monthOf(when: Date) {
  const { year, month } = calendarPartsInAppTz(when);
  return `${year}-${String(month).padStart(2, '0')}`;
}

const MONTH_NAME = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Refuses a change dated inside a closed month.
 *
 * Called by everything the owner types by hand — expenses, other income,
 * drawings, deposits — on the date the line is for *and*, on an edit, the date
 * it was for before, so a line cannot be moved out of a closed month either.
 */
export async function assertMonthOpen(org: string, ...when: (Date | null | undefined)[]) {
  const months = [...new Set(when.filter((w): w is Date => !!w).map(monthOf))];
  if (months.length === 0) return;
  const shut = await MonthCloseModel.findOne({
    organization: org,
    month: { $in: months },
    closed: true,
  }).lean();
  if (shut) throw badRequest(`${MONTH_NAME(shut.month)} is closed — reopen it first to change its money`);
}

/* ------------------------------------------------------------- cash moves -- */

const view = (d: CashMoveDoc) => ({
  _id: String(d._id),
  kind: d.kind,
  amount: d.amount,
  note: d.note ?? '',
  reference: d.reference ?? '',
  dayKey: formatDayKey(parseDayKey(new Date(d.moveDate).toISOString())),
  createdByName: d.createdByName ?? '',
  returnValue: d.returnValue ?? 0,
});

/** Everything but refunds is typed by hand; refunds are the till's. */
const HAND_KINDS: CashMoveKind[] = ['drawing', 'capital', 'bank_deposit', 'bank_withdrawal'];

export async function listCashMoves(actor: Actor, opts: { from?: string; to?: string } = {}) {
  const to = formatDayKey(parseDayKey(opts.to));
  const from = opts.from ? formatDayKey(parseDayKey(opts.from)) : shiftKey(to, -29);
  if (to < from) throw badRequest('That date range runs backwards');
  const { start, end } = dayRangeInstants(from, to);
  const rows = await CashMoveModel.find({
    organization: new Types.ObjectId(actor.org),
    moveDate: { $gte: start, $lte: end },
    deletedAt: null,
    ...branchMatch(actor.branch),
  })
    .sort({ moveDate: -1, createdAt: -1 })
    .lean();
  return {
    from,
    to,
    data: rows.map((r) => ({
      _id: String(r._id),
      kind: r.kind,
      amount: r.amount,
      note: r.note ?? '',
      reference: r.reference ?? '',
      dayKey: formatDayKey(parseDayKey(new Date(r.moveDate).toISOString())),
      createdByName: r.createdByName ?? '',
    })),
  };
}

export async function createCashMove(
  actor: Actor,
  payload: { kind: CashMoveKind; amount: number; note?: string; reference?: string; date?: string },
) {
  if (!HAND_KINDS.includes(payload.kind)) throw badRequest('A refund is taken at the till, on the bill');
  const when = payload.date ? instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00') : new Date();
  await assertMonthOpen(actor.org, when);
  const doc = await CashMoveModel.create({
    organization: new Types.ObjectId(actor.org),
    branch: await writeBranchOf(actor),
    kind: payload.kind,
    amount: money(payload.amount),
    note: payload.note ?? '',
    reference: payload.reference ?? '',
    moveDate: when,
    createdBy: new Types.ObjectId(actor.id),
    createdByName: actor.name,
  });
  return view(doc);
}

export async function updateCashMove(
  actor: Actor,
  id: string,
  payload: { amount?: number; note?: string; reference?: string; date?: string },
) {
  const doc = await CashMoveModel.findOne({ _id: oid(id), organization: actor.org, deletedAt: null, ...branchMatch(actor.branch) });
  if (!doc) throw notFound('That line');
  if (doc.kind === 'refund') throw badRequest('A refund belongs to its bill — take it back from the bill');
  const next = payload.date ? instantFromDayKeyAndTime(parseDayKey(payload.date), '12:00') : null;
  await assertMonthOpen(actor.org, doc.moveDate, next);
  if (payload.amount !== undefined) doc.amount = money(payload.amount);
  if (payload.note !== undefined) doc.note = payload.note;
  if (payload.reference !== undefined) doc.reference = payload.reference;
  if (next) doc.moveDate = next;
  await doc.save();
  return view(doc);
}

/**
 * Cash handed back for a return, written by the till.
 *
 * Recorded even when no cash changed hands — a return against a bill still on
 * the khata — because `returnValue` is what corrects the month's sales either
 * way. Never refused by a closed month: the customer is at the counter.
 */
export async function recordRefund(
  actor: Actor,
  input: {
    saleId: unknown;
    billNo: string;
    cashBack: number;
    returnValue: number;
    returnCost: number;
    note?: string;
  },
) {
  await CashMoveModel.create({
    organization: new Types.ObjectId(actor.org),
    kind: 'refund',
    amount: money(input.cashBack),
    returnValue: money(input.returnValue),
    returnCost: money(input.returnCost),
    reference: input.billNo,
    note: input.note ?? '',
    sale: input.saleId ?? null,
    moveDate: new Date(),
    createdBy: new Types.ObjectId(actor.id),
    createdByName: actor.name,
  });
}

/**
 * The returns taken before refunds were written down.
 *
 * Until the POS began writing a refund line for each return, a return put the
 * pieces back on the shelf and the money back over the counter and left the
 * accounts none the wiser — so those months read higher than they were. This
 * finds every bill with pieces back on it whose refund lines fall short of what
 * came back, and writes the difference: dated when the last piece came back,
 * the cash part being whatever did not come off the customer's baki.
 *
 * Safe to run any number of times: a bill whose refunds already add up is
 * left alone. Run once per shop per process, from the accounts page.
 */
const backfilled = new Set<string>();

/**
 * What a bill's refund lines are short of, if anything.
 *
 * The pieces back on the bill at the price sold, less what the refund lines
 * already say; of that, the cash is whatever did not come off the customer's
 * baki. `null` when the lines already add up.
 */
export function refundGap(
  lines: { returnedPieces?: number | null; pricePerPiece: number; costPerPiece?: number | null }[],
  written: { value: number; cash: number } | undefined,
  offDue: number,
) {
  const value = money(lines.reduce((t, l) => t + (l.returnedPieces ?? 0) * l.pricePerPiece, 0));
  const cost = money(lines.reduce((t, l) => t + (l.returnedPieces ?? 0) * (l.costPerPiece ?? 0), 0));
  const missing = money(value - (written?.value ?? 0));
  if (missing <= 0.01) return null;
  const cashAll = Math.max(0, value - offDue);
  const cash = money(Math.min(missing, Math.max(0, cashAll - (written?.cash ?? 0))));
  return { value: missing, cash, cost: value > 0 ? money((cost * missing) / value) : 0 };
}

export async function backfillRefunds(org: string) {
  if (backfilled.has(org)) return 0;
  backfilled.add(org);
  const orgId = new Types.ObjectId(org);

  const sales = await SaleModel.find({ organization: orgId, 'lines.returnedPieces': { $gt: 0 } })
    .select('billNo lines soldAt branch')
    .lean();
  if (!sales.length) return 0;
  const ids = sales.map((s) => s._id);

  const [written, stockBack, dueBack] = await Promise.all([
    CashMoveModel.aggregate<{ _id: Types.ObjectId; value: number; cash: number }>([
      { $match: { organization: orgId, kind: 'refund', sale: { $in: ids } } },
      { $group: { _id: '$sale', value: { $sum: '$returnValue' }, cash: { $sum: '$amount' } } },
    ]),
    StockLedgerModel.aggregate<{ _id: Types.ObjectId; last: Date }>([
      { $match: { organization: orgId, move: 'sale_return', 'ref.id': { $in: ids } } },
      { $group: { _id: '$ref.id', last: { $max: '$createdAt' } } },
    ]),
    CustomerLedgerModel.aggregate<{ _id: Types.ObjectId; amount: number }>([
      { $match: { organization: orgId, entry: 'sale_return', 'ref.id': { $in: ids } } },
      { $group: { _id: '$ref.id', amount: { $sum: { $abs: '$amount' } } } },
    ]),
  ]);
  const writtenOf = new Map(written.map((w) => [String(w._id), w]));
  const lastOf = new Map(stockBack.map((w) => [String(w._id), w.last]));
  const dueOf = new Map(dueBack.map((w) => [String(w._id), w.amount]));

  const rows = [];
  for (const sale of sales) {
    const gap = refundGap(
      sale.lines ?? [],
      writtenOf.get(String(sale._id)),
      dueOf.get(String(sale._id)) ?? 0,
    );
    if (!gap) continue;
    rows.push({
      organization: orgId,
      branch: sale.branch ?? null,
      kind: 'refund',
      amount: gap.cash,
      returnValue: gap.value,
      returnCost: gap.cost,
      reference: sale.billNo,
      note: 'Written in from an earlier return',
      sale: sale._id,
      moveDate: lastOf.get(String(sale._id)) ?? sale.soldAt,
      createdByName: 'System',
    });
  }
  if (rows.length) await CashMoveModel.insertMany(rows);
  return rows.length;
}

/* ------------------------------------------------------------ month close -- */

/** The last twelve months, newest first, with whether each is closed. */
export async function listMonths(actor: Actor) {
  const now = new Date();
  const { year, month } = calendarPartsInAppTz(now);
  const keys = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const rows = await MonthCloseModel.find({ organization: actor.org, month: { $in: keys } }).lean();
  const byKey = new Map(rows.map((r) => [r.month, r]));
  return keys.map((m) => {
    const r = byKey.get(m);
    return {
      month: m,
      closed: !!r?.closed,
      snapshot: r?.closed ? r.snapshot : null,
      countedCash: r?.countedCash ?? null,
      note: r?.note ?? '',
      closedAt: r?.closedAt ?? null,
      closedByName: r?.closedByName ?? '',
      reopenedAt: r?.reopenedAt ?? null,
      reopenedByName: r?.reopenedByName ?? '',
      reopenReason: r?.reopenReason ?? '',
    };
  });
}

/** The first and last day of a month, the last never after today. */
export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('A month looks like 2026-09');
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = `${month}-01`;
  const last = formatDayKey(new Date(Date.UTC(y, m, 0)));
  const today = formatDayKey(parseDayKey());
  if (from > today) throw badRequest('That month has not started yet');
  return { from, to: last < today ? last : today };
}

export async function closeMonth(
  actor: Actor,
  month: string,
  input: { countedCash?: number | null; note?: string },
  snapshot: unknown,
) {
  const { to } = monthRange(month);
  /* A month still running cannot be closed: today's bills and spending would
     land in a locked month, and the counter would stop. */
  if (to >= formatDayKey(parseDayKey())) throw badRequest('A month can be closed once it is over');
  const doc = await MonthCloseModel.findOneAndUpdate(
    { organization: actor.org, month },
    {
      $set: {
        closed: true,
        snapshot,
        countedCash: input.countedCash ?? null,
        note: input.note ?? '',
        closedAt: new Date(),
        closedBy: new Types.ObjectId(actor.id),
        closedByName: actor.name,
      },
    },
    { upsert: true, new: true },
  ).lean();
  return { month: doc!.month, closed: true };
}

export async function reopenMonth(actor: Actor, month: string, reason: string) {
  if (!reason?.trim() || reason.trim().length < 3)
    throw badRequest('Say why it is being reopened — it is kept with it');
  const doc = await MonthCloseModel.findOneAndUpdate(
    { organization: actor.org, month, closed: true },
    {
      $set: {
        closed: false,
        reopenedAt: new Date(),
        reopenedByName: actor.name,
        reopenReason: reason.trim(),
      },
    },
    { new: true },
  ).lean();
  if (!doc) throw notFound('A closed month');
  return { month, closed: false };
}
