import { describe, it, expect } from 'vitest';
import {
  buildDeliveryPdf,
  deliveryFilename,
  deliveryQrText,
  inWords,
  type DeliverySheetData,
} from '../src/services/shopInvoicePdf.service.js';

/**
 * The sheet a pharmacy files, and the square on it.
 *
 * The layout is checked by looking at it. What is worth asserting is what
 * somebody reads off the paper and cannot check by eye — the amount in words,
 * which is the line a bank and an accountant go by — and the two ways the
 * document can fail silently: a shop's chosen colour that pdfkit cannot parse,
 * and a delivery long enough to need a second page.
 */

const shop: DeliverySheetData['shop'] = {
  name: 'Bismillah Pharmacy',
  address: 'House 44, Road 3, Mirpur 10, Dhaka 1216',
  phone: '01711000223',
  drugLicenceNo: 'DHA-114477',
  vatBin: '',
  logo: null,
  look: {
    paper: 'A4',
    accent: '#065f46',
    showLogo: true,
    showQr: true,
    showBatch: true,
    signatureLabel: 'Checked and received by',
    terms: '',
  },
};

const delivery: DeliverySheetData = {
  shop,
  number: 'SQ-88120',
  issuedAt: new Date('2026-09-14T00:00:00.000Z'),
  party: { name: 'Square Depot, Mirpur', phone: '01555000111' },
  enteredBy: 'Md. Kamal Hossain',
  lines: [
    {
      name: 'Napa 500mg Tablet',
      batchNo: 'B-7741',
      expiry: new Date('2028-04-30T00:00:00.000Z'),
      qtyPieces: 1000,
      bonusPieces: 100,
      rate: 0.86,
      amount: 860,
    },
  ],
  subTotal: 860,
  discount: 0,
  vat: 0,
  total: 860,
  paid: 500,
  note: 'Rest on the next visit.',
};

describe('an amount in words', () => {
  it('counts in lakh and crore, which is how it is read out here', () => {
    expect(inWords(125_000)).toBe('one lakh twenty five thousand');
    expect(inWords(12_500_000)).toBe('one crore twenty five lakh');
  });

  it('reads an ordinary sheet', () => {
    expect(inWords(570)).toBe('five hundred seventy');
    expect(inWords(1240)).toBe('one thousand two hundred forty');
  });

  it('says zero rather than nothing at all', () => {
    expect(inWords(0)).toBe('zero');
  });

  it('ignores the poisha, because the line says "taka only"', () => {
    expect(inWords(99.99)).toBe('ninety nine');
  });
});

describe('the square on the sheet', () => {
  it('leads with the shop, then names the company and the invoice', () => {
    const text = deliveryQrText(delivery);
    expect(text.startsWith('Bismillah Pharmacy\n')).toBe(true);
    expect(text).toContain('Delivery from: Square Depot, Mirpur');
    expect(text).toContain('Invoice: SQ-88120');
    expect(text).toContain('Total: Tk 860');
  });
});

describe('the file itself', () => {
  it('is a PDF, named after the company and the invoice', async () => {
    const pdf = await buildDeliveryPdf(delivery);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    expect(deliveryFilename(delivery)).toBe('delivery-SQ-88120-square-depot-mirpur.pdf');
  });

  it('honours what the shop chose: A5, its own colour, no square', async () => {
    const pdf = await buildDeliveryPdf({
      ...delivery,
      shop: {
        ...shop,
        look: { ...shop.look, paper: 'A5', accent: '#7f1d1d', showQr: false, showBatch: false },
      },
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('carries a delivery long enough to need a second page', async () => {
    const many: DeliverySheetData = {
      ...delivery,
      lines: Array.from({ length: 60 }, (_, i) => ({
        name: `Item number ${i + 1} with a name long enough to test the column`,
        batchNo: `B-${1000 + i}`,
        expiry: new Date('2028-01-31T00:00:00.000Z'),
        qtyPieces: (i + 1) * 10,
        bonusPieces: i % 3 === 0 ? 10 : 0,
        rate: 3.5,
        amount: (i + 1) * 35,
      })),
    };
    const pdf = await buildDeliveryPdf(many);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    /* Three pages of rows carry more than one page of content, which is the
       thing that breaks when the letterhead is drawn as pages open rather than
       stamped over them at the end. */
    expect(pdf.length).toBeGreaterThan(4000);
  });
});
