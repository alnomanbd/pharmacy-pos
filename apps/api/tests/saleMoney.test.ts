import { describe, it, expect } from 'vitest';
import { settleUp, vatFor } from '../src/services/till.service.js';
import { mayVoid, SALESMAN_VOID_MINUTES } from '../src/services/saleAdmin.service.js';

/**
 * The three bits of arithmetic on a bill that are wrong silently.
 *
 * None of them announces itself: the change one comes back as a cash count
 * that is short every evening, the VAT one as a figure the shop's accountant
 * disagrees with months later, and the void one as a salesman quietly undoing
 * their own takings.
 */

describe('the note, the bill, and what goes back', () => {
  it('keeps the bill and gives the rest back', () => {
    /* The one that was missing: ৳570 bill, ৳1000 note, ৳430 back. Recording the
       note as the payment would leave the box ৳430 short at the count. */
    const s = settleUp([{ method: 'cash', amount: 1000 }], 570);
    expect(s.paid).toBe(570);
    expect(s.changeGiven).toBe(430);
    expect(s.cashTendered).toBe(1000);
    expect(s.due).toBe(0);
    expect(s.payments).toEqual([{ method: 'cash', amount: 570 }]);
  });

  it('leaves an exact payment alone', () => {
    const s = settleUp([{ method: 'cash', amount: 570 }], 570);
    expect(s.paid).toBe(570);
    expect(s.changeGiven).toBe(0);
  });

  it('takes the change out of the cash and never out of bKash', () => {
    /* Nobody hands notes back against a bKash payment. ৳500 cash + ৳300 bKash
       on a ৳700 bill is ৳100 back from the cash. */
    const s = settleUp(
      [
        { method: 'cash', amount: 500 },
        { method: 'bkash', amount: 300 },
      ],
      700,
    );
    expect(s.changeGiven).toBe(100);
    expect(s.paid).toBe(700);
    expect(s.payments).toEqual([
      { method: 'cash', amount: 400 },
      { method: 'bkash', amount: 300 },
    ]);
  });

  it('does not invent change when the overpayment was not in cash', () => {
    /* ৳1000 on bKash for a ৳570 bill is money sitting with the shop, not money
       in the customer's hand — handing back cash for it empties the box. */
    const s = settleUp([{ method: 'bkash', amount: 1000 }], 570);
    expect(s.changeGiven).toBe(0);
    expect(s.paid).toBe(1000);
  });

  it('still puts the rest on account when they are short', () => {
    const s = settleUp([{ method: 'cash', amount: 70 }], 140);
    expect(s.paid).toBe(70);
    expect(s.due).toBe(70);
    expect(s.changeGiven).toBe(0);
  });
});

describe('VAT, on the lines that carry it', () => {
  const medicine = { lineTotal: 100, isMedicine: true };
  const soap = { lineTotal: 100, isMedicine: false };

  it('charges nothing when the shop has no rate', () => {
    expect(vatFor([soap], 100, 0, { vatPercent: 0 }).vat).toBe(0);
    expect(vatFor([soap], 100, 0, null).vat).toBe(0);
  });

  it('leaves medicine out of it, because medicine is exempt here', () => {
    const { vat, perLine } = vatFor([medicine, soap], 200, 0, { vatPercent: 5 });
    expect(perLine).toEqual([0, 5]);
    expect(vat).toBe(5);
  });

  it('charges on medicine too when the shop says its registration says so', () => {
    const { vat } = vatFor([medicine, soap], 200, 0, { vatPercent: 5, vatOnMedicine: true });
    expect(vat).toBe(10);
  });

  it('charges on what was actually paid, after the haggling', () => {
    /* ৳100 of soap with ৳20 off the bill is ৳80 paid, so 5% is ৳4 and not ৳5. */
    const { vat } = vatFor([soap], 100, 20, { vatPercent: 5 });
    expect(vat).toBe(4);
  });
});

describe('who may cancel a bill', () => {
  const now = new Date('2026-09-13T20:00:00.000Z');
  const sale = (over: Partial<Record<string, unknown>> = {}) => ({
    salesman: 'rakib',
    soldAt: new Date(now.getTime() - 10 * 60_000),
    status: 'completed',
    shift: 'shift-1',
    ...over,
  });

  it('lets whoever runs the shop cancel anything', () => {
    const res = mayVoid(sale({ salesman: 'somebody-else' }), { id: 'boss', runsTheShop: true }, null, now);
    expect(res.ok).toBe(true);
  });

  it('lets a salesman undo their own mis-punch on their own open till', () => {
    const res = mayVoid(sale(), { id: 'rakib', runsTheShop: false }, 'shift-1', now);
    expect(res.ok).toBe(true);
  });

  it('will not let a salesman touch somebody else’s bill', () => {
    const res = mayVoid(sale(), { id: 'karim', runsTheShop: false }, 'shift-1', now);
    expect(res).toMatchObject({ ok: false });
  });

  it('will not let a salesman reach into a till that has been counted', () => {
    /* The money in that box has already been measured against its takings. */
    const res = mayVoid(sale({ shift: 'shift-0' }), { id: 'rakib', runsTheShop: false }, 'shift-1', now);
    expect(res).toMatchObject({ ok: false });
  });

  it('closes the window after an hour', () => {
    const old = sale({ soldAt: new Date(now.getTime() - (SALESMAN_VOID_MINUTES + 1) * 60_000) });
    expect(mayVoid(old, { id: 'rakib', runsTheShop: false }, 'shift-1', now)).toMatchObject({
      ok: false,
    });
    /* But the owner still can. */
    expect(mayVoid(old, { id: 'boss', runsTheShop: true }, null, now).ok).toBe(true);
  });

  it('refuses to cancel the same bill twice', () => {
    const res = mayVoid(sale({ status: 'void' }), { id: 'boss', runsTheShop: true }, null, now);
    expect(res).toMatchObject({ ok: false });
  });
});
