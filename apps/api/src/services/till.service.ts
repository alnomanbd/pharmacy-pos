import { Types, type PipelineStage } from 'mongoose';
import {
  SaleModel,
  ShiftModel,
  ShopCustomerModel,
  ShopSettingsModel,
  ShopCounterModel,
  CustomerLedgerModel,
  ShopProductModel,
  StockBatchModel,
  StockLedgerModel,
  ShopControlLogModel,
} from '../models/index.js';
import { rulesOf, redeemFor, pointsEarned, pointsClawedBack } from './loyalty.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { todayKey, calendarPartsInAppTz, parseDayKey, formatDayKey } from '../utils/date.js';
import type { Actor } from './shop.service.js';
import { recordRefund } from './shopCash.service.js';
import { branchMatch, writeBranchOf, inScope, branchOrMain, visibleMatch } from './branchScope.service.js';
import { BranchModel } from '../models/index.js';
import { bdMobile, BD_MOBILE_MESSAGE } from '../utils/phone.js';

/**
 * The counter.
 *
 * Everything here happens while somebody is standing on the other side of it,
 * which is the constraint that shapes the lot: a sale is one call, it takes
 * stock from the right lots without being told which, and it never fails for a
 * reason the person at the till cannot fix in five seconds.
 *
 * Three rules, and the rest follows:
 *
 * 1. **First expiry, first out.** A sale takes from the lot that expires
 *    soonest, across as many lots as it needs. The customer sees one line; the
 *    record keeps every batch it came from, because a return has to put the
 *    pieces back where they came from and because the cost differs per lot.
 * 2. **The cost is captured at the moment of sale.** Margin is what this shop
 *    paid for *these* pieces, not what the next delivery will cost.
 * 3. **A shift is a person, not a machine.** Two salesmen on two computers are
 *    two shifts and two drawers, and neither one's takings are mixed with the
 *    other's.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

const money = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ shift -- */

/** The shift this person has open, if any. The till asks on every load. */
/**
 * The branch a sale belongs to: the one its counter is in when a shift is open,
 * otherwise the branch the person is working in. A bill never lands in "all
 * branches" — stock comes off one shelf.
 */
async function sellingBranch(
  actor: Actor,
  shift?: { branch?: unknown; terminal?: string | null } | null,
  /** A sale refuses a mismatch; a search just looks in the branch picked. */
  strict = false,
): Promise<Types.ObjectId> {
  const open = shift === undefined ? await openShift(actor) : shift;
  if (open?.branch) {
    if (inScope(actor.branch, open.branch)) return open.branch as Types.ObjectId;
    /* The POS is open at a counter in another branch than the one picked at the
       top: selling here would take stock off the wrong shelf, into the wrong drawer. */
    if (strict) {
      throw badRequest(
        `Your POS is open on ${open.terminal || 'a counter'} in another branch — switch back to that branch to sell, or close the day there first.`,
      );
    }
  }
  return writeBranchOf(actor);
}

export async function openShift(actor: Actor) {
  return ShiftModel.findOne({
    organization: actor.org,
    user: actor.id,
    closedAt: null,
  }).lean();
}

export async function startShift(
  actor: Actor,
  input: { openingFloat?: number; terminal?: string; counterId?: string },
) {
  const already = await openShift(actor);
  /* Not an error: a salesman who reloads the page has not started a second
     shift, and telling them they have is how a real one gets closed by mistake. */
  if (already) return already;

  /*
   * The counter as a row, with its name copied beside it.
   *
   * A typed word made "Counter 1", "counter1" and "C-1" three different tills as
   * far as the day's figures went. The name is snapshotted so a closed shift
   * still reads correctly after the counter is renamed — the same rule the bills
   * follow.
   */
  let counter = null;
  if (input.counterId) {
    counter = await ShopCounterModel.findOne({
      _id: oid(input.counterId),
      organization: actor.org,
    }).lean();
    if (!counter) throw notFound('Counter');
    // A counter in a branch this person does not work in is not theirs to open.
    if (!inScope(actor.branch, counter.branch)) throw notFound('Counter');

    /* Two people on one counter is two cash counts against one box, and the
       second close would be measured against the first one's takings. */
    const busy = await ShiftModel.findOne({
      organization: actor.org,
      closedAt: null,
      counter: counter._id,
    });
    if (busy) throw badRequest(`${busy.userName} already has the POS open on ${counter.name}`);
  }

  const shift = await ShiftModel.create({
    organization: actor.org,
    // The counter's branch; a shift with no counter works in the branch picked.
    branch: counter?.branch ?? (await writeBranchOf(actor)),
    user: actor.id,
    userName: actor.name,
    counter: counter?._id ?? null,
    terminal: counter?.name ?? input.terminal ?? '',
    openingFloat: input.openingFloat ?? counter?.openingFloat ?? 0,
    expectedCash: input.openingFloat ?? counter?.openingFloat ?? 0,
  });
  return shift.toObject();
}

/**
 * Closing the drawer.
 *
 * The shop counts the cash and types what it found; the difference is recorded
 * either way. Refusing to close on a mismatch would simply teach everybody to
 * type the expected number, which is the one outcome that makes the figure
 * worthless.
 */
export async function closeShift(actor: Actor, input: { countedCash: number; note?: string }) {
  const shift = await ShiftModel.findOne({
    organization: actor.org,
    user: actor.id,
    closedAt: null,
  });
  if (!shift) throw badRequest('You have not opened the POS yet');

  shift.closedAt = new Date();
  shift.countedCash = input.countedCash;
  shift.difference = money(input.countedCash - shift.expectedCash);
  shift.note = input.note ?? '';
  await shift.save();

  return shift.toObject();
}

/* ---------------------------------------------------------------- selling -- */

/**
 * What the till shows when somebody types.
 *
 * Only what is actually on the shelf, because offering a product with no stock
 * is offering a line the sale will refuse three seconds later. For the same
 * reason a lot past its expiry is not counted — it is still in the drawer, but
 * it is not for sale, and the Expiry screen is where it gets dealt with. The
 * nearest expiry comes with it so the person at the counter can see what they
 * are about to hand over.
 */
export async function searchForSale(actor: Actor, q: string) {
  const text = q.trim();
  if (!text) return [];

  /*
   * A scanned code answers the whole question on its own.
   *
   * A scanner is a keyboard that types very fast and presses Enter, so what
   * arrives here is indistinguishable from typing — except that it is an exact
   * code, and if one row holds it there is nothing left to choose between.
   * Looked for first and returned alone, so the counter gets one row to add
   * rather than a list to pick from; anything else falls through to the name
   * search, which is what a person typing wants.
   */
  const scanned = await ShopProductModel.findOne({
    organization: actor.org,
    isActive: true,
    deletedAt: null,
    barcode: text,
  }).lean();

  const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  // What is on *this* branch's shelves: the counter sells from here, not from across town.
  const branch = await sellingBranch(actor);
  /* The batch number read off a strip in the customer's hand finds it too. */
  const lots =
    scanned || text.length < 3
      ? []
      : await StockBatchModel.find({
          organization: actor.org,
          branch,
          batchNo: rx,
          qtyOnHand: { $gt: 0 },
        }).distinct('product');
  const products = scanned
    ? [scanned]
    : await ShopProductModel.find({
        organization: actor.org,
        isActive: true,
        /* The bin is its own screen: a deleted item is not for sale. */
        deletedAt: null,
        $or: [{ name: rx }, { genericName: rx }, { _id: { $in: lots } }],
      })
        .limit(20)
        .lean();

  const ids = products.map((p) => p._id);
  const stock = await StockBatchModel.aggregate<{
    _id: Types.ObjectId;
    onHand: number;
    nearestExpiry: Date | null;
  }>([
    {
      $match: {
        organization: new Types.ObjectId(actor.org),
        branch,
        product: { $in: ids },
        qtyOnHand: { $gt: 0 },
        $or: [{ expiry: null }, { expiry: { $gte: new Date() } }],
      },
    },
    {
      $group: {
        _id: '$product',
        onHand: { $sum: '$qtyOnHand' },
        nearestExpiry: { $min: '$expiry' },
      },
    },
  ]);

  const byId = new Map(stock.map((s) => [String(s._id), s]));
  return products
    .map((p) => ({
      _id: String(p._id),
      name: p.name,
      genericName: p.genericName,
      strength: p.strength,
      /* The shelf as a word, not as an id. The counter reads "R2-A" off this
         and walks to it; the reference is the back room's business. */
      rack: p.rackLabel ?? '',
      piecesPerStrip: p.piecesPerStrip,
      stripsPerBox: p.stripsPerBox,
      mrpPerPiece: p.mrpPerPiece,
      prescriptionOnly: p.prescriptionOnly,
      /* Used by the counter to ask who a controlled drug is going to. */
      controlled: p.controlled === true,
      /* Echoed back so the till can tell a scan from a search: one row whose
         code is exactly what was typed goes straight onto the bill. */
      barcode: p.barcode ?? '',
      /* The till needs this to show VAT before the server works it out. */
      isMedicine: p.isMedicine !== false,
      onHand: byId.get(String(p._id))?.onHand ?? 0,
      nearestExpiry: byId.get(String(p._id))?.nearestExpiry ?? null,
    }))
    .filter((p) => p.onHand > 0);
}

/** Soonest expiry first, with "no date recorded" last rather than first. */
export function fefoOrder<T extends { expiry?: Date | string | null }>(batches: T[]): T[] {
  /*
   * Nulls sort first in Mongo, which would hand out the lots whose expiry
   * nobody recorded ahead of the ones that are about to go out of date. Sorted
   * here instead, with unknown expiry last: a lot with no date on it is not a
   * lot that is safe, it is a lot nobody typed a date for.
   */
  return [...batches].sort((a, b) => {
    const ax = a.expiry ? new Date(a.expiry).getTime() : Number.MAX_SAFE_INTEGER;
    const bx = b.expiry ? new Date(b.expiry).getTime() : Number.MAX_SAFE_INTEGER;
    return ax - bx;
  });
}

/** Past its date, as of `now`. A lot with no date recorded is not. */
export function isExpired(batch: { expiry?: Date | string | null }, now = new Date()) {
  return !!batch.expiry && new Date(batch.expiry).getTime() < now.getTime();
}

/**
 * Takes pieces off the shelf, soonest expiry first.
 *
 * Returns one allocation per lot it had to touch. A shop with the same medicine
 * in three batches sells across them without anybody choosing, which is the
 * only way a till can be fast — and the record still says which lots left the
 * building.
 *
 * A lot past its expiry is never handed out. First-expiry-first-out on its own
 * would do the opposite — the expired lot is the one that expires soonest — so
 * it is taken out of the running before the order is worked out, and a bill
 * that can only be filled from it is refused with the reason.
 */
async function allocate(
  org: string,
  productId: Types.ObjectId,
  pieces: number,
  /**
   * Let the shelf go negative rather than refuse.
   *
   * Only ever true for a bill that was rung up offline. Those pieces are
   * already in the customer's hand — they left the building an hour ago —
   * so refusing to post the bill does not put them back, it only loses the
   * money. A minus figure on the stock screen is the truth about a shelf
   * somebody needs to count, and that is better than a sale nobody recorded.
   */
  allowShort = false,
  /** Only this branch's lots — a bill takes stock off the shelf it was rung up at. */
  branch: Types.ObjectId | null = null,
  /**
   * Pieces this same bill has already taken from each lot, on an earlier line.
   * Without it, the same product on two lines is checked twice against the
   * same shelf, and ten get sold out of six.
   */
  reserved: Map<string, number> = new Map(),
) {
  const batches = await StockBatchModel.find({
    organization: org,
    ...(branch ? { branch } : {}),
    product: productId,
    ...(allowShort ? {} : { qtyOnHand: { $gt: 0 } }),
  }).lean();

  const now = new Date();
  /*
   * An offline bill has already gone out of the door, so its expired lots
   * stay in reach — but behind every lot still in date, which is the strip the
   * counter should have picked up. Whatever it takes from them is on the
   * ledger against that lot, for the owner to find.
   */
  const inOrder = allowShort
    ? [
        ...fefoOrder(batches.filter((b) => !isExpired(b, now))),
        ...fefoOrder(batches.filter((b) => isExpired(b, now))),
      ]
    : fefoOrder(batches.filter((b) => !isExpired(b, now)));
  const picked: { batch: (typeof batches)[number]; pieces: number }[] = [];
  let left = pieces;
  const free = (b: (typeof batches)[number]) => b.qtyOnHand - (reserved.get(String(b._id)) ?? 0);
  for (const batch of inOrder) {
    if (left <= 0) break;
    if (free(batch) <= 0) continue;
    const take = Math.min(free(batch), left);
    picked.push({ batch, pieces: take });
    left -= take;
  }

  if (left > 0 && allowShort) {
    /* Whatever is left over goes on the lot they would have reached for last,
       which is where the counting will start. */
    const last = picked[picked.length - 1] ?? { batch: inOrder[inOrder.length - 1], pieces: 0 };
    if (!last.batch) throw badRequest('That item has never been taken into stock');
    if (picked.length === 0) picked.push({ batch: last.batch, pieces: left });
    else last.pieces += left;
    left = 0;
  }
  if (left <= 0) for (const p of picked) reserved.set(String(p.batch._id), (reserved.get(String(p.batch._id)) ?? 0) + p.pieces);

  if (left > 0) {
    const have = pieces - left;
    const expired = batches
      .filter((b) => isExpired(b, now))
      .reduce((n, b) => n + Math.max(0, b.qtyOnHand), 0);
    throw badRequest(
      expired > 0
        ? `Only ${have} in date — ${expired} more ${expired === 1 ? 'is' : 'are'} past expiry and cannot be sold`
        : `Only ${have} left on the shelf`,
    );
  }
  return picked;
}

/**
 * When a bill posted late was really sold.
 *
 * The counter's own clock, but only within a day and never into the future.
 * A machine in a shop keeps bad time — plenty are years out — and a bill dated
 * next week sits at the top of every report until next week arrives. A day back
 * is enough for what this is for: an evening's queue posted when the line came
 * back, which may well be after midnight, and which should still count as that
 * evening's takings.
 */
export function effectiveSoldAt(claimed?: string | Date | null, now = new Date()): Date {
  if (!claimed) return now;
  const at = new Date(claimed);
  if (Number.isNaN(at.getTime())) return now;
  const floor = now.getTime() - 86_400_000;
  return new Date(Math.min(Math.max(at.getTime(), floor), now.getTime()));
}

/**
 * VAT, on the lines that carry it.
 *
 * Zero on almost every bill in this country, which is why the whole thing is
 * behind a rate that defaults to off: **medicine is VAT-exempt in Bangladesh**.
 * The same counter also sells baby food, cosmetics, soap and syringes, and a
 * VAT-registered shop has to charge on those — so what a line pays is decided
 * by `ShopProduct.isMedicine`, which the shop already sets when it adds an item,
 * rather than by asking anybody to tag two thousand products.
 *
 * Worked out on the line after its share of the bill's discount, because that
 * is the amount the customer is actually paying for it.
 */
export function vatFor(
  lines: { lineTotal: number; isMedicine: boolean }[],
  subTotal: number,
  billDiscount: number,
  settings: { vatPercent?: number; vatOnMedicine?: boolean } | null,
) {
  const rate = settings?.vatPercent ?? 0;
  if (!(rate > 0) || subTotal <= 0) return { vat: 0, perLine: lines.map(() => 0) };

  const onMedicine = settings?.vatOnMedicine === true;
  /* The bill discount comes off every line in proportion, so VAT is charged on
     what was really paid rather than on the price before the haggling. */
  const keep = Math.max(0, 1 - (billDiscount || 0) / subTotal);

  const perLine = lines.map((l) =>
    l.isMedicine && !onMedicine ? 0 : money((l.lineTotal * keep * rate) / 100),
  );
  return { vat: money(perLine.reduce((n, v) => n + v, 0)), perLine };
}

/**
 * The note, the bill, and what goes back.
 *
 * A ৳570 bill paid with a ৳1000 note is not a ৳1000 sale. The shop keeps ৳570
 * and ৳430 goes straight back over the counter, so the bill records ৳570 taken
 * and ৳430 given — and the cash box is credited with the ৳570, which is what is
 * actually in it. Recording the note would leave the evening's count short by
 * exactly the change, every time, and nobody would know why.
 *
 * Change comes off the cash line and only the cash line: no shop hands notes
 * back against a bKash payment, and a customer who sends ৳1000 on bKash for a
 * ৳570 bill has ৳430 sitting with the shop, not in their hand.
 */
export function settleUp(
  input: { method: string; amount: number; reference?: string }[] | undefined,
  total: number,
) {
  const given = (input ?? []).filter((p) => p.amount > 0).map((p) => ({ ...p }));
  const cashTendered = money(given.filter((p) => p.method === 'cash').reduce((n, p) => n + p.amount, 0));
  const tendered = money(given.filter((p) => p.method !== 'due').reduce((n, p) => n + p.amount, 0));

  let changeGiven = money(Math.max(0, tendered - total));
  /* Only what the cash line can cover — the rest was never change, it was an
     overpayment that stays with the shop and shows as a credit. */
  changeGiven = money(Math.min(changeGiven, cashTendered));

  const payments = given.map((p) =>
    p.method === 'cash' && changeGiven > 0 ? { ...p, amount: money(Math.max(0, p.amount - changeGiven)) } : p,
  );

  const paid = money(payments.filter((p) => p.method !== 'due').reduce((n, p) => n + p.amount, 0));

  return {
    payments: payments.filter((p) => p.amount > 0),
    paid,
    due: money(Math.max(0, total - paid)),
    cashTendered,
    changeGiven,
  };
}

/**
 * The next number on the pad.
 *
 * Taken from the highest number already issued that day, not from how many
 * bills exist. A count repeats a number the moment anything is removed — a
 * cancelled bill, a correction — and two bills with the same number is the one
 * thing a paper pad never does, because the numbers are printed on it.
 *
 * `13-0042` sorts correctly as a string because the serial is padded, so the
 * highest is one indexed read.
 */
async function nextBillNo(org: string, dayKey: string, dayOfMonth: number) {
  const last = await SaleModel.findOne({ organization: org, dayKey })
    .sort({ billNo: -1 })
    .select('billNo')
    .lean();
  const seq = last ? Number(String(last.billNo).split('-')[1] ?? 0) || 0 : 0;
  return `${dayOfMonth}-${String(seq + 1).padStart(4, '0')}`;
}

/**
 * Writes the bill, unless the same one is already there.
 *
 * The early check in `createSale` catches the ordinary replay; this catches the
 * race, where two tabs push the same offline queue within the same instant and
 * both get past it. The unique index decides, and the loser reads back what the
 * winner wrote instead of taking the same strips off the shelf a second time.
 *
 * `null` means the bill already existed — the caller must stop there.
 */
async function createOrReplay(
  doc: Record<string, unknown>,
  /** Called when the number was taken, to get the next one. */
  renumber: () => Promise<string>,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await SaleModel.create(doc);
    } catch (err) {
      const e = err as { code?: number; keyPattern?: Record<string, unknown> };
      if (e.code !== 11000) throw err;

      /* Which uniqueness was broken decides what this means. The counter's own
         reference means the bill is already there and this is a replay. The
         bill number means two counters reached for the same number in the same
         instant, and the second one simply takes the next. */
      if (e.keyPattern?.clientRef) return null;
      if (!e.keyPattern?.billNo) throw err;
      doc.billNo = await renumber();
    }
  }
  throw badRequest('Could not get a bill number — try that again');
}

/**
 * The bill.
 *
 * One call that moves stock, writes the ledger, adds to the shift and — if the
 * customer is a regular buying on account — moves their balance too. Written in
 * that order so a failure halfway leaves stock that is still on the shelf
 * rather than money nobody can trace.
 */
export async function createSale(
  actor: Actor,
  input: {
    lines: { productId: string; qtyPieces: number; pricePerPiece?: number; discount?: number }[];
    payments?: { method: string; amount: number; reference?: string }[];
    discount?: number;
    /** Loyalty points spent on this bill, by the customer named in `customerId`. */
    redeemPoints?: number;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    note?: string;
    /**
     * The classified-register lines, one per controlled drug on the bill.
     *
     * A controlled drug has to be traceable to a name, so a bill cannot carry
     * one without telling the shop who it is going to. Kept separately from the
     * sale lines — a stock line is about stock, this is the part that answers
     * the inspector.
     */
    trace?: { productId: string; buyerName?: string; buyerPhone?: string; doctorName?: string }[];
    /**
     * Set only by a till posting a bill it made while the line was down.
     *
     * `clientRef` makes posting it twice do nothing, and `soldAt` keeps the
     * bill at the time the customer actually stood there rather than the time
     * the internet came back.
     */
    clientRef?: string;
    soldAt?: string | Date;
  },
) {
  if (!input.lines?.length) throw badRequest('Nothing on the bill');

  const clientRef = input.clientRef?.trim() ?? '';
  const offline = clientRef.length > 0;

  if (offline) {
    /* The cheap check. The unique index is what actually holds the line when
       two tabs replay the same queue at the same moment. */
    const already = await SaleModel.findOne({ organization: actor.org, clientRef }).lean();
    if (already) return already;
  }

  const soldAt = offline ? effectiveSoldAt(input.soldAt) : new Date();

  const shift = await openShift(actor);
  // A bill queued offline went through at its own counter; it lands there whatever is picked now.
  const branch = offline && shift?.branch ? (shift.branch as Types.ObjectId) : await sellingBranch(actor, shift, true);
  /* The receipt names the branch when there is more than one, and prints a
     branch's own address and phone where it has them. */
  const here = await BranchModel.findById(branch).select('name address phone').lean();
  const branchInfo =
    here && ((actor.branch?.count ?? 1) > 1 || here.address || here.phone)
      ? { name: (actor.branch?.count ?? 1) > 1 ? here.name : '', address: here.address ?? '', phone: here.phone ?? '' }
      : undefined;
  const products = await ShopProductModel.find({
    _id: { $in: input.lines.map((l) => oid(l.productId)) },
    organization: actor.org,
  }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  /* Allocate everything before writing anything: a bill that takes three lines
     off the shelf and then finds the fourth is short has to fail whole. */
  const planned: {
    product: (typeof products)[number];
    price: number;
    discount: number;
    picks: Awaited<ReturnType<typeof allocate>>;
  }[] = [];

  /* The classified register lines, gathered while the lines are still only
     planned so the bill fails whole instead of posting and then refusing. */
  const trace = new Map<string, { buyerName: string; buyerPhone: string; doctorName: string }>();
  /* Lots already spoken for by an earlier line of this bill. */
  const reserved = new Map<string, number>();
  for (const line of input.lines) {
    const product = byId.get(line.productId);
    if (!product) throw badRequest('One of those items is not on this shop’s list');
    if (!(line.qtyPieces > 0)) throw badRequest(`How many ${product.name}?`);

    planned.push({
      product,
      price: line.pricePerPiece ?? product.mrpPerPiece ?? 0,
      discount: line.discount ?? 0,
      picks: await allocate(actor.org, product._id as Types.ObjectId, line.qtyPieces, offline, branch, reserved),
    });

    if (product.controlled) {
      const given = (input.trace ?? []).find((x) => x.productId === line.productId);
      const buyerName = given?.buyerName?.trim() ?? '';
      if (!buyerName) {
        throw badRequest(`${product.name} is a controlled drug — who is taking it?`);
      }
      trace.set(line.productId, {
        buyerName,
        buyerPhone: given?.buyerPhone?.trim() ?? '',
        doctorName: given?.doctorName?.trim() ?? '',
      });
    }
  }

  const lines = planned.flatMap((p) =>
    p.picks.map((pick) => {
      const gross = pick.pieces * p.price;
      /* A line's discount is spread over the lots it came from in proportion,
         so the pieces of the bill still add up to the bill. */
      const share =
        p.picks.length === 1
          ? p.discount
          : (p.discount * pick.pieces) / p.picks.reduce((n, x) => n + x.pieces, 0);
      return {
        product: p.product._id,
        batch: pick.batch._id,
        name: p.product.name,
        batchNo: pick.batch.batchNo ?? '',
        qtyPieces: pick.pieces,
        pricePerPiece: p.price,
        costPerPiece: pick.batch.costPerPiece ?? 0,
        discount: money(share),
        lineTotal: money(Math.max(0, gross - share)),
        /* Not stored: only used to work out which lines carry VAT. */
        isMedicine: p.product.isMedicine !== false,
      };
    }),
  );

  const subTotal = money(lines.reduce((n, l) => n + l.lineTotal, 0));

  const settings = await ShopSettingsModel.findOne({ organization: actor.org })
    .select('vatPercent vatOnMedicine loyalty')
    .lean();
  const rules = rulesOf(settings?.loyalty);

  /* Points spent come off as a discount, after the counter's own. Checked
     against the customer's balance here; a bill from offline is not refused,
     because the customer has already gone home with the discount. */
  let redeem = { points: 0, value: 0, deduct: 0 };
  if ((input.redeemPoints ?? 0) > 0 && rules.enabled) {
    if (!input.customerId) throw badRequest('Pick the customer whose points these are');
    const holder = await ShopCustomerModel.findOne({ _id: oid(input.customerId), organization: actor.org })
      .select('points')
      .lean();
    if (!holder) throw notFound('Customer');
    const available = Math.floor(holder.points ?? 0);
    const asked = input.redeemPoints!;
    if (!offline && asked > available) throw badRequest(`Only ${available} points to spend`);
    if (!offline && asked < rules.minRedeem) throw badRequest(`At least ${rules.minRedeem} points at a time`);
    const r = redeemFor(rules, asked, Math.max(0, subTotal - (input.discount || 0)));
    redeem = { ...r, deduct: Math.min(r.points, available) };
  }
  const discount = money((input.discount || 0) + redeem.value);
  const afterDiscount = money(Math.max(0, subTotal - discount));

  const { vat, perLine } = vatFor(lines, subTotal, discount, settings);
  const priced = lines.map(({ isMedicine, ...l }, i) => {
    void isMedicine;
    return { ...l, vat: perLine[i] };
  });

  const total = money(afterDiscount + vat);
  const cost = money(lines.reduce((n, l) => n + l.qtyPieces * l.costPerPiece, 0));

  const { payments, paid, due, cashTendered, changeGiven } = settleUp(input.payments, total);

  let customer = null;
  const loyaltyPhone = rules.enabled ? bdMobile(input.customerPhone) : null;
  if (input.customerId) {
    customer = await ShopCustomerModel.findOne({
      _id: oid(input.customerId),
      organization: actor.org,
    });
    if (!customer) throw notFound('Customer');
  } else if (due > 0 || loyaltyPhone) {
    /* Money owed has to be owed by somebody. A due with no name is a hole in
       the till that nobody can chase. A number given for the points is enough
       to open a page for them — the name can come later. */
    const name = input.customerName?.trim() || (due > 0 ? '' : loyaltyPhone!);
    if (!name) throw badRequest('Who is taking it on account?');
    /* A number that is not a mobile number does not go on the book — the bill
       still keeps what was typed, but a bill is never refused over it, because
       one rung up offline and refused at sync is a sale nobody can find. */
    const phone = bdMobile(input.customerPhone) ?? '';

    /*
     * The same person, not a new one every time.
     *
     * The counter types a name, not an id, and Kabir Bhai from the tea stall
     * comes back on Thursday. A row per bill turns the baki khata into a list
     * of ৳70s that never adds up to what he owes — which is the one number the
     * book exists to give. Matched on the phone where there is one, because two
     * customers share a name far more often than a number.
     */
    customer =
      (await ShopCustomerModel.findOne({
        organization: actor.org,
        /* Not somebody in the bin: a due put on a deleted account is one no
           screen shows, and so one nobody ever collects. */
        deletedAt: null,
        ...(phone ? { phone } : { name, phone: '' }),
      })) ?? (await ShopCustomerModel.create({ organization: actor.org, name, phone }));

    /* A name typed more fully the second time is worth keeping. */
    if (phone && name.length > customer.name.length) {
      customer.name = name;
      await customer.save();
    }
  }

  const dayKey = formatDayKey(todayKey(soldAt));
  /* The day of the month in the shop's timezone, not the server's — a bill rung
     up at half past midnight in Dhaka is still that day's bill wherever the
     machine happens to be running. */
  const dayOfMonth = calendarPartsInAppTz(soldAt).day;
  const billNo = await nextBillNo(actor.org, dayKey, dayOfMonth);

  const sale = await createOrReplay(
    {
      organization: actor.org,
      billNo,
      dayKey,
      soldAt,
      clientRef,
      wasOffline: offline,
      salesman: actor.id,
      salesmanName: actor.name,
      branch,
      branchInfo,
      shift: shift?._id ?? null,
      counter: shift?.counter ?? null,
      terminal: shift?.terminal ?? '',
      customer: customer?._id ?? null,
      customerName: customer?.name ?? input.customerName?.trim() ?? '',
      customerPhone: customer?.phone ?? input.customerPhone?.trim() ?? '',
      lines: priced,
      subTotal,
      discount,
      vat,
      vatPercent: settings?.vatPercent ?? 0,
      total,
      cost,
      payments,
      paid,
      cashTendered,
      changeGiven,
      due,
      note: input.note ?? '',
    },
    () => nextBillNo(actor.org, dayKey, dayOfMonth),
  );
  if (!sale) {
    const existing = await SaleModel.findOne({ organization: actor.org, clientRef }).lean();
    if (existing) return existing;
    throw badRequest('That bill has already been posted');
  }

  for (const line of priced) {
    /* One atomic step: two counters selling off the same lot at the same
       moment each take their own pieces, rather than one overwriting the
       other's. Never clamped — the shelf and its ledger must agree, and a
       minus figure (an offline bill, or two counters racing for the last
       strip) is a shelf to count, not a number to hide. */
    const batch = await StockBatchModel.findOneAndUpdate({ _id: line.batch }, { $inc: { qtyOnHand: -line.qtyPieces } }, { new: true });
    if (!batch) continue;

    await StockLedgerModel.create({
      organization: actor.org,
      branch: batch.branch,
      product: line.product,
      batch: batch._id,
      move: 'sale',
      qtyDelta: -line.qtyPieces,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: line.costPerPiece,
      pricePerPiece: line.pricePerPiece,
      ref: { model: 'Sale', id: sale._id },
      actor: actor.id,
      actorName: actor.name,
    });
  }

  /* Points: what was spent comes off, what this bill earned goes on. */
  const earned = customer ? pointsEarned(rules, paid) : 0;
  if (customer && (earned > 0 || redeem.deduct > 0)) {
    await ShopCustomerModel.updateOne(
      { _id: customer._id },
      { $inc: { points: earned - redeem.deduct, pointsEarned: earned } },
    );
    customer.points = Math.max(0, (customer.points ?? 0) + earned - redeem.deduct);
    sale.set('loyalty', { earned, redeemed: redeem.points, value: redeem.value, reversed: 0 });
    await sale.save();
  }

  if (customer && due > 0) {
    customer = await ShopCustomerModel.findById(customer._id).orFail();
    const balance = money((customer.balance ?? 0) + due);
    customer.balance = balance;
    await customer.save();
    await CustomerLedgerModel.create({
      organization: actor.org,
      branch,
      customer: customer._id,
      entry: 'sale',
      amount: due,
      balanceAfter: balance,
      reference: billNo,
      ref: { model: 'Sale', id: sale._id },
      actor: actor.id,
      actorName: actor.name,
    });
  }

  if (shift) {
    const cash = payments.filter((p) => p.method === 'cash').reduce((n, p) => n + p.amount, 0);
    const digital = paid - cash;
    await ShiftModel.updateOne(
      { _id: shift._id },
      {
        $inc: {
          salesCount: 1,
          salesTotal: total,
          cashTaken: cash,
          digitalTaken: digital,
          dueGiven: due,
          expectedCash: cash,
        },
      },
    );
  }

  const saleDoc = { ...sale.toObject(), ...(customer && rules.enabled ? { pointsBalance: Math.floor(customer.points ?? 0) } : {}) };

  /* The classified register: one line per controlled drug, with the name the
     counter was made to take on the way in. Written after the bill so the line
     can name the bill itself — the two are the record of the same moment. */
  if (trace.size > 0) {
    await ShopControlLogModel.insertMany(
      [...trace.entries()].map(([productId, t]) => {
        const p = byId.get(productId)!;
        return {
          organization: actor.org,
          product: p._id,
          name: p.name,
          strength: p.strength ?? '',
          qtyPieces: saleDoc.lines.reduce(
            (n, l) => n + (String(l.product) === String(p._id) ? l.qtyPieces : 0),
            0,
          ),
          buyerName: t.buyerName,
          buyerPhone: t.buyerPhone,
          doctorName: t.doctorName,
          sale: saleDoc._id,
          billNo: saleDoc.billNo,
          soldAt: saleDoc.soldAt,
          salesmanName: saleDoc.salesmanName,
        };
      }),
    );
  }

  return saleDoc;
}

/**
 * A return against a bill.
 *
 * Against the original, always: a shop that can put stock back without naming
 * the bill it came from can put back stock that never left. The pieces go back
 * into the lot they were sold from, which is why the sale line remembers its
 * batch.
 */
export async function returnSale(
  actor: Actor,
  saleId: string,
  input: { lines: { lineId: string; pieces: number }[]; reason?: string },
) {
  /* A bill from any branch this person works at — what comes back goes onto this branch's shelf (below). */
  const sale = await SaleModel.findOne({ _id: oid(saleId), organization: actor.org, ...visibleMatch(actor.branch) });
  if (!sale || sale.deletedAt) throw notFound('Bill');
  /* A cancelled bill has already given everything back; a return on it would
     put the strips on the shelf and the money over the counter a second time. */
  if (sale.status === 'void') throw badRequest('That bill was cancelled — there is nothing left on it to take back');
  if (sale.onHold) throw badRequest('That bill is on hold — clear the hold before taking anything back');
  if (!input.lines?.length) throw badRequest('Which items are coming back?');

  /*
   * What the customer actually paid for a piece: the line after its own
   * discount, less its share of the bill's discount (loyalty points
   * included), plus its VAT. Refunding the shelf price instead hands back
   * money that was never taken.
   */
  const keep = sale.subTotal > 0 ? Math.max(0, (sale.subTotal - (sale.discount || 0)) / sale.subTotal) : 1;
  const prior = refundsSoFar(sale);

  let refund = 0;
  let returnCost = 0;
  let returnVat = 0;
  const moves: { line: (typeof sale.lines)[number]; pieces: number }[] = [];
  for (const ask of input.lines) {
    const line = sale.lines.find((l) => String(l._id) === ask.lineId);
    if (!line) throw badRequest('That line is not on this bill');
    const left = line.qtyPieces - (line.returnedPieces ?? 0) - moves.filter((m) => m.line === line).reduce((n, m) => n + m.pieces, 0);
    if (ask.pieces <= 0 || ask.pieces > left) {
      throw badRequest(`${line.name}: only ${left} can come back`);
    }
    const share = ask.pieces / line.qtyPieces;
    refund += (line.lineTotal * keep + (line.vat ?? 0)) * share;
    returnVat += (line.vat ?? 0) * share;
    returnCost += ask.pieces * (line.costPerPiece ?? 0);
    moves.push({ line, pieces: ask.pieces });
  }

  /* The strips go back on the shelf of the branch taking them back — that is
     where they physically are now — into the same lot (number, expiry, cost)
     there, made if that branch has never held it. */
  const here = actor.branch?.write ?? null;
  for (const { line, pieces } of moves) {
    line.returnedPieces = (line.returnedPieces ?? 0) + pieces;
    if (!line.batch) continue;
    let target: unknown = line.batch;
    const sold = await StockBatchModel.findById(line.batch).lean();
    if (sold && here && sold.branch && String(sold.branch) !== String(here)) {
      const there =
        (await StockBatchModel.findOne({
          organization: actor.org,
          branch: here,
          product: sold.product,
          batchNo: sold.batchNo ?? '',
          expiry: sold.expiry ?? null,
        }).select('_id').lean()) ??
        (await StockBatchModel.create({
          organization: actor.org,
          branch: here,
          product: sold.product,
          batchNo: sold.batchNo ?? '',
          expiry: sold.expiry ?? null,
          costPerPiece: sold.costPerPiece,
          mrpPerPiece: sold.mrpPerPiece,
          qtyOnHand: 0,
          purchase: sold.purchase ?? null,
          supplier: sold.supplier ?? null,
          receivedAt: new Date(),
        }));
      target = there._id;
    }
    const batch = await StockBatchModel.findOneAndUpdate({ _id: target }, { $inc: { qtyOnHand: pieces } }, { new: true });
    if (!batch) continue;
    await StockLedgerModel.create({
      organization: actor.org,
      branch: batch.branch,
      product: line.product,
      batch: batch._id,
      move: 'sale_return',
      qtyDelta: pieces,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: line.costPerPiece,
      ref: { model: 'Sale', id: sale._id },
      reason: input.reason ?? '',
      actor: actor.id,
      actorName: actor.name,
    });
  }

  const allBack = sale.lines.every((l) => (l.returnedPieces ?? 0) >= l.qtyPieces);
  /* Never more than is left on the bill; and the last piece back settles it
     exactly, so paisa rounding cannot leave a bill a taka short or over. */
  const remaining = money(Math.max(0, sale.total - prior.value));
  refund = allBack ? remaining : Math.min(money(refund), remaining);
  returnVat = money(Math.min(returnVat, Math.max(0, (sale.vat ?? 0) - prior.vat)));
  returnCost = money(returnCost);

  /*
   * Where the money goes back to.
   *
   * First off whatever of this bill is still on the customer's baki —
   * refunding cash on a bill that was never paid for hands money to somebody
   * who has not given any. Then back the way it came: cash from the drawer up
   * to the cash this bill took, and the rest by the bKash, Nagad or card it
   * was paid with, which never leaves the drawer.
   */
  let againstDue = 0;
  if (sale.customer) {
    const dueLeft = money(Math.max(0, (sale.due ?? 0) - prior.againstDue));
    if (dueLeft > 0) {
      const customer = await ShopCustomerModel.findOne({ _id: sale.customer, organization: actor.org });
      if (customer) {
        againstDue = money(Math.min(refund, dueLeft, Math.max(0, customer.balance ?? 0)));
        if (againstDue > 0) {
          const balance = money((customer.balance ?? 0) - againstDue);
          customer.balance = balance;
          await customer.save();
          await CustomerLedgerModel.create({
            organization: actor.org,
            branch: sale.branch ?? null,
            customer: customer._id,
            entry: 'sale_return',
            amount: -againstDue,
            balanceAfter: balance,
            reference: sale.billNo,
            note: input.reason ?? 'Returned',
            ref: { model: 'Sale', id: sale._id },
            actor: actor.id,
            actorName: actor.name,
          });
        }
      }
    }
  }
  const rest = money(refund - againstDue);
  const cashPaid = (sale.payments ?? []).filter((p) => p.method === 'cash').reduce((n, p) => n + p.amount, 0);
  const cashBack = money(Math.min(rest, Math.max(0, cashPaid - prior.cash)));
  const otherBack = money(rest - cashBack);
  const otherMethod =
    otherBack > 0
      ? [...(sale.payments ?? [])].filter((p) => p.method !== 'cash' && p.method !== 'due').sort((a, b) => b.amount - a.amount)[0]?.method ?? 'bkash'
      : '';

  sale.set('refunds', {
    value: money(prior.value + refund),
    againstDue: money(prior.againstDue + againstDue),
    cash: money(prior.cash + cashBack),
    other: money(prior.other + otherBack),
    vat: money(prior.vat + returnVat),
    cost: money(prior.cost + returnCost),
  });
  sale.status = allBack ? 'returned' : 'completed';
  await sale.save();

  /* The points this bill earned go back in proportion to what came back. */
  const lp = sale.loyalty;
  if (sale.customer && lp?.earned) {
    const back = pointsClawedBack(lp.earned, lp.reversed ?? 0, refund, sale.total);
    if (back > 0) {
      const holder = await ShopCustomerModel.findOne({ _id: sale.customer, organization: actor.org }).select('points').lean();
      const take = Math.min(back, Math.floor(holder?.points ?? 0));
      if (take > 0) await ShopCustomerModel.updateOne({ _id: sale.customer }, { $inc: { points: -take } });
      sale.set('loyalty.reversed', (lp.reversed ?? 0) + back);
      await sale.save();
    }
  }

  /* On the accounts: what went back and how, and what the return took off the sale. */
  await recordRefund(actor, {
    saleId: sale._id,
    billNo: sale.billNo,
    cashBack,
    otherBack,
    otherMethod,
    returnValue: refund,
    returnCost,
    returnVat,
    note: input.reason ?? '',
  }).catch(() => undefined);

  /* The counter doing the return: its drawer gives the cash, and its day's
     figures lose the sale. */
  const shift = await openShift(actor);
  if (shift) {
    await ShiftModel.updateOne(
      { _id: shift._id },
      {
        $inc: {
          cashTaken: -cashBack,
          expectedCash: -cashBack,
          digitalTaken: -otherBack,
          dueGiven: -againstDue,
          salesTotal: -refund,
        },
      },
    );
  }

  return {
    billNo: sale.billNo,
    refund,
    cashBack,
    otherBack,
    otherMethod,
    againstDue,
    status: sale.status,
  };
}

/**
 * What returns have already given back on a bill.
 *
 * Read from the bill's own record. A bill returned before that record was
 * kept is worked out the old way — its returned pieces at the price sold —
 * so a later return or a cancel on it still knows roughly what is left.
 */
export function refundsSoFar(sale: {
  refunds?: { value?: number | null; againstDue?: number | null; cash?: number | null; other?: number | null; vat?: number | null; cost?: number | null } | null;
  lines?: { returnedPieces?: number | null; pricePerPiece: number; costPerPiece?: number | null }[];
  due?: number | null;
}) {
  const r = sale.refunds;
  if (r && r.value !== undefined && r.value !== null) {
    return { value: r.value ?? 0, againstDue: r.againstDue ?? 0, cash: r.cash ?? 0, other: r.other ?? 0, vat: r.vat ?? 0, cost: r.cost ?? 0 };
  }
  const legacy = returnedOf(sale.lines ?? []);
  const againstDue = Math.min(legacy.value, sale.due ?? 0);
  return { value: legacy.value, againstDue, cash: money(legacy.value - againstDue), other: 0, vat: 0, cost: legacy.cost };
}

/* --------------------------------------------------------------- the day -- */

/** The pieces that came back off a bill, at the price sold and at cost. */
export function returnedOf(
  lines: { returnedPieces?: number | null; pricePerPiece: number; costPerPiece?: number | null }[],
) {
  let value = 0;
  let cost = 0;
  for (const l of lines) {
    value += (l.returnedPieces ?? 0) * l.pricePerPiece;
    cost += (l.returnedPieces ?? 0) * (l.costPerPiece ?? 0);
  }
  return { value: money(value), cost: money(cost) };
}

/* The same, inside an aggregation over bills: the bill's own refund record
   where it has one, the old shelf-price reckoning where it does not. */
const RETURNED_VALUE = {
  $ifNull: [
    '$refunds.value',
    {
      $reduce: {
        input: '$lines',
        initialValue: 0,
        in: {
          $add: ['$$value', { $multiply: [{ $ifNull: ['$$this.returnedPieces', 0] }, '$$this.pricePerPiece'] }],
        },
      },
    },
  ],
};
const RETURNED_COST_LEGACY = {
  $reduce: {
    input: '$lines',
    initialValue: 0,
    in: {
      $add: [
        '$$value',
        { $multiply: [{ $ifNull: ['$$this.returnedPieces', 0] }, { $ifNull: ['$$this.costPerPiece', 0] }] },
      ],
    },
  },
};
const RETURNED_COST = { $ifNull: ['$refunds.cost', RETURNED_COST_LEGACY] };

/**
 * What this till has taken today.
 *
 * Scoped to the person by default, because that is what a salesman is allowed
 * to see; an owner asks for the shop's.
 */
export async function daySummary(actor: Actor, opts: { all?: boolean; dayKey?: string } = {}) {
  const filter: Record<string, unknown> = {
    organization: actor.org,
    dayKey: formatDayKey(parseDayKey(opts.dayKey)),
    deletedAt: null,
    ...branchMatch(actor.branch),
  };
  if (!opts.all) filter.salesman = actor.id;

  const rows = await SaleModel.find(filter).sort({ soldAt: -1 }).lean();
  /* Cancelled bills are listed and not counted: the money came back out when
     they were cancelled, and adding it again would invent a day's takings. */
  const sales = rows.filter((s) => s.status !== 'void');

  const byMethod: Record<string, number> = {};
  for (const s of sales) {
    for (const p of s.payments ?? []) {
      /* Baki is not money taken; it is on the bill's own `due`. */
      if (p.method === 'due') continue;
      byMethod[p.method] = money((byMethod[p.method] ?? 0) + p.amount);
    }
  }

  const back = sales.reduce(
    (acc, s) => {
      const b = refundsSoFar(s);
      return { value: acc.value + b.value, cost: acc.cost + b.cost, vat: acc.vat + b.vat };
    },
    { value: 0, cost: 0, vat: 0 },
  );

  return {
    dayKey: filter.dayKey as string,
    count: sales.length,
    total: money(sales.reduce((n, s) => n + s.total, 0)),
    /* What came back off these bills, at the price it sold for. */
    returned: money(back.value),
    due: money(sales.reduce((n, s) => n + s.due, 0)),
    /* Only an owner is told what the day made — a salesman sees what they took,
       never what it cost the shop. Net of what came back, as the accounts are. */
    margin: opts.all
      ? /* VAT is collected for the government, not earned: out of the margin, on the bills and on the returns. */
        money(sales.reduce((n, s) => n + (s.total - (s.vat ?? 0) - s.cost), 0) - (back.value - back.vat - back.cost))
      : undefined,
    byMethod,
    sales: rows.slice(0, 50).map((s) => ({
      _id: String(s._id),
      billNo: s.billNo,
      soldAt: s.soldAt,
      salesmanName: s.salesmanName,
      customerName: s.customerName,
      total: s.total,
      due: s.due,
      status: s.status,
      onHold: s.onHold,
      items: s.lines.length,
    })),
  };
}

/**
 * The bills, over a stretch of days.
 *
 * The day summary answers "how did today go". This answers the other question
 * a shop asks, which is "find me that bill" — the customer with a strip in a
 * carrier bag and a number on a slip, the owner checking what went out on
 * Friday evening, the argument about whether something was paid.
 *
 * Two things it does that a plain list would not:
 *
 * - **The totals are for the whole range, not the page.** A shop looking at a
 *   month wants the month's figure, and a total that only adds up the fifty
 *   bills on screen is a wrong number presented as a right one.
 * - **A salesman sees their own.** Same rule as everywhere else in the shop:
 *   `mine` is forced on for anybody who is not running the place, and the
 *   margin is left off entirely, because it is worked out from what the shop
 *   paid.
 */
export async function listSales(
  actor: Actor,
  opts: {
    from?: string;
    to?: string;
    q?: string;
    /** Only this salesman's bills. Forced on for a salesman by the route. */
    mine?: boolean;
    /** 'due' finds the bills still owed on, 'returned' the ones taken back. */
    only?: 'due' | 'returned';
    /** Whether the caller may be told the margin. */
    withMargin?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const from = formatDayKey(parseDayKey(opts.from));
  const to = formatDayKey(parseDayKey(opts.to));
  if (to < from) throw badRequest('That date range runs backwards');

  /* `YYYY-MM-DD` compares as a range without any conversion, which is the
     whole reason the key is stored that way. */
  const filter: Record<string, unknown> = {
    organization: actor.org,
    dayKey: { $gte: from, $lte: to },
    ...branchMatch(actor.branch),
    /* The bin is a screen of its own. A deleted bill on the register would be a
       bill somebody has to work out the status of every time they look. */
    deletedAt: null,
  };
  if (opts.mine) filter.salesman = actor.id;
  if (opts.only === 'due') filter.due = { $gt: 0 };
  if (opts.only === 'returned') filter.status = 'returned';

  const text = opts.q?.trim();
  if (text) {
    /*
     * A bill number is what a customer reads out, so it is matched first and
     * loosely: "42" should find 13-0042, because nobody reads the day part
     * back. The name and the phone are there for the regular who lost the slip.
     */
    const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ billNo: rx }, { customerName: rx }, { customerPhone: rx }];
  }

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));

  const [rows, total, totals, methods] = await Promise.all([
    SaleModel.find(filter)
      .sort({ soldAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SaleModel.countDocuments(filter),
    SaleModel.aggregate<{
      _id: null;
      total: number;
      paid: number;
      due: number;
      cost: number;
      returned: number;
      returnedCost: number;
    }>([
      /*
       * `find` casts the org string through the schema; an aggregation does
       * not, and an un-cast id matches nothing — quietly, as a zero total.
       *
       * A cancelled bill is shown in the list and left out of the arithmetic:
       * its money was reversed when it was cancelled, so counting it again
       * would report takings the shop never had.
       */
      {
        $match: {
          ...filter,
          organization: new Types.ObjectId(actor.org),
          status: { $ne: 'void' },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          paid: { $sum: '$paid' },
          due: { $sum: '$due' },
          cost: { $sum: '$cost' },
          returned: { $sum: RETURNED_VALUE },
          returnedCost: { $sum: RETURNED_COST },
        },
      },
    ]),
    /*
     * How the money came in, over the same bills.
     *
     * The payments on a bill are already net of change — a ৳1000 note on a
     * ৳570 bill is recorded as ৳570 cash — so these add up to what is in the
     * drawer and the phone, not to the notes that crossed the counter.
     */
    SaleModel.aggregate<{ _id: string; amount: number; bills: number }>([
      {
        $match: {
          ...filter,
          organization: new Types.ObjectId(actor.org),
          status: { $ne: 'void' },
        },
      },
      { $unwind: '$payments' },
      { $match: { 'payments.method': { $ne: 'due' } } },
      { $group: { _id: '$payments.method', amount: { $sum: '$payments.amount' }, bills: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
  ]);

  const sum = totals[0] ?? { total: 0, paid: 0, due: 0, cost: 0, returned: 0, returnedCost: 0 };

  return {
    from,
    to,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    count: total,
    byMethod: methods.map((m) => ({ method: m._id, amount: money(m.amount), bills: m.bills })),
    totals: {
      total: money(sum.total),
      paid: money(sum.paid),
      due: money(sum.due),
      /* What came back off these bills, at the price it sold for. */
      returned: money(sum.returned ?? 0),
      /* Net of what came back, the way the accounts count it. */
      margin: opts.withMargin
        ? money(sum.total - sum.cost - ((sum.returned ?? 0) - (sum.returnedCost ?? 0)))
        : undefined,
    },
    sales: rows.map((s) => ({
      _id: String(s._id),
      billNo: s.billNo,
      soldAt: s.soldAt,
      salesmanName: s.salesmanName,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      items: s.lines.length,
      total: s.total,
      paid: s.paid,
      due: s.due,
      status: s.status,
      onHold: s.onHold,
      terminal: s.terminal,
      wasOffline: s.wasOffline,
      methods: [...new Set((s.payments ?? []).map((p) => p.method))],
    })),
  };
}

export async function getSale(actor: Actor, id: string) {
  const sale = await SaleModel.findOne({ _id: oid(id), organization: actor.org, ...branchMatch(actor.branch) }).lean();
  if (!sale) throw notFound('Bill');
  return sale;
}

/** Finding the bill a customer has come back with. */
export async function findSale(actor: Actor, billNo: string) {
  /* Any branch this person works at: the slip in the customer's hand may be from the other one. */
  return SaleModel.find({ organization: actor.org, billNo: billNo.trim(), ...visibleMatch(actor.branch) })
    .sort({ soldAt: -1 })
    .limit(5)
    .lean();
}

/* -------------------------------------------------------------- the baki -- */

export async function listCustomers(actor: Actor, q?: string) {
  /* The bin is its own screen: nothing deleted appears on a list. */
  const filter: Record<string, unknown> = { organization: actor.org, deletedAt: null };
  if (q?.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  return ShopCustomerModel.find(filter).sort({ balance: -1, name: 1 }).limit(100).lean();
}

/**
 * The book as a page: paged, filtered, and with the whole book's figures.
 *
 * `listCustomers` stays as it is for the till's name picker, which wants a
 * short list of matches and nothing else. This is the Customers screen's, and
 * it needs what that one cannot give: the total out on the book across every
 * name — not the first hundred — and each person's last movement, which is
 * how a shop tells a regular from somebody who has not been in since Eid.
 */
export async function customerBook(
  actor: Actor,
  opts: {
    q?: string;
    /** `owing`: owes something; `clear`: owes nothing; `over`: past their limit. */
    show?: 'owing' | 'clear' | 'over';
    sort?: 'owed' | 'name' | 'recent';
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const base: Record<string, unknown> = {
    organization: new Types.ObjectId(actor.org),
    deletedAt: null,
  };
  const q = opts.q;
  if (q?.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    base.$or = [{ name: rx }, { phone: rx }];
  }

  const overLimit = {
    $and: [{ $gt: ['$creditLimit', 0] }, { $gt: ['$balance', '$creditLimit'] }],
  };
  const show: Record<string, unknown> =
    opts.show === 'owing'
      ? { balance: { $gt: 0 } }
      : opts.show === 'clear'
        ? { balance: { $lte: 0 } }
        : opts.show === 'over'
          ? { $expr: overLimit }
          : {};
  const sort: Record<string, 1 | -1> =
    opts.sort === 'name'
      ? { name: 1 }
      : opts.sort === 'recent'
        ? { lastAt: -1, name: 1 }
        : { balance: -1, name: 1 };

  /* Each person's last movement on the account — a bill, a payment. */
  const lastMove: PipelineStage.FacetPipelineStage[] = [
    {
      $lookup: {
        from: 'customerledgers',
        let: { c: '$_id' },
        as: 'last',
        pipeline: [
          { $match: { $expr: { $eq: ['$customer', '$$c'] } } },
          { $sort: { at: -1 } },
          { $limit: 1 },
          { $project: { at: 1, entry: 1 } },
        ],
      },
    },
    { $addFields: { lastAt: { $first: '$last.at' }, lastEntry: { $first: '$last.entry' } } },
  ];

  const [out] = await ShopCustomerModel.aggregate<{
    rows: Record<string, unknown>[];
    count: { n: number }[];
    summary: { customers: number; owing: number; owed: number; over: number }[];
  }>([
    { $match: base },
    {
      $facet: {
        rows: [
          { $match: show },
          /* The last movement is only looked up for the names on this page. */
          ...(opts.sort === 'recent'
            ? [...lastMove, { $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }]
            : [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }, ...lastMove]),
          { $project: { last: 0 } },
        ],
        count: [{ $match: show }, { $count: 'n' }],
        summary: [
          {
            $group: {
              _id: null,
              customers: { $sum: 1 },
              owing: { $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] } },
              owed: { $sum: { $max: ['$balance', 0] } },
              over: { $sum: { $cond: [overLimit, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const sum = out?.summary[0];
  return {
    data: (out?.rows ?? []).map((c) => ({ ...c, _id: String(c._id) })),
    total: out?.count[0]?.n ?? 0,
    page,
    limit,
    summary: {
      customers: sum?.customers ?? 0,
      owing: sum?.owing ?? 0,
      owed: Math.round((sum?.owed ?? 0) * 100) / 100,
      over: sum?.over ?? 0,
    },
  };
}

/**
 * A phone typed on the customer form: blank is allowed, a wrong number is not.
 * `undefined` means the field was not sent, so an edit leaves it alone.
 */
function customerPhone(typed: string | undefined): string | undefined {
  if (typed === undefined) return undefined;
  if (!typed.trim()) return '';
  const phone = bdMobile(typed);
  if (!phone) throw badRequest(BD_MOBILE_MESSAGE);
  return phone;
}

/**
 * Putting a name on the book before anything goes on account.
 *
 * The till still adds people as it always did; this is for the shop moving off
 * its notebook, where the regulars — and what they already owe — exist before
 * the first bill does. The opening balance is a ledger row like every other
 * figure on the account, so the first statement printed adds up to the page it
 * was copied from.
 *
 * Refused on a phone already on the book: the till matches returning customers
 * by phone, and two rows with one number is the same person owing twice.
 */
export async function createCustomer(
  actor: Actor,
  input: {
    name: string;
    phone?: string;
    address?: string;
    note?: string;
    creditLimit?: number;
    openingBalance?: number;
  },
) {
  const phone = customerPhone(input.phone) ?? '';
  if (phone) {
    const clash = await ShopCustomerModel.findOne({
      organization: actor.org,
      phone,
      deletedAt: null,
    }).lean();
    if (clash) throw badRequest(`That number is already on the book as ${clash.name}`);
  }

  const opening = money(input.openingBalance ?? 0);
  const customer = await ShopCustomerModel.create({
    organization: actor.org,
    name: input.name.trim(),
    phone,
    address: input.address?.trim() ?? '',
    note: input.note?.trim() ?? '',
    creditLimit: input.creditLimit ?? 0,
    balance: opening,
  });

  if (opening > 0) {
    await CustomerLedgerModel.create({
      organization: actor.org,
      customer: customer._id,
      entry: 'opening',
      amount: opening,
      balanceAfter: opening,
      note: 'Opening balance',
      actor: actor.id,
      actorName: actor.name,
    });
  }

  return customer.toObject();
}

/**
 * Correcting who somebody is — never what they owe.
 *
 * The balance is not on the list of things that can be edited: it moves by
 * sales, returns and payments, each a row, and a figure typed over is one the
 * statement can no longer explain.
 */
export async function updateCustomer(
  actor: Actor,
  id: string,
  input: { name?: string; phone?: string; address?: string; note?: string; creditLimit?: number },
) {
  const phone = customerPhone(input.phone);
  if (phone) {
    const clash = await ShopCustomerModel.findOne({
      organization: actor.org,
      phone,
      deletedAt: null,
      _id: { $ne: oid(id) },
    }).lean();
    if (clash) throw badRequest(`That number is already on the book as ${clash.name}`);
  }

  const set: Record<string, unknown> = {};
  for (const key of ['name', 'address', 'note', 'creditLimit'] as const) {
    if (input[key] !== undefined) set[key] = input[key];
  }
  if (phone !== undefined) set.phone = phone;

  const customer = await ShopCustomerModel.findOneAndUpdate(
    { _id: oid(id), organization: actor.org, deletedAt: null },
    { $set: set },
    { new: true },
  ).lean();
  if (!customer) throw notFound('Customer');
  return customer;
}

/**
 * One regular's account, in full.
 *
 * The page the notebook opens to when somebody comes to settle: what they owe
 * now, every bill they have taken, and every payment they have made, each with
 * the balance as it stood after it. The running total is recomputed from the
 * rows rather than read off the customer, so the figure at the bottom is always
 * one that can be explained line by line — which is the whole point of a ledger
 * in an argument at a counter.
 *
 * The bills come back beside it because "kobe ki nisilo" is the other half of
 * the same question, and a ledger row saying "sale, ৳140" does not answer it.
 */
export async function customerStatement(
  actor: Actor,
  id: string,
  range: { from?: string; to?: string } = {},
) {
  const customer = await ShopCustomerModel.findOne({
    _id: oid(id),
    organization: actor.org,
  }).lean();
  if (!customer) throw notFound('Customer');

  const rows = await CustomerLedgerModel.find({
    organization: actor.org,
    customer: customer._id,
  })
    .sort({ at: 1, createdAt: 1 })
    .lean();

  let running = 0;
  const entries = rows.map((r) => {
    running += r.amount;
    return { ...r, _id: String(r._id), balanceAfter: money(running) };
  });

  const from = range.from ? new Date(range.from) : null;
  const to = range.to ? new Date(`${range.to}T23:59:59.999`) : null;
  const shown = entries.filter((e) => (!from || new Date(e.at) >= from) && (!to || new Date(e.at) <= to));

  const bills = await SaleModel.find({ organization: actor.org, customer: customer._id, deletedAt: null })
    .sort({ soldAt: -1 })
    .limit(100)
    .lean();

  return {
    customer: { ...customer, _id: String(customer._id) },
    /* The whole account, not the window: a statement for September still has to
       say what is owed in total. */
    balance: money(running),
    openingForRange: shown.length ? money(shown[0].balanceAfter - shown[0].amount) : money(running),
    entries: shown,
    /* What they took, so a payment can be matched to the bills behind it. */
    bills: bills.map((b) => ({
      _id: String(b._id),
      billNo: b.billNo,
      soldAt: b.soldAt,
      items: b.lines.length,
      total: b.total,
      paid: b.paid,
      due: b.due,
      status: b.status,
      salesmanName: b.salesmanName,
    })),
    /* Cancelled bills are listed, marked, and not added up — and what came back is taken off. */
    totals: {
      bought: money(bills.filter((b) => b.status !== 'void').reduce((n, b) => n + b.total - refundsSoFar(b).value, 0)),
      paidAtCounter: money(bills.filter((b) => b.status !== 'void').reduce((n, b) => n + b.paid, 0)),
      onAccount: money(bills.filter((b) => b.status !== 'void').reduce((n, b) => n + Math.max(0, b.due - refundsSoFar(b).againstDue), 0)),
    },
  };
}

/** Money coming in against the baki khata. */
export async function payCustomer(
  actor: Actor,
  id: string,
  input: { amount: number; method?: string; note?: string },
) {
  const customer = await ShopCustomerModel.findOne({ _id: oid(id), organization: actor.org });
  if (!customer) throw notFound('Customer');
  if (!(input.amount > 0)) throw badRequest('A payment has to be more than nothing');
  /* More than is owed is a slip of the finger, not an advance: the khata has
     no way to show money held for somebody, and a minus balance reads as
     "clear" on every screen while the shop quietly owes them. */
  const owes = money(Math.max(0, customer.balance ?? 0));
  if (input.amount > owes + 0.009) {
    throw badRequest(
      owes > 0 ? `${customer.name} owes ৳${owes} — take that much at most` : `${customer.name} owes nothing`,
    );
  }

  const balance = money((customer.balance ?? 0) - input.amount);
  customer.balance = balance;
  await customer.save();

  /* Cash taken at an open counter is in that drawer, and the evening count
     has to expect it — or every baki collected reads as money found. */
  if ((input.method ?? 'cash') === 'cash') {
    const shift = await openShift(actor);
    if (shift) {
      await ShiftModel.updateOne({ _id: shift._id }, { $inc: { expectedCash: money(input.amount), khataTaken: money(input.amount) } });
    }
  }

  await CustomerLedgerModel.create({
    organization: actor.org,
    branch: await branchOrMain(actor),
    customer: customer._id,
    entry: 'payment',
    amount: -Math.abs(input.amount),
    balanceAfter: balance,
    method: input.method ?? 'cash',
    note: input.note ?? '',
    actor: actor.id,
    actorName: actor.name,
  });

  return { balance };
}

/* ----------------------------------------------------------------- alerts -- */

/** How close an expiry has to be before the counter is told about it. */
export const ALERT_EXPIRY_DAYS = 30;
/** Each list is capped: the bell is a nudge, the Stock and Expiry screens are the lists. */
const ALERT_CAP = 40;

export interface StockAlert {
  /** Stable across polls, so the page can tell a new alert from one already seen. */
  key: string;
  kind: 'expired' | 'expiring' | 'out' | 'low';
  productId: string;
  name: string;
  batchNo?: string;
  expiry?: Date | null;
  /** Pieces: on the lot for an expiry alert, on the whole shelf for a stock one. */
  qty: number;
  reorderLevel?: number;
}

/**
 * What the counter should be told without having to go and look.
 *
 * Four things that get worse quietly: a lot past its date still in the drawer,
 * a lot about to be, a shelf that has run out, and one below the level the
 * shop set. On the till router rather than the back room's, because the person
 * at the counter is the one who meets an empty shelf first — and so it carries
 * names, lots and counts only, never what anything cost.
 *
 * "Out" is only a product that has been stocked before. A shop's list starts
 * as hundreds of catalogue rows it has never bought, and every one of them
 * shouting "out of stock" on day one would teach everybody to ignore the bell.
 */
export async function stockAlerts(actor: Actor) {
  const org = new Types.ObjectId(actor.org);
  const now = new Date();
  const soon = new Date(now.getTime() + ALERT_EXPIRY_DAYS * 86_400_000);

  const [lots, shelves] = await Promise.all([
    StockBatchModel.find({
      organization: org,
      ...branchMatch(actor.branch),
      qtyOnHand: { $gt: 0 },
      expiry: { $ne: null, $lte: soon },
    })
      .populate<{
        product: { _id: Types.ObjectId; name: string; isActive?: boolean; deletedAt?: Date | null } | null;
      }>('product', 'name isActive deletedAt')
      .sort({ expiry: 1 })
      .lean(),
    StockBatchModel.aggregate<{ _id: Types.ObjectId; onHand: number }>([
      { $match: { organization: org, ...branchMatch(actor.branch) } },
      {
        $group: {
          _id: '$product',
          /* In-date pieces only: an expired strip is not something to sell,
             so a shelf of nothing else is a shelf that has run out. */
          onHand: {
            $sum: {
              $cond: [{ $or: [{ $eq: ['$expiry', null] }, { $gte: ['$expiry', now] }] }, '$qtyOnHand', 0],
            },
          },
        },
      },
    ]),
  ]);

  const products = await ShopProductModel.find({
    _id: { $in: shelves.map((s) => s._id) },
    organization: org,
    isActive: true,
    deletedAt: null,
  })
    .select('name reorderLevel')
    .lean();
  const onHand = new Map(shelves.map((s) => [String(s._id), s.onHand]));

  const expired: StockAlert[] = [];
  const expiring: StockAlert[] = [];
  for (const lot of lots) {
    const p = lot.product;
    if (!p || p.isActive === false || p.deletedAt) continue;
    const gone = isExpired(lot, now);
    const list = gone ? expired : expiring;
    list.push({
      key: `${gone ? 'expired' : 'expiring'}:${lot._id}`,
      kind: gone ? 'expired' : 'expiring',
      productId: String(p._id),
      name: p.name,
      batchNo: lot.batchNo ?? '',
      expiry: lot.expiry,
      qty: lot.qtyOnHand,
    });
  }

  const out: StockAlert[] = [];
  const low: StockAlert[] = [];
  for (const p of products) {
    const qty = onHand.get(String(p._id)) ?? 0;
    if (qty <= 0) {
      out.push({ key: `out:${p._id}`, kind: 'out', productId: String(p._id), name: p.name, qty: 0 });
    } else if (p.reorderLevel > 0 && qty <= p.reorderLevel) {
      /* The level is part of the key: raising it is a new thing to be told. */
      low.push({
        key: `low:${p._id}:${p.reorderLevel}`,
        kind: 'low',
        productId: String(p._id),
        name: p.name,
        qty,
        reorderLevel: p.reorderLevel,
      });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  low.sort((a, b) => a.qty / (a.reorderLevel || 1) - b.qty / (b.reorderLevel || 1));

  return {
    days: ALERT_EXPIRY_DAYS,
    counts: { expired: expired.length, expiring: expiring.length, out: out.length, low: low.length },
    expired: expired.slice(0, ALERT_CAP),
    expiring: expiring.slice(0, ALERT_CAP),
    out: out.slice(0, ALERT_CAP),
    low: low.slice(0, ALERT_CAP),
  };
}
