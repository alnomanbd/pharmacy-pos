import { Types } from 'mongoose';
import {
  ShopRackModel,
  ShopProductModel,
  StockBatchModel,
  StockLedgerModel,
  StockCountModel,
} from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import type { Actor } from './shop.service.js';
import { branchMatch, writeBranchOf } from './branchScope.service.js';

/**
 * Counting the shelf.
 *
 * The screen and the shelf disagree eventually in every shop — a strip handed
 * over and not rung up, a box broken open, a bill posted from offline against
 * stock somebody else had already sold. The count is how the two are put back
 * together, and it is the only screen in the shop that writes a number nobody
 * derived from a document.
 *
 * The rule that makes it safe, and the one everybody gets wrong:
 *
 * > Applying a count adds `counted − expected` to what the batch holds **now**.
 * > It does not set the batch to what was counted.
 *
 * Counting a rack takes an evening and the shop does not stop selling while
 * somebody walks it. Writing the counted figure over the batch would quietly
 * erase every bill rung up in between — which is a loss that looks exactly like
 * theft, on a screen whose whole purpose is finding theft.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

/**
 * Starts a count, or hands back the one already going.
 *
 * One at a time per shop. Two open counts over the same stock, applied one
 * after the other, would each claim the other's sales as a difference — and a
 * count that produces a wrong difference is worse than no count at all, because
 * somebody acts on it.
 */
export async function startCount(actor: Actor, input: { rackId?: string } = {}) {
  /* One count open per branch: each branch counts its own shelves. */
  const branch = await writeBranchOf(actor);
  const open = await StockCountModel.findOne({ organization: actor.org, branch, status: 'open' }).lean();
  if (open) return open;

  let rack = null;
  if (input.rackId) {
    rack = await ShopRackModel.findOne({ _id: oid(input.rackId), organization: actor.org }).lean();
    if (!rack) throw notFound('Rack');
  }

  const products = await ShopProductModel.find({
    organization: actor.org,
    isActive: { $ne: false },
    ...(rack ? { rack: rack._id } : {}),
  })
    .select('name rackLabel')
    .lean();
  if (products.length === 0) throw badRequest('Nothing on that rack to count');

  const byProduct = new Map(products.map((p) => [String(p._id), p]));

  /*
   * Every lot, including the ones the screen says are empty.
   *
   * A shelf the screen calls empty is exactly where a strip nobody rang up
   * turns out to be sitting, and a sheet that only lists what the screen
   * already knows about can never find one.
   */
  const batches = await StockBatchModel.find({
    organization: actor.org,
    branch,
    product: { $in: products.map((p) => p._id) },
  })
    .select('product batchNo expiry qtyOnHand costPerPiece')
    .lean();

  const lines = batches.map((b) => {
    const product = byProduct.get(String(b.product));
    return {
      product: b.product,
      batch: b._id,
      name: product?.name ?? '',
      batchNo: b.batchNo ?? '',
      rackLabel: product?.rackLabel ?? '',
      expiry: b.expiry ?? null,
      expected: b.qtyOnHand,
      counted: null,
      costPerPiece: b.costPerPiece ?? 0,
    };
  });

  const made = await StockCountModel.create({
    organization: actor.org,
    branch,
    rack: rack?._id ?? null,
    rackLabel: rack?.name ?? '',
    lines,
    startedBy: actor.id,
    startedByName: actor.name,
  });
  return made.toObject();
}

/** The count in progress, if there is one. */
export async function openCount(actor: Actor) {
  return StockCountModel.findOne({ organization: actor.org, status: 'open', ...branchMatch(actor.branch) }).lean();
}

/** The history, without dragging every line of every sheet back with it. */
export async function listCounts(actor: Actor, limit = 20) {
  const rows = await StockCountModel.find({ organization: actor.org, ...branchMatch(actor.branch) })
    .select(
      'rackLabel status startedAt startedByName appliedAt appliedByName shortPieces extraPieces valueDelta lines',
    )
    .sort({ startedAt: -1 })
    .limit(Math.min(100, limit))
    .lean();

  return rows.map(({ lines, ...rest }) => ({
    ...rest,
    lines: lines.length,
    counted: lines.filter((l) => l.counted !== null).length,
  }));
}

export async function getCount(actor: Actor, id: string) {
  const found = await StockCountModel.findOne({ _id: oid(id), organization: actor.org, ...branchMatch(actor.branch) }).lean();
  if (!found) throw notFound('Stock count');
  return found;
}

/**
 * Writes down what was on the shelf.
 *
 * Saved as somebody walks the rack rather than at the end, because a phone that
 * loses its connection halfway down an aisle should not lose the aisle.
 */
export async function saveCount(
  actor: Actor,
  id: string,
  lines: { lineId: string; counted: number | null }[],
) {
  const count = await StockCountModel.findOne({ _id: oid(id), organization: actor.org, ...branchMatch(actor.branch) });
  if (!count) throw notFound('Stock count');
  if (count.status !== 'open') throw badRequest('That count has already been finished');

  /*
   * What the screen says at the moment each line is counted, not when the
   * count began. A strip sold between starting the count and reaching that
   * shelf is already off the screen and off the shelf; measured against the
   * starting figure, it would come off a second time when the count is applied.
   */
  const ids = lines.map((e) => count.lines.id(e.lineId)?.batch).filter(Boolean);
  const nowOnHand = new Map(
    (await StockBatchModel.find({ _id: { $in: ids }, organization: actor.org }).select('qtyOnHand').lean()).map((b) => [String(b._id), b.qtyOnHand]),
  );
  for (const entry of lines) {
    const line = count.lines.id(entry.lineId);
    if (!line) continue;
    if (entry.counted === null || entry.counted === undefined) {
      line.counted = null;
      continue;
    }
    if (!Number.isFinite(entry.counted) || entry.counted < 0) {
      throw badRequest(`${line.name}: a shelf cannot hold less than nothing`);
    }
    const counted = Math.round(entry.counted);
    if (line.counted !== counted) {
      const screen = nowOnHand.get(String(line.batch));
      if (screen !== undefined) line.expected = screen;
    }
    line.counted = counted;
  }

  await count.save();
  return count.toObject();
}

/**
 * What the count comes to, before anybody commits to it.
 *
 * Shown on the screen beside the button, because "apply" on a stock count is
 * one of the few buttons in this product that changes a number nobody can
 * reconstruct from a document — and the person pressing it should see the size
 * of what they are about to agree to.
 */
export function summarise(lines: { expected: number; counted?: number | null; costPerPiece?: number }[]) {
  let shortPieces = 0;
  let extraPieces = 0;
  let valueDelta = 0;
  let counted = 0;
  let differing = 0;

  for (const line of lines) {
    if (line.counted === null || line.counted === undefined) continue;
    counted++;
    const delta = line.counted - line.expected;
    if (delta === 0) continue;
    differing++;
    if (delta < 0) shortPieces += -delta;
    else extraPieces += delta;
    valueDelta += delta * (line.costPerPiece ?? 0);
  }

  return {
    counted,
    differing,
    shortPieces,
    extraPieces,
    valueDelta: Math.round(valueDelta * 100) / 100,
  };
}

/**
 * Puts the count into the stock.
 *
 * A ledger row per lot that differed, so it can be read back line by line
 * afterwards — and a total in money, because pieces that are not there were
 * paid for and that is the figure an owner actually wants.
 *
 * A lot nobody counted is left alone. Not counted is not the same as zero, and
 * treating it as zero writes off a whole rack somebody ran out of time on.
 */
export async function applyCount(actor: Actor, id: string, input: { note?: string } = {}) {
  const count = await StockCountModel.findOne({ _id: oid(id), organization: actor.org, ...branchMatch(actor.branch) });
  if (!count) throw notFound('Stock count');
  if (count.status !== 'open') throw badRequest('That count has already been finished');

  const counted = count.lines.filter((l) => l.counted !== null);
  if (counted.length === 0) throw badRequest('Nothing has been counted yet');

  for (const line of counted) {
    const delta = (line.counted as number) - line.expected;
    if (delta === 0) continue;

    const batch = await StockBatchModel.findOne({ _id: line.batch, organization: actor.org });
    if (!batch) continue;

    /* The difference, applied to what the batch holds now — not the counted
       figure written over it. The shop kept selling while the rack was walked. */
    batch.qtyOnHand += delta;
    await batch.save();

    await StockLedgerModel.create({
      organization: actor.org,
      product: line.product,
      batch: batch._id,
      move: 'adjustment',
      qtyDelta: delta,
      balanceAfter: batch.qtyOnHand,
      costPerPiece: line.costPerPiece ?? 0,
      reason: `Counted ${line.counted} against ${line.expected}${
        count.rackLabel ? ` on ${count.rackLabel}` : ''
      }`,
      ref: { model: 'StockCount', id: count._id },
      actor: actor.id,
      actorName: actor.name,
    });
  }

  const totals = summarise(count.lines);
  count.status = 'applied';
  count.appliedAt = new Date();
  count.appliedBy = new Types.ObjectId(actor.id);
  count.appliedByName = actor.name;
  count.shortPieces = totals.shortPieces;
  count.extraPieces = totals.extraPieces;
  count.valueDelta = totals.valueDelta;
  if (input.note) count.note = input.note.trim();
  await count.save();

  return count.toObject();
}

/** Walked away from. Kept, because a count somebody abandoned is also a fact. */
export async function abandonCount(actor: Actor, id: string) {
  const count = await StockCountModel.findOne({ _id: oid(id), organization: actor.org, ...branchMatch(actor.branch) });
  if (!count) throw notFound('Stock count');
  if (count.status !== 'open') throw badRequest('That count has already been finished');
  count.status = 'abandoned';
  await count.save();
  return { status: count.status };
}
