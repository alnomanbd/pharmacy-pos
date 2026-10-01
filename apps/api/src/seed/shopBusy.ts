import { Types } from 'mongoose';
import {
  AuditLogModel,
  CashMoveModel,
  MonthCloseModel,
  PurchaseModel,
  SaleModel,
  ShiftModel,
  ExpenseModel,
  IncomeModel,
  MedicineModel,
  ShopCounterModel,
  ShopCustomerModel,
  ShopProductModel,
  ShopRackModel,
  StockBatchModel,
  StockLedgerModel,
  CustomerLedgerModel,
  UserModel,
} from '../models/index.js';
import { calendarPartsInAppTz, formatDayKey, instantFromDayKeyAndTime, parseDayKey } from '../utils/date.js';
import { softDelete } from '../services/shopTrash.service.js';
import { createCounter, updateCounter } from '../services/counters.service.js';
import { createStaff, updateStaff } from '../services/shopStaff.service.js';
import { env } from '../config/env.js';
import { createExpense } from '../services/shopExpense.service.js';
import { createIncome } from '../services/shopIncome.service.js';
import { createCashMove, closeMonth, monthRange } from '../services/shopCash.service.js';
import { accounts } from '../services/shopAccounts.service.js';
import * as shop from '../services/shop.service.js';
import * as till from '../services/till.service.js';
import * as orders from '../services/shopOrder.service.js';
import { logger } from '../utils/logger.js';

/**
 * A shop that has been open a while.
 *
 * The first demo pass stocks a fortnight: eight brands, three companies, two
 * customers. That shows the screens, but not what they are for — a list short
 * enough to read has no use for a pager, a search or a "to reorder" filter,
 * and a shelf where nothing has expired never lights the bell.
 *
 * So this adds the rest of a real shop: several hundred items, some twenty
 * companies, a wall of racks, a hundred-odd customers (some past the limit they
 * were given), three months of deliveries paid in every way a shop pays, orders
 * in every state, a day's bills at the counter, lots that have gone out of date
 * on the shelf and items that have run out.
 *
 * Through the services like the rest of the demo, with one exception said out
 * loud below: a delivery can no longer be entered already expired, so lots are
 * aged after they arrive — which is what time does to a real shelf anyway.
 *
 * Idempotent on a marker customer: run twice and the second run does nothing.
 */

const MARKER_PHONE = '01811000001';
const DAY = 86_400_000;

/** More of what a Dhaka pharmacy moves. Whatever the catalogue lacks is skipped. */
const MORE_SHELF: { q: string; pps: number; spb: number; mrp: number; reorder?: number }[] = [
  { q: 'Ciprocin', pps: 10, spb: 5, mrp: 15, reorder: 40 },
  { q: 'Azithrocin', pps: 6, spb: 5, mrp: 35 },
  { q: 'Zimax', pps: 6, spb: 5, mrp: 38, reorder: 24 },
  { q: 'Losectil', pps: 10, spb: 5, mrp: 5, reorder: 60 },
  { q: 'Pantonix', pps: 10, spb: 5, mrp: 7 },
  { q: 'Nexum', pps: 10, spb: 5, mrp: 9, reorder: 50 },
  { q: 'Esonix', pps: 10, spb: 5, mrp: 8 },
  { q: 'Rolac', pps: 10, spb: 5, mrp: 12 },
  { q: 'Tofen', pps: 10, spb: 10, mrp: 3 },
  { q: 'Alatrol', pps: 10, spb: 10, mrp: 3, reorder: 80 },
  { q: 'Fenadin', pps: 10, spb: 5, mrp: 8 },
  { q: 'Deslor', pps: 10, spb: 5, mrp: 5 },
  { q: 'Montene', pps: 10, spb: 3, mrp: 16, reorder: 30 },
  { q: 'Filmet', pps: 10, spb: 10, mrp: 2 },
  { q: 'Flagyl', pps: 10, spb: 10, mrp: 2.5 },
  { q: 'Histacin', pps: 10, spb: 10, mrp: 1 },
  { q: 'Bizoran', pps: 10, spb: 3, mrp: 12 },
  { q: 'Osartil', pps: 10, spb: 3, mrp: 10, reorder: 30 },
  { q: 'Camlodin', pps: 10, spb: 3, mrp: 6 },
  { q: 'Xinc', pps: 10, spb: 10, mrp: 2 },
  { q: 'Calbo', pps: 10, spb: 3, mrp: 9, reorder: 40 },
  { q: 'Neoceptin', pps: 10, spb: 10, mrp: 2 },
  { q: 'Famotack', pps: 10, spb: 10, mrp: 3 },
  { q: 'Cef-3', pps: 4, spb: 3, mrp: 45 },
  { q: 'Tamen', pps: 10, spb: 10, mrp: 1.5 },
  { q: 'Emistat', pps: 10, spb: 5, mrp: 8 },
  { q: 'Motigut', pps: 10, spb: 10, mrp: 3 },
  { q: 'Ecospirin', pps: 10, spb: 10, mrp: 1 },
  { q: 'Comet', pps: 10, spb: 5, mrp: 5, reorder: 50 },
  { q: 'Clofenac', pps: 10, spb: 10, mrp: 2 },
];

/** The rest of the counter: no catalogue row, no expiry, VAT-able. */
const SUNDRIES: { name: string; mrp: number }[] = [
  { name: 'Savlon Antiseptic Soap 75g', mrp: 45 },
  { name: 'Disposable Syringe 3ml', mrp: 8 },
  { name: 'Cerelac Wheat 400g', mrp: 520 },
  { name: 'Surgical Mask (box of 50)', mrp: 150 },
];

const MORE_COMPANIES: {
  name: string;
  kind: 'company' | 'distributor' | 'shop' | 'other';
  rep: string;
  phone: string;
  opening: number;
  visitsToday?: boolean;
}[] = [
  {
    name: 'Incepta Depot, Tejgaon',
    kind: 'company',
    rep: 'Arif Hossain',
    phone: '01711200001',
    opening: 12500,
    visitsToday: true,
  },
  { name: 'Beximco Pharma Depot', kind: 'company', rep: 'Sohel Rana', phone: '01711200002', opening: 9800 },
  { name: 'Renata Limited, Mirpur', kind: 'company', rep: 'Mahbub Alam', phone: '01711200003', opening: 0 },
  { name: 'ACI Healthcare Depot', kind: 'company', rep: 'Tanvir Ahmed', phone: '01711200004', opening: 4300 },
  {
    name: 'Eskayef Pharmaceuticals',
    kind: 'company',
    rep: 'Nazmul Huda',
    phone: '01711200005',
    opening: 7600,
    visitsToday: true,
  },
  { name: 'Opsonin Pharma Depot', kind: 'company', rep: 'Rashed Karim', phone: '01711200006', opening: 0 },
  { name: 'Aristopharma Depot', kind: 'company', rep: 'Shafiq Islam', phone: '01711200007', opening: 3100 },
  { name: 'Drug International Ltd', kind: 'company', rep: 'Kamrul Hasan', phone: '01711200008', opening: 0 },
  {
    name: 'ACME Laboratories Depot',
    kind: 'company',
    rep: 'Imran Hossain',
    phone: '01711200009',
    opening: 5400,
  },
  {
    name: 'Healthcare Pharmaceuticals',
    kind: 'company',
    rep: 'Faisal Ahmed',
    phone: '01711200010',
    opening: 2200,
  },
  {
    name: 'Babubazar Medicine Market',
    kind: 'distributor',
    rep: 'Harun Mia',
    phone: '01711200011',
    opening: 15800,
  },
  {
    name: 'Uttara Wholesale Traders',
    kind: 'distributor',
    rep: 'Jalal Uddin',
    phone: '01711200012',
    opening: 0,
  },
  { name: 'Shifa Pharmacy (Road 7)', kind: 'shop', rep: '', phone: '01711200013', opening: 650 },
  { name: 'Hasan Surgical Supplies', kind: 'other', rep: 'Hasan', phone: '01711200014', opening: 1800 },
];

const MORE_RACKS: {
  name: string;
  rule: 'form' | 'company' | 'manual';
  match: string[];
  isCold?: boolean;
  note?: string;
}[] = [
  { name: 'R4 — Drops', rule: 'form', match: ['drops', 'eye drops', 'ear drops'] },
  { name: 'R5 — Injections', rule: 'form', match: ['injection', 'vial', 'ampoule'] },
  { name: 'R6 — Square', rule: 'company', match: ['square'], note: 'Everything the Square SR brings' },
  { name: 'R7 — Incepta', rule: 'company', match: ['incepta'] },
  { name: 'R8 — Beximco', rule: 'company', match: ['beximco'] },
  { name: 'Counter top', rule: 'manual', match: [], note: 'What people ask for without a prescription' },
  { name: 'Baby care', rule: 'manual', match: [], note: 'Formula, diapers, wipes' },
  { name: 'Surgical', rule: 'manual', match: [], note: 'Syringes, gauze, masks' },
  { name: 'Glass case', rule: 'manual', match: [], note: 'Controlled — behind the counter, locked' },
  { name: 'Vaccine fridge', rule: 'manual', match: [], isCold: true, note: 'Insulin and vaccines, 2–8°C' },
  { name: 'Store room', rule: 'manual', match: [], note: 'Boxes not yet on a shelf' },
];

/** How much of everything. Big enough that every list needs its pager. */
const CATALOGUE_ITEMS = 650;
const NEVER_BOUGHT = 25;
const EXPIRED_LOTS = 12;
const SOON_LOTS = 15;
const EMPTIED = 12;
const CUSTOMER_COUNT = 110;
const ORDER_COUNT = 25;
const SALE_COUNT = 150;

const FIRST = [
  'Rafiq',
  'Shirin',
  'Monir',
  'Nasima',
  'Kamal',
  'Jahangir',
  'Selina',
  'Babul',
  'Rokeya',
  'Faruk',
  'Anwar',
  'Mizanur',
  'Tahmina',
  'Sabbir',
  'Moti',
  'Hena',
  'Nur',
  'Parveen',
  'Abdul',
  'Lutfa',
  'Shahin',
  'Sumaiya',
  'Delwar',
  'Kulsum',
  'Rubel',
  'Josna',
  'Iqbal',
  'Farzana',
  'Habib',
  'Nargis',
  'Sajib',
  'Ruma',
  'Tariq',
  'Moushumi',
  'Alamgir',
  'Shapla',
];
const LAST = [
  'Ahmed',
  'Akter',
  'Hossain',
  'Begum',
  'Alam',
  'Islam',
  'Rahman',
  'Khatun',
  'Hasan',
  'Mia',
  'Das',
  'Sultana',
  'Uddin',
  'Chowdhury',
  'Sarkar',
  'Karim',
];
const PLACES = [
  '',
  '',
  '',
  ' (tea stall)',
  ' (garments line 3)',
  ' (rickshaw garage)',
  ' (mechanic)',
  ' (chamber upstairs)',
  ' (school gate)',
  ' (bazar)',
];

/**
 * A notebook's worth of people: [name, owes, limit]. A limit of 0 is none set.
 *
 * About a third owe nothing, most owe a few hundred, a handful owe thousands —
 * and a fair few have gone past the limit they were given.
 */
const CUSTOMERS: [string, number, number][] = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}${PLACES[i % PLACES.length]}`;
  const owes = i % 3 === 0 ? 0 : ((i * 137) % 25) * 60 + (i % 5) * 15;
  const limit = i % 4 === 0 ? 0 : [500, 1000, 1500, 2000, 3000][i % 5]!;
  return [name, owes, limit];
});

const pick = <T>(list: T[], i: number) => list[i % list.length]!;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthOut = (days: number) => {
  const d = new Date(Date.now() + days * DAY);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function seedBusyShop(actor: shop.Actor) {
  if (await ShopCustomerModel.findOne({ organization: actor.org, phone: `+88${MARKER_PHONE}` }).lean()) {
    return { skipped: true };
  }
  if (await ShopCustomerModel.findOne({ organization: actor.org, phone: MARKER_PHONE }).lean()) {
    return { skipped: true };
  }
  const counts = { products: 0, suppliers: 0, racks: 0, customers: 0, deliveries: 0, orders: 0, sales: 0 };

  /* ---- more shelves ---- */
  for (const r of MORE_RACKS) {
    if (await shop.createRack(actor, r).catch(() => null)) counts.racks++;
  }

  /* ---- more companies, two of whom come round today ---- */
  const today = new Date().getDay();
  for (const [i, c] of MORE_COMPANIES.entries()) {
    const made = await shop
      .createSupplier(actor, {
        name: c.name,
        kind: c.kind,
        repName: c.rep,
        phone: c.phone,
        repVisitDay: c.visitsToday ? today : i % 7,
        openingBalance: c.opening,
      } as never)
      .catch(() => null);
    if (made) counts.suppliers++;
  }
  const suppliers = (await shop.listSuppliers(actor)).map((s) => String(s._id));

  /*
   * ---- a real list: several hundred items from the catalogue ----
   *
   * A named handful first, so the brands a demo is looked at for are there;
   * then a spread of the rest of the catalogue, so the list is as long as a
   * shop's actually is and the search, filters and pager have work to do.
   */
  const racks = (await shop.listRacks(actor)).map((r) => ({ id: String(r._id), name: r.name }));
  const newIds: string[] = [];
  const addMedicine = async (
    med: { _id: unknown; dosageForm?: string | null; price?: number | null },
    pack?: { pps: number; spb: number; mrp: number; reorder?: number },
    i = 0,
  ) => {
    const form = (med.dosageForm ?? '').toLowerCase();
    const loose = /tablet|capsule/.test(form);
    const made = await shop
      .createProduct(actor, {
        medicineId: String(med._id),
        piecesPerStrip: pack?.pps ?? (loose ? 10 : 1),
        stripsPerBox: pack?.spb ?? (loose ? pick([3, 5, 10], i) : 1),
        mrpPerPiece:
          pack?.mrp ??
          (med.price && med.price > 0
            ? Math.round(med.price * 100) / 100
            : loose
              ? pick([1.5, 3, 5, 8, 12], i)
              : pick([45, 70, 95, 120], i)),
        reorderLevel: pack?.reorder ?? (i % 4 === 0 ? (loose ? 30 : 5) : 0),
      })
      .catch(() => null);
    if (made) {
      newIds.push(String((made as { _id: unknown })._id));
      counts.products++;
    }
  };
  for (const item of MORE_SHELF) {
    const med =
      (await MedicineModel.findOne({ brandName: new RegExp(`^${item.q}$`, 'i') }).lean()) ??
      (await MedicineModel.findOne({ brandName: new RegExp(`^${item.q} `, 'i') }).lean());
    if (med) await addMedicine(med, item);
  }
  const already = (
    await ShopProductModel.find({ organization: actor.org, medicine: { $ne: null } })
      .select('medicine')
      .lean()
  ).map((p) => p.medicine);
  const spread = await MedicineModel.aggregate<{ _id: unknown; dosageForm?: string; price?: number }>([
    { $match: { isActive: { $ne: false }, _id: { $nin: already } } },
    { $sample: { size: CATALOGUE_ITEMS } },
    { $project: { dosageForm: 1, price: 1 } },
  ]);
  for (const [i, med] of spread.entries()) await addMedicine(med, undefined, i);

  const surgical = racks.find((r) => r.name === 'Surgical')?.id;
  const baby = racks.find((r) => r.name === 'Baby care')?.id;
  for (const [i, s] of SUNDRIES.entries()) {
    const made = await shop
      .createProduct(actor, {
        name: s.name,
        isMedicine: false,
        piecesPerStrip: 1,
        stripsPerBox: 1,
        mrpPerPiece: s.mrp,
        rackId: i === 2 ? baby : surgical,
        reorderLevel: i === 1 ? 20 : 0,
      })
      .catch(() => null);
    if (made) {
      newIds.push(String((made as { _id: unknown })._id));
      counts.products++;
    }
  }

  /*
   * ---- two months of deliveries ----
   *
   * Every new item arrives on one of them, except the last three: an item on
   * the list that has never been bought is its own honest state, and the
   * stock screen should show what that looks like.
   */
  const stocked = newIds.slice(0, Math.max(0, newIds.length - NEVER_BOUGHT));
  const products = await ShopProductModel.find({ _id: { $in: stocked } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  /* Days out for expiry: a few go this month, most a year or two away. */
  const EXPIRIES = [15, 40, 90, 150, 240, 300, 420, 540, 660];
  const PER_DELIVERY = 8;
  const deliveries = Math.ceil(stocked.length / PER_DELIVERY);
  for (let d = 0; d < deliveries; d++) {
    const chunk = stocked.slice(d * PER_DELIVERY, (d + 1) * PER_DELIVERY);
    const lines = chunk.map((productId, k) => {
      const p = byId.get(productId);
      const pieces = (p?.piecesPerStrip ?? 10) * (p?.stripsPerBox ?? 5);
      return {
        productId,
        batchNo: `D-${10000 + d * 10 + k}`,
        expiry: p?.isMedicine === false ? undefined : monthOut(pick(EXPIRIES, d + k * 3)),
        pieces: pieces * (1 + ((d + k) % 3)),
        bonusPieces: (d + k) % 5 === 0 ? (p?.piecesPerStrip ?? 10) : 0,
        tradePricePerPiece: Math.round((p?.mrpPerPiece ?? 5) * 0.82 * 100) / 100,
      };
    });
    const total = lines.reduce((n, l) => n + l.pieces * l.tradePricePerPiece, 0);
    /* Paid in full at the door, part of it, or none of it — all three are normal. */
    const paid = d % 3 === 0 ? total : d % 3 === 1 ? Math.round(total / 2) : 0;
    const made = await shop
      .createPurchase(actor, {
        supplierId: pick(suppliers, d),
        invoiceNo: `INV-${4000 + d}`,
        /* Spread over the last three months, oldest first. */
        invoiceDate: dayKey(new Date(Date.now() - Math.round((90 * (deliveries - d)) / deliveries) * DAY)),
        paidAmount: Math.floor(paid),
        lines,
      })
      .catch((err) => {
        logger.warn({ err }, 'Seed: busy delivery failed');
        return null;
      });
    if (made) counts.deliveries++;
  }

  /*
   * ---- time passing on the shelf ----
   *
   * The one place this reaches past the services. A delivery cannot be entered
   * already out of date — that rule is the point of the expiry work — so a dozen
   * lots are aged after they arrived, the way a real one is.
   */
  const aging = await StockBatchModel.find({
    organization: actor.org,
    product: { $in: stocked.slice(0, 60) },
    qtyOnHand: { $gt: 0 },
    expiry: { $ne: null },
  })
    .sort({ createdAt: 1 })
    .limit(EXPIRED_LOTS)
    .lean();
  for (const [i, b] of aging.entries()) {
    await StockBatchModel.updateOne(
      { _id: b._id },
      { $set: { expiry: new Date(Date.now() - (5 + i * 9) * DAY) } },
    );
  }

  await ageSoon(actor, stocked.slice(60, 160));

  /* ---- some shelves emptied: broken in the store room, written off ---- */
  for (const productId of stocked.slice(-EMPTIED)) {
    const lots = await StockBatchModel.find({
      organization: actor.org,
      product: productId,
      qtyOnHand: { $gt: 0 },
    }).lean();
    for (const lot of lots) {
      await shop
        .adjustStock(actor, {
          batchId: String(lot._id),
          qtyDelta: -lot.qtyOnHand,
          move: 'damage',
          reason: 'Carton got wet in the store room',
        })
        .catch(() => undefined);
    }
  }

  /* ---- the notebook ---- */
  for (const [i, [name, owes, limit]] of CUSTOMERS.entries()) {
    const made = await till
      .createCustomer(actor, {
        name,
        phone: `0181100${String(i + 1).padStart(4, '0')}`,
        creditLimit: limit || undefined,
        openingBalance: owes || undefined,
      })
      .catch(() => null);
    if (made) counts.customers++;
  }

  /* ---- orders in every state ---- */
  const everything = stocked.length ? stocked : newIds;
  const orderLines = (from: number) =>
    [0, 1, 2].map((k) => ({ productId: pick(everything, from + k), qtyPieces: 50 + k * 30 }));
  const write = async (i: number) =>
    orders
      .createOrder(actor, { supplierId: pick(suppliers, i + 3), lines: orderLines(i * 3) })
      .catch(() => null);

  /* Of every five: one written, one given to the rep, one cancelled — and the
     other two arrive below, one of them short. */
  for (let i = 0; i < ORDER_COUNT; i++) {
    if (i % 5 >= 3) continue;
    const o = await write(i);
    if (!o) continue;
    counts.orders++;
    if (i % 5 === 1) await orders.setOrderStatus(actor, String(o._id), { status: 'sent' }).catch(() => null);
    if (i % 5 === 2) {
      await orders
        .setOrderStatus(actor, String(o._id), {
          status: 'cancelled',
          reason: 'The rep says it is out of stock at the depot',
        })
        .catch(() => null);
    }
  }
  /* The ones that arrived — every other one short, which is what the Orders page is for. */
  for (let i = 0; i < ORDER_COUNT; i++) {
    if (i % 5 < 3) continue;
    const o = await write(i);
    if (!o) continue;
    await orders.setOrderStatus(actor, String(o._id), { status: 'sent' }).catch(() => null);
    const asked = orderLines(i * 3);
    const byIdAll = new Map(
      (await ShopProductModel.find({ _id: { $in: asked.map((l) => l.productId) } }).lean()).map((p) => [
        String(p._id),
        p,
      ]),
    );
    await shop
      .createPurchase(actor, {
        supplierId: pick(suppliers, i + 3),
        orderId: String(o._id),
        invoiceNo: `INV-${5000 + i}`,
        invoiceDate: dayKey(new Date(Date.now() - (i % 10) * DAY)),
        paidAmount: 0,
        lines: asked.map((l, k) => {
          const p = byIdAll.get(l.productId);
          return {
            productId: l.productId,
            batchNo: `O-${9300 + i * 10 + k}`,
            expiry: p?.isMedicine === false ? undefined : monthOut(360),
            /* Every other one came short on its last line. */
            pieces: i % 5 === 4 && k === 2 ? Math.floor(l.qtyPieces / 2) : l.qtyPieces,
            tradePricePerPiece: Math.round((p?.mrpPerPiece ?? 5) * 0.8 * 100) / 100,
          };
        }),
      })
      .catch((err) => logger.warn({ err }, 'Seed: busy order delivery failed'));
    counts.orders++;
  }

  /*
   * ---- a busy day at the counter ----
   *
   * Through the till like any other bill, so stock leaves first-expiry-first
   * and the ledger says so. Every sixth goes on somebody's account, part paid,
   * which is how the baki khata grows in real life.
   */
  if (!(await till.openShift(actor))) {
    await till.startShift(actor, { openingFloat: 1000, terminal: 'Counter 1' }).catch(() => null);
  }
  const people = await ShopCustomerModel.find({ organization: actor.org, deletedAt: null })
    .select('_id')
    .limit(60)
    .lean();
  const onShelf = (
    await StockBatchModel.aggregate<{ _id: unknown }>([
      {
        $match: {
          organization: new Types.ObjectId(actor.org),
          qtyOnHand: { $gt: 30 },
          expiry: { $gt: new Date() },
        },
      },
      { $group: { _id: '$product' } },
      { $limit: 300 },
    ])
  ).map((r) => String(r._id));
  const prices = new Map(
    (
      await ShopProductModel.find({ _id: { $in: onShelf } })
        .select('mrpPerPiece controlled')
        .lean()
    ).map((p) => [String(p._id), p]),
  );
  const sellable = onShelf.filter((id) => !prices.get(id)?.controlled);
  for (let i = 0; i < SALE_COUNT && sellable.length; i++) {
    const lines = [...new Set([0, 1, 2].slice(0, 1 + (i % 3)).map((k) => pick(sellable, i * 3 + k)))].map(
      (productId, k) => ({
        productId,
        qtyPieces: [2, 4, 6, 10][(i + k) % 4]!,
        pricePerPiece: prices.get(productId)?.mrpPerPiece ?? 0,
      }),
    );
    const total = Math.round(lines.reduce((n, l) => n + l.qtyPieces * l.pricePerPiece, 0) * 100) / 100;
    if (total <= 0) continue;
    const onAccount = i % 6 === 0 && people.length > 0;
    const made = await till
      .createSale(actor, {
        lines,
        payments: onAccount
          ? [{ method: 'cash', amount: Math.floor(total / 3) }]
          : [{ method: pick(['cash', 'cash', 'bkash', 'nagad', 'card'], i), amount: total }],
        customerId: onAccount ? String(pick(people, i)._id) : undefined,
      } as never)
      .catch(() => null);
    if (made) counts.sales++;
  }

  logger.info(counts, 'Seed: the shop has been open a while');
  return counts;
}

/**
 * A few lots that go out of date within the month.
 *
 * The same time-passing as the expired ones, and for the same reason: a lot
 * this close to its date would be refused by nobody, but the delivery dates
 * above land every expiry at a month's end, and the nearest of those is
 * rarely inside thirty days. Exported so an existing demo can be given them
 * without being seeded again.
 */
export async function ageSoon(actor: shop.Actor, among?: string[]) {
  const lots = await StockBatchModel.find({
    organization: actor.org,
    ...(among ? { product: { $in: among } } : {}),
    qtyOnHand: { $gt: 0 },
    expiry: { $gt: new Date(Date.now() + 60 * DAY) },
  })
    .sort({ createdAt: 1 })
    .limit(SOON_LOTS)
    .lean();
  for (const [i, b] of lots.entries()) {
    await StockBatchModel.updateOne(
      { _id: b._id },
      { $set: { expiry: new Date(Date.now() + (4 + i * 1.7) * DAY) } },
    );
  }
  return lots.length;
}

/**
 * Four months of what the shop costs to stand open.
 *
 * The rent on the 1st, two salaries on the 5th, the power and the line once a
 * month, a van to the wholesale market every week, the small supplies a
 * counter eats through, and the tea for the rep — every few days, a little.
 * Enough that the Expenses page has a month to compare with the one before,
 * and the owner's report has a net profit that is not simply the margin.
 *
 * Its own marker, so an existing demo can be given it without the rest.
 */
export async function seedExpenses(actor: shop.Actor) {
  const marker = 'Shop rent — Haji Abdul Karim (landlord)';
  if (await ExpenseModel.findOne({ organization: actor.org, note: marker }).lean()) return 0;

  const lines: {
    amount: number;
    category: 'rent' | 'salary' | 'utility' | 'transport' | 'supplies' | 'other';
    note: string;
    date: string;
  }[] = [];
  const today = new Date();
  const at = (y: number, m: number, d: number) => {
    const when = new Date(y, m, d);
    return when > today
      ? null
      : dayKey(new Date(Date.UTC(when.getFullYear(), when.getMonth(), when.getDate())));
  };

  for (let back = 3; back >= 0; back--) {
    const y = new Date(today.getFullYear(), today.getMonth() - back, 1).getFullYear();
    const m = new Date(today.getFullYear(), today.getMonth() - back, 1).getMonth();
    const push = (d: number, amount: number, category: (typeof lines)[number]['category'], note: string) => {
      const date = at(y, m, d);
      if (date) lines.push({ amount, category, note, date });
    };
    push(1, 15000, 'rent', marker);
    push(5, 12000, 'salary', 'Salary — Rakib (salesman)');
    push(5, 9000, 'salary', 'Salary — Sumon (night counter)');
    push(10, 2600 + back * 240, 'utility', 'DESCO electricity bill');
    push(12, 800, 'utility', 'Internet — monthly package');
    push(15, 400, 'utility', 'WASA water bill');
    push(20, 1200, 'supplies', 'Receipt paper rolls ×12');
    push(25, 650, 'supplies', 'Polythene bags and medicine envelopes');
    push(28, 350, 'other', 'Cleaner — month');
    for (const d of [3, 10, 17, 24])
      push(d, 180 + ((d + back) % 4) * 60, 'transport', 'Van fare — Babubazar pickup');
    for (let d = 2; d <= 28; d += 3)
      push(d, 60 + ((d * 7 + back) % 5) * 20, 'other', 'Tea and snacks — SR visit');
  }

  let made = 0;
  for (const l of lines) {
    if (await createExpense(actor, l).catch(() => null)) made++;
  }
  return made;
}

/**
 * The shop floor: counters, the people on them, and a day's bills at each.
 *
 * Every other demo bill is rung up by the owner on "Counter 1", which leaves
 * the Counters page with one busy till and nothing to compare it with. This
 * puts a counter by the door, a night counter, one beside the chamber and an
 * old one switched off — and gives three members of staff their own shift and
 * their own bills, so the page shows who is on which counter, what each has
 * taken, and one day already closed and counted, a little short.
 *
 * Staff sign in with the same demo password as everybody else. Its own marker,
 * so an existing demo can be given it without the rest.
 */
export async function seedCounters(actor: shop.Actor) {
  /* Idempotent part by part: a counter that exists is kept, and a member of
     staff who already has an account is not given a second day of bills. */
  const marker = 'Counter 2 — by the door';

  const COUNTERS: { name: string; note: string; openingFloat: number; off?: boolean }[] = [
    { name: 'Counter 1', note: 'Main counter — the scanner and the printer', openingFloat: 1000 },
    { name: marker, note: 'Quick sales: Napa, saline, a strip at a time', openingFloat: 500 },
    { name: 'Back counter', note: 'For the evening rush', openingFloat: 300 },
    { name: 'Night counter', note: '10 pm – 8 am, through the grille', openingFloat: 500 },
    { name: 'Old counter', note: 'Waiting for the new printer', openingFloat: 0, off: true },
  ];
  const ids: Record<string, string> = {};
  for (const c of COUNTERS) {
    const made =
      (await createCounter(actor, c).catch(() => null)) ??
      (await ShopCounterModel.findOne({ organization: actor.org, name: c.name }).lean());
    if (!made) continue;
    ids[c.name] = String(made._id);
    if (c.off) await updateCounter(actor, String(made._id), { isActive: false }).catch(() => null);
  }

  /* ---- three people, each on a counter of their own ---- */
  const tag = String(actor.org).slice(-6);
  const STAFF: {
    name: string;
    slug: string;
    role: 'salesman' | 'pharmacist';
    counter: string;
    bills: number;
    close?: number;
  }[] = [
    /* Not "Rakib": the first demo pass already has a Rakib, and two people
       with one name on one staff list is the confusion the list exists to end. */
    { name: 'Imran Hossain', slug: 'imran', role: 'salesman', counter: marker, bills: 24 },
    { name: 'Nasrin Akter', slug: 'nasrin', role: 'pharmacist', counter: 'Clinic side', bills: 14 },
    /* The one whose day is already over — counted ৳40 short. */
    { name: 'Sumon Mia', slug: 'sumon', role: 'salesman', counter: 'Night counter', bills: 10, close: -40 },
  ];

  const onShelf = (
    await StockBatchModel.aggregate<{ _id: unknown }>([
      {
        $match: {
          organization: new Types.ObjectId(actor.org),
          qtyOnHand: { $gt: 50 },
          expiry: { $gt: new Date() },
        },
      },
      { $group: { _id: '$product' } },
      { $limit: 200 },
    ])
  ).map((r) => String(r._id));
  const prices = new Map(
    (
      await ShopProductModel.find({ _id: { $in: onShelf }, controlled: { $ne: true } })
        .select('mrpPerPiece')
        .lean()
    ).map((p) => [String(p._id), p.mrpPerPiece ?? 0]),
  );
  const sellable = [...prices.keys()];

  let staffMade = 0;
  let bills = 0;
  for (const [s, who] of STAFF.entries()) {
    const email = `${who.slug}.${tag}@demo.com`;
    if (await UserModel.findOne({ email }).lean()) continue;
    /* A phone is required to sign in with, and has to be nobody else's: one
       made from the account's id and the person's place in the list. */
    const phone = `0195${s}${String(parseInt(tag, 16) % 1_000_000).padStart(6, '0')}`;
    const user = await createStaff(actor, {
      name: who.name,
      email,
      phone,
      role: who.role,
      password: env.seed.shopPassword,
    }).catch((err) => {
      logger.warn({ err }, 'Seed: staff account failed');
      return null;
    });
    if (!user) continue;
    staffMade++;
    const them: shop.Actor = { org: actor.org, id: String(user._id), name: who.name };

    if (!(await till.openShift(them))) {
      await till
        .startShift(them, {
          counterId: ids[who.counter],
          openingFloat: COUNTERS.find((c) => c.name === who.counter)?.openingFloat,
        })
        .catch((err) => logger.warn({ err }, 'Seed: staff shift failed'));
    }
    for (let i = 0; i < who.bills && sellable.length; i++) {
      const lines = [
        ...new Set([0, 1].slice(0, 1 + ((i + s) % 2)).map((k) => pick(sellable, s * 37 + i * 2 + k))),
      ].map((productId, k) => ({
        productId,
        qtyPieces: [2, 5, 10][(i + k) % 3]!,
        pricePerPiece: prices.get(productId) ?? 0,
      }));
      /* To the poisha: a round figure over the bill on bKash is money the till
         keeps with nothing to show for it. */
      const total = Math.round(lines.reduce((sum, l) => sum + l.qtyPieces * l.pricePerPiece, 0) * 100) / 100;
      if (total <= 0) continue;
      const made = await till
        .createSale(them, {
          lines,
          payments: [{ method: pick(['cash', 'cash', 'cash', 'bkash', 'nagad'], i + s), amount: total }],
        } as never)
        .catch(() => null);
      if (made) bills++;
    }
    if (who.close !== undefined) {
      const shift = await till.openShift(them);
      if (shift) {
        const expected = (shift.openingFloat ?? 0) + (shift.cashTaken ?? 0);
        await till
          .closeShift(them, {
            countedCash: Math.max(0, Math.round(expected + who.close)),
            note: 'Counted at 8 am handover',
          })
          .catch((err) => logger.warn({ err }, 'Seed: closing a shift failed'));
      }
    }
  }

  /*
   * Two who have left. Switched off, never deleted — the Staff page's own
   * rule — so the "switched off" filter has somebody in it and their old
   * bills would still carry their names.
   */
  for (const [i, gone] of [
    { name: 'Jamal Uddin', slug: 'jamal', role: 'salesman' as const },
    { name: 'Farhana Yasmin', slug: 'farhana', role: 'pharmacist' as const },
  ].entries()) {
    const email = `${gone.slug}.${tag}@demo.com`;
    if (await UserModel.findOne({ email }).lean()) continue;
    const phone = `0196${i}${String(parseInt(tag, 16) % 1_000_000).padStart(6, '0')}`;
    const made = await createStaff(actor, { ...gone, email, phone, password: env.seed.shopPassword }).catch(
      () => null,
    );
    if (made) {
      await updateStaff(actor, made._id, { isActive: false }).catch(() => null);
      staffMade++;
    }
  }

  logger.info({ counters: Object.keys(ids).length, staff: staffMade, bills }, 'Seed: the shop floor');
  return { counters: Object.keys(ids).length, staff: staffMade, bills };
}

/**
 * A bin with something in it.
 *
 * Nothing a shop deletes is destroyed, and the Bin page is where that shows —
 * but a demo where nobody has ever deleted anything shows an empty box. This
 * throws away the things a real shop does over a fortnight: a customer entered
 * twice, items added and never bought, a shelf taken down, the old counter, a
 * couple of mistyped expenses — each with the reason somebody had to type, by
 * different members of staff, on different days.
 *
 * Through the bin's own service, so every line is exactly what the page would
 * have made. The dates are then set back, the one liberty taken, so the page
 * reads as a fortnight rather than as one minute.
 */
export async function seedBin(actor: shop.Actor) {
  const marker = 'Entered twice by mistake — the other one has the right phone';
  if (await ShopCustomerModel.findOne({ organization: actor.org, deleteReason: marker }).lean()) return 0;

  const staff = await UserModel.find({
    organization: actor.org,
    isActive: true,
    role: { $in: ['pharmacist', 'salesman'] },
  })
    .select('name')
    .lean();
  const who = (i: number): shop.Actor & { role?: string } =>
    i === 0 || staff.length === 0
      ? { ...actor, role: 'admin' }
      : {
          org: actor.org,
          id: String(staff[(i - 1) % staff.length]!._id),
          name: staff[(i - 1) % staff.length]!.name,
          role: 'pharmacist',
        };

  const plan: { kind: string; id: string; reason: string; daysAgo: number }[] = [];

  /* Two customers who owe nothing — the bin refuses anybody with a balance. */
  const clear = await ShopCustomerModel.find({ organization: actor.org, deletedAt: null, balance: 0 })
    .limit(2)
    .lean();
  if (clear[0]) plan.push({ kind: 'customer', id: String(clear[0]._id), reason: marker, daysAgo: 0 });
  if (clear[1])
    plan.push({
      kind: 'customer',
      id: String(clear[1]._id),
      reason: 'Moved away — asked us to take the number off',
      daysAgo: 6,
    });

  /* Items added to the list and never bought: nothing on the shelf to hide. */
  const stocked = new Set(
    (await StockBatchModel.distinct('product', { organization: actor.org })).map(String),
  );
  const never = (
    await ShopProductModel.find({ organization: actor.org, deletedAt: null }).select('_id').lean()
  )
    .map((p) => String(p._id))
    .filter((id) => !stocked.has(id))
    .slice(0, 4);
  const itemReasons = [
    'Added by mistake — we do not keep this',
    'Wrong strength picked from the catalogue',
    'Company stopped making it',
    'Duplicate of the item on R1',
  ];
  never.forEach((id, i) =>
    plan.push({ kind: 'product', id, reason: itemReasons[i]!, daysAgo: [1, 1, 3, 9][i]! }),
  );

  const rack = await ShopRackModel.findOne({
    organization: actor.org,
    deletedAt: null,
    name: 'Store room',
  }).lean();
  if (rack)
    plan.push({
      kind: 'rack',
      id: String(rack._id),
      reason: 'Store room shelf taken down for the fridge',
      daysAgo: 4,
    });

  const counter = await ShopCounterModel.findOne({
    organization: actor.org,
    deletedAt: null,
    name: 'Old counter',
  }).lean();
  if (counter)
    plan.push({ kind: 'counter', id: String(counter._id), reason: 'Sold the old counter table', daysAgo: 2 });

  const tea = await ExpenseModel.find({ organization: actor.org, deletedAt: null, category: 'other' })
    .sort({ expenseDate: -1 })
    .limit(2)
    .lean();
  tea.forEach((e, i) =>
    plan.push({
      kind: 'expense',
      id: String(e._id),
      reason: i === 0 ? 'Typed twice — same receipt' : 'Wrong amount, entered again',
      daysAgo: i === 0 ? 0 : 5,
    }),
  );

  let binned = 0;
  for (const [i, p] of plan.entries()) {
    const done = await softDelete(who(i % (staff.length + 1)), p.kind, p.id, p.reason).catch((err) => {
      logger.warn({ err, kind: p.kind }, 'Seed: binning failed');
      return null;
    });
    if (!done) continue;
    binned++;
    const when = new Date(Date.now() - p.daysAgo * DAY - (i % 5) * 47 * 60_000);
    const model =
      p.kind === 'customer'
        ? ShopCustomerModel
        : p.kind === 'product'
          ? ShopProductModel
          : p.kind === 'rack'
            ? ShopRackModel
            : p.kind === 'counter'
              ? ShopCounterModel
              : ExpenseModel;
    await (model as typeof ExpenseModel).updateOne({ _id: p.id }, { $set: { deletedAt: when } });
  }
  return binned;
}

/**
 * Four months of money in that is not a sale.
 *
 * The company's cash-back when a target is met, a week of blood-pressure
 * checks and injections pushed at the counter, the mobile-banking agent's
 * commission, the rent on the corner the recharge man uses, and the empty
 * cartons sold to the kabadiwala. Small against the takings, and exactly the
 * money a profit figure without it misses.
 */
export async function seedIncome(actor: shop.Actor) {
  const marker = 'Corner rent — Faruk (mobile recharge)';
  if (await IncomeModel.findOne({ organization: actor.org, note: marker }).lean()) return 0;

  const lines: {
    amount: number;
    category: 'bonus' | 'service' | 'commission' | 'rent' | 'other';
    note: string;
    date: string;
  }[] = [];
  const today = new Date();
  for (let back = 3; back >= 0; back--) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const push = (d: number, amount: number, category: (typeof lines)[number]['category'], note: string) => {
      const when = new Date(first.getFullYear(), first.getMonth(), d);
      if (when > today) return;
      lines.push({
        amount,
        category,
        note,
        date: dayKey(new Date(Date.UTC(when.getFullYear(), when.getMonth(), when.getDate()))),
      });
    };
    push(2, 1500, 'rent', marker);
    push(8, 2400 - back * 300, 'bonus', 'Square — cash-back on the quarter target');
    push(18, 1200, 'bonus', 'Incepta — display bonus for the front shelf');
    push(28, 860 + back * 40, 'commission', 'bKash agent commission — month');
    for (const d of [6, 13, 20, 27])
      push(d, 240 + ((d + back) % 4) * 60, 'service', 'BP checks and injections pushed — week');
    push(15, 150, 'other', 'Empty cartons sold to the kabadiwala');
  }

  let made = 0;
  for (const l of lines) if (await createIncome(actor, l).catch(() => null)) made++;
  return made;
}

/**
 * The owner's money and the bank: a drawing most weeks, capital once when a
 * big delivery was due, the takings carried to the bank on Thursdays, and a
 * withdrawal for the month's salaries. Its own marker.
 */
export async function seedCashMoves(actor: shop.Actor) {
  const marker = 'Put in for the Incepta quarter order';
  if (await CashMoveModel.findOne({ organization: actor.org, note: marker }).lean()) return 0;

  const lines: {
    kind: 'drawing' | 'capital' | 'bank_deposit' | 'bank_withdrawal';
    amount: number;
    note: string;
    reference?: string;
    date: string;
  }[] = [];
  const today = new Date();
  for (let back = 3; back >= 0; back--) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const push = (d: number, l: Omit<(typeof lines)[number], 'date'>) => {
      const when = new Date(first.getFullYear(), first.getMonth(), d);
      if (when > today) return;
      lines.push({
        ...l,
        date: dayKey(new Date(Date.UTC(when.getFullYear(), when.getMonth(), when.getDate()))),
      });
    };
    if (back === 2) push(3, { kind: 'capital', amount: 50000, note: marker });
    for (const d of [7, 14, 21, 28])
      push(d, { kind: 'drawing', amount: 3000 + ((d + back) % 3) * 1000, note: 'Taken home for the house' });
    for (const d of [4, 11, 18, 25]) {
      push(d, {
        kind: 'bank_deposit',
        amount: 8000 + ((d * 3 + back) % 5) * 1500,
        note: 'Takings to Dutch-Bangla, Mirpur 10',
        reference: `DBBL-${d}${back}`,
      });
    }
    push(5, { kind: 'bank_withdrawal', amount: 21000, note: 'Cash for the salaries' });
  }

  let made = 0;
  for (const l of lines) if (await createCashMove(actor, l).catch(() => null)) made++;
  return made;
}

/**
 * A month already closed — the one before last — so the Month close tab shows
 * both states: a closed month with its figures kept, and the open ones.
 */
export async function seedMonthClose(actor: shop.Actor) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (await MonthCloseModel.findOne({ organization: actor.org, month }).lean()) return 0;
  const range = monthRange(month);
  const a = await accounts(actor, { ...range, limit: 1 });
  await closeMonth(
    actor,
    month,
    { countedCash: 12450, note: 'Counted with Rakib on the last evening — matched the book' },
    { range, profit: a.profit, cash: a.cash, position: a.position },
  );
  return 1;
}

/**
 * The Activity page's history, from what the demo actually did.
 *
 * The trail is written as the shop works, so a freshly seeded demo has an empty
 * one — every bill, delivery and expense above went in through the services,
 * not the routes. This writes the entries those actions would have left, from
 * the documents themselves: each bill with its own time and salesman, each
 * delivery, each expense and income, the shifts, and a sign-in and sign-out a
 * day for everybody who works here. Nothing is invented that the data does not
 * already say happened.
 */
export async function seedActivity(actor: shop.Actor) {
  const org = new Types.ObjectId(actor.org);
  if (await AuditLogModel.findOne({ organization: org, action: 'shop.purchase.create' }).lean()) return 0;

  const rows: Record<string, unknown>[] = [];
  /* A line dated later today (noon, say) is written as now: the trail never
     holds a moment that has not happened yet. */
  const now = Date.now();
  const entry = (
    when: Date,
    who: { id?: unknown; name?: string; role?: string },
    action: string,
    model: string,
    id: unknown,
    label: string,
  ) => {
    const at = when.getTime() > now ? new Date(now - (rows.length % 50) * 60_000) : when;
    rows.push({
      organization: org,
      actor: who.id ?? null,
      actorName: who.name ?? '',
      actorRole: who.role ?? '',
      action,
      target: { model, id: id ?? undefined, label },
      ip: '103.4.145.' + ((rows.length % 200) + 10),
      createdAt: at,
    });
  };

  const users = await UserModel.find({ organization: org }).select('name role').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const who = (id: unknown, name?: string) => {
    const u = byId.get(String(id));
    return { id: u?._id ?? id, name: u?.name ?? name ?? '', role: u?.role ?? '' };
  };

  const sales = await SaleModel.find({ organization: org })
    .select('billNo total soldAt salesman salesmanName')
    .sort({ soldAt: -1 })
    .limit(400)
    .lean();
  for (const s of sales)
    entry(
      new Date(s.soldAt),
      who(s.salesman, s.salesmanName),
      'shop.sale.create',
      'Sale',
      s._id,
      `${s.billNo} · ৳${s.total}`,
    );

  const purchases = await PurchaseModel.find({ organization: org })
    .select('invoiceNo total createdAt createdBy createdByName')
    .lean();
  for (const p of purchases)
    entry(
      new Date(p.createdAt!),
      who(p.createdBy, p.createdByName),
      'shop.purchase.create',
      'Purchase',
      p._id,
      `${p.invoiceNo} · ৳${p.total}`,
    );

  const spent = await ExpenseModel.find({ organization: org })
    .select('amount category note expenseDate createdBy createdByName')
    .lean();
  for (const e of spent)
    entry(
      new Date(e.expenseDate),
      who(e.createdBy, e.createdByName),
      'shop.expense.create',
      'Expense',
      e._id,
      `৳${e.amount} · ${e.category}${e.note ? ` · ${e.note}` : ''}`,
    );

  const earned = await IncomeModel.find({ organization: org })
    .select('amount category note incomeDate createdBy createdByName')
    .lean();
  for (const e of earned)
    entry(
      new Date(e.incomeDate),
      who(e.createdBy, e.createdByName),
      'shop.income.create',
      'Income',
      e._id,
      `৳${e.amount} · ${e.category}${e.note ? ` · ${e.note}` : ''}`,
    );

  const moves = await CashMoveModel.find({ organization: org, kind: { $ne: 'refund' } })
    .select('kind amount note moveDate createdBy createdByName')
    .lean();
  for (const m of moves)
    entry(
      new Date(m.moveDate),
      who(m.createdBy, m.createdByName),
      'shop.cash.create',
      'CashMove',
      m._id,
      `${m.kind} · ৳${m.amount}${m.note ? ` · ${m.note}` : ''}`,
    );

  const shifts = await ShiftModel.find({ organization: org })
    .select('user userName terminal openedAt closedAt openingFloat difference countedCash')
    .lean();
  for (const s of shifts) {
    entry(
      new Date(s.openedAt),
      who(s.user, s.userName),
      'shop.shift.open',
      'Shift',
      s._id,
      `${s.terminal || 'Counter'} · float ৳${s.openingFloat ?? 0}`,
    );
    if (s.closedAt) {
      const diff = s.difference ?? 0;
      entry(
        new Date(s.closedAt),
        who(s.user, s.userName),
        'shop.shift.close',
        'Shift',
        s._id,
        `counted ৳${s.countedCash ?? 0} · ${diff === 0 ? 'counted right' : `${diff < 0 ? 'short' : 'over'} ৳${Math.abs(diff)}`}`,
      );
    }
  }

  /* A sign-in each morning and a sign-out each night, for the last fortnight. */
  const active = users.filter((u) => ['admin', 'doctor', 'pharmacist', 'salesman'].includes(u.role));
  for (let back = 13; back >= 0; back--) {
    for (const [i, u] of active.entries()) {
      if ((back + i) % 5 === 4) continue; /* a day off now and then */
      const day = new Date(Date.now() - back * DAY);
      const inAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8 + (i % 3), (i * 17) % 60);
      const outAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21 + (i % 2), (i * 23) % 60);
      if (inAt > new Date()) continue;
      entry(inAt, who(u._id), 'auth.login', 'User', u._id, '');
      if (outAt < new Date()) entry(outAt, who(u._id), 'auth.logout', 'User', u._id, '');
    }
  }

  if (rows.length) await AuditLogModel.collection.insertMany(rows, { ordered: false });
  await stampLastSignIn(actor);
  return rows.length;
}

/* ------------------------------------------------ the shop's past bills -- */

const DHAKA_HOUR = (d: Date) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: env.appTz, hour: '2-digit', hourCycle: 'h23' }).format(d),
  );

/** A day key moved on (or back) by whole days. */
const shiftDay = (key: string, by: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

/** A point between two instants: 0 is the first, 1 the last. */
const timeBetween = (from: number, to: number, r: number) =>
  new Date(from + (to - from) * Math.min(1, Math.max(0, r)));

/**
 * The bills rung up by the seed itself land at whatever minute it ran — all
 * of them, a hundred and fifty in the same few seconds, at 3 am if that is
 * when it ran. A shop's day is not like that.
 *
 * Each person's burst is spread over opening hours: today, if the shop has
 * been open a while; otherwise yesterday, with the shift that took them closed
 * at its end. Then the day's pad is numbered again in the order the bills were
 * rung up, the way paper numbers them, and every place that quotes a number —
 * the khata, a refund, the Activity trail — is told the new one.
 */
export async function settleSeededBills(actor: shop.Actor) {
  const today = formatDayKey(parseDayKey());
  const all = await SaleModel.find({ organization: actor.org, dayKey: today }).sort({ soldAt: 1 }).lean();

  /* A burst: five or more of one person's bills inside three hours. Real
     bills are hours apart; a seeded burst is minutes. */
  const bySeller = new Map<string, typeof all>();
  for (const s of all) {
    const k = String(s.salesman);
    bySeller.set(k, [...(bySeller.get(k) ?? []), s]);
  }
  const bursts = [...bySeller.values()].filter((b) => {
    if (b.length < 5) return false;
    const span = new Date(b[b.length - 1]!.soldAt).getTime() - new Date(b[0]!.soldAt).getTime();
    return span <= 3 * 3600_000;
  });
  if (bursts.length === 0) return 0;

  const now = new Date();
  const toYesterday = DHAKA_HOUR(now) < 12;
  const dayKeyTo = toYesterday ? shiftDay(today, -1) : today;
  const key = parseDayKey(dayKeyTo);
  const open = instantFromDayKeyAndTime(key, '09:00').getTime();
  const close = toYesterday ? instantFromDayKeyAndTime(key, '23:00').getTime() : now.getTime() - 10 * 60_000;
  if (close <= open) return 0;

  let moved = 0;
  for (const [n, sales] of bursts.entries()) {
    /* Each counter opens a little after the last, so the times do not stack. */
    const from = open + n * 25 * 60_000;
    for (let i = 0; i < sales.length; i++) {
      const s = sales[i]!;
      const wobble = (((i * 7919 + n * 131) % 13) - 6) / (sales.length * 20);
      const at = timeBetween(from, close, (i + 0.5) / sales.length + wobble);
      await SaleModel.updateOne({ _id: s._id }, { $set: { soldAt: at, dayKey: dayKeyTo } });
      await Promise.all([
        StockLedgerModel.updateMany({ 'ref.id': s._id }, { $set: { createdAt: at } }, { timestamps: false }),
        CustomerLedgerModel.updateMany({ 'ref.id': s._id }, { $set: { createdAt: at } }, { timestamps: false }),
        AuditLogModel.updateMany({ 'target.id': s._id }, { $set: { createdAt: at } }, { timestamps: false }),
      ]);
      moved++;
    }

    /* The shift that took them runs over the same hours. */
    const times = sales.map((_, i) => timeBetween(from, close, (i + 0.5) / sales.length).getTime());
    for (const id of [...new Set(sales.map((s) => String(s.shift ?? '')).filter(Boolean))]) {
      const sh = await ShiftModel.findById(id);
      if (!sh) continue;
      sh.openedAt = new Date(from - 15 * 60_000);
      const end = new Date(Math.max(...times) + 20 * 60_000);
      if (toYesterday && !sh.closedAt) {
        sh.closedAt = end;
        sh.countedCash = sh.expectedCash;
        sh.difference = 0;
      } else if (sh.closedAt) {
        sh.closedAt = end < now ? end : new Date(now.getTime() - 60_000);
      }
      await sh.save({ timestamps: false });
    }
  }

  await renumberDay(actor, dayKeyTo);
  return moved;
}

/** A day's pad numbered again in the order its bills were rung up. */
async function renumberDay(actor: shop.Actor, dayKey: string) {
  const bills = await SaleModel.find({ organization: actor.org, dayKey }).sort({ soldAt: 1 }).lean();
  const dom = Number(dayKey.slice(8, 10));
  /* Out of the way first: the unique index is per day, and the new numbers
     are the old ones shuffled. */
  await Promise.all(bills.map((b) => SaleModel.updateOne({ _id: b._id }, { $set: { billNo: `tmp-${b._id}` } })));
  for (let i = 0; i < bills.length; i++) {
    const b = bills[i]!;
    const billNo = `${dom}-${String(i + 1).padStart(4, '0')}`;
    await SaleModel.updateOne({ _id: b._id }, { $set: { billNo } });
    if (billNo === b.billNo) continue;
    await Promise.all([
      CustomerLedgerModel.updateMany({ 'ref.id': b._id }, { $set: { reference: billNo } }, { timestamps: false }),
      CashMoveModel.updateMany({ sale: b._id }, { $set: { reference: billNo } }),
      AuditLogModel.updateMany(
        { 'target.id': b._id },
        { $set: { 'target.label': `${billNo} · ৳${b.total}` } },
        { timestamps: false },
      ),
    ]);
  }
}

/**
 * Ninety days of the counter before the seed ran.
 *
 * Written straight in rather than rung up through the till: nine thousand
 * bills through the till would take the shelves to nothing and the seed an
 * hour. The shelves are what the deliveries left; these are the months'
 * takings, each bill priced at its lot's MRP and costed at what the lot cost,
 * so the reports, the accounts and the margin read like a shop that has been
 * trading — nine to thirteen thousand taka a day, less on a Friday, more in
 * the first week of the month when salaries are paid.
 */
export async function seedSalesHistory(actor: shop.Actor, days = 90) {
  const org = new Types.ObjectId(actor.org);
  const today = formatDayKey(parseDayKey());
  const since = shiftDay(today, -days);
  const already = await SaleModel.countDocuments({
    organization: org,
    dayKey: { $gte: since, $lt: shiftDay(today, -2) },
  });
  if (already > days * 20) return 0;

  const lots = await StockBatchModel.aggregate<{
    _id: Types.ObjectId;
    product: Types.ObjectId;
    batchNo: string;
    costPerPiece: number;
    mrpPerPiece: number;
    name: string;
  }>([
    { $match: { organization: org, qtyOnHand: { $gt: 0 } } },
    { $sort: { expiry: 1 } },
    { $group: { _id: '$product', lot: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$lot' } },
    { $lookup: { from: 'shopproducts', localField: 'product', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $match: { 'p.deletedAt': null, 'p.controlled': { $ne: true }, 'p.mrpPerPiece': { $gt: 0 } } },
    {
      $project: {
        product: 1,
        batchNo: 1,
        costPerPiece: 1,
        mrpPerPiece: '$p.mrpPerPiece',
        name: { $trim: { input: { $concat: ['$p.name', ' ', { $ifNull: ['$p.strength', ''] }] } } },
      },
    },
  ]);
  if (lots.length < 20) return 0;
  /* The everyday sellers come up far more often than the rest. */
  const common = lots.filter((l) => l.mrpPerPiece <= 15);
  const people = await UserModel.find({
    organization: org,
    isActive: true,
    role: { $in: ['salesman', 'pharmacist'] },
  })
    .select('_id name')
    .lean();
  const sellers = [{ _id: new Types.ObjectId(actor.id), name: actor.name }, ...people];

  let state = 12345;
  const rnd = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const METHODS = ['cash', 'cash', 'cash', 'cash', 'cash', 'bkash', 'bkash', 'nagad', 'card'];
  const round = (v: number) => Math.round(v * 100) / 100;

  let made = 0;
  for (let d = days; d >= 1; d--) {
    const dayKey = shiftDay(today, -d);
    const key = parseDayKey(dayKey);
    const weekday = key.getUTCDay();
    const dom = Number(dayKey.slice(8, 10));
    const target = (9000 + rnd() * 4000) * (weekday === 5 ? 0.7 : 1) * (dom <= 7 ? 1.15 : 1);
    const open = instantFromDayKeyAndTime(key, '09:00').getTime();
    const close = instantFromDayKeyAndTime(key, '23:00').getTime();

    const top = await SaleModel.findOne({ organization: org, dayKey })
      .sort({ billNo: -1 })
      .select('billNo')
      .lean();
    let seq = top ? Number(String(top.billNo).split('-')[1] ?? 0) || 0 : 0;

    const bills: Record<string, unknown>[] = [];
    let sum = 0;
    while (sum < target) {
      const count = 1 + Math.floor(rnd() * rnd() * 4);
      const picked = new Map<string, (typeof lots)[number]>();
      for (let k = 0; k < count; k++) {
        const from = rnd() < 0.7 && common.length ? common : lots;
        const lot = from[Math.floor(rnd() * from.length)]!;
        picked.set(String(lot.product), lot);
      }
      const lines = [...picked.values()].map((lot) => {
        const qty = [2, 4, 5, 6, 10, 10, 14, 20][Math.floor(rnd() * 8)]!;
        return {
          product: lot.product,
          batch: lot._id,
          name: lot.name,
          batchNo: lot.batchNo ?? '',
          qtyPieces: qty,
          pricePerPiece: lot.mrpPerPiece,
          costPerPiece: lot.costPerPiece ?? 0,
          discount: 0,
          lineTotal: round(qty * lot.mrpPerPiece),
          vat: 0,
          returnedPieces: 0,
        };
      });
      const subTotal = round(lines.reduce((n, l) => n + l.lineTotal, 0));
      if (subTotal <= 0) continue;
      /* The loose change off a bigger bill, the way a counter rounds. */
      const discount = subTotal > 300 && rnd() < 0.25 ? round(subTotal % 10) : 0;
      const total = round(subTotal - discount);
      const cost = round(lines.reduce((n, l) => n + l.qtyPieces * l.costPerPiece, 0));
      const method = METHODS[Math.floor(rnd() * METHODS.length)]!;
      const tendered = method === 'cash' ? Math.ceil(total / 50) * 50 : 0;
      /* Busier in the evening: half the bills bunch after four o'clock. */
      const r = rnd() < 0.55 ? 0.45 + 0.55 * Math.sqrt(rnd()) : rnd();
      const seller = sellers[Math.floor(rnd() * sellers.length)]!;
      bills.push({
        organization: org,
        dayKey,
        soldAt: timeBetween(open, close, r),
        salesman: seller._id,
        salesmanName: seller.name,
        customerName: '',
        customerPhone: '',
        lines,
        subTotal,
        discount,
        vat: 0,
        vatPercent: 0,
        total,
        cost,
        payments: [{ method, amount: total, reference: '' }],
        paid: total,
        cashTendered: tendered,
        changeGiven: tendered ? round(tendered - total) : 0,
        due: 0,
        status: 'completed',
      });
      sum += total;
    }
    bills.sort((a, b) => (a.soldAt as Date).getTime() - (b.soldAt as Date).getTime());
    for (const b of bills) b.billNo = `${dom}-${String(++seq).padStart(4, '0')}`;
    await SaleModel.insertMany(bills, { ordered: false });
    made += bills.length;
  }
  logger.info({ bills: made, days }, 'Seed: the counter has been trading a while');
  return made;
}

/**
 * "Signed in never" beside somebody with a week of bills is the Staff page
 * contradicting the Activity page. Each person's last sign-in on the trail is
 * put on their account, where the Staff page reads it.
 */
export async function stampLastSignIn(actor: shop.Actor) {
  const last = await AuditLogModel.aggregate<{ _id: Types.ObjectId; at: Date }>([
    { $match: { organization: new Types.ObjectId(actor.org), action: 'auth.login' } },
    { $group: { _id: '$actor', at: { $max: '$createdAt' } } },
  ]);
  for (const l of last) {
    await UserModel.updateOne(
      { _id: l._id, $or: [{ lastLoginAt: null }, { lastLoginAt: { $lt: l.at } }] },
      { $set: { lastLoginAt: l.at } },
    );
  }
  return last.length;
}
