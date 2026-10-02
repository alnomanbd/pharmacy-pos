import { useAuthStore } from '@dawai/shared/store/auth.store';

/**
 * Whose browser storage this is.
 *
 * The till keeps a few things in `localStorage` — the tiles it has learned, the
 * bills held for later, the shelf it can search offline, the bills waiting for
 * the line to come back. All of them belong to one shop, and some to one
 * branch of it. A key that does not say which leaks one shop's counter into
 * the next shop that signs in on the same machine: its best-sellers on the
 * tiles, its held bills on the list, its prices in an offline search.
 *
 * So every such key is suffixed with the shop, and where the stock is the
 * branch's, with the branch too. Nothing is kept for nobody: with no shop
 * signed in, the key says so, and holds nothing anybody else can read.
 */

/** The signed-in shop, or `none`. */
export function shopId(): string {
  return useAuthStore.getState().user?.organizationId || 'none';
}

/** A key that belongs to the signed-in shop. */
export function shopKey(base: string): string {
  return `${base}:${shopId()}`;
}

/** A key that belongs to the signed-in shop and the branch this screen is in. */
export function branchKey(base: string, branch: string): string {
  return `${base}:${shopId()}:${branch || 'main'}`;
}

/**
 * The keys written before they were scoped.
 *
 * Their owner cannot be known, so the conveniences go: a learned tile, a held
 * bill or a cached shelf from an unknown shop is exactly what must not show up
 * in this one. The one exception is the queue of unsent bills — that is money
 * already in somebody's drawer — and it is handed to the first shop that signs
 * in here, which on a one-shop machine is its owner. A bill that belongs to
 * another shop is refused by the server (the products are not this shop's)
 * and stays on the list with the reason, rather than being lost.
 */
const LEGACY_DROP = ['dawai.shop.quickpicks', 'dawai.shop.held', 'dawai.shop.shelf', 'dawai.branch'];
const LEGACY_OUTBOX = 'dawai.shop.outbox';

export function migrateLegacyKeys() {
  try {
    for (const k of LEGACY_DROP) localStorage.removeItem(k);
    const legacy = localStorage.getItem(LEGACY_OUTBOX);
    if (legacy && shopId() !== 'none') {
      const mine = shopKey(LEGACY_OUTBOX);
      const current = JSON.parse(localStorage.getItem(mine) ?? '[]') as unknown[];
      const old = JSON.parse(legacy) as unknown[];
      localStorage.setItem(mine, JSON.stringify([...current, ...old]));
      localStorage.removeItem(LEGACY_OUTBOX);
    }
  } catch {
    /* A locked store has nothing in it to move. */
  }
}
