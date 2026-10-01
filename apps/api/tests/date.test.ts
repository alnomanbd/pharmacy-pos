import { describe, it, expect } from 'vitest';
import {
  parseDayKey,
  todayKey,
  dayKeyFromParts,
  dayKeyRange,
  formatDayKey,
  instantFromDayKeyAndTime,
  timeOfDayInAppTz,
  expiryFromInput,
} from '../src/utils/date.js';

// APP_TZ is pinned to Asia/Dhaka (UTC+6) by vitest.config.ts.

describe('day keys', () => {
  it('takes YYYY-MM-DD literally, as UTC midnight', () => {
    expect(parseDayKey('2026-08-31').toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('resolves an ISO instant to the calendar day it falls on in the app timezone', () => {
    // 18:00Z on Aug 30 is already Aug 31 in Dhaka — this is exactly the instant
    // the old frontend sent for "Aug 31", and the old backend filed it as Aug 30.
    expect(parseDayKey('2026-08-30T18:00:00.000Z').toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('gives the same key whether the client sends a date or that date as an instant', () => {
    const fromDate = parseDayKey('2026-08-31');
    const fromInstant = parseDayKey('2026-08-30T18:00:00.000Z');
    expect(fromInstant.getTime()).toBe(fromDate.getTime());
  });

  it('keeps late-evening Dhaka instants on the same day', () => {
    // 23:30 Dhaka on Aug 31 = 17:30Z. Must not roll forward to Sep 1.
    expect(parseDayKey('2026-08-31T17:30:00.000Z').toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('rolls over exactly at Dhaka midnight, not UTC midnight', () => {
    // 18:00Z is 00:00 Dhaka the next day.
    expect(parseDayKey('2026-08-31T17:59:59.999Z').toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(parseDayKey('2026-08-31T18:00:00.000Z').toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('defaults to today in the app timezone', () => {
    const now = new Date('2026-08-30T19:00:00.000Z'); // 01:00 Aug 31 in Dhaka
    expect(todayKey(now).toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(parseDayKey(undefined, now).toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('rejects an unparseable date instead of storing Invalid Date', () => {
    expect(() => parseDayKey('not-a-date')).toThrow(/Invalid date/);
  });

  it('rejects out-of-range parts instead of silently rolling them over', () => {
    expect(() => parseDayKey('2026-13-01')).toThrow(/Invalid date/);
    expect(() => parseDayKey('2026-02-30')).toThrow(/Invalid date/);
    expect(() => parseDayKey('2026-02-29')).toThrow(/Invalid date/); // 2026 is not a leap year
    expect(() => parseDayKey('2026-00-10')).toThrow(/Invalid date/);
  });

  it('covers the whole day with an inclusive range', () => {
    const { start, end } = dayKeyRange(dayKeyFromParts(2026, 8, 31));
    expect(start.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });

  it('round-trips through YYYY-MM-DD', () => {
    expect(formatDayKey(parseDayKey('2026-08-31'))).toBe('2026-08-31');
    expect(formatDayKey(parseDayKey('2024-02-29'))).toBe('2024-02-29'); // real leap day
    expect(formatDayKey(parseDayKey('2026-01-01'))).toBe('2026-01-01');
  });
});

describe('slot instants', () => {
  it('resolves a wall-clock time to the moment it happens in the shop', () => {
    // 4:30pm on 4 Sep in Dhaka (UTC+6) is 10:30 UTC.
    const at = instantFromDayKeyAndTime(dayKeyFromParts(2026, 9, 4), '16:30');
    expect(at.toISOString()).toBe('2026-09-04T10:30:00.000Z');
  });

  it('keeps a late-evening slot on its own calendar day', () => {
    // 9pm Dhaka is 15:00 UTC the same day — not the next one.
    const at = instantFromDayKeyAndTime(dayKeyFromParts(2026, 9, 4), '21:00');
    expect(at.toISOString()).toBe('2026-09-04T15:00:00.000Z');
  });

  it('handles the start of the day, where a naive offset would roll back', () => {
    // Midnight Dhaka is 18:00 UTC the previous day.
    const at = instantFromDayKeyAndTime(dayKeyFromParts(2026, 9, 4), '00:00');
    expect(at.toISOString()).toBe('2026-09-03T18:00:00.000Z');
  });

  it('rejects a time it cannot read rather than inventing an instant', () => {
    expect(() => instantFromDayKeyAndTime(dayKeyFromParts(2026, 9, 4), 'half four')).toThrow();
  });
});

describe('wall-clock time of an instant', () => {
  it('reads an instant back as the shop clock time', () => {
    expect(timeOfDayInAppTz(new Date('2026-09-04T10:30:00.000Z'))).toBe('16:30');
  });

  it('round-trips with the slot resolver', () => {
    const key = dayKeyFromParts(2026, 9, 4);
    for (const hhmm of ['00:00', '09:05', '16:30', '21:00', '23:59']) {
      expect(timeOfDayInAppTz(instantFromDayKeyAndTime(key, hhmm))).toBe(hhmm);
    }
  });
});

describe('expiryFromInput', () => {
  it('takes a month to the last moment of it, in Dhaka', () => {
    /* 31 March, 23:59:59.999 Dhaka is 17:59:59.999 UTC. */
    expect(expiryFromInput('2027-03').toISOString()).toBe('2027-03-31T17:59:59.999Z');
  });

  it('rolls December into the right year', () => {
    expect(expiryFromInput('2027-12').toISOString()).toBe('2027-12-31T17:59:59.999Z');
  });

  it('takes a full date to the end of that day', () => {
    expect(expiryFromInput('2027-03-15').toISOString()).toBe('2027-03-15T17:59:59.999Z');
  });

  it('refuses a month that does not exist', () => {
    expect(() => expiryFromInput('2027-13')).toThrow();
    expect(() => expiryFromInput('not a date')).toThrow();
  });
});
