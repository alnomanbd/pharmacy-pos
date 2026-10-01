import { env } from '../config/env.js';
import { badRequest } from './AppError.js';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Calendar day identity for day-keyed records (bill numbers, shifts, the
 * day's takings).
 *
 * A "day" is stored as UTC midnight of the shop's calendar date, so the
 * value is a stable key rather than an instant: the server's own timezone
 * cannot shift which day a bill belongs to. Previously `startOfToday()` used
 * server-local midnight while the client sent local-midnight-as-ISO, which put
 * the same day into two different documents on a UTC host.
 */
export function dayKeyFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Calendar Y/M/D of an instant, as seen in the app timezone. */
export function calendarPartsInAppTz(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.appTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Today's day key, measured in the app timezone. */
export function todayKey(now = new Date()) {
  const { year, month, day } = calendarPartsInAppTz(now);
  return dayKeyFromParts(year, month, day);
}

/**
 * Day key for a client-supplied date.
 *
 * `YYYY-MM-DD` is the preferred wire format and is taken literally. A full ISO
 * instant is still accepted (older clients send one) and is resolved to the
 * calendar day it falls on in the app timezone.
 */
export function parseDayKey(input?: string | null, now = new Date()) {
  if (!input) return todayKey(now);

  const dateOnly = DATE_ONLY.exec(input);
  if (dateOnly) {
    const [year, month, day] = [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])];
    const key = dayKeyFromParts(year, month, day);
    // Date.UTC silently rolls over out-of-range parts (month 13 becomes January
    // of the next year, Feb 30 becomes March 2). Round-trip to reject those
    // rather than file a record under a day the caller never asked for.
    const rolledOver =
      Number.isNaN(key.getTime()) ||
      key.getUTCFullYear() !== year ||
      key.getUTCMonth() + 1 !== month ||
      key.getUTCDate() !== day;
    if (rolledOver) throw badRequest(`Invalid date: ${input}`);
    return key;
  }

  const instant = new Date(input);
  if (Number.isNaN(instant.getTime())) throw badRequest(`Invalid date: ${input}`);
  return todayKey(instant);
}

/** Inclusive [start, end] instant range covering a day key. */
export function dayKeyRange(key: Date) {
  return { start: key, end: new Date(key.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

/** `YYYY-MM-DD` for a day key (UTC parts — the key is already normalized). */
export function formatDayKey(key: Date) {
  return key.toISOString().slice(0, 10);
}

/**
 * Minutes the app timezone is ahead of UTC at a given instant.
 *
 * Derived from `Intl` rather than hardcoded, so `APP_TZ` can be changed without
 * touching this file.
 */
function tzOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.appTz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return (asIfUtc - instant.getTime()) / 60000;
}

/**
 * The real instant of a wall-clock time on a day key — `16:30` on the 4th
 * becomes the moment 4:30pm actually happens in the shop's timezone.
 *
 * An expense or a cash move entered for a day is a day key plus an `HH:MM`
 * string, which is the right way to record "half four" but cannot be compared
 * against `Date.now()` until it is resolved against the zone. The offset is read at the guessed
 * instant and applied once; in a DST zone a slot within an hour of the
 * transition can land an hour out. `Asia/Dhaka` has no DST, so for this app the
 * result is exact.
 */
export function instantFromDayKeyAndTime(key: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw badRequest(`Invalid time: ${hhmm}`);
  const guess = new Date(key.getTime() + (h * 60 + m) * 60000);
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
}

/**
 * `HH:MM` of an instant in the app timezone — the inverse of
 * `instantFromDayKeyAndTime`, for turning a moment back into the wall-clock time
 * an entry is written as.
 */
export function timeOfDayInAppTz(instant: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: env.appTz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

const MONTH_ONLY = /^(\d{4})-(\d{2})$/;

/**
 * The last moment a pack is still in date, from what the shop typed.
 *
 * A strip says `EXP 03/2027` and means the whole of March, so `YYYY-MM` is the
 * wire format and resolves to the final millisecond of that month in the app
 * timezone — not to UTC midnight on the 31st, which in Dhaka is six in the
 * morning and would take a good strip off sale for the rest of its last day.
 * A full `YYYY-MM-DD` is still taken (older clients, and the odd import that
 * carries a day) and means the end of that day; a full ISO instant is kept
 * as the moment it names.
 */
export function expiryFromInput(input: string) {
  const month = MONTH_ONLY.exec(input);
  let key: Date;
  if (month) {
    const [year, m] = [Number(month[1]), Number(month[2])];
    if (m < 1 || m > 12) throw badRequest(`Invalid expiry: ${input}`);
    /* The first of the next month; a millisecond before it is the end of this
       one. Month 13 rolls into January, which is what December needs. */
    key = dayKeyFromParts(year, m + 1, 1);
  } else if (DATE_ONLY.test(input)) {
    key = new Date(parseDayKey(input).getTime() + 24 * 60 * 60 * 1000);
  } else {
    /* A full instant is an instant; whoever sent it meant that moment. */
    const instant = new Date(input);
    if (Number.isNaN(instant.getTime())) throw badRequest(`Invalid expiry: ${input}`);
    return instant;
  }
  return new Date(instantFromDayKeyAndTime(key, '00:00').getTime() - 1);
}
