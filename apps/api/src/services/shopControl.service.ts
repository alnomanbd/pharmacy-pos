import { ShopControlLogModel } from '../models/index.js';
import type { Actor } from './shop.service.js';
import { dayRangeInstants } from './shopReport.service.js';
import { parseDayKey, formatDayKey } from '../utils/date.js';

/**
 * The classified register of controlled drugs.
 *
 * The lines themselves are written by `createSale` — the counter collects the
 * buyer and the advising doctor while the bill is being made, and the register
 * here is only the door through which the shop comes back to read it. Nothing
 * in this file should ever edit or delete a line: a register you can tidy is
 * not a register.
 */
export async function listTrace(actor: Actor, opts: { from?: string; to?: string }) {
  const from = formatDayKey(parseDayKey(opts.from));
  const to = formatDayKey(parseDayKey(opts.to));
  const { start, end } = dayRangeInstants(from, to);
  const match = { organization: actor.org, soldAt: { $gte: start, $lte: end } };

  const [agg] = await ShopControlLogModel.aggregate<{ count: number; pieces: number }>([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, pieces: { $sum: '$qtyPieces' } } },
  ]);

  /* A register page over a long range is a file, not a scroll: cap what the
     screen holds at the newest 400 lines while the count says how many there
     really are. */
  const rows = await ShopControlLogModel.find(match).sort({ soldAt: -1, _id: -1 }).limit(400).lean();

  return {
    from,
    to,
    count: agg?.count ?? 0,
    pieces: agg?.pieces ?? 0,
    rows,
  };
}