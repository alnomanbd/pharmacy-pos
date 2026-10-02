import { Types } from 'mongoose';
import {
  SaleModel,
  CustomerLedgerModel,
  SupplierLedgerModel,
  ExpenseModel,
  IncomeModel,
  ShopCustomerModel,
  StockBatchModel,
  CashMoveModel,
} from '../models/index.js';
import { badRequest } from '../utils/AppError.js';
import { formatDayKey, parseDayKey } from '../utils/date.js';
import { dayRangeInstants } from './shopReport.service.js';
import { backfillRefunds } from './shopCash.service.js';
import { branchMatch } from './branchScope.service.js';
import { listSuppliers, type Actor } from './shop.service.js';

/**
 * The shop's accounts: every taka in and out, in one place.
 *
 * Nothing here is new money. The bills are counted at the till, the baki
 * khata on the customer's account, a company's payments on its statement, and
 * the rent on the Expenses page — each where the person doing it stands. What
 * no screen did was put them side by side, which is the only way to answer the
 * two questions an owner closes the month with: *did the shop make money*, and
 * *where did the cash go*.
 *
 * So three readings of the same stretch:
 *
 * - **Profit and loss** — what was sold, what that stock had cost, and what the
 *   shop spent and took besides. Earned, not received: a bill on the khata is
 *   profit the day it is sold, whenever the money comes.
 * - **Money in and out** — the cash view: what actually crossed the counter,
 *   by how it was paid. A bill on the khata is not in it until it is settled.
 * - **The cash book** — both of those as lines, day by day, the way the
 *   shop's own register reads.
 *
 * And where the shop stands today: what it is owed, what it owes, and what is
 * on the shelf.
 */

const DAY = 86_400_000;
const money = (n: number) => Math.round(n * 100) / 100;
const shiftKey = (key: string, days: number) => formatDayKey(new Date(parseDayKey(key).getTime() + days * DAY));

/* A transfer is money changing pockets — cash to the bank and back — and is
   neither in nor out of the shop. */
type Direction = 'in' | 'out' | 'transfer';

export interface BookLine {
  /** Stable, for the list's keys. */
  key: string;
  at: string;
  dayKey: string;
  direction: Direction;
  kind: 'takings' | 'khata' | 'supplier' | 'expense' | 'income' | 'drawing' | 'capital' | 'refund' | 'bank_deposit' | 'bank_withdrawal';
  title: string;
  detail: string;
  amount: number;
  method?: string;
  /** A day's takings, split by how they were paid, and how many bills. */
  methods?: { method: string; amount: number }[];
  bills?: number;
}

export async function accounts(
  actor: Actor,
  opts: { from?: string; to?: string; page?: number; limit?: number } = {},
) {
  /* Earlier returns that never reached the accounts, written in once. */
  await backfillRefunds(actor.org).catch(() => 0);
  const org = new Types.ObjectId(actor.org);
  // The branches in view — a branch's takings, spend, drawer and shelf; baki and companies are the shop's.
  const bm = branchMatch(actor.branch);
  const to = formatDayKey(parseDayKey(opts.to));
  const from = opts.from ? formatDayKey(parseDayKey(opts.from)) : shiftKey(to, -29);
  if (to < from) throw badRequest('That date range runs backwards');
  const { start, end } = dayRangeInstants(from, to);
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 30));

  const [sales, takings, khata, paidOut, spent, earned, owed, suppliers, stock, moves, bank] = await Promise.all([
    /* ---- earned: the bills, at what they sold for and what they cost ---- */
    SaleModel.aggregate<{ sales: number; cost: number; due: number; bills: number }>([
      { $match: { organization: org, ...bm, dayKey: { $gte: from, $lte: to }, deletedAt: null, status: { $ne: 'void' } } },
      { $group: { _id: null, sales: { $sum: '$total' }, cost: { $sum: '$cost' }, due: { $sum: '$due' }, bills: { $sum: 1 } } },
    ]),
    /* ---- received at the counter, per day and method, net of change ---- */
    SaleModel.aggregate<{ _id: { day: string; method: string }; amount: number; bills: number }>([
      { $match: { organization: org, ...bm, dayKey: { $gte: from, $lte: to }, deletedAt: null, status: { $ne: 'void' } } },
      { $unwind: '$payments' },
      { $match: { 'payments.method': { $ne: 'due' } } },
      { $group: { _id: { day: '$dayKey', method: '$payments.method' }, amount: { $sum: '$payments.amount' }, bills: { $sum: 1 } } },
    ]),
    /* ---- the baki khata settled ---- */
    CustomerLedgerModel.find({ organization: org, entry: 'payment', at: { $gte: start, $lte: end } })
      .populate<{ customer: { name?: string } | null }>('customer', 'name')
      .sort({ at: -1 })
      .lean(),
    /* ---- paid to the companies, at the door or later ---- */
    SupplierLedgerModel.find({ organization: org, entry: 'payment', at: { $gte: start, $lte: end } })
      .populate<{ supplier: { name?: string } | null }>('supplier', 'name')
      .sort({ at: -1 })
      .lean(),
    ExpenseModel.find({ organization: org, ...bm, deletedAt: null, expenseDate: { $gte: start, $lte: end } }).sort({ expenseDate: -1 }).lean(),
    IncomeModel.find({ organization: org, ...bm, deletedAt: null, incomeDate: { $gte: start, $lte: end } }).sort({ incomeDate: -1 }).lean(),
    /* ---- where it stands, today ---- */
    ShopCustomerModel.aggregate<{ owed: number; people: number }>([
      { $match: { organization: org, deletedAt: null, balance: { $gt: 0 } } },
      { $group: { _id: null, owed: { $sum: '$balance' }, people: { $sum: 1 } } },
    ]),
    listSuppliers(actor),
    StockBatchModel.aggregate<{ value: number }>([
      { $match: { organization: org, ...bm, qtyOnHand: { $gt: 0 } } },
      { $group: { _id: null, value: { $sum: { $multiply: ['$qtyOnHand', '$costPerPiece'] } } } },
    ]),
    /* ---- the owner's money, the bank, and refunds, in the stretch ---- */
    CashMoveModel.find({ organization: org, ...bm, deletedAt: null, moveDate: { $gte: start, $lte: end } }).sort({ moveDate: -1 }).lean(),
    /* ---- the bank, all time: what was carried there, less what came back ---- */
    CashMoveModel.aggregate<{ _id: string; amount: number }>([
      { $match: { organization: org, ...bm, deletedAt: null, kind: { $in: ['bank_deposit', 'bank_withdrawal'] } } },
      { $group: { _id: '$kind', amount: { $sum: '$amount' } } },
    ]),
  ]);

  const sumOf = (kind: string, field: 'amount' | 'returnValue' | 'returnCost' = 'amount') =>
    moves.filter((m) => m.kind === kind).reduce((n, m) => n + (m[field] ?? 0), 0);
  const drawings = sumOf('drawing');
  const capital = sumOf('capital');
  const refunds = sumOf('refund');
  const returns = sumOf('refund', 'returnValue');
  const returnCost = sumOf('refund', 'returnCost');
  const deposited = sumOf('bank_deposit');
  const withdrawn = sumOf('bank_withdrawal');

  const sold = sales[0] ?? { sales: 0, cost: 0, due: 0, bills: 0 };
  const expenses = spent.reduce((n, e) => n + e.amount, 0);
  const otherIncome = earned.reduce((n, e) => n + e.amount, 0);
  /* A return takes its value off the sales and its stock off the cost, so the
     margin is what the shop actually kept on what stayed sold. */
  const margin = sold.sales - returns - (sold.cost - returnCost);

  /* ---- money in and out, by how ---- */
  const inBy = new Map<string, number>();
  const outBy = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const t of takings) add(inBy, t._id.method, t.amount);
  for (const k of khata) add(inBy, k.method || 'cash', Math.abs(k.amount));
  for (const i of earned) add(inBy, 'cash', i.amount);
  for (const p of paidOut) add(outBy, p.method || 'cash', Math.abs(p.amount));
  for (const e of spent) add(outBy, 'cash', e.amount);
  if (capital) add(inBy, 'cash', capital);
  if (drawings) add(outBy, 'cash', drawings);
  if (refunds) add(outBy, 'cash', refunds);

  const counter = takings.reduce((n, t) => n + t.amount, 0);
  const collected = khata.reduce((n, k) => n + Math.abs(k.amount), 0);
  const toSuppliers = paidOut.reduce((n, p) => n + Math.abs(p.amount), 0);
  const moneyIn = counter + collected + otherIncome + capital;
  const moneyOut = toSuppliers + expenses + drawings + refunds;

  /* ---- the cash book: the counter's takings a line a day, the rest a line each ---- */
  const byDay = new Map<string, { amount: number; bills: number; methods: Map<string, number> }>();
  for (const t of takings) {
    const d = byDay.get(t._id.day) ?? { amount: 0, bills: 0, methods: new Map() };
    d.amount += t.amount;
    d.bills += t.bills;
    d.methods.set(t._id.method, (d.methods.get(t._id.method) ?? 0) + t.amount);
    byDay.set(t._id.day, d);
  }
  /* The end of a day, so a day's takings sit under that day's other lines. */
  const endOf = (dayKey: string) => new Date(dayRangeInstants(dayKey, dayKey).end).toISOString();
  const dayOf = (d: Date) => formatDayKey(parseDayKey(new Date(d).toISOString()));

  const book: BookLine[] = [
    ...[...byDay.entries()].map(([day, d]) => ({
      key: `takings:${day}`,
      at: endOf(day),
      dayKey: day,
      direction: 'in' as const,
      kind: 'takings' as const,
      title: 'Counter takings',
      detail: '',
      bills: d.bills,
      methods: [...d.methods.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([method, v]) => ({ method, amount: money(v) })),
      amount: money(d.amount),
    })),
    ...khata.map((k) => ({
      key: `khata:${k._id}`,
      at: new Date(k.at).toISOString(),
      dayKey: dayOf(k.at),
      direction: 'in' as const,
      kind: 'khata' as const,
      title: k.customer?.name ?? 'A customer',
      detail: k.note || 'Baki collected',
      amount: money(Math.abs(k.amount)),
      method: k.method || 'cash',
    })),
    ...earned.map((i) => ({
      key: `income:${i._id}`,
      at: new Date(i.incomeDate).toISOString(),
      dayKey: dayOf(i.incomeDate),
      direction: 'in' as const,
      kind: 'income' as const,
      title: i.category,
      detail: i.note ?? '',
      amount: money(i.amount),
    })),
    ...paidOut.map((p) => ({
      key: `supplier:${p._id}`,
      at: new Date(p.at).toISOString(),
      dayKey: dayOf(p.at),
      direction: 'out' as const,
      kind: 'supplier' as const,
      title: p.supplier?.name ?? 'A company',
      detail: [p.note, p.reference].filter(Boolean).join(' · ') || 'Paid to the company',
      amount: money(Math.abs(p.amount)),
      method: p.method || 'cash',
    })),
    ...moves.map((m) => ({
      key: `move:${m._id}`,
      at: new Date(m.moveDate).toISOString(),
      dayKey: dayOf(m.moveDate),
      direction: (m.kind === 'capital'
        ? 'in'
        : m.kind === 'drawing' || m.kind === 'refund'
          ? 'out'
          : 'transfer') as Direction,
      kind: m.kind as BookLine['kind'],
      title: m.kind === 'refund' ? m.reference || 'A returned bill' : m.kind,
      detail: m.kind === 'refund' ? m.note || 'Cash back for a return' : m.note ?? '',
      amount: money(m.amount),
    })),
    ...spent.map((e) => ({
      key: `expense:${e._id}`,
      at: new Date(e.expenseDate).toISOString(),
      dayKey: dayOf(e.expenseDate),
      direction: 'out' as const,
      kind: 'expense' as const,
      title: e.category,
      detail: e.note ?? '',
      amount: money(e.amount),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  /* Each day's in and out, whole, for the headings the page groups under. */
  const days = new Map<string, { in: number; out: number }>();
  for (const l of book) {
    const d = days.get(l.dayKey) ?? { in: 0, out: 0 };
    if (l.direction !== 'transfer') d[l.direction] += l.amount;
    days.set(l.dayKey, d);
  }

  const payable = suppliers.reduce((n, s) => n + Math.max(0, s.balance || 0), 0);

  return {
    from,
    to,
    profit: {
      sales: money(sold.sales),
      returns: money(returns),
      cost: money(sold.cost - returnCost),
      margin: money(margin),
      marginPercent: sold.sales > 0 ? Math.round((margin / sold.sales) * 1000) / 10 : 0,
      otherIncome: money(otherIncome),
      expenses: money(expenses),
      net: money(margin + otherIncome - expenses),
      bills: sold.bills,
      onAccount: money(sold.due),
    },
    cash: {
      in: money(moneyIn),
      out: money(moneyOut),
      net: money(moneyIn - moneyOut),
      inParts: { counter: money(counter), khata: money(collected), otherIncome: money(otherIncome), capital: money(capital) },
      outParts: { suppliers: money(toSuppliers), expenses: money(expenses), drawings: money(drawings), refunds: money(refunds) },
      /* Carried to the bank and back in the stretch — not in, not out. */
      transfers: { deposited: money(deposited), withdrawn: money(withdrawn) },
      inByMethod: [...inBy.entries()].map(([method, amount]) => ({ method, amount: money(amount) })).sort((a, b) => b.amount - a.amount),
      outByMethod: [...outBy.entries()].map(([method, amount]) => ({ method, amount: money(amount) })).sort((a, b) => b.amount - a.amount),
    },
    position: {
      receivable: money(owed[0]?.owed ?? 0),
      receivableFrom: owed[0]?.people ?? 0,
      payable: money(payable),
      payableTo: suppliers.filter((s) => (s.balance || 0) > 0).length,
      stockValue: money(stock[0]?.value ?? 0),
      /* Only what this page has been told about: deposits less withdrawals. */
      bank: money(
        (bank.find((b) => b._id === 'bank_deposit')?.amount ?? 0) - (bank.find((b) => b._id === 'bank_withdrawal')?.amount ?? 0),
      ),
    },
    book: {
      total: book.length,
      page,
      limit,
      lines: book.slice((page - 1) * limit, page * limit),
      days: Object.fromEntries([...days.entries()].map(([k, v]) => [k, { in: money(v.in), out: money(v.out) }])),
    },
  };
}
