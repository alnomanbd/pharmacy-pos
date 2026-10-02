/**
 * The console's brand, in one place — a rename is this file and the
 * `<title>` in index.html.
 */
export const BRAND = {
  name: 'Dawai',
  console: 'Operator console',
  /** Where shop owners sign in, for an operator who landed on the wrong door. */
  shopUrl:
    import.meta.env.VITE_SHOP_URL ||
    (import.meta.env.DEV ? 'http://localhost:5175' : 'https://shop.dawai.com.bd'),
  /** The marketing site, for agents' and shops' sign-up links. */
  siteUrl:
    import.meta.env.VITE_SITE_URL ||
    (import.meta.env.DEV ? 'http://localhost:3100' : 'https://dawai.com.bd'),
  consoleHost: 'console.dawai.com.bd',
} as const;
