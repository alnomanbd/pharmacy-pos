import { OrganizationModel, UserModel, ShopProductModel, MedicineModel } from '../models/index.js';
import * as shop from '../services/shop.service.js';
import * as till from '../services/till.service.js';
import { logger } from '../utils/logger.js';
import {
  seedActivity,
  seedBin,
  seedBusyShop,
  seedSalesHistory,
  settleSeededBills,
  seedCashMoves,
  seedCounters,
  seedExpenses,
  seedIncome,
  seedMonthClose,
} from './shopBusy.js';

/**
 * A demo pharmacy with something on the shelves.
 *
 * An empty shop demonstrates nothing: the interesting screens — what is owed,
 * what expires, what the margin was — are all blank until stock has been bought
 * and sold. This puts a fortnight of an ordinary Dhaka shop into the demo
 * account so the product can be looked at rather than imagined.
 *
 * Written through the services rather than the models, so the demo obeys the
 * same rules a customer does: bonus spread into cost, batches, FEFO, ledger
 * rows. If a rule changes and this stops making sense, that is worth knowing.
 *
 * Idempotent: run it twice and it adds a second fortnight of sales, not a
 * second shop.
 */

/** Brands a Dhaka pharmacy actually moves, and how they are packed. */
const SHELF: { q: string; piecesPerStrip: number; stripsPerBox: number; mrp: number }[] = [
  { q: 'Napa', piecesPerStrip: 10, stripsPerBox: 10, mrp: 1.2 },
  { q: 'Seclo', piecesPerStrip: 10, stripsPerBox: 6, mrp: 7 },
  { q: 'Monas', piecesPerStrip: 10, stripsPerBox: 3, mrp: 18 },
  { q: 'Maxpro', piecesPerStrip: 10, stripsPerBox: 5, mrp: 7 },
  { q: 'Fexo', piecesPerStrip: 10, stripsPerBox: 5, mrp: 9 },
  { q: 'Ace', piecesPerStrip: 10, stripsPerBox: 10, mrp: 1.2 },
  { q: 'Amodis', piecesPerStrip: 10, stripsPerBox: 5, mrp: 6 },
  { q: 'Sergel', piecesPerStrip: 10, stripsPerBox: 5, mrp: 7 },
];

const COMPANIES: { name: string; kind: 'company' | 'distributor' | 'shop'; rep: string; day: number; opening: number }[] = [
  { name: 'Square Depot, Mirpur', kind: 'company', rep: 'Jasim Uddin', day: 0, opening: 8400 },
  { name: 'Mitford Wholesale (Rahim Traders)', kind: 'distributor', rep: 'Rahim Mia', day: 2, opening: 5200 },
  { name: 'Al-Madina Pharmacy (next door)', kind: 'shop', rep: '', day: 5, opening: 0 },
];

const RACKS: { name: string; rule: 'form' | 'company' | 'manual'; match: string[] }[] = [
  { name: 'R1 — Tablets', rule: 'form', match: ['tablet', 'capsule'] },
  { name: 'R2 — Syrups', rule: 'form', match: ['syrup', 'suspension', 'drops'] },
  { name: 'R3 — Ointments', rule: 'form', match: ['ointment', 'cream', 'gel'] },
  { name: 'Fridge', rule: 'manual', match: [] },
];

export async function seedShopDemo() {
  /* Every active shop — on a fresh database that is the one `demo-shop` made. */
  const orgs = await OrganizationModel.find({ status: 'active' }).lean();
  if (orgs.length === 0) {
    logger.warn('Seed: no shop yet — run seed:demo-shop first');
    return { skipped: true };
  }

  const totals = { products: 0, suppliers: 0, deliveries: 0, sales: 0 };
  for (const org of orgs) {
    const one = await seedOneShop(org);
    totals.products += one.products ?? 0;
    totals.suppliers += one.suppliers ?? 0;
    totals.deliveries += one.deliveries ?? 0;
    totals.sales += one.sales ?? 0;
  }
  return totals;
}

async function seedOneShop(org: { _id: unknown; name: string }) {
  const owner = await UserModel.findOne({
    organization: org._id,
    role: 'admin',
  })
    .sort({ createdAt: 1 })
    .lean();
  if (!owner) return { skipped: true };

  const actor: shop.Actor = { org: String(org._id), id: String(owner._id), name: owner.name };

  /* ---- the shelves ---- */
  for (const r of RACKS) {
    await shop.createRack(actor, r).catch(() => undefined);
  }

  /* ---- who they buy from ---- */
  const suppliers: Record<string, string> = {};
  for (const c of COMPANIES) {
    const made = await shop
      .createSupplier(actor, {
        name: c.name,
        kind: c.kind,
        repName: c.rep,
        repVisitDay: c.day,
        openingBalance: c.opening,
      } as never)
      .catch(() => null);
    if (made) suppliers[c.name] = String((made as { _id: unknown })._id);
  }
  if (Object.keys(suppliers).length === 0) {
    const existing = await shop.listSuppliers(actor);
    for (const s of existing) suppliers[s.name] = String(s._id);
  }

  /* ---- what they sell ---- */
  const productIds: string[] = [];
  for (const item of SHELF) {
    /* Exact brand first: `^Napa` also matches NAPACHE, which is a different
       medicine at a different strength — and a demo that quietly stocks the
       wrong brand is exactly the bug the counter screen exists to catch. */
    const already =
      (await ShopProductModel.findOne({
        organization: org._id,
        name: new RegExp(`^${item.q}$`, 'i'),
      }).lean()) ??
      (await ShopProductModel.findOne({
        organization: org._id,
        name: new RegExp(`^${item.q} `, 'i'),
      }).lean());
    if (already) {
      productIds.push(String(already._id));
      continue;
    }

    const med =
      (await MedicineModel.findOne({ brandName: new RegExp(`^${item.q}$`, 'i') }).lean()) ??
      (await MedicineModel.findOne({ brandName: new RegExp(`^${item.q} `, 'i') }).lean());
    if (!med) continue;

    const made = await shop
      .createProduct(actor, {
        medicineId: String(med._id),
        piecesPerStrip: item.piecesPerStrip,
        stripsPerBox: item.stripsPerBox,
        mrpPerPiece: item.mrp,
        reorderLevel: item.piecesPerStrip * 5,
      })
      .catch(() => null);
    if (made) productIds.push(String((made as { _id: unknown })._id));
  }

  /* ---- a couple of deliveries, with bonus on some lines ---- */
  const supplierIds = Object.values(suppliers);
  let deliveries = 0;
  for (let i = 0; i < Math.min(2, supplierIds.length); i++) {
    const lines = productIds.slice(i * 4, i * 4 + 4).map((productId, n) => ({
      productId,
      batchNo: `B-${String(7000 + i * 50 + n)}`,
      /* A spread of dates, so the expiry page has something in each bucket. */
      expiry: new Date(Date.now() + (60 + n * 120) * 86_400_000).toISOString(),
      boxes: 1,
      bonusStrips: n % 2 === 0 ? 1 : 0,
      tradePricePerPiece: 0.72,
    }));
    if (lines.length === 0) continue;

    await shop
      .createPurchase(actor, {
        supplierId: supplierIds[i],
        invoiceNo: `INV-${2600 + i}`,
        paidAmount: i === 0 ? 200 : 0,
        lines,
      })
      .catch((err) => logger.warn({ err }, 'Seed: demo delivery failed'));
    deliveries++;
  }

  /* ---- and a day at the counter ---- */
  await till.startShift(actor, { openingFloat: 500, terminal: 'Counter 1' });

  let sales = 0;
  const sellable = await till.searchForSale(actor, 'a');
  for (let i = 0; i < Math.min(4, sellable.length); i++) {
    const p = sellable[i];
    const qty = [4, 10, 6, 20][i % 4];
    const amount = Math.round(qty * p.mrpPerPiece);
    await till
      .createSale(actor, {
        lines: [{ productId: p._id, qtyPieces: qty, pricePerPiece: p.mrpPerPiece }],
        payments:
          i === 3
            ? [{ method: 'cash', amount: Math.round(amount / 2) }]
            : [{ method: i % 2 ? 'bkash' : 'cash', amount }],
        /* One of them goes on the baki khata, because every shop has one. */
        customerName: i === 3 ? 'Kabir Bhai (tea stall)' : undefined,
        customerPhone: i === 3 ? '01799000222' : undefined,
      })
      .catch((err) => logger.warn({ err }, 'Seed: demo sale failed'));
    sales++;
  }

  logger.info({ shop: org.name, products: productIds.length }, 'Seed: shop stocked');

  /* And then the rest of a real shop, so every list has enough on it to need
     its search, its filters and its pager. */
  await seedBusyShop(actor).catch((err) => logger.warn({ err }, 'Seed: busy shop failed'));
  /* Three months of trading behind the bills the seed just rang up. */
  await seedSalesHistory(actor).catch((err) => logger.warn({ err }, 'Seed: sales history failed'));
  await seedExpenses(actor).catch((err) => logger.warn({ err }, 'Seed: expenses failed'));
  await seedIncome(actor).catch((err) => logger.warn({ err }, 'Seed: income failed'));
  await seedCounters(actor).catch((err) => logger.warn({ err }, 'Seed: counters failed'));
  /* After every counter has rung its bills: each burst spread over the day. */
  await settleSeededBills(actor).catch((err) => logger.warn({ err }, 'Seed: settling bills failed'));
  await seedBin(actor).catch((err) => logger.warn({ err }, 'Seed: bin failed'));
  await seedCashMoves(actor).catch((err) => logger.warn({ err }, 'Seed: cash moves failed'));
  await seedMonthClose(actor).catch((err) => logger.warn({ err }, 'Seed: month close failed'));
  /* Last, so the trail covers everything above. */
  await seedActivity(actor).catch((err) => logger.warn({ err }, 'Seed: activity failed'));
  return { products: productIds.length, suppliers: supplierIds.length, deliveries, sales };
}
