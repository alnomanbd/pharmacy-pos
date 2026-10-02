import { attachBranch, scopeOf, switcherOf } from '../services/branchScope.service.js';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as till from '../services/till.service.js';
import * as shop from '../services/shop.service.js';
import * as counters from '../services/counters.service.js';
import * as saleAdmin from '../services/saleAdmin.service.js';
import { searchEverything } from '../services/shopSearch.service.js';
import type { Actor } from '../services/shop.service.js';
import {
  requireAuth,
  requireRole,
  requireWritableTenant,
} from '../middlewares/auth.js';
import { SHOP_ROLES, SHOP_ADMIN_ROLES } from '../types/roles.js';
import { validate } from '../middlewares/validate.js';
import { ok, created } from '../utils/response.js';
import { shopActivity } from '../middlewares/shopActivity.js';

/**
 * The counter's own API.
 *
 * Mounted apart from `/shop` because it admits a different set of people: a
 * salesman sells here and is refused everywhere in the back room, where trade
 * price and margin live. That separation is the whole of the role design, and
 * it is enforced by which router a route
 * lives in rather than by a check somebody has to remember to write.
 */
const router = Router();

router.use(requireAuth, requireWritableTenant, requireRole(...SHOP_ROLES), attachBranch);

/* Every change that succeeds goes on the owner's Activity page. */
router.use(shopActivity('till'));

/* The branch switcher: which branches this person works in, and which one they are on. */
router.get('/branches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ok(res, await switcherOf(req.user!.org!, scopeOf(req)));
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

const actorOf = (req: Request): Actor => ({
  org: req.user!.org!,
  id: req.user!.id,
  name: req.user!.name,
  branch: scopeOf(req),
});

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/* --------------------------------------------------------------- printing -- */

/**
 * What goes at the top of the paper, and how wide the paper is.
 *
 * Read-only here: a salesman prints bills all evening and never edits the
 * header. The write is in the admin router.
 */
router.get(
  '/settings',
  handle((req) => shop.getSettings(actorOf(req))),
);

/* ------------------------------------------------------------------ shift -- */

router.get(
  '/shift',
  handle(async (req) => ({ shift: await till.openShift(actorOf(req)) })),
);

/**
 * The counters somebody may open a till on.
 *
 * At the counter rather than in the back room because this is the list the
 * open-the-day box needs, and a salesman has to be able to say where they are
 * standing.
 */
router.get(
  '/counters',
  handle((req) => counters.pickableCounters(actorOf(req))),
);

router.post(
  '/shift/open',
  validate(
    z.object({
      openingFloat: z.number().min(0).max(10_000_000).optional(),
      counterId: z.string().trim().max(40).optional(),
      terminal: z.string().trim().max(60).optional(),
    }),
  ),
  make((req) => till.startShift(actorOf(req), req.body), 'Till open'),
);

router.post(
  '/shift/close',
  validate(
    z.object({
      countedCash: z.number().min(0).max(100_000_000),
      note: z.string().trim().max(500).optional(),
    }),
  ),
  handle((req) => till.closeShift(actorOf(req), req.body), 'Till closed'),
);

/* ---------------------------------------------------------------- selling -- */

/** What is actually on the shelf, as somebody types at the counter. */
router.get(
  '/search',
  handle((req) => till.searchForSale(actorOf(req), String(req.query.q ?? ''))),
);

/** Expired, about to expire, run out and running low — the bell's lists. */
router.get(
  '/alerts',
  handle((req) => till.stockAlerts(actorOf(req))),
);

const saleSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(40),
        qtyPieces: z.number().int().positive().max(1_000_000),
        pricePerPiece: z.number().min(0).max(1_000_000).optional(),
        discount: z.number().min(0).max(1_000_000).optional(),
      }),
    )
    .min(1)
    .max(100),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank', 'due']),
        amount: z.number().min(0).max(100_000_000),
        reference: z.string().trim().max(80).optional(),
      }),
    )
    .max(6)
    .optional(),
  discount: z.number().min(0).max(1_000_000).optional(),
  customerId: z.string().trim().max(40).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
  /* Only sent by a till posting what it rang up while the line was down. */
  clientRef: z.string().trim().min(8).max(64).optional(),
  soldAt: z.string().datetime().optional(),
  /* The classified-register lines: one per controlled drug on the bill. A
     controlled drug goes out with a name or not at all. */
  trace: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(40),
        buyerName: z.string().trim().max(120).optional(),
        buyerPhone: z.string().trim().max(40).optional(),
        doctorName: z.string().trim().max(120).optional(),
      }),
    )
    .max(100)
    .optional(),
});

router.post(
  '/sales',
  validate(saleSchema),
  make((req) => till.createSale(actorOf(req), req.body), 'Sold'),
);

router.get(
  '/sales/:id',
  handle((req) => till.getSale(actorOf(req), req.params.id)),
);


/** Finding the bill a customer has come back holding, by its exact number. */
router.get(
  '/sales',
  handle((req) => till.findSale(actorOf(req), String(req.query.billNo ?? ''))),
);

/**
 * The bills, over a stretch of days.
 *
 * The counter's own history and the owner's sales register are the same screen
 * asking the same question — "find me that bill" — so they are the same route.
 * What differs is scope: anybody who is not running the shop sees their own
 * bills and is never told the margin.
 */
router.get(
  '/bills',
  handle((req) => {
    const boss = SHOP_ADMIN_ROLES.includes(req.user!.role);
    return till.listSales(actorOf(req), {
      from: str(req.query.from),
      to: str(req.query.to),
      q: str(req.query.q),
      mine: boss ? req.query.mine === 'true' : true,
      only: req.query.only === 'due' || req.query.only === 'returned' ? req.query.only : undefined,
      withMargin: boss,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
  }),
);

/**
 * One box that finds anything in the shop.
 *
 * A shopkeeper does not think in screens: somebody rings about "that Incepta
 * invoice", a customer walks in with 0042 on a slip. The back room's rows are
 * left out for a salesman — the same rule as everywhere else.
 */
router.get(
  '/search-all',
  handle((req) =>
    searchEverything(actorOf(req), String(req.query.q ?? ''), {
      backRoom: SHOP_ADMIN_ROLES.includes(req.user!.role),
    }),
  ),
);

/**
 * Cancelling a bill.
 *
 * Whoever runs the shop may cancel anything; a salesman may cancel their own
 * mis-punch, on their own open till, within the hour — because a counter that
 * cannot undo one will undo it by handing the cash back and saying nothing.
 * The reason is required at both ends and kept on the bill.
 */
router.post(
  '/sales/:id/void',
  validate(z.object({ reason: z.string().trim().min(3).max(300) })),
  handle(async (req) => {
    const open = await till.openShift(actorOf(req));
    return saleAdmin.voidSale(
      { ...actorOf(req), role: req.user!.role },
      req.params.id,
      req.body,
      {
        runsTheShop: SHOP_ADMIN_ROLES.includes(req.user!.role),
        openShiftId: open ? String(open._id) : null,
      },
    );
  }, 'Bill cancelled'),
);

router.post(
  '/sales/:id/return',
  validate(
    z.object({
      lines: z
        .array(
          z.object({
            lineId: z.string().trim().min(1).max(40),
            pieces: z.number().int().positive().max(1_000_000),
          }),
        )
        .min(1)
        .max(100),
      reason: z.string().trim().max(240).optional(),
    }),
  ),
  handle((req) => till.returnSale(actorOf(req), req.params.id, req.body), 'Returned'),
);

/* --------------------------------------------------------------- the day -- */

/**
 * Today.
 *
 * A salesman sees their own takings; `all=true` is the shop's, and it carries
 * the margin, so it is refused to anyone but the people who run the place.
 */
router.get(
  '/day',
  handle(async (req) => {
    const all = req.query.all === 'true';
    if (all && !SHOP_ADMIN_ROLES.includes(req.user!.role)) {
      // Not an error the salesman needs to see: they get their own day.
      return till.daySummary(actorOf(req), { dayKey: str(req.query.dayKey) });
    }
    return till.daySummary(actorOf(req), { all, dayKey: str(req.query.dayKey) });
  }),
);

/* -------------------------------------------------------------- the baki -- */

router.get(
  '/customers',
  handle((req) => till.listCustomers(actorOf(req), str(req.query.q))),
);

/** The Customers screen: paged, filtered, with the whole book's figures. */
router.get(
  '/customers/book',
  handle((req) =>
    till.customerBook(actorOf(req), {
      q: str(req.query.q),
      show: ['owing', 'clear', 'over'].includes(String(req.query.show))
        ? (req.query.show as 'owing' | 'clear' | 'over')
        : undefined,
      sort: ['owed', 'name', 'recent'].includes(String(req.query.sort))
        ? (req.query.sort as 'owed' | 'name' | 'recent')
        : undefined,
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
    }),
  ),
);

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  note: z.string().trim().max(500).optional(),
  creditLimit: z.number().min(0).max(100_000_000).optional(),
  openingBalance: z.number().min(0).max(100_000_000).optional(),
});

/*
 * A salesman may put a name on the book and correct a phone number — the till
 * already lets them add a customer by selling on account. How much credit the
 * shop gives, and what somebody owed before the software, are the owner's
 * figures, so those are dropped rather than refused: the rest of the form
 * still saves.
 */
const ownersOnly = (req: Request, body: Record<string, unknown>) => {
  if (SHOP_ADMIN_ROLES.includes(req.user!.role)) return body;
  const { creditLimit: _limit, openingBalance: _opening, ...rest } = body;
  return rest;
};

router.post(
  '/customers',
  validate(customerSchema),
  make(
    (req) => till.createCustomer(actorOf(req), ownersOnly(req, req.body) as never),
    'Customer added',
  ),
);

router.patch(
  '/customers/:id',
  validate(customerSchema.omit({ openingBalance: true }).partial()),
  handle(
    (req) => till.updateCustomer(actorOf(req), req.params.id, ownersOnly(req, req.body)),
    'Saved',
  ),
);

/**
 * One regular's account, with every bill and every payment on it.
 *
 * At the counter rather than in the back room, because that is where somebody
 * settles up — and a salesman taking the money has to be able to show the
 * person what it is for.
 */
router.get(
  '/customers/:id',
  handle((req) =>
    till.customerStatement(actorOf(req), req.params.id, {
      from: str(req.query.from),
      to: str(req.query.to),
    }),
  ),
);

router.post(
  '/customers/:id/payments',
  validate(
    z.object({
      amount: z.number().positive().max(100_000_000),
      method: z.string().trim().max(40).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  ),
  make((req) => till.payCustomer(actorOf(req), req.params.id, req.body), 'Payment taken'),
);

export default router;
