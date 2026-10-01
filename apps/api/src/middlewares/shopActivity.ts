import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { recordAudit } from '../services/audit.service.js';
import type { AuditAction } from '../models/AuditLog.js';

/**
 * The shop's activity trail, written in one place.
 *
 * The owner's Activity page answers "who did what, and when" — a bill rung up,
 * a delivery entered, a price changed, a day closed short. Writing that from
 * inside every service would be forty call sites and one forgotten route; so
 * the two shop routers mount this, and every change that *succeeds* is logged
 * from the route it came in on. A request the server refused is not activity,
 * it is an error the person saw on their screen.
 *
 * Routes that already write their own, richer entry — editing, cancelling,
 * holding and deleting a bill, and the Recycle Bin — are left off the map, so
 * nothing appears twice.
 */

type Data = Record<string, unknown>;
type Spec = { action: AuditAction; model: string; label?: (req: Request, data: Data) => string };

const taka = (v: unknown) => (typeof v === 'number' ? `৳${Math.round(v * 100) / 100}` : '');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const join = (...parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : '')).filter(Boolean).join(' · ');

/* The words a person would use for the thing, from whatever the route sent back. */
const named = (req: Request, d: Data) =>
  str(d.billNo) || str(d.name) || str(d.invoiceNo) || str(d.supplierName) || str(req.body?.name) || '';
const money = (field: string) => (req: Request, d: Data) =>
  join(taka(req.body?.[field] ?? d[field]), str(req.body?.category ?? d.category), str(req.body?.note));
const fields = (req: Request) => Object.keys(req.body ?? {}).slice(0, 5).join(', ');

const MAP: Record<string, Spec> = {
  /* ---- the counter ---- */
  'till POST /sales': { action: 'shop.sale.create', model: 'Sale', label: (_r, d) => join(str(d.billNo), taka(d.total)) },
  'till POST /sales/:id/return': {
    action: 'shop.sale.return',
    model: 'Sale',
    label: (_r, d) => join(str(d.billNo), `refund ${taka(d.refund)}`),
  },
  'till POST /shift/open': {
    action: 'shop.shift.open',
    model: 'Shift',
    label: (req, d) => join(str(d.terminal), `float ${taka(req.body?.openingFloat ?? d.openingFloat)}`),
  },
  'till POST /shift/close': {
    action: 'shop.shift.close',
    model: 'Shift',
    label: (req, d) => {
      const diff = typeof d.difference === 'number' ? d.difference : 0;
      return join(`counted ${taka(req.body?.countedCash)}`, diff === 0 ? 'counted right' : `${diff < 0 ? 'short' : 'over'} ${taka(Math.abs(diff))}`);
    },
  },
  'till POST /customers': { action: 'shop.customer.create', model: 'ShopCustomer', label: named },
  'till PATCH /customers/:id': { action: 'shop.customer.update', model: 'ShopCustomer', label: named },
  'till POST /customers/:id/payments': { action: 'shop.customer.payment', model: 'ShopCustomer', label: money('amount') },

  /* ---- the back room ---- */
  'shop POST /suppliers': { action: 'shop.supplier.create', model: 'Supplier', label: named },
  'shop PATCH /suppliers/:id': { action: 'shop.supplier.update', model: 'Supplier', label: named },
  'shop POST /suppliers/:id/payments': { action: 'shop.supplier.payment', model: 'Supplier', label: money('amount') },
  'shop POST /suppliers/:id/returns': {
    action: 'shop.supplier.return',
    model: 'Supplier',
    label: (_r, d) => join(str(d.supplier), `credit ${taka(d.credit)}`),
  },
  'shop PATCH /settings': { action: 'shop.settings.update', model: 'ShopSettings', label: fields },
  'shop POST /racks': { action: 'shop.rack.create', model: 'ShopRack', label: named },
  'shop PATCH /racks/:id': { action: 'shop.rack.update', model: 'ShopRack', label: named },
  'shop POST /products': { action: 'shop.product.create', model: 'ShopProduct', label: named },
  'shop PATCH /products/:id': { action: 'shop.product.update', model: 'ShopProduct', label: (req, d) => join(named(req, d), fields(req)) },
  'shop POST /purchases': { action: 'shop.purchase.create', model: 'Purchase', label: (_r, d) => join(str(d.invoiceNo), taka(d.total)) },
  'shop POST /stock/adjust': {
    action: 'shop.stock.adjust',
    model: 'StockBatch',
    label: (req) => join(`${Number(req.body?.qtyDelta) > 0 ? '+' : ''}${req.body?.qtyDelta ?? ''} pcs`, str(req.body?.move), str(req.body?.reason)),
  },
  'shop POST /counts': { action: 'shop.count.start', model: 'StockCount' },
  'shop PATCH /counts/:id': { action: 'shop.count.update', model: 'StockCount' },
  'shop POST /counts/:id/apply': { action: 'shop.count.apply', model: 'StockCount' },
  'shop POST /counts/:id/abandon': { action: 'shop.count.abandon', model: 'StockCount' },
  'shop POST /orders': { action: 'shop.order.create', model: 'ShopOrder', label: named },
  'shop POST /orders/:id/status': { action: 'shop.order.status', model: 'ShopOrder', label: (req, d) => join(named(req, d), str(req.body?.status)) },
  'shop POST /staff': { action: 'shop.staff.create', model: 'User', label: (req) => join(str(req.body?.name), str(req.body?.role)) },
  'shop PATCH /staff/:id': {
    action: 'shop.staff.update',
    model: 'User',
    label: (req, d) =>
      join(named(req, d), req.body?.isActive === false ? 'switched off' : req.body?.isActive === true ? 'switched on' : fields(req)),
  },
  'shop POST /staff/:id/password': { action: 'shop.staff.password', model: 'User', label: named },
  'shop POST /counters': { action: 'shop.counter.create', model: 'ShopCounter', label: named },
  'shop PATCH /counters/:id': { action: 'shop.counter.update', model: 'ShopCounter', label: named },
  'shop POST /customers/:id/remind': { action: 'shop.customer.remind', model: 'ShopCustomer', label: named },
  'shop POST /customers/remind': { action: 'shop.customer.remind', model: 'ShopCustomer', label: (_r, d) => `sent ${String(d.sent ?? 0)}` },
  'shop POST /expenses': { action: 'shop.expense.create', model: 'Expense', label: money('amount') },
  'shop PATCH /expenses/:id': { action: 'shop.expense.update', model: 'Expense', label: money('amount') },
  'shop POST /incomes': { action: 'shop.income.create', model: 'Income', label: money('amount') },
  'shop PATCH /incomes/:id': { action: 'shop.income.update', model: 'Income', label: money('amount') },
  'shop POST /cash-moves': {
    action: 'shop.cash.create',
    model: 'CashMove',
    label: (req) => join(str(req.body?.kind), taka(req.body?.amount), str(req.body?.note)),
  },
  'shop PATCH /cash-moves/:id': { action: 'shop.cash.update', model: 'CashMove', label: money('amount') },
  'shop POST /months/:month/close': { action: 'shop.month.close', model: 'MonthClose', label: (req) => str(req.params.month) },
  'shop POST /months/:month/reopen': {
    action: 'shop.month.reopen',
    model: 'MonthClose',
    label: (req) => join(str(req.params.month), str(req.body?.reason)),
  },
};

const idOf = (v: unknown) => (typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : undefined);

export function shopActivity(router: 'shop' | 'till') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

    /* What the route sent back, kept for the label — never stored whole. */
    let body: Data = {};
    const json = res.json.bind(res);
    res.json = ((payload: unknown) => {
      const data = (payload as { data?: unknown } | null)?.data;
      if (data && typeof data === 'object') body = data as Data;
      return json(payload);
    }) as typeof res.json;

    res.on('finish', () => {
      if (res.statusCode >= 400 || !req.user) return;
      const spec = MAP[`${router} ${req.method} ${req.route?.path ?? ''}`];
      if (!spec) return;
      let label = '';
      try {
        label = spec.label?.(req, body) ?? '';
      } catch {
        /* A label that cannot be worked out is an entry without one, not no entry. */
      }
      void recordAudit(
        { org: req.user.org, id: req.user.id, name: req.user.name, role: req.user.role, ip: req.ip },
        spec.action,
        { model: spec.model, id: idOf(req.params.id) ?? idOf(body._id), label: label.slice(0, 200) },
      );
    });
    next();
  };
}
