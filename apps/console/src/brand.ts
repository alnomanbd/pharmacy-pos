/**
 * The console's brand, in one place — a rename is this file and the
 * `<title>` in index.html.
 */
export const BRAND = {
  name: 'Dawai',
  console: 'Operator console',
  /** Where shop owners sign in, for an operator who landed on the wrong door. */
  shopUrl: import.meta.env.VITE_SHOP_URL || 'https://shop.dawai.com.bd',
  consoleHost: 'console.dawai.com.bd',
} as const;
