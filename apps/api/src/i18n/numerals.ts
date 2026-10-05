/**
 * Bangla digits, for what the API writes in Bangla — an email, a push alert.
 *
 * The same rule as the shop app's `bnNumerals` (packages/shared), kept here
 * because the API does not import the shared package: figures, dates and money
 * read in Bangla digits; identifiers (a bill or invoice number, a transaction
 * id, a link) are left alone by simply not being passed through this.
 */
export type Lang = 'en' | 'bn';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function bnDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** A number in the given language: `1,250` or `১,২৫০`. */
export function num(n: number, lang: Lang, locale = 'en-BD'): string {
  const s = n.toLocaleString(locale);
  return lang === 'bn' ? bnDigits(s) : s;
}
