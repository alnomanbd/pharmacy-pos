import { describe, it, expect } from 'vitest';
import { pdfLang, pdfWords } from '../src/services/pdfWords.js';
import { buildDeliveryPdf, type DeliverySheetData } from '../src/services/shopInvoicePdf.service.js';
import { buildControlRegisterPdf } from '../src/services/shopControlPdf.service.js';
import { resolveFonts } from '../src/services/pdfFont.js';
import { bnAmountInWords } from '../src/utils/bnWords.js';

/**
 * The shop's papers in Bangla.
 *
 * The page itself is checked by looking at it; what can go wrong quietly is a
 * label turned into something half-translated, a figure looked up as a word,
 * or a Bangla sheet on a server with no font that can draw it.
 */

const shop: DeliverySheetData['shop'] = {
  name: 'Bismillah Pharmacy',
  address: 'Mirpur 10, Dhaka',
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
    signatureLabel: 'For the shop',
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
  note: '',
};

describe('the words on the page', () => {
  it('reads Bangla only when Bangla is asked for', () => {
    expect(pdfLang('bn')).toBe('bn');
    expect(pdfLang('en')).toBe('en');
    expect(pdfLang(undefined)).toBe('en');
    expect(pdfLang('fr')).toBe('en');
  });

  it('turns exact labels over and leaves everything else as written', () => {
    const w = pdfWords('bn');
    expect(w('Total')).toBe('মোট');
    expect(w('Still owed')).toBe('এখনো বাকি');
    /* A name, a number or an unknown label is never guessed at. */
    expect(w('Square Depot, Mirpur')).toBe('Square Depot, Mirpur');
    expect(w('SQ-88120')).toBe('SQ-88120');
    expect(pdfWords('en')('Total')).toBe('Total');
  });

  it('says the amount the way a counter reads it', () => {
    expect(bnAmountInWords(860)).toBe('আটশত ষাট');
  });
});

describe('the sheets themselves', () => {
  it('builds the delivery sheet in Bangla, and it is not the English one', async () => {
    const en = await buildDeliveryPdf({ ...delivery, lang: 'en' });
    const bn = await buildDeliveryPdf({ ...delivery, lang: 'bn' });
    expect(bn.subarray(0, 5).toString()).toBe('%PDF-');
    /* With a font that draws Bangla the two differ; without one the Bangla
       request falls back to English rather than dropping the words. */
    if (resolveFonts().unicode) expect(bn.equals(en)).toBe(false);
  });

  it('builds the controlled-drug register in Bangla', async () => {
    const pdf = await buildControlRegisterPdf(
      shop,
      {
        from: '2026-09-01',
        to: '2026-09-25',
        count: 1,
        pieces: 10,
        rows: [
          {
            soldAt: new Date('2026-09-10T08:00:00.000Z'),
            billNo: '10-0012',
            name: 'Sedil',
            strength: '5 mg',
            qtyPieces: 10,
            buyerName: 'রহিমা বেগম',
            buyerPhone: '01711999888',
            doctorName: '',
          },
        ],
      },
      'bn',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
