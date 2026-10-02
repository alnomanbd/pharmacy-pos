import { Types } from 'mongoose';
import {
  SaleModel,
  PurchaseModel,
  ShopProductModel,
  ShopCustomerModel,
  SupplierModel,
  StockBatchModel,
} from '../models/index.js';
import type { Actor } from './shop.service.js';
import { branchMatch } from './branchScope.service.js';

/**
 * One box that finds anything in the shop.
 *
 * A shopkeeper does not think in screens. Somebody rings up about "that
 * Incepta invoice", a customer walks in holding a slip with 0042 on it, the
 * owner wants to know what Napa is selling for — and all three start by typing
 * the thing they know into whatever box is in front of them. Making them first
 * choose the right page is making them learn our filing system.
 *
 * So: one query across the five things a shop refers to by name or number, each
 * returning where it lives. Deliberately shallow — five of each, enough to
 * recognise and click, never a report. The pages behind it are still where the
 * real looking happens.
 *
 * The back room's rows (purchases, suppliers, cost) are dropped for a salesman
 * by the caller, which is the same rule the rest of the shop follows: which
 * router a thing is served from decides who may see it.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ShopHit {
  kind: 'bill' | 'purchase' | 'product' | 'customer' | 'supplier' | 'batch';
  id: string;
  title: string;
  subtitle: string;
  /** Where clicking it goes, inside the shop app. */
  to: string;
  amount?: number;
}

export async function searchEverything(
  actor: Actor,
  q: string,
  opts: { backRoom?: boolean } = {},
): Promise<ShopHit[]> {
  const text = q.trim();
  if (text.length < 2) return [];

  const rx = new RegExp(escape(text), 'i');
  const org = new Types.ObjectId(actor.org);
  const bm = branchMatch(actor.branch);

  /*
   * A bill number is what a customer reads out, and they read out the serial —
   * "forty two", not "thirteen dash zero zero four two" — so it matches on any
   * part of it, and on the name and phone besides.
   */
  const bills = SaleModel.find({
    organization: org,
    ...bm,
    /* The bin is its own screen — even in the box that finds everything. */
    deletedAt: null,
    $or: [{ billNo: rx }, { customerName: rx }, { customerPhone: rx }],
  })
    .select('billNo soldAt total status customerName')
    .sort({ soldAt: -1 })
    .limit(5)
    .lean();

  const products = ShopProductModel.find({
    organization: org,
    isActive: { $ne: false },
    deletedAt: null,
    $or: [{ name: rx }, { genericName: rx }, { rackLabel: rx }, { barcode: rx }],
  })
    .select('name strength genericName rackLabel mrpPerPiece')
    .limit(5)
    .lean();

  const customers = ShopCustomerModel.find({
    organization: org,
    deletedAt: null,
    $or: [{ name: rx }, { phone: rx }],
  })
    .select('name phone balance')
    .limit(5)
    .lean();

  const purchases = opts.backRoom
    ? PurchaseModel.find({ organization: org, ...bm, invoiceNo: rx })
        .populate('supplier', 'name')
        .select('invoiceNo invoiceDate total supplier')
        .sort({ invoiceDate: -1 })
        .limit(5)
        .lean()
    : Promise.resolve([]);

  const suppliers = opts.backRoom
    ? SupplierModel.find({
        organization: org,
        deletedAt: null,
        $or: [{ name: rx }, { repName: rx }, { phone: rx }],
      })
        .select('name balance kind')
        .limit(5)
        .lean()
    : Promise.resolve([]);

  /* A batch number, read off a strip: which lot, what it is, when it expires. */
  const lots = StockBatchModel.find({ organization: org, ...bm, batchNo: rx })
    .populate('product', 'name strength deletedAt')
    .select('batchNo expiry qtyOnHand product')
    .sort({ expiry: 1 })
    .limit(5)
    .lean();

  const [b, p, c, pu, su, lo] = await Promise.all([
    bills,
    products,
    customers,
    purchases,
    suppliers,
    lots,
  ]);

  const hits: ShopHit[] = [];

  for (const row of b) {
    hits.push({
      kind: 'bill',
      id: String(row._id),
      title: `Bill ${row.billNo}`,
      subtitle: [
        row.customerName || 'Walk-in',
        new Date(row.soldAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        row.status === 'void' ? 'cancelled' : row.status === 'returned' ? 'taken back' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      to: `/sales?q=${encodeURIComponent(row.billNo)}`,
      amount: row.total,
    });
  }

  for (const row of pu as { _id: unknown; invoiceNo: string; invoiceDate: Date; total: number; supplier?: { name?: string } }[]) {
    hits.push({
      kind: 'purchase',
      id: String(row._id),
      title: row.invoiceNo || 'No invoice number',
      subtitle: [
        row.supplier?.name,
        new Date(row.invoiceDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      ]
        .filter(Boolean)
        .join(' · '),
      to: `/purchases?q=${encodeURIComponent(row.invoiceNo || row.supplier?.name || '')}`,
      amount: row.total,
    });
  }

  for (const row of p) {
    hits.push({
      kind: 'product',
      id: String(row._id),
      title: `${row.name} ${row.strength ?? ''}`.trim(),
      subtitle: [row.genericName, row.rackLabel && `rack ${row.rackLabel}`]
        .filter(Boolean)
        .join(' · '),
      to: `/stock?q=${encodeURIComponent(row.name)}`,
      amount: row.mrpPerPiece,
    });
  }

  for (const row of lo as {
    _id: unknown;
    batchNo: string;
    expiry?: Date | null;
    qtyOnHand: number;
    product?: { name?: string; strength?: string; deletedAt?: Date | null } | null;
  }[]) {
    if (!row.product || row.product.deletedAt) continue;
    hits.push({
      kind: 'batch',
      id: String(row._id),
      title: row.batchNo,
      subtitle: [
        `${row.product.name ?? ''} ${row.product.strength ?? ''}`.trim(),
        row.expiry
          ? `expires ${new Date(row.expiry).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
          : '',
        `${row.qtyOnHand} pcs`,
      ]
        .filter(Boolean)
        .join(' · '),
      /* The Expiry page holds the lots within 120 days of their date; one with
         longer to go is found on the Stock page, by the same number. */
      to:
        row.expiry && new Date(row.expiry).getTime() - Date.now() <= 120 * 86_400_000
          ? `/expiry?q=${encodeURIComponent(row.batchNo)}`
          : `/stock?q=${encodeURIComponent(row.batchNo)}`,
    });
  }

  for (const row of c) {
    hits.push({
      kind: 'customer',
      id: String(row._id),
      title: row.name,
      subtitle: [row.phone, row.balance > 0 ? 'owes' : ''].filter(Boolean).join(' · '),
      to: `/customers?q=${encodeURIComponent(row.name)}`,
      amount: row.balance > 0 ? row.balance : undefined,
    });
  }

  for (const row of su as { _id: unknown; name: string; balance: number; kind?: string }[]) {
    hits.push({
      kind: 'supplier',
      id: String(row._id),
      title: row.name,
      subtitle: row.balance > 0 ? 'owed' : '',
      to: `/suppliers?q=${encodeURIComponent(row.name)}`,
      amount: row.balance > 0 ? row.balance : undefined,
    });
  }

  return hits;
}
