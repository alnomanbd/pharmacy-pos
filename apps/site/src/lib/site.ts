/**
 * The site's configuration, in one file.
 *
 * Two origins matter and they are easy to swap by accident, so they are named
 * for what they are rather than for where they point:
 *
 * - `appUrl` is where the **shop** is signed into — the billing screen, the stock, the
 *   khata. The login form on this site authenticates against the API and then
 *   sends the person here.
 * - `siteUrl` is this marketing site, which the shop's own sign-in screen
 *   links back to as "back to the website".
 *
 * `apiUrl` is the only one the browser needs, and it is the only one that has
 * to be right for the forms to work: a static export inlines it at build time,
 * so a site deployed against the wrong API fails visibly and immediately rather
 * than quietly posting enquiries to a stranger.
 */
export const siteConfig = {
  /*
   * THE BRAND — change these lines to rename the product everywhere: header,
   * footer, sign-in, page titles, SEO, legal pages and both languages (the copy
   * writes `{brand}` and is stamped from `name`).
   *
   * "Dawai" is the working name (2026-10-01); the domain and trademark are
   * still to be checked, so the site's own URL is an env var too.
   */
  name: 'Dawai',
  /** Just the product, for a logo lockup and the `%s · Dawai` title template. */
  shortName: 'Dawai',
  /** The wordmark as it is set in Latin script. */
  wordmark: 'Dawai',
  /** The line under the wordmark. */
  product: 'Pharmacy POS',
  /** Who sells it — the footer ©, the legal pages and the JSON-LD publisher. */
  company: 'Dawai',
  /** The studio behind it, credited in the footer's last line. */
  poweredBy: 'CyberLab',
  domain: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dawai.com.bd').replace(/^https?:\/\//, ''),
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dawai.com.bd',
  /*
   * Dawai's own app and API. `apiUrl` ends in `/api` — the forms post to
   * `${apiUrl}/auth/register` and `${apiUrl}/public/contact`.
   */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://shop.dawai.com.bd',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'https://api.dawai.com.bd/api',
  contactEmail: 'alnoman.cse@outlook.com',
  /** WhatsApp, digits with the country code (8801…). Empty: the chat button opens the contact page. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? '',
  address: 'Dhaka, Bangladesh',
  addressBn: 'ঢাকা, বাংলাদেশ',
} as const;

/** The two-letter switch, because a flag is a country and both products are read in one. */
export const LANGS = ['en', 'bn'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

export const langNames: Record<Lang, { self: string; other: string; label: string }> = {
  en: { self: 'EN', other: 'বাংলা', label: 'English' },
  bn: { self: 'বাংলা', other: 'EN', label: 'বাংলা' },
};
