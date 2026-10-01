import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { receiptQrText } from './Receipt';
import type { Sale } from '../api';

/**
 * The square on the receipt is read by a stranger's phone in a doorway.
 *
 * Which makes two things worth a test: what it says — the shop's own details,
 * whether or not the head of the slip printed them — and that it stays small
 * enough to survive a thermal head on cheap paper. A dense square is one that
 * does not scan, and nobody finds out until a customer tries.
 */

const sale = {
  billNo: '19-0042',
  soldAt: '2026-09-18T13:24:00.000Z',
  total: 570,
  lines: [],
  payments: [],
  discount: 0,
  due: 0,
  status: 'completed',
  salesmanName: 'Kamal',
} as unknown as Sale;

const WHEN = '18 Sep 2026, 7:24 pm';

describe('what the receipt’s QR says', () => {
  it('leads with the shop, its address and its number', () => {
    const text = receiptQrText(
      { shopName: 'Bismillah Pharmacy', address: 'Mirpur 10, Dhaka', phone: '01711000223' },
      sale,
      WHEN,
    );
    expect(text.split('\n').slice(0, 3)).toEqual([
      'Bismillah Pharmacy',
      'Mirpur 10, Dhaka',
      'Mob: 01711000223',
    ]);
  });

  it('carries the bill, the moment and the amount', () => {
    const text = receiptQrText({ shopName: 'Shop' }, sale, WHEN);
    expect(text).toContain('Bill: 19-0042');
    expect(text).toContain(WHEN);
    expect(text).toContain('Total: Tk 570');
  });

  it('leaves no gap where an address was never filled in', () => {
    const text = receiptQrText({ shopName: 'Shop', address: '', phone: '  ' }, sale, WHEN);
    /* One blank line, between the shop and the bill — and not three. */
    expect(text.split('\n').filter((l) => l === '')).toHaveLength(1);
    expect(text.startsWith('Shop\n\nBill:')).toBe(true);
  });

  it('gives an offline slip its reference rather than the waiting marker', () => {
    const waiting = { ...sale, billNo: 'WAITING · a1b2c3d4' } as Sale;
    const text = receiptQrText({ shopName: 'Shop' }, waiting, WHEN);
    expect(text).toContain('Bill: a1b2c3d4');
    expect(text).not.toContain('WAITING');
  });

  it('stays inside a square a thermal printer can put down', () => {
    /* Version 10 is 57 modules; at 24mm that is 0.42mm a module, about three
       dots on a 203dpi head. Past that the square stops scanning off paper. */
    const text = receiptQrText(
      {
        shopName: 'Bismillah Medicine Corner & Pharmacy',
        address: 'House 44, Road 3, Block C, Mirpur 10, Dhaka 1216',
        phone: '01711000223',
      },
      { ...sale, billNo: '19-0042', total: 12_500.75 } as Sale,
      WHEN,
    );
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    expect(qr.modules.size).toBeLessThanOrEqual(57);
  });
});

describe('the square that is actually drawn', () => {
  it('matches the library’s matrix, module for module', async () => {
    const { render } = await import('@testing-library/react');
    const { QrSquare } = await import('./Receipt');
    const React = await import('react');

    const text = 'Bismillah Pharmacy\nMirpur 10, Dhaka\n\nBill: 19-0042\nTotal: Tk 570';
    const { container } = render(React.createElement(QrSquare, { text, mm: 24 }));

    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const quiet = 4;

    /* Every dark module, as the DOM has it — the first rect is the white
       background and is skipped. */
    const drawn = new Set(
      [...container.querySelectorAll('rect')]
        .slice(1)
        .map((r) => `${r.getAttribute('x')},${r.getAttribute('y')}`),
    );

    let wrong = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const dark = !!qr.modules.data[row * size + col];
        /* x is the column and y is the row: swapping them draws a QR that is a
           valid-looking square and decodes to nothing. */
        const there = drawn.has(`${col + quiet},${row + quiet}`);
        if (dark !== there) wrong++;
      }
    }
    expect(wrong).toBe(0);
    expect(drawn.size).toBe(qr.modules.data.reduce((n: number, v: number) => n + (v ? 1 : 0), 0));
  });
});
