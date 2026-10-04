import PDFDocument from 'pdfkit';
import { Types } from 'mongoose';

import { ShopCustomerModel, SupplierModel } from '../models/index.js';
import { letterheadOf, type LetterheadShop } from './shopInvoicePdf.service.js';
import { ownerReport, todayGoodsIn } from './shopReport.service.js';
import { daySummary } from './till.service.js';
import { currencyPrefix, resolveFonts, safeText, warnIfUnsupported } from './pdfFont.js';
import { pdfWords, type PdfLang } from './pdfWords.js';
import type { Actor } from './shop.service.js';

/**
 * The owner's page, on paper.
 *
 * The screen answers "what happened this month" in a room where the two
 * numbers beside it do the comparing. A sheet of paper has no hover and no
 * sibling screen, so the stretch is printed the same way — this stretch
 * against the same stretch before it, on the line under every figure — and the
 * day is printed with its payments, its khata and what came in off the vans.
 *
 * Both are the shop's own trade on the shop's own letterhead, built like the
 * delivery sheet: explicit `y` positions rather than flowed layout, and the
 * letterhead painted once at the end over whatever pages there turned out to
 * be, so a report that runs to three pages still reads as one document.
 */

const INK = '#111827';
const BODY = '#374151';
const MUTED = '#6b7280';
const HAIR = '#e5e7eb';
const RED = '#b91c1c';

function mix(hex: string, towards: string, ratio: number) {
  const parse = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(towards);
  const channel = (a: number, b: number) =>
    Math.round(a + (b - a) * ratio)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

const money2 = (n: number) => Math.round((n || 0) * 100) / 100;

const day = (value: Date | string) =>
  new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const moment = (value: Date | string) =>
  new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  upay: 'Upay',
  card: 'Card',
  bank: 'Bank',
  due: 'On account',
};

/** The methods in the order a shop reads them off a till drawer. */
const METHOD_ORDER = ['cash', 'bkash', 'nagad', 'rocket', 'upay', 'card', 'bank', 'due'];

/* ------------------------------------------------------------------ data -- */

export interface OwnerReportPdfData {
  shop: LetterheadShop;
  /** The language of whoever asked for it. */
  lang?: PdfLang;
  issuedAt: Date;
  report: Awaited<ReturnType<typeof ownerReport>>;
}

export interface TodayReportPdfData {
  shop: LetterheadShop;
  /** The language of whoever asked for it. */
  lang?: PdfLang;
  issuedAt: Date;
  dayKey: string;
  totals: { bills: number; sales: number; margin: number; due: number };
  byMethod: { method: string; amount: number }[];
  cameIn: { count: number; value: number; pieces: number };
  owedByCustomers: { name: string; phone: string; balance: number }[];
  owedToSuppliers: number;
  bills: {
    billNo: string;
    time: string;
    by: string;
    customer: string;
    total: number;
    due: number;
    status: string;
  }[];
}

export function ownerReportPdfData(
  actor: Actor,
  opts: { from?: string; to?: string } = {},
): Promise<OwnerReportPdfData> {
  return Promise.all([letterheadOf(actor.org), ownerReport(actor, opts)]).then(([shop, report]) => ({
    shop,
    issuedAt: new Date(),
    report,
  }));
}

/** The day, the way the evening screen reads it, plus what the screen reads elsewhere. */
export async function todayReportPdfData(actor: Actor): Promise<TodayReportPdfData> {
  const org = new Types.ObjectId(actor.org);

  const [shop, day, goods, customers] = await Promise.all([
    letterheadOf(actor.org),
    daySummary(actor, { all: true }),
    todayGoodsIn(actor),
    ShopCustomerModel.find({ organization: org, deletedAt: null, balance: { $gt: 0 } })
      .sort({ balance: -1 })
      .limit(10)
      .select('name phone balance')
      .lean(),
  ]);

  const [supplierRow] = await SupplierModel.aggregate<{ owed: number }>([
    { $match: { organization: org, deletedAt: null } },
    { $group: { _id: null, owed: { $sum: { $ifNull: ['$balance', 0] } } } },
  ]);

  const byMethod = Object.entries(day.byMethod)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => {
      const oi = (m: string) => {
        const i = METHOD_ORDER.indexOf(m);
        return i === -1 ? METHOD_ORDER.length : i;
      };
      return oi(a[0]) - oi(b[0]);
    })
    .map(([method, amount]) => ({ method, amount: money2(amount) }));

  /* A method the shop does not recognise still has a row; it just reads as
     itself. The due line is the baki going out today, on the paper so the
     paper can be argued with after the drawer is open. */
  if (day.due > 0) byMethod.push({ method: 'due', amount: money2(day.due) });

  return {
    shop,
    issuedAt: new Date(),
    dayKey: day.dayKey,
    totals: {
      bills: day.count,
      sales: money2(day.total),
      margin: money2(day.margin ?? 0),
      due: money2(day.due),
    },
    byMethod,
    cameIn: goods.cameIn,
    owedByCustomers: customers.map((c) => ({
      name: c.name,
      phone: c.phone ?? '',
      balance: money2(c.balance),
    })),
    owedToSuppliers: money2(supplierRow?.owed ?? 0),
    bills: day.sales.map((s) => ({
      billNo: s.billNo,
      time: moment(s.soldAt),
      by: s.salesmanName,
      customer: s.customerName ?? 'Cash customer',
      total: money2(s.total),
      due: money2(s.due),
      status: s.status,
    })),
  };
}

export function ownerReportFilename(data: OwnerReportPdfData) {
  return `sales-report-${data.report.range.from}-to-${data.report.range.to}.pdf`;
}

export function todayReportFilename(data: TodayReportPdfData) {
  return `today-report-${data.dayKey}.pdf`;
}

/* ------------------------------------------------------------------ shell -- */

export interface Ctx {
  doc: PDFKit.PDFDocument;
  fonts: ReturnType<typeof resolveFonts>;
  accent: string;
  wash: string;
  soft: string;
  wash2: string;
  panelEdge: string;
  money: (n: number) => string;
  t: (v: string | undefined | null) => string;
  /** The document's words in its language — exact phrases, figures untouched. */
  w: (v: string) => string;
  /** Bangla on the page: no letter-spacing, which splits its joined letters. */
  bn: boolean;
  left: number;
  right: number;
  width: number;
  bandH: number;
  footH: number;
  bottom: number;
  top: number;
  fit: (
    value: string,
    x: number,
    y: number,
    w: number,
    font: string,
    max: number,
    min: number,
    color?: string,
  ) => void;
}

/**
 * A4, on the shop's letterhead, with the band and the foot stamped over
 * whatever pages the content turned out to need.
 */
export async function withReport(
  shop: LetterheadShop,
  title: string,
  sub: string,
  draw: (ctx: Ctx) => Promise<void> | void,
  lang: PdfLang = 'en',
): Promise<Buffer> {
  const fonts = resolveFonts();
  warnIfUnsupported(fonts, 'report', shop.name, shop.address, shop.phone);
  const t = (v: string | undefined | null) => safeText(fonts, v ?? '');
  /* Bangla only where a font can draw it; otherwise the words would vanish. */
  const bn = fonts.unicode && lang === 'bn';
  const w = pdfWords(bn ? 'bn' : 'en');
  const money = (n: number) =>
    `${currencyPrefix(fonts, 'BDT').trimEnd()} ${money2(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const look = shop.look;
  const accent = /^#[0-9a-fA-F]{6}$/.test(look.accent) ? look.accent : '#065f46';
  const wash = mix(accent, '#ffffff', 0.9);
  const soft = mix(accent, '#ffffff', 0.62);
  const wash2 = mix(accent, '#ffffff', 0.95);
  const panelEdge = mix(accent, '#ffffff', 0.74);

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bandH = 92;
  const footH = 34;
  const bottom = doc.page.height - doc.page.margins.bottom - footH;
  const top = bandH + 22;

  const fit = (
    value: string,
    x: number,
    y: number,
    w: number,
    font: string,
    max: number,
    min: number,
    color = INK,
  ) => {
    doc.font(font).fillColor(color);
    let size = max;
    while (size > min && doc.fontSize(size).widthOfString(value) > w) size -= 0.5;
    let text = value;
    if (doc.fontSize(size).widthOfString(text) > w) {
      while (text.length > 1 && doc.widthOfString(`${text}…`) > w) text = text.slice(0, -1);
      text = `${text}…`;
    }
    doc.fontSize(size).text(text, x, y, { width: w, lineBreak: false });
  };

  await draw({
    doc,
    fonts,
    accent,
    wash,
    soft,
    wash2,
    panelEdge,
    money,
    t,
    w,
    bn,
    left,
    right,
    width,
    bandH,
    footH,
    bottom,
    top,
    fit,
  });

  /* ---- letterhead + foot, over every page ---- */
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);

    doc.rect(0, 0, doc.page.width, bandH).fillColor(accent).fill();
    doc
      .rect(0, bandH, doc.page.width, 1.5)
      .fillColor(mix(accent, '#000000', 0.18))
      .fill();

    let textX = left;
    if (shop.logo) {
      try {
        doc.image(shop.logo, left, 18, { fit: [54, 54], align: 'center', valign: 'center' });
        textX = left + 66;
      } catch {
        /* An unreadable image is not a reason to fail the document. */
      }
    }

    const nameW = right - textX - width * 0.3;
    fit(t(shop.name), textX, 20, nameW, fonts.bold, 19, 11, '#ffffff');
    if (shop.address) fit(t(shop.address), textX, 47, nameW, fonts.regular, 9, 7, soft);
    const idLine = t(
      [
        shop.phone && `${w('Mob')}: ${shop.phone}`,
        shop.drugLicenceNo && `${w('Drug Licence')}: ${shop.drugLicenceNo}`,
        shop.vatBin && `BIN: ${shop.vatBin}`,
      ]
        .filter(Boolean)
        .join('  ·  '),
    );
    if (idLine) fit(idLine, textX, 61, nameW, fonts.regular, 9, 7, soft);

    doc
      .font(fonts.bold)
      .fontSize(19)
      .fillColor('#ffffff')
      .text(w(title), left, 24, {
        width,
        align: 'right',
        characterSpacing: bn ? 0 : 2.2,
      });
    doc.font(fonts.regular).fontSize(9).fillColor(soft).text(t(sub), left, 52, {
      width,
      align: 'right',
    });

    const footY = doc.page.height - doc.page.margins.bottom - footH + 8;
    doc
      .moveTo(left, footY - 6)
      .lineTo(right, footY - 6)
      .strokeColor(accent)
      .lineWidth(1.5)
      .stroke();
    const terms = t(shop.look.terms).trim();
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(terms || t([shop.name, shop.address].filter(Boolean).join(' · ')), left, footY, {
        width: width - 90,
      });
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`${w('Page')} ${i + 1} ${w('of')} ${pages.count}`, left, footY, {
        width,
        align: 'right',
      });
  }

  doc.flushPages();
  doc.end();
  return done;
}

/** A section heading on the page: mono caps in the accent over a hair rule. */
export function heading(c: Ctx, text: string, note: string | null, y: number) {
  const { doc, fonts, accent } = c;
  doc
    .rect(c.left, y - 2, c.width, 20)
    .fillColor(c.wash2)
    .fill();
  doc
    .font(fonts.bold)
    .fontSize(8)
    .fillColor(accent)
    .text(c.w(text).toUpperCase(), c.left + 10, y, {
      characterSpacing: c.bn ? 0 : 1.1,
      lineBreak: false,
    });
  if (note) {
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(c.t(c.w(note)), c.left + 10, y, { width: c.width - 120, align: 'right', lineBreak: false });
  }
  doc
    .moveTo(c.left, y + 16)
    .lineTo(c.right, y + 16)
    .strokeColor(HAIR)
    .lineWidth(0.8)
    .stroke();
  return y + 26;
}

/* ------------------------------------------------------------ draw pieces -- */

function summaryTiles(
  c: Ctx,
  tiles: { label: string; value: string; sub: string }[],
  x: number,
  y: number,
  perRow: number,
  gap: number,
  tileH: number,
) {
  const { doc, fonts } = c;
  const w = (c.width - gap * (perRow - 1)) / perRow;
  tiles.forEach((tile, i) => {
    const tx = x + (i % perRow) * (w + gap);
    const ty = y + Math.floor(i / perRow) * (tileH + gap);
    doc.roundedRect(tx, ty, w, tileH, 6).fillColor(c.wash2).fill();
    doc.roundedRect(tx, ty, w, tileH, 6).strokeColor(c.panelEdge).lineWidth(0.8).stroke();
    c.fit(c.w(tile.label).toUpperCase(), tx + 9, ty + 8, w - 18, fonts.bold, 7, 6, c.accent);
    c.fit(tile.value, tx + 9, ty + 23, w - 18, fonts.bold, w >= 150 ? 15 : 12.5, 9, INK);
    doc
      .font(fonts.regular)
      .fontSize(6.8)
      .fillColor(MUTED)
      .text(c.w(tile.sub), tx + 9, ty + (w >= 150 ? 45 : 49), {
        width: w - 18,
        lineGap: 1,
      });
  });
  return y + Math.ceil(tiles.length / perRow) * (tileH + gap) - gap;
}

/**
 * One table, with its head on every page it crosses.
 *
 * `y` is threaded through the object because pdfkit's cursor is no help here —
 * this is why generated documents drift.
 */
export function table(
  c: Ctx,
  columns: { label: string; width: number; align: 'left' | 'right' }[],
  rows: string[][],
  y: number,
  opts: { mutedFirst?: boolean } = {},
) {
  const { doc, fonts, accent, wash, wash2: _w2 } = c;
  const rowH = 19;
  const headH = 23;
  const flex = columns.find((col) => col.width < 0);
  const fixed = columns.filter((col) => col.width >= 0).reduce((n, col) => n + col.width, 0);
  const flexW = c.width - fixed - (columns.length - 1) * 2;
  const xs: number[] = [];
  let cursor = c.left;
  for (const col of columns) {
    xs.push(cursor);
    cursor += (col.width < 0 ? flexW : col.width) + 2;
  }

  let yy = y;
  const head = () => {
    doc.rect(c.left, yy, c.width, headH).fillColor(wash).fill();
    doc.font(fonts.bold).fontSize(6.8).fillColor(accent);
    columns.forEach((col, i) => {
      const w = col.width < 0 ? flexW : col.width;
      doc.text(c.w(col.label).toUpperCase(), xs[i], yy + 8, {
        width: w - 8,
        align: col.align === 'right' ? 'right' : 'left',
        characterSpacing: c.bn ? 0 : 0.7,
        lineBreak: false,
      });
    });
    doc
      .moveTo(c.left, yy + headH)
      .lineTo(c.right, yy + headH)
      .strokeColor(accent)
      .lineWidth(1.1)
      .stroke();
    yy += headH + 5;
  };

  head();
  rows.forEach((row, ri) => {
    if (yy + rowH + 18 > c.bottom) {
      doc.addPage();
      yy = c.top;
      head();
    }
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(ri === 0 && opts.mutedFirst ? MUTED : BODY);
    columns.forEach((col, i) => {
      const w = col.width < 0 ? flexW : col.width;
      doc.text(row[i] ?? '', xs[i], yy, {
        width: w - 8,
        align: col.align === 'right' ? 'right' : 'left',
        lineBreak: false,
      });
    });
    yy += rowH - 4;
    doc.moveTo(c.left, yy).lineTo(c.right, yy).strokeColor(HAIR).lineWidth(0.5).stroke();
    yy += 5;
  });
  return yy;
}

/* ------------------------------------------------------- the stretch sheet -- */

export async function buildOwnerReportPdf(data: OwnerReportPdfData): Promise<Buffer> {
  const r = data.report;
  const range = r.range;
  const best = r.byDay.reduce((b, d) => (d.sales > b.sales ? d : b), r.byDay[0]);
  const sold = r.byDay.reduce((n, d) => n + d.sales, 0);
  const w = pdfWords(resolveFonts().unicode ? (data.lang ?? 'en') : 'en');

  return withReport(
    data.shop,
    'SALES REPORT',
    `${day(parseKey(range.from))} — ${day(parseKey(range.to))} · ${range.days} ${w('days')}`,
    (c) => {
      const { doc, fonts, money } = c;

      let y = c.top;
      const pct = (now: number, before: number) =>
        before > 0 ? ` · ${Math.round(((now - before) / before) * 1000) / 10}% ${w('vs')}` : '';

      /* Nothing beside a figure cannot be good or bad, so every tile carries
         the same stretch before it — the rule that shapes the whole page. */
      y = summaryTiles(
        c,
        [
          {
            label: 'Sold',
            value: money(r.now.sales),
            sub: `${w('vs')} ${money(r.before.sales)}${pct(r.now.sales, r.before.sales)}`,
          },
          {
            label: 'Margin',
            value: money(r.now.margin),
            sub: `${r.now.marginPercent}${w('% of sales')} · ${w('vs')} ${money(r.before.margin)}`,
          },
          {
            label: 'Bills',
            value: String(r.now.bills),
            sub: `${w('vs')} ${r.before.bills}${pct(r.now.bills, r.before.bills)}`,
          },
          {
            label: 'Average bill',
            value: money(r.now.averageBill),
            sub: `${w('vs')} ${money(r.before.averageBill)}`,
          },
          {
            label: 'Came in',
            value: money(r.now.cameIn.value),
            sub: `${r.now.cameIn.count} ${w('deliveries')} · ${r.now.cameIn.pieces} ${w('pieces')} · ${w('vs')} ${money(r.before.cameIn.value)}`,
          },
          {
            label: 'Spent',
            value: money(r.now.expenses),
            sub: `${w('on the shop itself')} · ${w('vs')} ${money(r.before.expenses)}`,
          },
        ],
        c.left,
        y,
        6,
        9,
        78,
      );
      y += 16;

      /* The number the stretch is actually about: what the shop kept after it
         paid to be open. */
      const kept = r.now.net;
      doc.font(fonts.bold).fontSize(9).fillColor(c.accent);
      doc.text(
        `${w(kept >= 0 ? 'You kept' : 'The shop ran behind by')} ${money(Math.abs(kept))} — ${money(r.now.margin)} ${w('of margin')}${
          r.now.otherIncome > 0 ? ` ${w('plus')} ${money(r.now.otherIncome)} ${w('other income')}` : ''
        } ${w('minus')} ${money(r.now.expenses)} ${w('spent on the shop')}`,
        c.left,
        y,
        { width: c.width, lineBreak: false },
      );
      y += 18;

      /* ---- the stretch, day by day ---- */
      y = heading(
        c,
        'Sold each day',
        `${money(sold)} ${w('in all')} · ${w('best day')} ${fmtDay(best.dayKey)}`,
        y,
      );
      const chartTop = y;
      const chartH = 108;
      const peak = Math.max(1, ...r.byDay.map((d) => d.sales));
      const barW = Math.max(1, (c.width - 8) / r.byDay.length - 3);
      doc
        .moveTo(c.left, chartTop + chartH + 1)
        .lineTo(c.right, chartTop + chartH + 1)
        .strokeColor(HAIR)
        .lineWidth(0.7)
        .stroke();
      r.byDay.forEach((d, i) => {
        const bh = d.sales > 0 ? Math.max(3, Math.round((d.sales / peak) * chartH)) : 0;
        const bx = c.left + 4 + i * (barW + 3);
        doc
          .rect(bx, chartTop + chartH - bh, barW, bh)
          .fillColor(mix(c.accent, '#ffffff', d.sales === peak ? 0 : 0.25))
          .fill();
        if (d.sales === peak && d.sales > 0) {
          doc
            .font(fonts.bold)
            .fontSize(6.5)
            .fillColor(c.accent)
            .text(money(d.sales), bx, chartTop + chartH - bh - 9, {
              width: barW,
              align: 'center',
              lineBreak: false,
            });
        }
      });
      doc.font(fonts.regular).fontSize(7).fillColor(MUTED);
      doc.text(fmtDay(r.byDay[0].dayKey), c.left, chartTop + chartH + 7, { lineBreak: false });
      doc.text(fmtDay(r.byDay[r.byDay.length - 1].dayKey), c.left, chartTop + chartH + 7, {
        width: c.width,
        align: 'right',
        lineBreak: false,
      });
      y = chartTop + chartH + 26;

      /* ---- what earned the most ---- */
      y = heading(
        c,
        'What earned the most',
        'Ranked by what it made this shop, not by how much of it left the shelf.',
        y,
      );
      y = table(
        c,
        [
          { label: 'Item', width: -1, align: 'left' },
          { label: 'Pieces', width: 56, align: 'right' },
          { label: 'Sold', width: 88, align: 'right' },
          { label: 'Profit', width: 88, align: 'right' },
        ],
        r.topProducts.map((p) => [c.t(p.name), String(p.pieces), money(p.sales), money(p.margin)]),
        y,
      );
      if (r.topProducts.length === 0) {
        doc
          .font(fonts.regular)
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(w('Nothing sold in this stretch.'), c.left, y, {
            lineBreak: false,
          });
        y += 18;
      }
      y += 10;

      /* ---- which company is worth it ---- */
      y = heading(
        c,
        'Which company is worth it',
        'Margin on the stock each one supplied, traced through the batch it sold from.',
        y,
      );
      y = table(
        c,
        [
          { label: 'Company', width: -1, align: 'left' },
          { label: 'Sold', width: 88, align: 'right' },
          { label: 'Profit', width: 88, align: 'right' },
          { label: '%', width: 42, align: 'right' },
        ],
        r.bySupplier.map((s) => [c.t(s.name), money(s.sales), money(s.margin), `${s.marginPercent}%`]),
        y,
      );
      if (r.bySupplier.length === 0) {
        doc
          .font(fonts.regular)
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(w('Nothing sold in this stretch.'), c.left, y, {
            lineBreak: false,
          });
        y += 18;
      }
      y += 10;

      /* ---- what the shop itself cost ---- */
      y = heading(
        c,
        'What the shop cost',
        "The stretch's spending, by what it was for. This is where the margin becomes the kept profit.",
        y,
      );
      y = table(
        c,
        [
          { label: 'For', width: -1, align: 'left' },
          { label: 'Spent', width: 88, align: 'right' },
        ],
        r.expenseCategories.map((e) => [c.t(w(e.category)), money(e.amount)]),
        y,
      );
      if (r.expenseCategories.length === 0) {
        doc
          .font(fonts.regular)
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(w('No expenses recorded in this stretch.'), c.left, y, { lineBreak: false });
        y += 18;
      }
      y += 10;

      /* ---- money asleep on the shelf ---- */
      y = heading(
        c,
        'Sitting there',
        'On the shelf through the whole stretch without selling one piece, valued at what you paid.',
        y,
      );
      y = table(
        c,
        [
          { label: 'Item', width: -1, align: 'left' },
          { label: 'Rack', width: 92, align: 'left' },
          { label: 'On hand', width: 56, align: 'right' },
          { label: 'Value', width: 88, align: 'right' },
        ],
        r.deadStock.map((d) => [
          c.t(d.strength ? `${d.name} · ${d.strength}` : d.name),
          c.t(d.rackLabel || '—'),
          String(d.onHand),
          money(d.value),
        ]),
        y,
      );
      if (r.deadStock.length === 0) {
        y += 2;
        doc
          .font(fonts.regular)
          .fontSize(8.5)
          .fillColor(MUTED)
          .text(w('Everything on the shelf sold at least once.'), c.left, y, {
            lineBreak: false,
          });
      }
    },
    data.lang,
  );
}

/* ----------------------------------------------------------- the day sheet -- */

export async function buildTodayPdf(data: TodayReportPdfData): Promise<Buffer> {
  const t2 = data.totals;
  const owedByCustomers = data.owedByCustomers.reduce((n, c) => n + c.balance, 0);
  const w = pdfWords(resolveFonts().unicode ? (data.lang ?? 'en') : 'en');

  return withReport(
    data.shop,
    'TODAY',
    day(parseKey(data.dayKey)),
    (c) => {
      const { doc, fonts, money } = c;

      let y = c.top;
      y = summaryTiles(
        c,
        [
          { label: 'Sold today', value: money(t2.sales), sub: `${t2.bills} ${w('bills today')}` },
          { label: 'Margin', value: money(t2.margin), sub: 'after what the stock cost' },
          { label: 'On account today', value: money(t2.due), sub: 'left on the khata to collect' },
          {
            label: 'Came in today',
            value: money(data.cameIn.value),
            sub: `${data.cameIn.count} ${w('deliveries')} · ${data.cameIn.pieces} ${w('pieces')}`,
          },
          {
            label: 'Owed to you',
            value: money(owedByCustomers),
            sub: `${data.owedByCustomers.length} ${w('on the baki khata')}`,
          },
          { label: 'You owe', value: money(data.owedToSuppliers), sub: 'to the companies' },
        ],
        c.left,
        y,
        3,
        12,
        66,
      );
      y += 18;

      /* ---- how it was paid ---- */
      y = heading(c, 'How it was paid', null, y);
      const methodRows = data.byMethod.length
        ? data.byMethod.map((m) => [w(METHOD_LABEL[m.method] ?? m.method), money(m.amount)])
        : [[w('Nothing sold yet today.'), '']];
      y = table(
        c,
        [
          { label: 'Method', width: -1, align: 'left' },
          { label: 'Amount', width: 160, align: 'right' },
        ],
        methodRows,
        y,
      );
      y += 10;

      /* ---- the khata ---- */
      y = heading(
        c,
        'Baki khata',
        data.owedByCustomers.length ? 'Who owes the most, first.' : 'Nobody on the khata today.',
        y,
      );
      if (data.owedByCustomers.length) {
        y = table(
          c,
          [
            { label: 'Customer', width: -1, align: 'left' },
            { label: 'Owes', width: 160, align: 'right' },
          ],
          data.owedByCustomers.map((x) => [
            c.t(x.phone ? `${x.name} · ${x.phone}` : x.name),
            money(x.balance),
          ]),
          y,
        );
        y += 10;
      }

      /* ---- the bills ---- */
      y = heading(c, "Today's bills", `${data.bills.length} ${w('shown')}`, y);
      y = table(
        c,
        [
          { label: 'Bill', width: 96, align: 'left' },
          { label: 'Time', width: 118, align: 'left' },
          { label: 'Sold by', width: -1, align: 'left' },
          { label: 'Total', width: 88, align: 'right' },
          { label: 'Due', width: 74, align: 'right' },
        ],
        data.bills.map((s) => [s.billNo, s.time, c.t(s.by), money(s.total), s.due > 0 ? money(s.due) : '—']),
        y,
      );
      if (data.bills.length === 0) {
        y += 2;
        doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED).text(w('Nothing sold yet today.'), c.left, y, {
          lineBreak: false,
        });
      }
    },
    data.lang,
  );
}

/* ------------------------------------------------------------- the little -- */

/** Parse a `YYYY-MM-DD` key in the same UTC-safe way the rest of the app does. */
function parseKey(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

const fmtDay = (key: string) =>
  parseKey(key).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
