import type { SellableProduct } from '../api';

/**
 * Bills put aside.
 *
 * A pharmacy counter serves three people at once. Somebody asks for their
 * blood-pressure tablets, then remembers they also want something for the
 * child and goes to look at the shelf; the queue behind them does not stop.
 * Every real POS has a park-and-resume key for exactly this, and a counter
 * without one either keeps a customer waiting or loses the half-typed bill.
 *
 * Kept in `localStorage` and not on the server, deliberately: a held bill has
 * not happened yet. Nothing has left the shelf, no money has changed hands, and
 * a record of it on the server would be a sale that never was. It belongs to
 * this machine and this evening — and it survives the reload, which is the only
 * thing it has to survive.
 */

const KEY = 'dawai.shop.held';
/** Long enough for an evening, short enough that yesterday does not haunt. */
const TTL = 12 * 60 * 60 * 1000;

export interface HeldLine {
  product: SellableProduct;
  qtyPieces: number;
  pricePerPiece: number;
}

export interface HeldBill {
  id: string;
  at: number;
  /** Whatever the counter can call it by — a name, or just the first medicine. */
  label: string;
  lines: HeldLine[];
  customerName: string;
  customerPhone: string;
  discount: string;
  total: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): HeldBill[] {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as HeldBill[]) : [];
    return all.filter((b) => Date.now() - b.at < TTL);
  } catch {
    return [];
  }
}

function write(bills: HeldBill[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bills));
  } catch {
    /* A full store must not take the counter down. */
  }
  for (const fn of listeners) fn();
}

export function onHeldChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function heldBills(): HeldBill[] {
  return read();
}

export function hold(bill: Omit<HeldBill, 'id' | 'at'>): HeldBill {
  const made: HeldBill = {
    ...bill,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
  };
  write([...read(), made]);
  return made;
}

export function drop(id: string) {
  write(read().filter((b) => b.id !== id));
}

/** What to call a held bill when nobody gave it a name. */
export function labelFor(lines: HeldLine[], customerName: string): string {
  if (customerName.trim()) return customerName.trim();
  if (lines.length === 0) return 'Empty';
  const first = lines[0].product.name;
  return lines.length === 1 ? first : `${first} +${lines.length - 1}`;
}
