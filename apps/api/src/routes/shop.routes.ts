import { attachBranch, scopeOf } from '../services/branchScope.service.js';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { storage, keys, assertAllowed } from '../services/storage.service.js';
import { ShopSettingsModel, OrganizationModel } from '../models/index.js';
import { badRequest, forbidden } from '../utils/AppError.js';
import * as shop from '../services/shop.service.js';
import * as staff from '../services/shopStaff.service.js';
import * as reports from '../services/shopReport.service.js';
import * as reportPdf from '../services/shopReportPdf.service.js';
import { pdfLang } from '../services/pdfWords.js';
import * as orders from '../services/shopOrder.service.js';
import * as exports from '../services/shopExport.service.js';
import * as remind from '../services/shopRemind.service.js';
import * as invoices from '../services/shopInvoicePdf.service.js';
import * as counts from '../services/stockCount.service.js';
import * as counters from '../services/counters.service.js';
import * as transfers from '../services/stockTransfer.service.js';
import * as dataImport from '../services/dataImport.service.js';
import * as push from '../services/push.service.js';
import * as roles from '../services/accessRole.service.js';
import { trending as trendingReport } from '../services/shopTrending.service.js';
import { productMedicineInfo } from '../services/medicineInfo.service.js';
import { address as addressField } from '../validators/auth.validator.js';
import type { ShopPermission } from '../types/shopPermissions.js';
import * as online from '../services/onlineOrder.service.js';
import * as wallet from '../services/wallet.service.js';
import * as saleAdmin from '../services/saleAdmin.service.js';
import * as bin from '../services/shopTrash.service.js';
import * as expenses from '../services/shopExpense.service.js';
import * as incomes from '../services/shopIncome.service.js';
import { accounts } from '../services/shopAccounts.service.js';
import * as cash from '../services/shopCash.service.js';
import { listShopActivity } from '../services/shopActivity.service.js';
import { shopActivity } from '../middlewares/shopActivity.js';
import * as control from '../services/shopControl.service.js';
import * as controlPdf from '../services/shopControlPdf.service.js';
import { requireAuth, requireRole, requireWritableTenant, requireShopPermission, shopPathGate } from '../middlewares/auth.js';
import { SHOP_ROLES } from '../types/roles.js';
import {
  ORDER_STATUS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  CASH_MOVE_KINDS,
  type OrderStatus,
} from '../models/index.js';
import { validate } from '../middlewares/validate.js';
import { csvFilename } from '../utils/csv.js';
import { bdMobile, BD_MOBILE_MESSAGE } from '../utils/phone.js';
import { ok, created } from '../utils/response.js';
import medicineRequestRoutes from './shopMedicineRequest.routes.js';
import supportRoutes from './shopSupport.routes.js';
import announcementRoutes from './shopAnnouncement.routes.js';
import helpRoutes from './shopHelp.routes.js';
import branchRoutes from './shopBranch.routes.js';
import * as onboarding from '../services/onboarding.service.js';

/**
 * The shop's own API.
 *
 * The shop's back room: stock, deliveries, suppliers, write-offs, reports.
 * `requireRole` asks whether this *person* may see what things cost — the owner
 * and the pharmacist may, the salesman may not. Mounted at `/api/shop`.
 */
const router = Router();

/*
 * Everything in this file is the shop's *back* room — stock, deliveries,
 * companies, write-offs — so it is the admin set. The till is mounted
 * separately in `till.routes.ts` and admits the salesman, who may sell and may
 * not see what anything cost.
 */
/* Any shop role may ask for a missing medicine, so these sit ahead of the gate. */
router.use('/medicine-requests', medicineRequestRoutes);
/* Support too — and without the read-only lock: a lapsed shop has to be able to ask why. */
router.use('/support', supportRoutes);
router.use('/announcements', announcementRoutes);
router.use('/help', helpRoutes);
router.use('/branches', branchRoutes);

router.use(requireAuth, requireWritableTenant, requireRole(...SHOP_ROLES), attachBranch);

/*
 * Who may do what in the back room, by path — the shop's roles decide
 * (types/shopPermissions.ts). Each path: what reading it takes, and what
 * changing it takes. A path not listed needs `settings.manage`.
 */
router.use(
  shopPathGate([
    { path: '/onboarding', read: null, write: null },
    { path: '/roles', read: 'staff.manage', write: 'staff.manage' },
    { path: '/staff', read: 'staff.manage', write: 'staff.manage' },
    { path: '/suppliers', read: 'purchases.manage', write: 'purchases.manage' },
    { path: '/purchases', read: 'purchases.manage', write: 'purchases.manage' },
    { path: '/orders', read: 'purchases.manage', write: 'purchases.manage' },
    { path: '/products', read: 'stock.view', write: 'stock.manage' },
    { path: '/racks', read: 'stock.view', write: 'stock.manage' },
    { path: '/stock', read: 'stock.view', write: 'stock.manage' },
    { path: '/counts', read: 'stock.view', write: 'stock.manage' },
    { path: '/transfers', read: 'stock.view', write: 'transfers.manage' },
    { path: '/import/stock', read: 'stock.manage', write: 'stock.manage' },
    { path: '/import/customers', read: 'customers.manage', write: 'customers.manage' },
    { path: '/customers', read: 'customers.manage', write: 'customers.manage' },
    { path: '/reports', read: 'reports.view', write: 'reports.view' },
    { path: '/control', read: 'reports.view', write: 'reports.view' },
    { path: '/push', read: 'reports.view', write: 'reports.view' },
    { path: '/accounts', read: 'accounts.view', write: 'accounts.manage' },
    { path: '/expenses', read: 'accounts.view', write: 'accounts.manage' },
    { path: '/incomes', read: 'accounts.view', write: 'accounts.manage' },
    { path: '/cash-moves', read: 'accounts.view', write: 'accounts.manage' },
    { path: '/months', read: 'accounts.view', write: 'accounts.close' },
    { path: '/export', read: 'data.export', write: 'data.export' },
    { path: '/sales', read: 'sales.view_all', write: 'sales.edit' },
    { path: '/activity', read: 'audit.view', write: 'audit.view' },
    /* Binning and restoring are checked by what is binned (below); reading the bin is the trail's. */
    { path: '/trash', read: 'audit.view', write: null },
    { path: '/settings', read: 'settings.manage', write: 'settings.manage' },
    { path: '/invoice', read: 'settings.manage', write: 'settings.manage' },
    { path: '/counters', read: 'settings.manage', write: 'settings.manage' },
    { path: '/wallets', read: 'settings.manage', write: 'settings.manage' },
    { path: '/online-orders', read: 'settings.manage', write: 'settings.manage' },
  ]),
);

/* Every change that succeeds goes on the owner's Activity page. */
router.use(shopActivity('shop'));

/*
 * The getting-started checklist: read from what the shop has done, never
 * ticked by hand. The owner's alone — setting the shop up is their job, and a
 * pharmacist hiding it would hide it from the owner too.
 */
router.get('/onboarding', requireRole('admin'), async (req, res, next) => {
  try {
    ok(res, await onboarding.setupOf(req.user!.org!));
  } catch (err) {
    next(err);
  }
});
router.post('/onboarding/dismiss', requireRole('admin'), async (req, res, next) => {
  try {
    ok(res, await onboarding.setDismissed(req.user!.org!, req.body?.dismissed !== false));
  } catch (err) {
    next(err);
  }
});

const handle =
  <T>(run: (req: Request) => Promise<T>, message?: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await run(req), message);
    } catch (err) {
      next(err);
    }
  };

const make =
  <T>(run: (req: Request) => Promise<T>, message?: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      created(res, await run(req), message);
    } catch (err) {
      next(err);
    }
  };

/** Who is asking, in the shape every service call here takes. */
const actorOf = (req: Request): shop.Actor => ({
  org: req.user!.org!,
  id: req.user!.id,
  name: req.user!.name,
  branch: scopeOf(req),
});

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (v === undefined ? undefined : Number(v));

/* ------------------------------------------------------------- companies -- */

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /* Company depot, wholesaler (Mitford and the like), another shop, or
     something else. See the model for why it matters. */
  kind: z.enum(['company', 'distributor', 'shop', 'other']).optional(),
  repPhone: z.string().trim().max(40).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  repName: z.string().trim().max(120).optional(),
  /** 0 = Sunday, matching the rest of the app. Null is "nobody visits". */
  repVisitDay: z.number().int().min(0).max(6).nullable().optional(),
  openingBalance: z.number().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(2000).optional(),
});

router.get(
  '/suppliers',
  handle((req) => shop.listSuppliers(actorOf(req), { q: str(req.query.q) })),
);

router.post(
  '/suppliers',
  validate(supplierSchema),
  make((req) => shop.createSupplier(actorOf(req), req.body), 'Company added'),
);

router.patch(
  '/suppliers/:id',
  validate(supplierSchema.partial()),
  handle((req) => shop.updateSupplier(actorOf(req), req.params.id, req.body), 'Saved'),
);

/** The statement: every row in date order, with a running balance. */
router.get(
  '/suppliers/:id/ledger',
  handle((req) =>
    shop.supplierStatement(actorOf(req), req.params.id, {
      from: str(req.query.from),
      to: str(req.query.to),
    }),
  ),
);

router.post(
  '/suppliers/:id/payments',
  validate(
    z.object({
      amount: z.number().positive().max(100_000_000),
      method: z.string().trim().max(40).optional(),
      reference: z.string().trim().max(80).optional(),
      note: z.string().trim().max(500).optional(),
      at: z.string().optional(),
    }),
  ),
  make((req) => shop.paySupplier(actorOf(req), req.params.id, req.body), 'Payment recorded'),
);

/* -------------------------------------------------------------- settings -- */

/**
 * The shop's own particulars, and how it prints.
 *
 * Readable by anyone at a counter — the receipt is printed from the browser, so
 * the till needs the header and the paper width — and writable only by the
 * people who run the shop, which is why the write lives in this router and the
 * read is duplicated in the counter's.
 */
const settingsSchema = z.object({
  shopName: z.string().trim().max(120).optional(),
  shopNameBn: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(60).optional(),
  drugLicenceNo: z.string().trim().max(60).optional(),
  footer: z.string().trim().max(240).optional(),
  footerBn: z.string().trim().max(240).optional(),
  paperSize: z.enum(['80', '58', 'custom']).optional(),
  /* Millimetres. 40 is narrower than any roll sold here and 210 is A4 — past
     either, somebody has typed the wrong number. */
  paperWidthMm: z.number().int().min(40).max(210).optional(),
  autoPrint: z.boolean().optional(),
  confirmSale: z.boolean().optional(),
  copies: z.number().int().min(1).max(3).optional(),
  printBangla: z.boolean().optional(),
  showSavings: z.boolean().optional(),
  /* Zero is off, which is the answer for a shop selling only medicine. */
  vatPercent: z.number().min(0).max(100).optional(),
  vatOnMedicine: z.boolean().optional(),
  vatBin: z.string().trim().max(40).optional(),
  loyalty: z
    .object({
      enabled: z.boolean().optional(),
      spendPerPoint: z.number().min(1).max(100_000).optional(),
      pointValue: z.number().min(0).max(10_000).optional(),
      minRedeem: z.number().int().min(0).max(1_000_000).optional(),
      maxRedeemPercent: z.number().min(0).max(100).optional(),
    })
    .optional(),
  /* The A4 sheet is its own document with its own look. A colour is checked
     here rather than in the renderer, because an unparseable one reaches pdfkit
     as a thrown error halfway through a print. */
  invoice: z
    .object({
      paper: z.enum(['A4', 'A5']).optional(),
      accent: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, 'A colour looks like #065f46')
        .optional(),
      showLogo: z.boolean().optional(),
      showQr: z.boolean().optional(),
      showBatch: z.boolean().optional(),
      signatureLabel: z.string().trim().max(60).optional(),
      terms: z.string().trim().max(600).optional(),
      style: z.enum(['dawai', 'image', 'pad']).optional(),
      padTopMm: z.number().min(0).max(120).optional(),
      padBottomMm: z.number().min(0).max(80).optional(),
    })
    .optional(),
});

/* ------------------------------------------------------------------ push -- */

/**
 * Alerts on the owner's phone — see push.service. The phone is named by its
 * push address, which only that phone's browser knows.
 */
const pushKinds = z.array(z.enum(['takings', 'stock', 'orders'])).max(3);
const endpoint = z.object({ endpoint: z.string().url().max(1000) });

router.get(
  '/push/key',
  handle(() => push.publicKey()),
);

router.post(
  '/push/subscribe',
  validate(
    z.object({
      subscription: z.object({
        endpoint: z.string().url().max(1000),
        keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
      }),
      kinds: pushKinds.optional(),
      device: z.string().max(160).optional(),
    }),
  ),
  handle((req) => push.subscribe(actorOf(req), req.body)),
);

router.post(
  '/push/me',
  validate(endpoint),
  handle((req) => push.mine(actorOf(req), req.body.endpoint)),
);

router.patch(
  '/push/kinds',
  validate(endpoint.extend({ kinds: pushKinds })),
  handle((req) => push.setKinds(actorOf(req), req.body.endpoint, req.body.kinds)),
);

router.post(
  '/push/unsubscribe',
  validate(endpoint),
  handle((req) => push.unsubscribe(actorOf(req), req.body.endpoint)),
);

router.post(
  '/push/test',
  validate(endpoint),
  handle((req) => push.sendTest(actorOf(req), req.body.endpoint)),
);

/* ------------------------------------------------------ medicine figures -- */

/**
 * Whether this shop is counted in the anonymous medicine figures — see
 * medicineDemand.service and the Terms. Counted unless switched off. The
 * shop's address — division, district, upazila, street — is set here too:
 * the district is what it is counted by, and this is the one place an owner
 * says where the shop is, apart from the receipt's own address line.
 */
const ADDRESS_KEYS = ['district', 'division', 'upazila', 'street', 'area', 'postalCode'] as const;

router.get(
  '/data-sharing',
  handle(async (req) => {
    const o = await OrganizationModel.findById(actorOf(req).org).select('dataSharing address').lean();
    const addr = (o?.address ?? {}) as Record<string, string | undefined>;
    return {
      counted: !o?.dataSharing?.optedOut,
      address: Object.fromEntries(ADDRESS_KEYS.map((k) => [k, addr[k] ?? ''])),
      changedAt: o?.dataSharing?.changedAt ?? null,
      changedByName: o?.dataSharing?.changedByName ?? '',
    };
  }),
);
router.patch(
  '/data-sharing',
  validate(z.object({ counted: z.boolean().optional(), address: addressField.optional() })),
  handle(async (req) => {
    const a = actorOf(req);
    const set: Record<string, unknown> = {};
    if (req.body.counted !== undefined) {
      Object.assign(set, { 'dataSharing.optedOut': !req.body.counted, 'dataSharing.changedAt': new Date(), 'dataSharing.changedByName': a.name });
    }
    // Checked and made official by the validator: division from the district, upazila of that district.
    for (const [k, v] of Object.entries((req.body.address ?? {}) as Record<string, string | undefined>)) {
      if (v !== undefined) set[`address.${k}`] = v;
    }
    if (Object.keys(set).length) await OrganizationModel.updateOne({ _id: a.org }, { $set: set });
    return { counted: req.body.counted };
  }, 'Saved'),
);

/* ---------------------------------------------------------------- import -- */

/**
 * Moving in from a spreadsheet — see dataImport.service. The screen reads the
 * file and sends its rows, a thousand at a time, first to check and then to
 * write.
 */
const importSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(1000),
  dryRun: z.boolean().optional(),
});

router.post(
  '/import/stock',
  validate(importSchema),
  handle((req) => dataImport.importStock(actorOf(req), req.body.rows, { dryRun: req.body.dryRun })),
);

router.post(
  '/import/customers',
  validate(importSchema),
  handle((req) => dataImport.importCustomers(actorOf(req), req.body.rows, { dryRun: req.body.dryRun })),
);

router.get(
  '/settings',
  handle((req) => shop.getSettings(actorOf(req))),
);

router.patch(
  '/settings',
  validate(settingsSchema),
  handle((req) => shop.updateSettings(actorOf(req), req.body), 'Saved'),
);

/* ----------------------------------------------------------------- racks -- */

/**
 * The shelves.
 *
 * Every pharmacy arranges them differently — by what the medicine is, by which
 * company made it, or by nothing anybody could write down — so the shelves are
 * rows with an optional rule rather than a fixed list. The rule is a suggestion
 * when an item is added; where the box actually sits is whatever somebody says
 * it is.
 */
const rackSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rule: z.enum(['form', 'company', 'manual']).optional(),
  match: z.array(z.string().trim().max(60)).max(30).optional(),
  note: z.string().trim().max(240).optional(),
  isCold: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

router.get(
  '/racks',
  handle((req) => shop.listRacks(actorOf(req))),
);

router.post(
  '/racks',
  validate(rackSchema),
  make((req) => shop.createRack(actorOf(req), req.body), 'Rack added'),
);

router.patch(
  '/racks/:id',
  validate(rackSchema.partial()),
  handle((req) => shop.updateRack(actorOf(req), req.params.id, req.body), 'Saved'),
);

/* -------------------------------------------------------------- products -- */

const productSchema = z.object({
  /** From the shared catalogue, or nothing for the soap and the syringes. */
  medicineId: z.string().trim().max(40).optional(),
  name: z.string().trim().max(160).optional(),
  genericName: z.string().trim().max(160).optional(),
  companyName: z.string().trim().max(120).optional(),
  strength: z.string().trim().max(60).optional(),
  dosageForm: z.string().trim().max(60).optional(),
  isMedicine: z.boolean().optional(),
  piecesPerStrip: z.number().int().min(1).max(1000).optional(),
  stripsPerBox: z.number().int().min(1).max(1000).optional(),
  mrpPerPiece: z.number().min(0).max(1_000_000).optional(),
  /* A shelf that exists, or a label typed by a shop with no shelves set up. */
  rackId: z.string().trim().max(40).optional(),
  rackLabel: z.string().trim().max(40).optional(),
  reorderLevel: z.number().int().min(0).max(1_000_000).optional(),
  prescriptionOnly: z.boolean().optional(),
  controlled: z.boolean().optional(),
  /* Text, not a number: a leading zero is part of the code. */
  barcode: z.string().trim().max(64).optional(),
});

router.get(
  '/products',
  handle((req) =>
    shop.listProducts(actorOf(req), {
      q: str(req.query.q),
      lowStock: req.query.lowStock === 'true',
      status: ['low', 'out', 'expiring'].includes(String(req.query.status))
        ? (req.query.status as 'low' | 'out' | 'expiring')
        : undefined,
      sort: ['name', 'onHand', 'expiry', 'value'].includes(String(req.query.sort))
        ? (req.query.sort as 'name' | 'onHand' | 'expiry' | 'value')
        : undefined,
      rackId: str(req.query.rackId),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.post(
  '/products',
  validate(productSchema),
  make((req) => shop.createProduct(actorOf(req), req.body), 'Added to your list'),
);

router.patch(
  '/products/:id',
  validate(productSchema.partial()),
  handle((req) => shop.updateProduct(actorOf(req), req.params.id, req.body), 'Saved'),
);

/** Every lot of one product, soonest expiry first. */
router.get(
  '/products/:id/batches',
  handle((req) => shop.productBatches(actorOf(req), req.params.id)),
);

/** What it is as a medicine: its catalogue entry and its generic's write-up. */
router.get(
  '/products/:id/medicine-info',
  handle((req) => productMedicineInfo(actorOf(req), req.params.id)),
);

/** And its whole history, which is where a wrong number gets explained. */
router.get(
  '/products/:id/ledger',
  handle((req) => shop.productLedger(actorOf(req), req.params.id, num(req.query.limit))),
);

/* ------------------------------------------------------------- purchases -- */

const purchaseSchema = z.object({
  supplierId: z.string().trim().min(1).max(40),
  invoiceNo: z.string().trim().max(60).optional(),
  invoiceDate: z.string().optional(),
  discount: z.number().min(0).max(100_000_000).optional(),
  vat: z.number().min(0).max(100_000_000).optional(),
  paidAmount: z.number().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(2000).optional(),
  /* Recorded from an order: the order closes with what actually came. */
  orderId: z.string().trim().max(40).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(40),
        batchNo: z.string().trim().max(60).optional(),
        expiry: z.string().optional(),
        /* Entered the way the invoice reads: boxes and strips, not pieces. */
        boxes: z.number().int().min(0).max(100_000).optional(),
        strips: z.number().int().min(0).max(1_000_000).optional(),
        pieces: z.number().int().min(0).max(10_000_000).optional(),
        bonusStrips: z.number().int().min(0).max(1_000_000).optional(),
        bonusPieces: z.number().int().min(0).max(10_000_000).optional(),
        tradePricePerPiece: z.number().min(0).max(1_000_000),
        mrpPerPiece: z.number().min(0).max(1_000_000).optional(),
        discount: z.number().min(0).max(100_000_000).optional(),
      }),
    )
    .min(1)
    .max(200),
});

router.get(
  '/purchases',
  handle((req) =>
    shop.listPurchases(actorOf(req), {
      supplierId: str(req.query.supplierId),
      q: str(req.query.q),
      paid: req.query.paid === 'due' || req.query.paid === 'paid' ? req.query.paid : undefined,
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

router.post(
  '/purchases',
  validate(purchaseSchema),
  make((req) => shop.createPurchase(actorOf(req), req.body), 'Delivery recorded'),
);

/**
 * A delivery as a sheet, on the shop's own letterhead.
 *
 * Called a delivery and not an invoice: the invoice is the company's document
 * and lives in a folder with a signature on it. This is the shop's record of
 * what it actually received — batches, expiries, the bonus in its own column,
 * and the cost per piece that was derived from all three.
 *
 * `inline`, so it opens in a tab and can be printed from there or saved;
 * `no-store`, because it is the shop's own trade.
 */
const sheet =
  (load: (req: Request) => Promise<invoices.DeliverySheetData>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await load(req);
      /* A paper that leaves the shop: in the shop's paper language, or the
         asker's own when the shop has not chosen Bangla. */
      const lang = (await shop.getSettings(actorOf(req))).printBangla ? 'bn' : pdfLang(req.query.lang);
      const pdf = await invoices.buildDeliveryPdf({ ...data, lang });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoices.deliveryFilename(data)}"`);
      res.setHeader('Content-Length', String(pdf.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(pdf);
    } catch (err) {
      next(err);
    }
  };

router.get(
  '/purchases/:id/delivery.pdf',
  sheet((req) => invoices.deliverySheet(actorOf(req), req.params.id)),
);

/**
 * The same sheet with nothing real on it.
 *
 * A shop choosing its paper — the size, the colour, whether the logo and the
 * square appear — should see the result rather than the form. Made up rows
 * rather than the last delivery, because the first thing a new shop does is
 * open this screen and it has no deliveries yet.
 */
router.get(
  '/invoice/preview.pdf',
  sheet((req) => invoices.sampleDelivery(actorOf(req))),
);

/*
 * The same, drawn from what the settings screen has typed and not saved yet —
 * so the sheet beside the form changes as the colour or the small print does,
 * the way the receipt beside it already did.
 */
router.post(
  '/invoice/preview.pdf',
  validate(
    z.object({
      shopName: settingsSchema.shape.shopName,
      address: settingsSchema.shape.address,
      phone: settingsSchema.shape.phone,
      drugLicenceNo: settingsSchema.shape.drugLicenceNo,
      vatBin: settingsSchema.shape.vatBin,
      printBangla: z.boolean().optional(),
      invoice: settingsSchema.shape.invoice,
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const b = req.body as {
        shopName?: string;
        address?: string;
        phone?: string;
        drugLicenceNo?: string;
        vatBin?: string;
        printBangla?: boolean;
        invoice?: invoices.LetterheadDraft['look'];
      };
      const data = await invoices.sampleDelivery(
        actorOf(req),
        {
          shop: { name: b.shopName, address: b.address, phone: b.phone, drugLicenceNo: b.drugLicenceNo, vatBin: b.vatBin },
          look: b.invoice,
        },
        /* `align`: the page that is printed and held against a pad — the
           outline, and nothing of the pad drawn over it. */
        req.query.align === '1' ? { align: true } : { preview: true },
      );
      const lang = b.printBangla ? 'bn' : pdfLang(req.query.lang);
      const pdf = await invoices.buildDeliveryPdf({ ...data, lang });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdf.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(pdf);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/purchases/:id',
  handle((req) => shop.getPurchase(actorOf(req), req.params.id)),
);

/**
 * The owner's own page: this stretch against the one before it.
 *
 * On the admin router like everything else here, which is the whole of the
 * permission story — margin, cost and what a company is worth are the owner's
 * business and a salesman never reaches this file.
 */
/** The five things that get worse while nobody is looking. */
router.get(
  '/reports/attention',
  handle((req) => reports.needsAttention(actorOf(req))),
);

/** What is moving: rising, falling, new, running out and slow, this stretch against the last. */
router.get(
  '/reports/trending',
  handle((req) => trendingReport(actorOf(req), { from: str(req.query.from), to: str(req.query.to) })),
);

router.get(
  '/reports/owner',
  handle((req) => reports.ownerReport(actorOf(req), { from: str(req.query.from), to: str(req.query.to) })),
);

/** What came in off the vans, for the evening screen's own tile. */
router.get(
  '/reports/today',
  handle((req) => reports.todayGoodsIn(actorOf(req))),
);

/**
 * The owner's page, as a sheet.
 *
 * Same figures as the screen, on A4: this stretch against the one before, the
 * daily chart, and the three tables. Inline and `no-store`, like the delivery
 * sheet — the shop's own trade.
 */
const reportSheet =
  (load: (req: Request) => Promise<{ body: Buffer; filename: string }>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { body, filename } = await load(req);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', String(body.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(body);
    } catch (err) {
      next(err);
    }
  };

router.get(
  '/reports/owner.pdf',
  reportSheet(async (req) => {
    const data = await reportPdf.ownerReportPdfData(actorOf(req), {
      from: str(req.query.from),
      to: str(req.query.to),
    });
    return {
      /* In the language of whoever asked for it. */
      body: await reportPdf.buildOwnerReportPdf({ ...data, lang: pdfLang(req.query.lang) }),
      filename: reportPdf.ownerReportFilename(data),
    };
  }),
);

router.get(
  '/reports/today.pdf',
  reportSheet(async (req) => {
    const data = await reportPdf.todayReportPdfData(actorOf(req));
    return {
      body: await reportPdf.buildTodayPdf({ ...data, lang: pdfLang(req.query.lang) }),
      filename: reportPdf.todayReportFilename(data),
    };
  }),
);

router.get(
  '/expenses',
  handle((req) => expenses.listExpenses(actorOf(req), { from: str(req.query.from), to: str(req.query.to) })),
);

router.post(
  '/expenses',
  validate(
    z.object({
      amount: z.number().min(0).max(100_000_000),
      category: z.enum(EXPENSE_CATEGORIES),
      note: z.string().trim().max(2000).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  make((req) => expenses.createExpense(actorOf(req), req.body), 'Expense recorded'),
);

router.patch(
  '/expenses/:id',
  validate(
    z.object({
      amount: z.number().min(0).max(100_000_000).optional(),
      category: z.enum([...EXPENSE_CATEGORIES]).optional(),
      note: z.string().trim().max(2000).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  handle((req) => expenses.updateExpense(actorOf(req), req.params.id, req.body), 'Saved'),
);

/* ------------------------------------------------------------ other income -- */

/** Money in that is not a sale — the mirror of the expenses above. */
router.get(
  '/incomes',
  handle((req) => incomes.listIncome(actorOf(req), { from: str(req.query.from), to: str(req.query.to) })),
);

router.post(
  '/incomes',
  validate(
    z.object({
      amount: z.number().min(0).max(100_000_000),
      category: z.enum(INCOME_CATEGORIES),
      note: z.string().trim().max(2000).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  make((req) => incomes.createIncome(actorOf(req), req.body), 'Income recorded'),
);

router.patch(
  '/incomes/:id',
  validate(
    z.object({
      amount: z.number().min(0).max(100_000_000).optional(),
      category: z.enum([...INCOME_CATEGORIES]).optional(),
      note: z.string().trim().max(2000).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  handle((req) => incomes.updateIncome(actorOf(req), req.params.id, req.body), 'Saved'),
);

/* -------------------------------------------------- the owner's money, bank -- */

router.get(
  '/cash-moves',
  handle((req) => cash.listCashMoves(actorOf(req), { from: str(req.query.from), to: str(req.query.to) })),
);

router.post(
  '/cash-moves',
  validate(
    z.object({
      kind: z.enum(CASH_MOVE_KINDS),
      amount: z.number().min(0).max(100_000_000),
      note: z.string().trim().max(2000).optional(),
      reference: z.string().trim().max(80).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  make((req) => cash.createCashMove(actorOf(req), req.body), 'Recorded'),
);

router.patch(
  '/cash-moves/:id',
  validate(
    z.object({
      amount: z.number().min(0).max(100_000_000).optional(),
      note: z.string().trim().max(2000).optional(),
      reference: z.string().trim().max(80).optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  ),
  handle((req) => cash.updateCashMove(actorOf(req), req.params.id, req.body), 'Saved'),
);

/* ------------------------------------------------------------- month close -- */

/*
 * Closing and reopening a month is the owner's alone: it locks what everybody
 * else has typed, and a pharmacist who could reopen one could move a number.
 */
/* Closing and reopening a month are their own permission, the owner's by default. */
const ownerOnly = requireShopPermission('accounts.close');

router.get(
  '/months',
  handle((req) => cash.listMonths(actorOf(req))),
);

router.post(
  '/months/:month/close',
  ownerOnly,
  validate(
    z.object({
      countedCash: z.number().min(0).max(100_000_000).nullable().optional(),
      note: z.string().trim().max(2000).optional(),
    }),
  ),
  handle(async (req) => {
    const range = cash.monthRange(req.params.month);
    /* The whole shop's month, whichever branch the owner happens to be looking at: the lock is shop-wide. */
    const a = await accounts({ ...actorOf(req), branch: null }, { ...range, limit: 1 });
    return cash.closeMonth(actorOf(req), req.params.month, req.body, {
      range,
      profit: a.profit,
      cash: a.cash,
      position: a.position,
    });
  }, 'Month closed'),
);

router.post(
  '/months/:month/reopen',
  ownerOnly,
  validate(z.object({ reason: z.string().trim().min(3).max(300) })),
  handle((req) => cash.reopenMonth(actorOf(req), req.params.month, req.body.reason), 'Month reopened'),
);

/* ---------------------------------------------------------------- activity -- */

/** Who did what, and when — the owner's page, nobody else's. */
router.get(
  '/activity',
  handle((req) =>
    listShopActivity(actorOf(req), {
      from: str(req.query.from),
      to: str(req.query.to),
      group: str(req.query.group),
      who: str(req.query.who),
      q: str(req.query.q),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

/* ---------------------------------------------------------------- accounts -- */

/** Profit and loss, money in and out, the cash book, and where the shop stands. */
router.get(
  '/accounts',
  handle((req) =>
    accounts(actorOf(req), {
      from: str(req.query.from),
      to: str(req.query.to),
      page: num(req.query.page),
      limit: num(req.query.limit),
    }),
  ),
);

/* ------------------------------------------- the classified register (F2) -- */

/**
 * The controlled-drugs register.
 *
 * Read-only everywhere: the lines are made at the till, on the bill itself,
 * and there is deliberately no edit or delete here — a register you can tidy
 * is not a register. The page comes out of the same date range the owner's
 * reports use, and the PDF is the same sheet an inspector would ask to see.
 */
router.get(
  '/control',
  handle((req) => control.listTrace(actorOf(req), { from: str(req.query.from), to: str(req.query.to) })),
);

router.get(
  '/control.pdf',
  reportSheet(async (req) => {
    const actor = actorOf(req);
    const data = await control.listTrace(actor, {
      from: str(req.query.from),
      to: str(req.query.to),
    });
    return {
      /* A paper that leaves the shop: in the shop's paper language, or the
         asker's own when the shop has not chosen Bangla. */
      body: await controlPdf.controlRegisterPdf(
        String(actor.org),
        data,
        (await shop.getSettings(actor)).printBangla ? 'bn' : pdfLang(req.query.lang),
      ),
      filename: `controlled-drugs-${data.from}-${data.to}.pdf`,
    };
  }),
);

/* ------------------------------------------------------- chasing the baki -- */

/**
 * On the admin router, and never on a timer.
 *
 * A reminder is a favour a shopkeeper asks of a customer they want back next
 * week. Who to ask and when is the owner's judgement, so it is a button they
 * press — not a nightly job, and not something a salesman can fire at the
 * shop's regulars.
 */
router.post(
  '/customers/:id/remind',
  handle((req) => remind.remindCustomer(actorOf(req), req.params.id), 'Reminder sent'),
);

router.post(
  '/customers/remind',
  validate(z.object({ minBalance: z.number().positive().max(100_000_000) })),
  handle((req) => remind.remindEveryone(actorOf(req), req.body), 'Reminders sent'),
);

/* --------------------------------------------------------------- exports -- */

/**
 * A spreadsheet somebody can be given.
 *
 * Not through `handle`, because these do not answer in the usual envelope —
 * the body is the file. Attachment rather than inline, and `no-store`, since
 * every one of them is the shop's own trade.
 */
const download =
  (run: (req: Request) => Promise<{ csv: string; from?: string; to?: string }>, what: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { csv, from, to } = await run(req);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(what, from, to)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  };

router.get(
  '/export/sales',
  download(
    (req) => exports.salesCsv(actorOf(req), { from: str(req.query.from), to: str(req.query.to) }),
    'bills',
  ),
);

router.get(
  '/export/stock',
  download((req) => exports.stockCsv(actorOf(req)), 'stock'),
);

router.get(
  '/export/suppliers',
  download((req) => exports.suppliersCsv(actorOf(req)), 'companies'),
);

router.get(
  '/export/customers',
  download((req) => exports.customersCsv(actorOf(req)), 'baki-khata'),
);

/* ---------------------------------------------------------------- orders -- */

/**
 * What the shop is asking a company for.
 *
 * No prices on it, deliberately: the rate is the company's to state on the
 * invoice, and an order carrying a guessed one is an argument with the rep.
 */
const orderSchema = z.object({
  supplierId: z.string().trim().min(1).max(40),
  note: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(40),
        qtyPieces: z.number().int().positive().max(10_000_000),
        note: z.string().trim().max(240).optional(),
      }),
    )
    .min(1)
    .max(300),
});

/** The list the reorder levels write for you, before anybody edits it. */
router.get(
  '/orders/suggest',
  handle((req) => orders.suggestOrder(actorOf(req), { supplierId: str(req.query.supplierId) })),
);

const orderStatus = (v: unknown) => {
  const value = str(v);
  return value && (ORDER_STATUS as readonly string[]).includes(value) ? (value as OrderStatus) : undefined;
};

router.get(
  '/orders',
  handle((req) =>
    orders.listOrders(actorOf(req), {
      status: orderStatus(req.query.status),
      supplierId: str(req.query.supplierId),
      limit: num(req.query.limit),
    }),
  ),
);

router.post(
  '/orders',
  validate(orderSchema),
  make((req) => orders.createOrder(actorOf(req), req.body), 'Order written'),
);

router.get(
  '/orders/:id',
  handle((req) => orders.getOrder(actorOf(req), req.params.id)),
);

router.patch(
  '/orders/:id/status',
  validate(
    z.object({
      status: z.enum(['sent', 'received', 'cancelled']),
      /* Required by the service when it is a cancellation, like every other
         reason kept in this shop. */
      reason: z.string().trim().max(300).optional(),
    }),
  ),
  handle((req) => orders.setOrderStatus(actorOf(req), req.params.id, req.body), 'Saved'),
);

/* ----------------------------------------------------------------- staff -- */

/**
 * The people who work here.
 *
 * In the admin router, not the counter's: hiring, switching somebody off and
 * setting a password are the owner's, and a salesman who could do any of them
 * could hire themselves a second account.
 */
const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(40),
  /* A built-in role by name, or one of the shop's roles by id. */
  role: z.enum(['pharmacist', 'salesman']).optional(),
  roleId: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(128),
});

router.get(
  '/staff',
  handle((req) => staff.listStaff(actorOf(req))),
);

router.post(
  '/staff',
  validate(staffSchema),
  make((req) => staff.createStaff(actorOf(req), req.body, req.user!.shopPermissions ?? []), 'Account created'),
);

router.patch(
  '/staff/:id',
  validate(
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().max(40).optional(),
      role: z.enum(['pharmacist', 'salesman']).optional(),
      roleId: z.string().trim().max(40).optional(),
      isActive: z.boolean().optional(),
      branchIds: z.array(z.string()).max(100).optional(),
    }),
  ),
  handle((req) => staff.updateStaff(actorOf(req), req.params.id, req.body, req.user!.shopPermissions ?? []), 'Saved'),
);

/* ----------------------------------------------------------------- roles -- */

/**
 * The shop's roles — Owner, the two built in, and its own — with the
 * permission catalogue the Roles screen draws its checkboxes from.
 */
const roleSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(240).optional(),
  permissions: z.array(z.string().max(40)).max(60).optional(),
});
const roleActor = (req: Request) => ({ ...actorOf(req), shopPermissions: req.user!.shopPermissions ?? [] });

router.get(
  '/roles',
  handle(async (req) => ({ roles: await roles.listShopRoles(actorOf(req).org), catalogue: roles.shopPermissionCatalogue() })),
);
router.post(
  '/roles',
  validate(roleSchema),
  make(async (req) => ({ id: await roles.saveShopRole(roleActor(req), null, req.body) }), 'Role made'),
);
router.patch(
  '/roles/:id',
  validate(roleSchema),
  handle(async (req) => ({ id: await roles.saveShopRole(roleActor(req), req.params.id, req.body) }), 'Role saved'),
);
router.delete(
  '/roles/:id',
  handle((req) => roles.deleteShopRole(roleActor(req), req.params.id), 'Role deleted'),
);

router.post(
  '/staff/:id/password',
  validate(z.object({ password: z.string().min(8).max(128) })),
  handle(
    (req) => staff.setStaffPassword(actorOf(req), req.params.id, req.body.password),
    'Password set — tell them what it is',
  ),
);

/* ----------------------------------------------------------------- stock -- */

/**
 * Sending stock back to the company.
 *
 * Expiry and breakage, settled against the account rather than refunded — the
 * rep takes the strips and the amount comes off what the shop owes.
 */
router.post(
  '/suppliers/:id/returns',
  validate(
    z.object({
      lines: z
        .array(
          z.object({
            batchId: z.string().trim().min(1).max(40),
            pieces: z.number().int().positive().max(10_000_000),
          }),
        )
        .min(1)
        .max(200),
      reason: z.string().trim().max(240).optional(),
      reference: z.string().trim().max(80).optional(),
    }),
  ),
  make((req) => shop.returnToSupplier(actorOf(req), { ...req.body, supplierId: req.params.id }), 'Sent back'),
);

/** What is out of date or about to be, and what it is worth. */
router.get(
  '/stock/expiry',
  handle((req) => shop.expiryReport(actorOf(req), num(req.query.days))),
);

/**
 * A count, a breakage, or something written off.
 *
 * The only way stock moves with no document behind it, which is why the reason
 * is required by the service rather than merely encouraged here.
 */
router.post(
  '/stock/adjust',
  validate(
    z.object({
      batchId: z.string().trim().min(1).max(40),
      qtyDelta: z
        .number()
        .int()
        .refine((n) => n !== 0, 'By how much?'),
      move: z.enum(['damage', 'expiry', 'adjustment']),
      reason: z.string().trim().min(2).max(240),
    }),
  ),
  handle((req) => shop.adjustStock(actorOf(req), req.body), 'Stock adjusted'),
);

/* ----------------------------------------------------- counting the shelf -- */

/**
 * The stock count.
 *
 * Started, filled in a rack at a time over an evening, and then applied — which
 * is the only button in the shop that changes a number nobody can rebuild from
 * a document. Admin only, for the same reason purchases are: it is where a
 * shortage gets explained away.
 */
router.get(
  '/counts',
  handle((req) => counts.listCounts(actorOf(req), Number(req.query.limit) || 20)),
);

router.get(
  '/counts/open',
  handle(async (req) => ({ count: await counts.openCount(actorOf(req)) })),
);

router.post(
  '/counts',
  validate(z.object({ rackId: z.string().trim().max(40).optional() })),
  make((req) => counts.startCount(actorOf(req), req.body), 'Counting started'),
);

router.get(
  '/counts/:id',
  handle((req) => counts.getCount(actorOf(req), req.params.id)),
);

router.patch(
  '/counts/:id',
  validate(
    z.object({
      lines: z
        .array(
          z.object({
            lineId: z.string().trim().min(1).max(40),
            /* Null is "not counted yet", which is not the same as zero — see
               the service, where the difference decides what gets written off. */
            counted: z.number().int().min(0).max(10_000_000).nullable(),
          }),
        )
        .min(1)
        .max(500),
    }),
  ),
  handle((req) => counts.saveCount(actorOf(req), req.params.id, req.body.lines), 'Saved'),
);

router.post(
  '/counts/:id/apply',
  validate(z.object({ note: z.string().trim().max(500).optional() })),
  handle((req) => counts.applyCount(actorOf(req), req.params.id, req.body), 'Stock updated'),
);

router.post(
  '/counts/:id/abandon',
  handle((req) => counts.abandonCount(actorOf(req), req.params.id), 'Count dropped'),
);

/* ------------------------------------------------------------ letterhead -- */

/*
 * The pictures on the A4 sheet: the logo in the band, and the shop's own
 * letterhead — its header and its footer, scanned or photographed.
 *
 * Replaced rather than added to: the old file is removed once the new one is
 * stored, so a shop that tries four scans keeps one.
 */
const LETTERHEAD_SLOTS = { logo: 'logo', header: 'letterheadHeader', footer: 'letterheadFooter' } as const;
const letterheadUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.post(
  '/settings/letterhead/:slot',
  letterheadUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const field = LETTERHEAD_SLOTS[req.params.slot as keyof typeof LETTERHEAD_SLOTS];
      if (!field) throw badRequest('Not a letterhead picture');
      if (!req.file) throw badRequest('Choose a picture to upload');
      assertAllowed('image', req.file);
      const actor = actorOf(req);
      await shop.getSettings(actor);
      const stored = await storage.save(keys.letterhead(actor.org), req.file);
      const before = await ShopSettingsModel.findOneAndUpdate({ organization: actor.org }, { $set: { [field]: stored.key } }).select(field).lean();
      const previous = (before as Record<string, unknown> | null)?.[field];
      if (typeof previous === 'string' && previous && previous !== stored.key) await storage.remove(previous).catch(() => undefined);
      ok(res, { slot: req.params.slot, key: stored.key }, 'Picture saved');
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/settings/letterhead/:slot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const field = LETTERHEAD_SLOTS[req.params.slot as keyof typeof LETTERHEAD_SLOTS];
    if (!field) throw badRequest('Not a letterhead picture');
    const actor = actorOf(req);
    const before = await ShopSettingsModel.findOneAndUpdate({ organization: actor.org }, { $set: { [field]: '' } }).select(field).lean();
    const previous = (before as Record<string, unknown> | null)?.[field];
    if (typeof previous === 'string' && previous) await storage.remove(previous).catch(() => undefined);
    ok(res, { slot: req.params.slot }, 'Picture removed');
  } catch (err) {
    next(err);
  }
});

/* The picture itself, for the settings screen's thumbnail. */
router.get('/settings/letterhead/:slot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const field = LETTERHEAD_SLOTS[req.params.slot as keyof typeof LETTERHEAD_SLOTS];
    if (!field) throw badRequest('Not a letterhead picture');
    const s = await ShopSettingsModel.findOne({ organization: actorOf(req).org }).select(field).lean();
    const key = (s as Record<string, unknown> | null)?.[field];
    if (typeof key !== 'string' || !key) {
      res.status(204).end();
      return;
    }
    const buf = await storage.read(key);
    res.setHeader('Content-Type', key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(buf);
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- wallets -- */

router.get('/wallets', handle((req) => wallet.walletSettings(actorOf(req).org)));
router.patch(
  '/wallets',
  validate(
    z.object({
      bkashNumber: z.string().trim().max(20).optional(),
      nagadNumber: z.string().trim().max(20).optional(),
      rocketNumber: z.string().trim().max(20).optional(),
      upayNumber: z.string().trim().max(20).optional(),
      bkashApi: z
        .object({
          enabled: z.boolean().optional(),
          sandbox: z.boolean().optional(),
          appKey: z.string().trim().max(120).optional(),
          username: z.string().trim().max(120).optional(),
          appSecret: z.string().trim().max(200).optional(),
          password: z.string().trim().max(200).optional(),
        })
        .optional(),
    }),
  ),
  handle((req) => wallet.saveWalletSettings(actorOf(req).org, req.body), 'Saved'),
);

/* -------------------------------------------------------- online orders -- */

/* The shop's order link and how it delivers: the owner's and the pharmacist's to set. */
router.get('/online-orders/settings', handle((req) => online.orderSettings(actorOf(req).org)));
router.patch(
  '/online-orders/settings',
  validate(
    z.object({
      enabled: z.boolean().optional(),
      pickup: z.boolean().optional(),
      delivery: z.boolean().optional(),
      deliveryCharge: z.number().min(0).max(5000).optional(),
      freeDeliveryOver: z.number().min(0).max(1_000_000).optional(),
      note: z.string().trim().max(300).optional(),
    }),
  ),
  handle((req) => online.saveOrderSettings(actorOf(req).org, req.body), 'Saved'),
);
router.post('/online-orders/new-link', handle((req) => online.newOrderLink(actorOf(req).org), 'A new link — the old one no longer works'));

/* ------------------------------------------------------------- transfers -- */

/* Stock carried from the branch being worked in to another. */
router.get(
  '/transfers',
  handle((req) => transfers.listTransfers(actorOf(req), Number(req.query.limit) || 50)),
);

router.post(
  '/transfers',
  validate(
    z.object({
      toBranchId: z.string().trim().min(1).max(40),
      lines: z
        .array(z.object({ batchId: z.string().trim().min(1).max(40), pieces: z.number().int().positive().max(1_000_000) }))
        .min(1)
        .max(200),
      note: z.string().trim().max(240).optional(),
    }),
  ),
  make((req) => transfers.createTransfer(actorOf(req), req.body), 'Sent across'),
);

/* -------------------------------------------------------------- counters -- */

/**
 * Where people stand and sell.
 *
 * The list doubles as the shop's view of its own floor — who is on which
 * counter, what each has taken today, and which boxes are still open.
 */
router.get(
  '/counters',
  handle((req) => counters.listCounters(actorOf(req))),
);

router.post(
  '/counters',
  validate(
    z.object({
      name: z.string().trim().min(1).max(60),
      note: z.string().trim().max(240).optional(),
      openingFloat: z.number().min(0).max(10_000_000).optional(),
      paperWidthMm: z.number().min(40).max(210).nullable().optional(),
      branchId: z.string().optional(),
    }),
  ),
  make((req) => counters.createCounter(actorOf(req), req.body), 'Counter added'),
);

router.patch(
  '/counters/:id',
  validate(
    z.object({
      name: z.string().trim().min(1).max(60).optional(),
      note: z.string().trim().max(240).optional(),
      openingFloat: z.number().min(0).max(10_000_000).optional(),
      paperWidthMm: z.number().min(40).max(210).nullable().optional(),
      branchId: z.string().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(999).optional(),
    }),
  ),
  handle((req) => counters.updateCounter(actorOf(req), req.params.id, req.body), 'Saved'),
);

/* ------------------------------------------------------- correcting a bill -- */

/**
 * What a bill says about the people on it.
 *
 * Not the lines: changing what left the shelf after the customer walked out
 * with it is a second transaction, not a correction, and the honest way to do
 * that is to cancel and ring it up again. A name typed wrong against a due is
 * the thing that actually needs fixing, and every fix carries a reason.
 */
router.patch(
  '/sales/:id',
  validate(
    z.object({
      customerName: z.string().trim().max(120).optional(),
      /* Corrected while somebody is looking at it, so a wrong number is
         refused here, unlike at the till where a bill is never turned away. */
      customerPhone: z
        .string()
        .trim()
        .max(40)
        .refine((v) => !v || bdMobile(v) !== null, BD_MOBILE_MESSAGE)
        .transform((v) => (v ? bdMobile(v)! : ''))
        .optional(),
      note: z.string().trim().max(500).optional(),
      reason: z.string().trim().min(3).max(300),
    }),
  ),
  handle(
    (req) => saleAdmin.editSale({ ...actorOf(req), role: req.user!.role }, req.params.id, req.body),
    'Bill corrected',
  ),
);

/* ------------------------------------------------- the rest of a bill's life -- */

/**
 * The acts only the owner may take on a bill that is already rung up.
 *
 * Correcting it is above. These four are the ones that move it between states,
 * and every one of them takes a reason that is kept on the bill and written to
 * the audit trail: an owner's question is never "what does this say now", it is
 * "who did that and what did they say".
 *
 * The counter can still cancel its own mis-punch within the hour — that lives
 * on the till's router, where a salesman can reach it.
 */
const reasonOnly = z.object({ reason: z.string().trim().min(3).max(300) });

router.post(
  '/sales/:id/revert',
  validate(reasonOnly),
  handle(
    (req) => saleAdmin.revertSale({ ...actorOf(req), role: req.user!.role }, req.params.id, req.body),
    'Bill put back',
  ),
);

router.post(
  '/sales/:id/hold',
  validate(z.object({ hold: z.boolean(), reason: z.string().trim().max(300).optional() })),
  handle(
    (req) => saleAdmin.holdSale({ ...actorOf(req), role: req.user!.role }, req.params.id, req.body),
    'Saved',
  ),
);

router.delete(
  '/sales/:id',
  validate(reasonOnly),
  handle(
    (req) => saleAdmin.deleteSale({ ...actorOf(req), role: req.user!.role }, req.params.id, req.body),
    'Bill moved to the bin',
  ),
);

router.post(
  '/sales/:id/restore',
  handle(
    (req) => saleAdmin.restoreSale({ ...actorOf(req), role: req.user!.role }, req.params.id),
    'Taken out of the bin',
  ),
);

/* ------------------------------------------------------------------- bin -- */

/**
 * Everything the shop has thrown away, and the way back.
 *
 * One screen for all of it — a bill, an item, a customer, a company, a shelf, a
 * counter — because "I deleted something and I want it back" is one thought,
 * and making somebody remember which page they deleted it from is making them
 * do the filing.
 */
router.get(
  '/trash',
  handle((req) => bin.listShopTrash(actorOf(req), str(req.query.kind))),
);

/* What binning (or restoring) each kind of thing takes: the permission that manages it. */
const BIN_NEEDS: Record<string, ShopPermission> = {
  product: 'stock.manage',
  rack: 'stock.manage',
  customer: 'customers.delete',
  supplier: 'purchases.manage',
  counter: 'settings.manage',
  expense: 'accounts.manage',
  income: 'accounts.manage',
  cashmove: 'accounts.manage',
  sale: 'sales.edit',
};
const binGate = (req: Request, _res: Response, next: NextFunction) => {
  const needed = BIN_NEEDS[req.params.kind] ?? 'audit.view';
  if (!(req.user!.shopPermissions ?? []).includes(needed)) return next(forbidden('Your role does not allow this — ask the shop owner'));
  next();
};

router.delete(
  '/trash/:kind/:id',
  binGate,
  validate(reasonOnly),
  handle(
    (req) =>
      bin.softDelete(
        { ...actorOf(req), role: req.user!.role },
        req.params.kind,
        req.params.id,
        req.body.reason,
      ),
    'Moved to the bin',
  ),
);

router.post(
  '/trash/:kind/:id/restore',
  binGate,
  handle(
    (req) => bin.restore({ ...actorOf(req), role: req.user!.role }, req.params.kind, req.params.id),
    'Taken out of the bin',
  ),
);

export default router;
