/**
 * The baki reminder SMS, as the shop writes it — the screen's half.
 *
 * The API fills the same blanks the same way when it sends (shopRemind.service
 * `fillReminder`); this copy is what lets Settings show the message as it is
 * typed, and the "Send a reminder?" question show what will actually go.
 */

/** The fill-ins a shop can use, in the order the screen offers them. */
export const REMINDER_FIELDS = [
  { key: '{name}', label: 'Customer’s name' },
  { key: '{amount}', label: 'What they owe' },
  { key: '{shop}', label: 'Shop name' },
  { key: '{phone}', label: 'Shop phone' },
] as const;

/** What goes when the shop has written nothing — the same line the API sends. */
export function standardReminder(v: { amount: number; shop?: string; phone?: string }) {
  const who = (v.shop ?? '').trim() || 'Your pharmacy';
  const call = v.phone?.trim() ? ` Call ${v.phone.trim()}.` : '';
  return `${who}: apnar bakite ache Tk ${money(v.amount)}. Shubidha moto poriShodh korle krritajno thakbo.${call}`;
}

/** A starting point for a shop writing its own, using every blank. */
export const SAMPLE_REMINDER = '{name} bhai, {shop} e apnar baki Tk {amount}. Shubidha moto diye diben. {phone}';

const money = (n: number) => Math.round((n || 0) * 100) / 100;

/** The shop's wording with the blanks filled in — exactly as the API does it. */
export function fillReminder(
  template: string,
  v: { name?: string; amount: number; shop?: string; phone?: string },
): string {
  const values: Record<string, string> = {
    name: (v.name ?? '').trim(),
    amount: String(money(v.amount)),
    shop: (v.shop ?? '').trim(),
    phone: (v.phone ?? '').trim(),
  };
  return template
    .replace(/\{(name|amount|shop|phone)\}/gi, (_, key: string) => values[key.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?।])/g, '$1')
    .trim();
}

/** The message that goes for this customer: the shop's wording, or the standard line. */
export function reminderMessage(
  template: string | undefined,
  v: { name?: string; amount: number; shop?: string; phone?: string },
) {
  return template?.trim() ? fillReminder(template, v) : standardReminder(v);
}

/* The GSM 7-bit alphabet every phone reads, and its two-character escapes. */
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

/**
 * What one message costs to send: how many characters, in how many SMS.
 *
 * Plain Latin text goes as GSM: 160 a message, 153 a part once it is split.
 * One Bangla letter (or an emoji, or a curly quote) turns the whole message into
 * Unicode: 70 a message, 67 a part — the same reminder in Bangla script is two
 * or three messages, and the shop pays for each.
 */
export function smsParts(text: string): { chars: number; parts: number; unicode: boolean; perPart: number } {
  const chars = [...text];
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_EXT.includes(c));
  if (unicode) {
    const n = chars.length;
    const perPart = n <= 70 ? 70 : 67;
    return { chars: n, parts: n === 0 ? 0 : Math.ceil(n / perPart), unicode, perPart };
  }
  const n = chars.reduce((sum, c) => sum + (GSM_EXT.includes(c) ? 2 : 1), 0);
  const perPart = n <= 160 ? 160 : 153;
  return { chars: n, parts: n === 0 ? 0 : Math.ceil(n / perPart), unicode, perPart };
}

/**
 * The wording with the customer's blanks marked rather than filled — for
 * "Remind them all", where every customer gets their own name and amount.
 */
export function reminderOutline(
  template: string | undefined,
  v: { shop?: string; phone?: string },
  marks: { name: string; amount: string },
) {
  const base =
    template?.trim() ||
    `{shop}: apnar bakite ache Tk {amount}. Shubidha moto poriShodh korle krritajno thakbo.${v.phone?.trim() ? ' Call {phone}.' : ''}`;
  return fillReminder(base.replace(/\{name\}/gi, marks.name).replace(/\{amount\}/gi, marks.amount), {
    amount: 0,
    shop: (v.shop ?? '').trim() || 'Your pharmacy',
    phone: v.phone,
  });
}
