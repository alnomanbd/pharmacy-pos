/**
 * A Bangladeshi mobile number, or nothing.
 *
 * Typed as 01711…, +8801711…, 8801711… and "017-11 …" equally often, and
 * stored one way — 01XXXXXXXXX — because the till matches a returning customer
 * by phone and sends reminders to it. Checked here so the person typing hears
 * about a wrong number while they are still looking at it.
 *
 * Mirrors `backend/src/utils/phone.ts`, which is what actually decides; keep
 * the two alike.
 */
const MOBILE = /^01[3-9]\d{8}$/;

/** The number in its one stored form, or null when it is not a mobile number. */
export function bdMobile(input: string | null | undefined): string | null {
  const raw = String(input ?? '').replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(raw)) return null;
  const digits = raw.replace(/^\+/, '');
  const local = digits.startsWith('880') ? digits.slice(2) : digits;
  return MOBILE.test(local) ? local : null;
}

export const BD_MOBILE_MESSAGE = 'Enter an 11-digit mobile number, like 01711223344';
