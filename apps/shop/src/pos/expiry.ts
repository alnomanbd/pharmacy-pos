/**
 * `YYYY-MM` from what is printed on the strip.
 *
 * Packs here say `EXP 03/2027` or `EXP 03/27` — a month, never a day — so the
 * field takes it the way it is read off the foil, and the server makes it the
 * end of that month. Null when it does not read as a month.
 */
export function expiryMonth(text: string): string | null {
  const m = /^\s*(\d{1,2})\s*[/.\-\s]\s*(\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Before the month we are in now, as the shop's own clock sees it. */
export function monthPassed(ym: string, now = new Date()) {
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return ym < current;
}
