import { Types, type Model } from 'mongoose';
import {
  SaleModel,
  ShopProductModel,
  ShopCustomerModel,
  SupplierModel,
  ShopRackModel,
  ShopCounterModel,
  StockBatchModel,
  ExpenseModel,
  IncomeModel,
  CashMoveModel,
} from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { recordAudit } from './audit.service.js';
import { assertMonthOpen } from './shopCash.service.js';
import type { Actor } from './shop.service.js';

/**
 * The shop's bin.
 *
 * Nothing a shopkeeper deletes is gone. A product removed by mistake takes its
 * batches, its cost and its whole ledger with it; a customer deleted takes what
 * they owe; a bill deleted takes money out of a day that has already been
 * counted. Every one of those is a phone call to us if it is unrecoverable, so
 * none of them are.
 *
 * Deliberately separate from `isActive`, which already existed and means
 * something else: **turned off** is still on the shop's list and not for sale;
 * **deleted** is gone from every screen. Only the second one lands here, and
 * only the second one carries a name and a reason.
 *
 * The one thing with a rule of its own is a bill, which must be cancelled
 * before it can be deleted — see `saleAdmin`. A deleted bill that still counted
 * would be money nobody could find.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

/** What can be thrown away, and how to describe one line of it. */
type Kind = 'sale' | 'product' | 'customer' | 'supplier' | 'rack' | 'counter' | 'expense' | 'income' | 'cashmove';

interface Binnable {
  kind: Kind;
  label: string;
  model: () => Model<Record<string, unknown>>;
  /** The fields worth reading back on the trash screen. */
  select: string;
  title: (doc: Record<string, unknown>) => string;
  meta: (doc: Record<string, unknown>) => string;
}

const money = (n: unknown) => `৳${Math.round(Number(n ?? 0) * 100) / 100}`;

export const BINNABLE: Binnable[] = [
  {
    kind: 'sale',
    label: 'Bill',
    model: () => SaleModel as unknown as Model<Record<string, unknown>>,
    select: 'billNo soldAt total customerName deletedAt deletedByName deleteReason',
    title: (d) => `Bill ${d.billNo ?? ''}`,
    meta: (d) => [d.customerName || 'Walk-in', money(d.total)].filter(Boolean).join(' · '),
  },
  {
    kind: 'product',
    label: 'Item',
    model: () => ShopProductModel as unknown as Model<Record<string, unknown>>,
    select: 'name strength genericName rackLabel deletedAt deletedByName deleteReason',
    title: (d) => `${d.name ?? ''} ${d.strength ?? ''}`.trim(),
    meta: (d) => [d.genericName, d.rackLabel && `rack ${d.rackLabel}`].filter(Boolean).join(' · '),
  },
  {
    kind: 'customer',
    label: 'Customer',
    model: () => ShopCustomerModel as unknown as Model<Record<string, unknown>>,
    select: 'name phone balance deletedAt deletedByName deleteReason',
    title: (d) => String(d.name ?? ''),
    meta: (d) => [d.phone, Number(d.balance) > 0 && `${money(d.balance)} owed`].filter(Boolean).join(' · '),
  },
  {
    kind: 'supplier',
    label: 'Supplier',
    model: () => SupplierModel as unknown as Model<Record<string, unknown>>,
    select: 'name phone balance deletedAt deletedByName deleteReason',
    title: (d) => String(d.name ?? ''),
    meta: (d) => (Number(d.balance) > 0 ? `${money(d.balance)} owed` : ''),
  },
  {
    kind: 'rack',
    label: 'Rack',
    model: () => ShopRackModel as unknown as Model<Record<string, unknown>>,
    select: 'name note deletedAt deletedByName deleteReason',
    title: (d) => String(d.name ?? ''),
    meta: (d) => String(d.note ?? ''),
  },
  {
    kind: 'counter',
    label: 'Counter',
    model: () => ShopCounterModel as unknown as Model<Record<string, unknown>>,
    select: 'name note deletedAt deletedByName deleteReason',
    title: (d) => String(d.name ?? ''),
    meta: (d) => String(d.note ?? ''),
  },
  {
    kind: 'expense',
    label: 'Expense',
    model: () => ExpenseModel as unknown as Model<Record<string, unknown>>,
    select: 'amount category note expenseDate deletedAt deletedByName deleteReason',
    title: (d) => `${money(d.amount)} · ${String(d.category ?? '')}`,
    meta: (d) =>
      [d.note, d.expenseDate ? new Date(String(d.expenseDate)).toISOString().slice(0, 10) : '']
        .filter(Boolean)
        .join(' · '),
  },
  {
    kind: 'income',
    label: 'Income',
    model: () => IncomeModel as unknown as Model<Record<string, unknown>>,
    select: 'amount category note incomeDate deletedAt deletedByName deleteReason',
    title: (d) => `${money(d.amount)} · ${String(d.category ?? '')}`,
    meta: (d) =>
      [d.note, d.incomeDate ? new Date(String(d.incomeDate)).toISOString().slice(0, 10) : '']
        .filter(Boolean)
        .join(' · '),
  },
  {
    kind: 'cashmove',
    label: 'Owner & bank',
    model: () => CashMoveModel as unknown as Model<Record<string, unknown>>,
    select: 'kind amount note moveDate deletedAt deletedByName deleteReason',
    title: (d) => `${money(d.amount)} · ${String(d.kind ?? '').replace('_', ' ')}`,
    meta: (d) =>
      [d.note, d.moveDate ? new Date(String(d.moveDate)).toISOString().slice(0, 10) : '']
        .filter(Boolean)
        .join(' · '),
  },
];

const defOf = (kind: string) => {
  const def = BINNABLE.find((b) => b.kind === kind);
  if (!def) throw badRequest('There is no such thing in the Recycle Bin');
  return def;
};

/** Everything thrown away, newest first. */
export async function listShopTrash(actor: Actor, kind?: string) {
  const wanted = kind ? [defOf(kind)] : BINNABLE;

  const piles = await Promise.all(
    wanted.map(async (def) => {
      const docs = (await def
        .model()
        .find({ organization: actor.org, deletedAt: { $ne: null } })
        .select(def.select)
        .sort({ deletedAt: -1 })
        .limit(200)
        .lean()) as unknown as Record<string, unknown>[];

      return docs.map((d) => ({
        kind: def.kind,
        label: def.label,
        id: String(d._id),
        title: def.title(d),
        meta: def.meta(d),
        deletedAt: d.deletedAt ? new Date(d.deletedAt as string).toISOString() : '',
        deletedByName: String(d.deletedByName ?? ''),
        reason: String(d.deleteReason ?? ''),
      }));
    }),
  );

  return piles.flat().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Throws one thing away.
 *
 * A reason every time. The bin exists so a mistake is recoverable, but the
 * question the owner asks a week later is never "what is in the bin" — it is
 * "who put this in it and what did they say".
 */
export async function softDelete(
  actor: Actor & { role?: string },
  kind: string,
  id: string,
  reason: string,
) {
  const why = reason?.trim();
  if (!why || why.length < 3) throw badRequest('Say why this is being deleted — it is kept with it');

  const def = defOf(kind);
  if (def.kind === 'sale') throw badRequest('A bill is deleted from the register, not from here');

  const doc = (await def
    .model()
    .findOne({ _id: oid(id), organization: actor.org })) as unknown as
    | (Record<string, unknown> & { save: () => Promise<unknown>; _id: unknown })
    | null;
  if (!doc) throw notFound(def.label);
  if (doc.deletedAt) throw badRequest('That is already in the Recycle Bin');
  /* Money typed into a closed month stays as it was closed. */
  if (def.kind === 'expense' || def.kind === 'income' || def.kind === 'cashmove') {
    if (def.kind === 'cashmove' && doc.kind === 'refund') {
      throw badRequest('A refund belongs to its bill — it cannot be deleted on its own');
    }
    await assertMonthOpen(actor.org, (doc.expenseDate ?? doc.incomeDate ?? doc.moveDate) as Date);
  }

  /*
   * Stock on a shelf is not a thing to be quietly filed away.
   *
   * Deleting a product that still has pieces in it hides stock the shop paid
   * for, and the stock report stops adding up with no way to see why. Sell it,
   * write it off, or send it back first — all three leave a record.
   */
  if (def.kind === 'product') {
    const onHand = await StockBatchModel.aggregate<{ total: number }>([
      {
        $match: {
          organization: new Types.ObjectId(actor.org),
          product: oid(id),
          qtyOnHand: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$qtyOnHand' } } },
    ]);
    const left = onHand[0]?.total ?? 0;
    if (left > 0) {
      throw badRequest(
        `${doc.name} still has ${left} pieces on the shelf — write them off or sell them first`,
      );
    }
  }

  /* Money owed is not deleted, it is collected or written off on the account. */
  if ((def.kind === 'customer' || def.kind === 'supplier') && Number(doc.balance ?? 0) !== 0) {
    throw badRequest(`${doc.name} still has ${money(doc.balance)} on the account — settle it first`);
  }

  doc.deletedAt = new Date();
  doc.deletedBy = new Types.ObjectId(actor.id);
  doc.deletedByName = actor.name;
  doc.deleteReason = why;
  if ('isActive' in doc) doc.isActive = false;
  await doc.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'shop.delete',
    { model: def.label, id: doc._id, label: def.title(doc) },
    { after: { reason: why } },
  );

  return { kind: def.kind, id: String(doc._id) };
}

/** And takes it back out again. */
export async function restore(actor: Actor & { role?: string }, kind: string, id: string) {
  const def = defOf(kind);

  const doc = (await def
    .model()
    .findOne({ _id: oid(id), organization: actor.org, deletedAt: { $ne: null } })) as unknown as
    | (Record<string, unknown> & { save: () => Promise<unknown>; _id: unknown })
    | null;
  if (!doc) throw notFound(`${def.label} in the Recycle Bin`);
  /* Bringing money back into a closed month changes it as much as adding it. */
  if (def.kind === 'expense' || def.kind === 'income' || def.kind === 'cashmove') {
    await assertMonthOpen(actor.org, (doc.expenseDate ?? doc.incomeDate ?? doc.moveDate) as Date);
  }

  doc.deletedAt = null;
  doc.deletedBy = null;
  doc.deletedByName = '';
  doc.deleteReason = '';
  /* Back on the list, and back on: something taken out of the bin is meant to
     be used again, and a shop that has to turn it on separately will think the
     restore did not work. */
  if ('isActive' in doc) doc.isActive = true;
  await doc.save();

  await recordAudit(
    { org: actor.org, id: actor.id, name: actor.name, role: actor.role },
    'shop.restore',
    { model: def.label, id: doc._id, label: def.title(doc) },
  );

  return { kind: def.kind, id: String(doc._id) };
}
