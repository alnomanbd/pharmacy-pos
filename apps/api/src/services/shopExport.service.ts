import { Types } from 'mongoose';
import {
  SaleModel,
  ShopProductModel,
  StockBatchModel,
  ShopCustomerModel,
} from '../models/index.js';
import { formatDayKey, parseDayKey } from '../utils/date.js';
import { badRequest } from '../utils/AppError.js';
import { buildCsv, type CsvColumn } from '../utils/csv.js';
import { listSuppliers, type Actor } from './shop.service.js';

/**
 * The four things a shop is asked to hand over.
 *
 * Every screen in here answers a question on screen and none of them could be
 * given to anybody — and a pharmacy is asked for exactly that, every month, by
 * the person who does its accounts and sometimes by a bank. Copying figures off
 * a screen into a spreadsheet by hand is how a month's numbers stop matching
 * the software they came from.
 *
 * Deliberately CSV and not a prettier format: it opens in Excel, in Google
 * Sheets and in the accountant's own software, none of which read a PDF. The
 * headers are the accountant's words rather than the model's field names, since
 * the file is read by somebody who has never seen this codebase.
 *
 * Money is written as a plain number with no currency symbol or thousands
 * separator. A spreadsheet that receives "৳1,240.50" stores text, and a column
 * of text does not add up — which is the one thing the file exists to do.
 */

const money = (n: number) => Math.round((n || 0) * 100) / 100;

const dayRange = (from?: string, to?: string) => {
  const start = formatDayKey(parseDayKey(from));
  const end = formatDayKey(parseDayKey(to));
  if (end < start) throw badRequest('That date range runs backwards');
  return { from: start, to: end };
};

/* ------------------------------------------------------------- the register -- */

interface SaleRow {
  billNo: string;
  dayKey: string;
  soldAt: Date;
  salesmanName: string;
  customerName: string;
  customerPhone: string;
  items: number;
  subTotal: number;
  discount: number;
  vat: number;
  total: number;
  cost: number;
  paid: number;
  due: number;
  status: string;
  methods: string;
}

const SALE_COLUMNS: CsvColumn<SaleRow>[] = [
  { header: 'Bill no', value: (r) => r.billNo },
  { header: 'Date', value: (r) => r.dayKey },
  { header: 'Time', value: (r) => new Date(r.soldAt).toISOString().slice(11, 16) },
  { header: 'Sold by', value: (r) => r.salesmanName },
  { header: 'Customer', value: (r) => r.customerName },
  { header: 'Phone', value: (r) => r.customerPhone },
  { header: 'Items', value: (r) => r.items },
  { header: 'Sub total', value: (r) => r.subTotal },
  { header: 'Discount', value: (r) => r.discount },
  { header: 'VAT', value: (r) => r.vat },
  { header: 'Total', value: (r) => r.total },
  /* What it cost the shop, so the margin can be worked out in the sheet rather
     than taken on trust from us. */
  { header: 'Cost', value: (r) => r.cost },
  { header: 'Margin', value: (r) => money(r.total - r.cost) },
  { header: 'Paid', value: (r) => r.paid },
  { header: 'On account', value: (r) => r.due },
  { header: 'Paid by', value: (r) => r.methods },
  { header: 'Status', value: (r) => r.status },
];

export async function salesCsv(actor: Actor, opts: { from?: string; to?: string } = {}) {
  const { from, to } = dayRange(opts.from, opts.to);

  const sales = await SaleModel.find({
    organization: actor.org,
    dayKey: { $gte: from, $lte: to },
    /* The bin is its own screen, and a deleted bill is not the shop's register.
       A cancelled one stays: its number was printed on somebody's slip, and the
       status column says what happened to it. */
    deletedAt: null,
  })
    .sort({ soldAt: 1 })
    .lean();

  const rows: SaleRow[] = sales.map((s) => ({
    billNo: s.billNo,
    dayKey: s.dayKey,
    soldAt: s.soldAt,
    salesmanName: s.salesmanName ?? '',
    customerName: s.customerName ?? '',
    customerPhone: s.customerPhone ?? '',
    items: s.lines.length,
    subTotal: money(s.subTotal),
    discount: money(s.discount),
    vat: money(s.vat),
    total: money(s.total),
    cost: money(s.cost),
    paid: money(s.paid),
    due: money(s.due),
    status: s.status === 'void' ? 'cancelled' : s.status,
    methods: (s.payments ?? []).map((p) => `${p.method} ${money(p.amount)}`).join(' + '),
  }));

  return { csv: buildCsv(SALE_COLUMNS, rows), from, to, count: rows.length };
}

/* ----------------------------------------------------------------- the shelf -- */

interface StockRow {
  name: string;
  strength: string;
  genericName: string;
  companyName: string;
  barcode: string;
  rackLabel: string;
  piecesPerStrip: number;
  stripsPerBox: number;
  mrpPerPiece: number;
  reorderLevel: number;
  onHand: number;
  value: number;
  nearestExpiry: Date | null;
}

const STOCK_COLUMNS: CsvColumn<StockRow>[] = [
  { header: 'Item', value: (r) => r.name },
  { header: 'Strength', value: (r) => r.strength },
  { header: 'Generic', value: (r) => r.genericName },
  { header: 'Company', value: (r) => r.companyName },
  { header: 'Barcode', value: (r) => r.barcode },
  { header: 'Rack', value: (r) => r.rackLabel },
  { header: 'Pieces per strip', value: (r) => r.piecesPerStrip },
  { header: 'Strips per box', value: (r) => r.stripsPerBox },
  { header: 'MRP per piece', value: (r) => r.mrpPerPiece },
  { header: 'Reorder level', value: (r) => r.reorderLevel },
  { header: 'On hand (pieces)', value: (r) => r.onHand },
  { header: 'Value at cost', value: (r) => r.value },
  { header: 'First expiry', value: (r) => r.nearestExpiry },
];

export async function stockCsv(actor: Actor) {
  const org = new Types.ObjectId(actor.org);

  const products = await ShopProductModel.find({
    organization: org,
    isActive: true,
    deletedAt: null,
  })
    .sort({ name: 1 })
    .lean();

  const held = await StockBatchModel.aggregate<{
    _id: Types.ObjectId;
    onHand: number;
    value: number;
    nearestExpiry: Date | null;
  }>([
    { $match: { organization: org, qtyOnHand: { $gt: 0 } } },
    {
      $group: {
        _id: '$product',
        onHand: { $sum: '$qtyOnHand' },
        value: { $sum: { $multiply: ['$qtyOnHand', '$costPerPiece'] } },
        nearestExpiry: { $min: '$expiry' },
      },
    },
  ]);
  const byId = new Map(held.map((h) => [String(h._id), h]));

  const rows: StockRow[] = products.map((p) => {
    const s = byId.get(String(p._id));
    return {
      name: p.name,
      strength: p.strength ?? '',
      genericName: p.genericName ?? '',
      companyName: p.companyName ?? '',
      barcode: p.barcode ?? '',
      rackLabel: p.rackLabel ?? '',
      piecesPerStrip: p.piecesPerStrip,
      stripsPerBox: p.stripsPerBox,
      mrpPerPiece: money(p.mrpPerPiece),
      reorderLevel: p.reorderLevel,
      onHand: s?.onHand ?? 0,
      value: money(s?.value ?? 0),
      nearestExpiry: s?.nearestExpiry ?? null,
    };
  });

  return { csv: buildCsv(STOCK_COLUMNS, rows), count: rows.length };
}

/* -------------------------------------------------------------- the accounts -- */

interface AccountRow {
  name: string;
  phone: string;
  extra: string;
  balance: number;
}

const OWED_COLUMNS: CsvColumn<AccountRow>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Kind', value: (r) => r.extra },
  { header: 'Balance', value: (r) => r.balance },
];

/**
 * The companies' account book: what this shop still owes each of them.
 *
 * Through `listSuppliers` rather than reading the collection, because a
 * company's balance is derived from its ledger and nowhere else — a second
 * implementation here would be a second answer to "what do we owe Incepta",
 * and the wrong one would be the one in the accountant's file.
 */
export async function suppliersCsv(actor: Actor) {
  const rows = await listSuppliers(actor);

  return {
    csv: buildCsv(
      OWED_COLUMNS,
      rows.map((s) => ({
        name: s.name,
        phone: s.phone ?? '',
        extra: s.kind ?? '',
        balance: money(s.balance),
      })),
    ),
    count: rows.length,
  };
}

/** The baki khata: who owes the shop, and how much of it. */
export async function customersCsv(actor: Actor) {
  const rows = await ShopCustomerModel.find({ organization: actor.org, deletedAt: null })
    .sort({ name: 1 })
    .lean();

  return {
    csv: buildCsv(
      OWED_COLUMNS,
      rows.map((c) => ({
        name: c.name,
        phone: c.phone ?? '',
        extra: '',
        balance: money(c.balance),
      })),
    ),
    count: rows.length,
  };
}
