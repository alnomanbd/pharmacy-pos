/**
 * Calendar-date helpers.
 *
 * The API's day-keyed endpoints (the day's bills, takings and reports) take a
 * plain `YYYY-MM-DD`. Never send an ISO instant for a day: `toISOString()` reports
 * the UTC date, so in Dhaka every hour before 6am resolves to yesterday.
 */

/** `YYYY-MM-DD` for a date, read in the browser's own timezone. */
export function toLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today as `YYYY-MM-DD`, local. */
export function todayLocal() {
  return toLocalDate(new Date());
}

/** Parses `YYYY-MM-DD` into a local-midnight Date (for weekday display). */
export function fromLocalDate(value: string) {
  return new Date(`${value}T00:00:00`);
}
