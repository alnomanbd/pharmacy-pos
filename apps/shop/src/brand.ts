/**
 * The product's brand, in one place.
 *
 * Dawai, in one place: a rename is this file (and `index.html`'s `<title>`),
 * nothing else.
 */
export const BRAND = {
  name: 'Dawai',
  /** The marketing site the sign-in page's "back to the website" returns to. */
  siteUrl: import.meta.env.VITE_SITE_URL || 'https://dawai.com.bd',
} as const;
