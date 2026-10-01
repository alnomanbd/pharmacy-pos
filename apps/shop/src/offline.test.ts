import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Selling with the line down.
 *
 * Every one of these is about money that has already changed hands. A bill
 * sent twice takes the stock off the shelf twice; a bill dropped takes the
 * money and records nothing; a refusal retried forever hides the one bill
 * somebody needs to look at. None of the three announces itself at the
 * counter, which is why they are tested here rather than noticed later.
 */

const sell = vi.fn();
vi.mock('./api', () => ({
  tillApi: { sell: (payload: Record<string, unknown>) => sell(payload) },
}));

const {
  dropSale,
  flushOutbox,
  isOffline,
  newRef,
  pendingSales,
  provisionalBill,
  queueSale,
  rememberShelf,
  shelfSearch,
} = await import('./offline');

const bill = (n: number) => ({
  clientRef: `ref-${n}`,
  soldAt: new Date(Date.UTC(2026, 0, 2, 9, n)).toISOString(),
  body: { lines: [{ productId: 'p1', qtyPieces: n, pricePerPiece: 2 }] },
  total: n * 2,
  items: 1,
  customerName: '',
});

beforeEach(() => {
  localStorage.clear();
  sell.mockReset();
});

describe('the queue', () => {
  it('keeps a bill until the shop has it', () => {
    queueSale(bill(1));
    expect(pendingSales()).toHaveLength(1);
    dropSale('ref-1');
    expect(pendingSales()).toHaveLength(0);
  });

  it('survives the page being reloaded', async () => {
    queueSale(bill(1));
    /* A fresh module, as if the browser had been closed and opened. */
    vi.resetModules();
    const again = await import('./offline');
    expect(again.pendingSales()).toHaveLength(1);
  });

  it('sends what is waiting in the order it was rung up', async () => {
    queueSale(bill(1));
    queueSale(bill(2));
    sell.mockResolvedValue({ billNo: '2-0001' });

    const res = await flushOutbox();

    expect(res.sent).toBe(2);
    expect(pendingSales()).toHaveLength(0);
    expect(sell.mock.calls.map((c) => (c[0] as { clientRef: string }).clientRef)).toEqual([
      'ref-1',
      'ref-2',
    ]);
  });

  it('sends the counter’s own reference, so posting it twice does nothing', async () => {
    queueSale(bill(1));
    sell.mockResolvedValue({ billNo: '2-0001' });
    await flushOutbox();
    expect(sell.mock.calls[0][0]).toMatchObject({ clientRef: 'ref-1', soldAt: bill(1).soldAt });
  });

  it('stops at the first bill that cannot get out, and keeps the rest', async () => {
    queueSale(bill(1));
    queueSale(bill(2));
    sell.mockRejectedValue({ code: 'ERR_NETWORK' });

    const res = await flushOutbox();

    expect(res.sent).toBe(0);
    expect(sell).toHaveBeenCalledTimes(1);
    expect(pendingSales()).toHaveLength(2);
  });

  it('holds a refused bill with its reason rather than retrying it forever', async () => {
    queueSale(bill(1));
    queueSale(bill(2));
    sell.mockImplementation((payload: { clientRef: string }) =>
      payload.clientRef === 'ref-1'
        ? Promise.reject({ response: { data: { message: 'That item is not on this shop’s list' } } })
        : Promise.resolve({ billNo: '2-0002' }),
    );

    const res = await flushOutbox();

    expect(res.sent).toBe(1);
    expect(res.stuck).toBe(1);
    const left = pendingSales();
    expect(left).toHaveLength(1);
    expect(left[0].error).toContain('not on this shop');

    /* And it is left alone on the next attempt — the answer will be the same. */
    sell.mockClear();
    await flushOutbox();
    expect(sell).not.toHaveBeenCalled();
  });

  it('gives every bill a reference of its own', () => {
    const refs = new Set(Array.from({ length: 200 }, () => newRef()));
    expect(refs.size).toBe(200);
  });
});

describe('telling "the line is down" from "the shop said no"', () => {
  it('counts a request that reached nobody as offline', () => {
    expect(isOffline({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isOffline(new Error('boom'))).toBe(true);
  });

  it('does not count a refusal as offline', () => {
    expect(isOffline({ response: { status: 400 } })).toBe(false);
  });
});

describe('the cached shelf', () => {
  const item = (id: string, name: string, generic = '', barcode = '') => ({
    _id: id,
    name,
    genericName: generic,
    barcode,
    piecesPerStrip: 10,
    stripsPerBox: 10,
    mrpPerPiece: 1.2,
    onHand: 100,
    nearestExpiry: null,
  });

  it('finds what the counter searched for earlier, by brand or by generic', () => {
    rememberShelf([item('1', 'Napa', 'Paracetamol'), item('2', 'Seclo', 'Omeprazole')]);
    expect(shelfSearch('nap').map((p) => p.name)).toEqual(['Napa']);
    expect(shelfSearch('omep').map((p) => p.name)).toEqual(['Seclo']);
  });

  it('adds to what it knows rather than replacing it', () => {
    rememberShelf([item('1', 'Napa')]);
    rememberShelf([item('2', 'Seclo')]);
    expect(shelfSearch('se')).toHaveLength(1);
    expect(shelfSearch('na')).toHaveLength(1);
  });

  it('answers a scanned code with that one row, and nothing else', () => {
    rememberShelf([
      item('1', 'Napa', 'Paracetamol', '8901234567890'),
      item('2', 'Napa Extra', 'Paracetamol'),
    ]);
    /* Typing the name offers both; scanning the pack offers the pack. */
    expect(shelfSearch('napa')).toHaveLength(2);
    expect(shelfSearch('8901234567890').map((p) => p.name)).toEqual(['Napa']);
  });

  it('does not take a code as a partial match', () => {
    rememberShelf([item('1', 'Napa', 'Paracetamol', '8901234567890')]);
    expect(shelfSearch('890123')).toEqual([]);
  });

  it('forgets a shelf too old to trust the prices on', () => {
    rememberShelf([item('1', 'Napa')]);
    vi.setSystemTime(new Date(Date.now() + 5 * 86_400_000));
    expect(shelfSearch('nap')).toEqual([]);
    vi.useRealTimers();
  });
});

describe('the slip printed for a bill the shop has not seen', () => {
  it('carries no bill number, because only the shop can issue one', () => {
    const slip = provisionalBill(
      { ...bill(3), body: { ...bill(3).body, payments: [{ method: 'cash', amount: 6 }] } },
      'Kamal',
      [],
    );
    expect(slip.billNo).toMatch(/^WAITING/);
    expect(slip.total).toBe(6);
    expect(slip.paid).toBe(6);
    expect(slip.due).toBe(0);
  });

  it('shows what is still owed when they did not pay it all', () => {
    const slip = provisionalBill(
      { ...bill(10), body: { ...bill(10).body, payments: [{ method: 'cash', amount: 5 }] } },
      'Kamal',
      [],
    );
    expect(slip.total).toBe(20);
    expect(slip.due).toBe(15);
  });
});
