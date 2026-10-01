import type { SellableProduct } from '../api';

/**
 * The dozen things this counter actually reaches for.
 *
 * Every shop has them and no two shops have the same ones: a road-side pharmacy
 * sells Napa and Seclo all evening, one beside a diabetes hospital sells
 * metformin and strips. A fixed list of "popular medicines" would be wrong for
 * both, and asking the owner to configure a grid is asking them to do work the
 * till can do by watching.
 *
 * So it is learned, here, from what this machine sells — which also means it
 * works on the first evening rather than after somebody sets it up, and it
 * quietly follows the season. Counted with a decay so that last winter's cough
 * syrup does not hold a tile against this week's.
 *
 * Local because it is a convenience, not a record: the shop's real figures live
 * in the reports, and a tile grid that needed a server round-trip would be a
 * tile grid that is empty when the line drops.
 */

const KEY = 'dawai.shop.quickpicks';
/**
 * How many tiles the strip holds.
 *
 * Twenty, not eight: a pharmacy reaches for far more than eight things in an
 * evening, and the tiles are one line of text each — the row costs the same
 * height whether it carries eight or twenty, and every extra one is a search
 * somebody does not have to type.
 */
export const QUICK_PICKS = 20;

interface Tally {
  product: SellableProduct;
  /** Decayed count of times sold from this counter. */
  score: number;
  at: number;
}

/** A fortnight, roughly: what sold a month ago should not outrank this week. */
const HALF_LIFE = 14 * 86_400_000;

function read(): Tally[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tally[]) : [];
  } catch {
    return [];
  }
}

function decayed(t: Tally, now: number): number {
  const age = Math.max(0, now - t.at);
  return t.score * Math.pow(0.5, age / HALF_LIFE);
}

/** Called once per line when a bill is taken. */
export function remember(products: SellableProduct[]) {
  if (products.length === 0) return;
  const now = Date.now();
  const byId = new Map(read().map((t) => [t.product._id, t]));

  for (const p of products) {
    const seen = byId.get(p._id);
    byId.set(p._id, {
      product: p,
      score: (seen ? decayed(seen, now) : 0) + 1,
      at: now,
    });
  }

  try {
    /* Only what could ever surface — a tally of two thousand medicines is a
       tally nobody reads and a localStorage row nobody wants. */
    const kept = [...byId.values()]
      .sort((a, b) => decayed(b, now) - decayed(a, now))
      .slice(0, 40);
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* Not worth failing a sale over. */
  }
}

export function quickPicks(): SellableProduct[] {
  const now = Date.now();
  return read()
    .sort((a, b) => decayed(b, now) - decayed(a, now))
    .slice(0, QUICK_PICKS)
    .map((t) => t.product);
}
