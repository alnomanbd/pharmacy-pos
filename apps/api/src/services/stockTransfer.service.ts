import { Types } from 'mongoose';
import { BranchModel, StockBatchModel, StockLedgerModel, StockTransferModel, ShopProductModel } from '../models/index.js';
import { branchMatch, writeBranchOf } from './branchScope.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import type { Actor } from './shop.service.js';

/**
 * Moving stock from the branch being worked in to another one.
 *
 * From here, never into here: whoever packs the box is the one who knows what
 * went in it, and the shelf it leaves is the one that has to be right. Each
 * lot lands in the matching lot at the other end — same product, batch number
 * and expiry — or a new one with the same cost and price, so nothing about the
 * strip changes except where it is.
 */

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

export async function createTransfer(
  actor: Actor,
  input: { toBranchId: string; lines: { batchId: string; pieces: number }[]; note?: string },
) {
  const fromId = await writeBranchOf(actor);
  const [from, to] = await Promise.all([
    BranchModel.findOne({ _id: fromId, organization: actor.org }).lean(),
    BranchModel.findOne({ _id: oid(input.toBranchId), organization: actor.org, active: true }).lean(),
  ]);
  if (!from) throw notFound('Branch');
  if (!to) throw badRequest('That branch is not one of this shop’s open branches');
  if (String(from._id) === String(to._id)) throw badRequest('Pick the other branch — this one is where the stock is now');
  if (!input.lines?.length) throw badRequest('What is going across?');

  /* Checked in full before anything moves: a box half-sent because the third
     line was wrong is two shelves that are both wrong. */
  const wanted = new Map<string, number>();
  for (const l of input.lines) {
    if (!(l.pieces > 0) || !Number.isInteger(l.pieces)) throw badRequest('Send whole pieces, more than none');
    wanted.set(l.batchId, (wanted.get(l.batchId) ?? 0) + l.pieces);
  }
  const lots = await StockBatchModel.find({
    _id: { $in: [...wanted.keys()].map(oid) },
    organization: actor.org,
    branch: from._id,
  });
  if (lots.length !== wanted.size) throw badRequest('One of those lots is not on this branch’s shelf');
  const products = await ShopProductModel.find({ _id: { $in: lots.map((l) => l.product) } }).select('name').lean();
  const nameOf = new Map(products.map((p) => [String(p._id), p.name]));
  for (const lot of lots) {
    const n = wanted.get(String(lot._id))!;
    if (n > lot.qtyOnHand) {
      throw badRequest(`Only ${lot.qtyOnHand} of ${nameOf.get(String(lot.product)) ?? 'that'} (batch ${lot.batchNo || '—'}) are here`);
    }
  }

  const transferId = new Types.ObjectId();
  const lines = [];
  let value = 0;
  for (const lot of lots) {
    const pieces = wanted.get(String(lot._id))!;
    lot.qtyOnHand -= pieces;
    await lot.save();

    let there = await StockBatchModel.findOne({
      organization: actor.org,
      branch: to._id,
      product: lot.product,
      batchNo: lot.batchNo,
      expiry: lot.expiry ?? null,
    });
    if (there) {
      const before = Math.max(0, there.qtyOnHand);
      // The same lot at a different cost is averaged, as a second delivery of it would be.
      there.costPerPiece =
        before + pieces > 0
          ? Math.round(((before * there.costPerPiece + pieces * lot.costPerPiece) / (before + pieces)) * 10000) / 10000
          : lot.costPerPiece;
      there.qtyOnHand += pieces;
      await there.save();
    } else {
      there = await StockBatchModel.create({
        organization: actor.org,
        branch: to._id,
        product: lot.product,
        batchNo: lot.batchNo,
        expiry: lot.expiry ?? null,
        costPerPiece: lot.costPerPiece,
        mrpPerPiece: lot.mrpPerPiece,
        qtyOnHand: pieces,
        purchase: lot.purchase ?? null,
        supplier: lot.supplier ?? null,
        receivedAt: new Date(),
      });
    }

    const ref = { model: 'StockTransfer', id: transferId };
    const reason = `${from.name} → ${to.name}`;
    await StockLedgerModel.create({
      organization: actor.org,
      branch: from._id,
      product: lot.product,
      batch: lot._id,
      move: 'transfer',
      qtyDelta: -pieces,
      balanceAfter: lot.qtyOnHand,
      costPerPiece: lot.costPerPiece,
      ref,
      reason,
      actor: actor.id,
      actorName: actor.name,
    });
    await StockLedgerModel.create({
      organization: actor.org,
      branch: to._id,
      product: lot.product,
      batch: there._id,
      move: 'transfer',
      qtyDelta: pieces,
      balanceAfter: there.qtyOnHand,
      costPerPiece: lot.costPerPiece,
      ref,
      reason,
      actor: actor.id,
      actorName: actor.name,
    });

    value += pieces * (lot.costPerPiece || 0);
    lines.push({
      product: lot.product,
      name: nameOf.get(String(lot.product)) ?? '',
      fromBatch: lot._id,
      toBatch: there._id,
      batchNo: lot.batchNo ?? '',
      expiry: lot.expiry ?? null,
      pieces,
      costPerPiece: lot.costPerPiece,
    });
  }

  const made = await StockTransferModel.create({
    _id: transferId,
    organization: actor.org,
    from: from._id,
    to: to._id,
    fromName: from.name,
    toName: to.name,
    lines,
    value: Math.round(value * 100) / 100,
    note: input.note?.trim() ?? '',
    createdBy: actor.id,
    createdByName: actor.name,
  });
  return made.toObject();
}

/** Transfers in or out of the branches in view, newest first. */
export async function listTransfers(actor: Actor, limit = 50) {
  const m = branchMatch(actor.branch) as { branch?: unknown };
  const filter: Record<string, unknown> = { organization: actor.org };
  if (m.branch) filter.$or = [{ from: m.branch }, { to: m.branch }];
  return StockTransferModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .lean();
}
