import { type Ctx, table, withReport } from './shopReportPdf.service.js';
import { letterheadOf, type LetterheadShop } from './shopInvoicePdf.service.js';
import { calendarPartsInAppTz } from '../utils/date.js';
import type { PdfLang } from './pdfWords.js';

export interface ControlRegisterRow {
  soldAt: Date;
  billNo: string;
  name: string;
  strength: string;
  qtyPieces: number;
  buyerName: string;
  buyerPhone: string;
  doctorName: string;
}

export interface ControlRegisterData {
  from: string;
  to: string;
  count: number;
  pieces: number;
  rows: ControlRegisterRow[];
}

/**
 * The classified register itself, forensically boring.
 *
 * Deliberately plainer than the owner's report: this is a document a shop
 * hands an inspector, so it wants the date every handover happened, the bill
 * it went out on, what it was, and — above everything — who took it and who
 * advised it. Buyer name is the one field the counter was forced to take; the
 * doctor that advised it and the phone to reach either are kept when given.
 */
export async function buildControlRegisterPdf(
  shop: LetterheadShop,
  data: ControlRegisterData,
  lang: PdfLang = 'en',
): Promise<Buffer> {
  const pad = (n: number) => String(n).padStart(2, '0');

  return withReport(
    shop,
    'CONTROLLED DRUGS REGISTER',
    `${data.from}  –  ${data.to}`,
    async (c: Ctx) => {
      const { doc, fonts, accent, wash, t, w } = c;

      doc.rect(c.left, c.top, c.width, 24).fillColor(wash).fill();
      doc.font(fonts.bold).fontSize(10).fillColor(accent);
      doc.text(t(`${data.count} ${w('entries')}`), c.left, c.top + 8, { width: c.width });

      doc.font(fonts.regular).fontSize(10).fillColor(accent);
      doc.text(t(`${data.pieces} ${w('pieces')}`), c.left, c.top + 8, { width: c.width, align: 'right' });

      const yy = table(
        c,
        [
          { label: t('Date'), width: 56, align: 'left' },
          { label: t('Bill'), width: 62, align: 'left' },
          { label: 'Item', width: -1, align: 'left' },
          { label: t('Qty'), width: 40, align: 'right' },
          { label: t('Buyer'), width: -1, align: 'left' },
          { label: t('Phone'), width: 78, align: 'left' },
          { label: t('Doctor advised'), width: -1, align: 'left' },
        ],
        data.rows.map((r) => {
          const d = calendarPartsInAppTz(r.soldAt);
          return [
            `${pad(d.day)}/${pad(d.month)}/${d.year}`,
            r.billNo || '—',
            `${r.name}${r.strength ? ` · ${r.strength}` : ''}`,
            String(r.qtyPieces),
            r.buyerName || '—',
            r.buyerPhone || '—',
            r.doctorName || '—',
          ];
        }),
        c.top + 30,
      );

      doc.font(fonts.regular).fontSize(7.5);
      doc
        .fillColor('#888')
        .text(
          t(
            w(
              'Buyer names are kept by law for controlled drugs. The advising doctor and a phone are recorded when known.',
            ),
          ),
          c.left,
          yy + 4,
          { width: c.width },
        );
    },
    lang,
  );
}

/** The register PDF, ready to stream: pulls the shop's own letterhead. */
export async function controlRegisterPdf(
  org: string,
  data: ControlRegisterData,
  lang: PdfLang = 'en',
): Promise<Buffer> {
  const shop = await letterheadOf(org);
  return buildControlRegisterPdf(shop, data, lang);
}
