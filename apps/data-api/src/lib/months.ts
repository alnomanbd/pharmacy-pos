import { HttpError } from './http.js';

/**
 * Figures leave by whole month, never by day. Two day ranges a day apart
 * would subtract to one day's sales, and one day in one district can be one
 * shop; a month is what the five-shop rule is counted over.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** This month in Dhaka, `YYYY-MM`. */
export function thisMonth(now = new Date()) {
  const d = new Date(now.getTime() + 6 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, by: number) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + by;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
}

export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export type MonthRange = { from: string; to: string; months: string[]; prevFrom: string; prevTo: string; partial: boolean };

/**
 * The months asked for, checked against how far back the plan reaches.
 * Defaults to the last three whole months. The current month may be asked for;
 * it is marked partial.
 */
export function monthRange(q: { from?: unknown; to?: unknown }, historyMonths: number, now = new Date()): MonthRange {
  const current = thisMonth(now);
  const lastWhole = addMonths(current, -1);
  const to = typeof q.to === 'string' && q.to ? q.to : lastWhole;
  const from = typeof q.from === 'string' && q.from ? q.from : addMonths(to, -2);
  if (!MONTH.test(from) || !MONTH.test(to)) throw new HttpError(400, 'bad_month', 'from and to are months, as YYYY-MM');
  if (from > to) throw new HttpError(400, 'bad_range', 'from is after to');
  if (to > current) throw new HttpError(400, 'bad_range', 'to is in the future');
  const earliest = addMonths(current, -historyMonths);
  if (from < earliest) throw new HttpError(403, 'history_limit', `Your plan reaches back to ${earliest}`);
  const months = monthsBetween(from, to);
  if (months.length > 36) throw new HttpError(400, 'bad_range', 'At most 36 months at once');
  return { from, to, months, prevFrom: addMonths(from, -months.length), prevTo: addMonths(from, -1), partial: to === current };
}
