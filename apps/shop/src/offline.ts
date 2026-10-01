import { tillApi, type SellableProduct, type Sale } from './api';

/**
 * Selling with the line down.
 *
 * A shop's internet goes at the worst possible moment and the queue does not
 * stop for it. Every counter in this country has a pad of paper for exactly
 * this, and every one of those pads loses a bill a week — so the till keeps
 * selling and posts what it took the moment the line comes back.
 *
 * Three things make that safe rather than merely optimistic:
 *
 * - **The bill carries a reference the counter made.** Posting it twice does
 *   nothing: the server keeps one bill per reference (see `Sale.clientRef`).
 *   A browser that retried, a second tab, a reload halfway through — all end
 *   with one bill.
 * - **The queue is written before anything is printed.** It lives in
 *   `localStorage`, which survives the reload, the crash and the power cut
 *   that a variable in memory does not.
 * - **The shelf is cached.** A counter cannot look a medicine up over a line
 *   that is down, so the last good search results are kept and searched
 *   locally, with the price the shop last published.
 *
 * What it does not do is hide the state. A bill that has not reached the
 * server is shown as waiting, with a count, until it has.
 */

const OUTBOX = 'dawai.shop.outbox';
const SHELF = 'dawai.shop.shelf';
/** The catalogue is stale after this, and a stale price is worse than none. */
const SHELF_TTL = 3 * 86_400_000;

export interface PendingSale {
  clientRef: string;
  soldAt: string;
  /** Exactly what would have gone to the server, kept whole. */
  body: Record<string, unknown>;
  /** For the waiting list, so it can be read without unpacking the body. */
  total: number;
  items: number;
  customerName: string;
  /** Set when the server refused it — a refusal is not worth retrying alone. */
  error?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A full or locked store must not take the counter down. */
  }
  for (const fn of listeners) fn();
}

export function onOutboxChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pendingSales(): PendingSale[] {
  return read<PendingSale[]>(OUTBOX, []);
}

/**
 * A reference for a bill, made here.
 *
 * `crypto.randomUUID` where it exists — two counters in the same shop must
 * never generate the same one, and the day's date plus a counter will collide
 * the first time two machines sell at the same second.
 */
export function newRef(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Puts a bill on the queue. Written synchronously, before anything is printed. */
export function queueSale(entry: PendingSale) {
  write(OUTBOX, [...pendingSales(), entry]);
}

export function dropSale(clientRef: string) {
  write(
    OUTBOX,
    pendingSales().filter((s) => s.clientRef !== clientRef),
  );
}

/**
 * Sends what is waiting, oldest first.
 *
 * In order and one at a time, not all at once: the bills came off one counter
 * in one order, and the numbers printed on them should follow it.
 *
 * A bill the server *refuses* — a price out of range, a product deleted since —
 * is not dropped and not retried forever. It stays with the reason on it, so
 * somebody can look at it, because the money for it is already in the box.
 */
export async function flushOutbox(): Promise<{
  sent: number;
  failed: number;
  stuck: number;
  /** What the shop gave them back, so a slip can be reprinted with its number. */
  posted: { clientRef: string; sale: Sale }[];
}> {
  let failed = 0;
  const posted: { clientRef: string; sale: Sale }[] = [];

  for (const entry of pendingSales()) {
    if (entry.error) continue;
    try {
      const sale = await tillApi.sell({
        ...entry.body,
        clientRef: entry.clientRef,
        soldAt: entry.soldAt,
      });
      dropSale(entry.clientRef);
      posted.push({ clientRef: entry.clientRef, sale });
    } catch (err) {
      if (isOffline(err)) {
        failed++;
        break;
      }
      /* The server answered and said no. Retrying that gets the same no. */
      write(
        OUTBOX,
        pendingSales().map((s) =>
          s.clientRef === entry.clientRef ? { ...s, error: messageOf(err) } : s,
        ),
      );
      failed++;
    }
  }

  return {
    sent: posted.length,
    failed,
    stuck: pendingSales().filter((s) => s.error).length,
    posted,
  };
}

/** True when the request never reached anybody — as opposed to being refused. */
export function isOffline(err: unknown): boolean {
  if (!navigator.onLine) return true;
  const e = err as { response?: unknown; code?: string };
  return !e?.response || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED';
}

function messageOf(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || 'The shop refused this bill.';
}

/* ------------------------------------------------------------- the shelf -- */

interface Shelf {
  at: number;
  items: SellableProduct[];
}

/**
 * Remembers what the counter has seen, so it can still be found.
 *
 * Merged rather than replaced: a search for "nap" and a search for "sec" both
 * teach it something, and between them a day at the counter covers most of
 * what the shop actually sells.
 */
export function rememberShelf(items: SellableProduct[]) {
  if (items.length === 0) return;
  const shelf = read<Shelf>(SHELF, { at: 0, items: [] });
  const byId = new Map(shelf.items.map((p) => [p._id, p]));
  for (const p of items) byId.set(p._id, p);
  write(SHELF, { at: Date.now(), items: [...byId.values()].slice(-2000) });
}

export function shelfSearch(q: string): SellableProduct[] {
  const shelf = read<Shelf>(SHELF, { at: 0, items: [] });
  if (!shelf.at || Date.now() - shelf.at > SHELF_TTL) return [];
  const text = q.trim().toLowerCase();
  if (text.length < 2) return [];
  /* A scan is exact, and it answers on its own — the same rule the server
     follows, kept here because scanning is most valuable on the evening the
     line is down. */
  const scanned = shelf.items.find((p) => p.barcode && p.barcode.toLowerCase() === text);
  if (scanned) return [scanned];
  return shelf.items
    .filter(
      (p) =>
        p.name.toLowerCase().includes(text) ||
        (p.genericName ?? '').toLowerCase().includes(text),
    )
    .slice(0, 20);
}

/* ------------------------------------------------------------ the receipt -- */

/**
 * A bill to print for a sale the server has not seen yet.
 *
 * It has no bill number, because only the shop can issue one and the shop has
 * not been asked. The paper says so rather than inventing one: a customer who
 * comes back with a number nobody can find is worse served than one who comes
 * back with a slip that says the bill is pending.
 */
export function provisionalBill(entry: PendingSale, salesmanName: string, lines: Sale['lines']): Sale {
  const body = entry.body as {
    payments?: { method: string; amount: number }[];
    discount?: number;
    customerPhone?: string;
  };
  const payments = body.payments ?? [];
  const paid = payments.filter((p) => p.method !== 'due').reduce((n, p) => n + p.amount, 0);
  return {
    _id: entry.clientRef,
    billNo: `WAITING · ${entry.clientRef.slice(0, 6).toUpperCase()}`,
    soldAt: entry.soldAt,
    salesmanName,
    customerName: entry.customerName,
    customerPhone: body.customerPhone ?? '',
    lines,
    subTotal: entry.total + (body.discount ?? 0),
    discount: body.discount ?? 0,
    total: entry.total,
    payments,
    paid,
    due: Math.max(0, Math.round((entry.total - paid) * 100) / 100),
    status: 'completed',
  };
}
