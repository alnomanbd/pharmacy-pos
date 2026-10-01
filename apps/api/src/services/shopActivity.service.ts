import { Types } from 'mongoose';
import { AuditLogModel } from '../models/index.js';
import { formatDayKey, parseDayKey } from '../utils/date.js';
import { dayRangeInstants } from './shopReport.service.js';
import type { Actor } from './shop.service.js';

/**
 * Who did what in the shop, and when.
 *
 * The owner's own trail: every bill, every delivery, every change of a price,
 * every sign-in and sign-out, every deletion and the reason for it — read from
 * the append-only audit log the rest of the app writes. Grouped the way an
 * owner asks ("who touched the money", "who signed in last night") rather than
 * by the forty action names underneath.
 */

export const ACTIVITY_GROUPS = {
  sales: ['shop.sale.create', 'shop.sale.return', 'sale.edit', 'sale.void', 'sale.revert', 'sale.hold', 'sale.return'],
  money: [
    'shop.customer.payment',
    'shop.supplier.payment',
    'shop.expense.create',
    'shop.expense.update',
    'shop.income.create',
    'shop.income.update',
    'shop.cash.create',
    'shop.cash.update',
    'shop.month.close',
    'shop.month.reopen',
    'shop.shift.open',
    'shop.shift.close',
  ],
  stock: [
    'shop.product.create',
    'shop.product.update',
    'shop.purchase.create',
    'shop.stock.adjust',
    'shop.count.start',
    'shop.count.update',
    'shop.count.apply',
    'shop.count.abandon',
    'shop.order.create',
    'shop.order.status',
    'shop.rack.create',
    'shop.rack.update',
    'shop.supplier.return',
  ],
  people: [
    'shop.customer.create',
    'shop.customer.update',
    'shop.customer.remind',
    'shop.supplier.create',
    'shop.supplier.update',
    'shop.staff.create',
    'shop.staff.update',
    'shop.staff.password',
  ],
  signin: ['auth.login', 'auth.logout', 'auth.session.revoke', 'auth.session.revoke_others', 'password.change', 'password.reset'],
  setup: ['shop.settings.update', 'shop.counter.create', 'shop.counter.update'],
  bin: ['shop.delete', 'shop.restore'],
} as const;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

const EVERY = Object.values(ACTIVITY_GROUPS).flat() as string[];
const groupOf = (action: string) =>
  (Object.entries(ACTIVITY_GROUPS).find(([, list]) => (list as readonly string[]).includes(action))?.[0] ?? 'setup') as ActivityGroup;

export async function listShopActivity(
  actor: Actor,
  opts: { from?: string; to?: string; group?: string; who?: string; q?: string; page?: number; limit?: number } = {},
) {
  const org = new Types.ObjectId(actor.org);
  const to = formatDayKey(parseDayKey(opts.to));
  const from = opts.from ? formatDayKey(parseDayKey(opts.from)) : to;
  const { start, end } = dayRangeInstants(from, to);
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 40));

  /* The stretch, the shop's own actions only — the names in `EVERY`, which are
     the ones this page knows how to describe. */
  const base: Record<string, unknown> = { organization: org, createdAt: { $gte: start, $lte: end }, action: { $in: EVERY } };
  const filter: Record<string, unknown> = { ...base };
  if (opts.group && opts.group in ACTIVITY_GROUPS) filter.action = { $in: ACTIVITY_GROUPS[opts.group as ActivityGroup] };
  if (opts.who && Types.ObjectId.isValid(opts.who)) filter.actor = new Types.ObjectId(opts.who);
  if (opts.q?.trim()) {
    const rx = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ 'target.label': rx }, { actorName: rx }];
  }

  const [rows, total, byAction, people] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLogModel.countDocuments(filter),
    AuditLogModel.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: '$action', n: { $sum: 1 } } }]),
    AuditLogModel.aggregate<{ _id: Types.ObjectId; name: string; role: string; n: number; last: Date }>([
      { $match: base },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$actor', name: { $first: '$actorName' }, role: { $first: '$actorRole' }, n: { $sum: 1 }, last: { $first: '$createdAt' } } },
      { $sort: { n: -1 } },
    ]),
  ]);

  const groups = Object.fromEntries(Object.keys(ACTIVITY_GROUPS).map((g) => [g, 0])) as Record<ActivityGroup, number>;
  for (const a of byAction) groups[groupOf(a._id)] += a.n;

  return {
    from,
    to,
    total,
    page,
    limit,
    groups,
    people: people.filter((p) => p._id).map((p) => ({ id: String(p._id), name: p.name, role: p.role, count: p.n, last: p.last })),
    data: rows.map((r) => ({
      _id: String(r._id),
      at: r.createdAt,
      action: r.action,
      group: groupOf(r.action),
      who: r.actorName ?? '',
      whoId: r.actor ? String(r.actor) : '',
      role: r.actorRole ?? '',
      model: r.target?.model ?? '',
      label: r.target?.label ?? '',
      reason: (r.after as { reason?: string } | undefined)?.reason ?? '',
      ip: r.ip ?? '',
    })),
  };
}
