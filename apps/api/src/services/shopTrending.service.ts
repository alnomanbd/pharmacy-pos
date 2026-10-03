import { Types } from 'mongoose';
import { SaleModel, StockBatchModel, ShopProductModel } from '../models/index.js';
import { branchMatch } from './branchScope.service.js';
import { rangeOf } from './shopReport.service.js';
import type { Actor } from './shop.service.js';

/**
 * What is moving in this shop: the medicines selling more than they did, less
 * than they did, the ones that have just started, and the ones sitting on the
 * shelf — this stretch against the same days before it.
 *
 * Counted in pieces that stayed sold (returns taken off), so a strip sold and
 * brought back is not a trend. A rising item carries how many days its shelf
 * lasts at this stretch's pace, because "Napa is up 40%" is only useful next
 * to "and you have four days of it left".
 */

const money = (n: number) => Math.round(n * 100) / 100;

type Row = { _id: Types.ObjectId; pieces: number; value: number; bills: number };

async function soldBetween(scope: Record<string, unknown>, from: string, to: string) {
  return SaleModel.aggregate<Row>([
    { $match: { ...scope, dayKey: { $gte: from, $lte: to }, deletedAt: null, status: { $ne: 'void' } } },
    { $unwind: '$lines' },
    {
      $project: {
        product: '$lines.product',
        pieces: { $subtract: ['$lines.qtyPieces', { $ifNull: ['$lines.returnedPieces', 0] }] },
        value: {
          $multiply: [
            '$lines.lineTotal',
            { $cond: [{ $gt: ['$lines.qtyPieces', 0] }, { $divide: [{ $subtract: ['$lines.qtyPieces', { $ifNull: ['$lines.returnedPieces', 0] }] }, '$lines.qtyPieces'] }, 0] },
          ],
        },
        sale: '$_id',
      },
    },
    { $group: { _id: '$product', pieces: { $sum: '$pieces' }, value: { $sum: '$value' }, bills: { $addToSet: '$sale' } } },
    { $project: { pieces: 1, value: 1, bills: { $size: '$bills' } } },
  ]);
}

export interface TrendRow {
  id: string;
  name: string;
  strength: string;
  generic: string;
  company: string;
  pieces: number;
  piecesBefore: number;
  value: number;
  valueBefore: number;
  change: number | null;
  onHand: number;
  daysLeft: number | null;
}

export async function trending(actor: Actor, opts: { from?: string; to?: string } = {}) {
  const range = rangeOf(opts);
  const scope = { organization: new Types.ObjectId(actor.org), ...branchMatch(actor.branch) };
  const [now, before] = await Promise.all([soldBetween(scope, range.from, range.to), soldBetween(scope, range.previousFrom, range.previousTo)]);

  const ids = [...new Set([...now, ...before].map((r) => String(r._id)))].map((id) => new Types.ObjectId(id));
  const today = new Date();
  const [products, stock, allStock] = await Promise.all([
    ShopProductModel.find({ _id: { $in: ids }, organization: actor.org }).select('name strength genericName companyName').lean(),
    StockBatchModel.aggregate<{ _id: Types.ObjectId; onHand: number }>([
      { $match: { ...scope, product: { $in: ids }, $or: [{ expiry: null }, { expiry: { $gte: today } }] } },
      { $group: { _id: '$product', onHand: { $sum: '$qtyOnHand' } } },
    ]),
    /* Everything on the shelf, for the slow movers: stock with little or no selling against it. */
    StockBatchModel.aggregate<{ _id: Types.ObjectId; onHand: number; value: number }>([
      { $match: { ...scope, qtyOnHand: { $gt: 0 }, $or: [{ expiry: null }, { expiry: { $gte: today } }] } },
      { $group: { _id: '$product', onHand: { $sum: '$qtyOnHand' }, value: { $sum: { $multiply: ['$qtyOnHand', '$costPerPiece'] } } } },
      { $sort: { value: -1 } },
      { $limit: 400 },
    ]),
  ]);
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const onHand = new Map(stock.map((s) => [String(s._id), s.onHand]));
  const nowOf = new Map(now.map((r) => [String(r._id), r]));
  const beforeOf = new Map(before.map((r) => [String(r._id), r]));

  const rows: TrendRow[] = ids.map((oid) => {
    const id = String(oid);
    const p = byId.get(id);
    const a = nowOf.get(id);
    const b = beforeOf.get(id);
    const pieces = Math.max(0, a?.pieces ?? 0);
    const piecesBefore = Math.max(0, b?.pieces ?? 0);
    const left = Math.max(0, onHand.get(id) ?? 0);
    const perDay = pieces / range.days;
    return {
      id,
      name: p?.name ?? 'A product no longer on the list',
      strength: p?.strength ?? '',
      generic: p?.genericName ?? '',
      company: p?.companyName ?? '',
      pieces,
      piecesBefore,
      value: money(a?.value ?? 0),
      valueBefore: money(b?.value ?? 0),
      change: piecesBefore > 0 ? Math.round(((pieces - piecesBefore) / piecesBefore) * 1000) / 10 : null,
      onHand: left,
      daysLeft: perDay > 0 ? Math.floor(left / perDay) : null,
    };
  });

  /* A trend needs enough behind it to be one: a single strip more than last time is noise. */
  const meaningful = (r: TrendRow) => Math.max(r.pieces, r.piecesBefore) >= 5;
  const rising = rows
    .filter((r) => r.piecesBefore > 0 && r.pieces > r.piecesBefore && meaningful(r))
    .sort((a, b) => b.pieces - b.piecesBefore - (a.pieces - a.piecesBefore))
    .slice(0, 15);
  const falling = rows
    .filter((r) => r.piecesBefore > 0 && r.pieces < r.piecesBefore && meaningful(r))
    .sort((a, b) => a.pieces - a.piecesBefore - (b.pieces - b.piecesBefore))
    .slice(0, 15);
  const fresh = rows
    .filter((r) => r.piecesBefore === 0 && r.pieces > 0)
    .sort((a, b) => b.pieces - a.pieces)
    .slice(0, 15);
  /* Rising and short: what to reorder before the next customer asks for it. */
  const runningOut = rows
    .filter((r) => r.pieces > 0 && r.daysLeft !== null && r.daysLeft <= 7 && (r.change === null || r.change > 0))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 15);

  /* Slow movers: on the shelf, worth something, and barely selling. */
  const slowIds = allStock.filter((s) => (nowOf.get(String(s._id))?.pieces ?? 0) <= Math.max(1, s.onHand * 0.02)).slice(0, 15);
  const slowProducts = await ShopProductModel.find({ _id: { $in: slowIds.map((s) => s._id) }, organization: actor.org }).select('name strength').lean();
  const slowName = new Map(slowProducts.map((p) => [String(p._id), [p.name, p.strength].filter(Boolean).join(' ')]));
  const slow = slowIds.map((s) => ({
    id: String(s._id),
    name: slowName.get(String(s._id)) ?? 'A product',
    onHand: s.onHand,
    value: money(s.value),
    sold: Math.max(0, nowOf.get(String(s._id))?.pieces ?? 0),
  }));

  /* The same, rolled up by generic and by company — what kind of medicine, and whose. */
  const roll = (key: (r: TrendRow) => string) => {
    const m = new Map<string, { name: string; value: number; valueBefore: number; pieces: number }>();
    for (const r of rows) {
      const k = key(r).trim();
      if (!k) continue;
      const e = m.get(k.toLowerCase()) ?? { name: k, value: 0, valueBefore: 0, pieces: 0 };
      e.value += r.value;
      e.valueBefore += r.valueBefore;
      e.pieces += r.pieces;
      m.set(k.toLowerCase(), e);
    }
    return [...m.values()]
      .map((e) => ({ ...e, value: money(e.value), valueBefore: money(e.valueBefore), change: e.valueBefore > 0 ? Math.round(((e.value - e.valueBefore) / e.valueBefore) * 1000) / 10 : null }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  };

  return {
    range,
    rising,
    falling,
    fresh,
    runningOut,
    slow,
    byGeneric: roll((r) => r.generic),
    byCompany: roll((r) => r.company),
  };
}
