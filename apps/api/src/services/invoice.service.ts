import PDFDocument from 'pdfkit';
import { ShopSettingsModel, PaymentModel, OrganizationModel, UserModel } from '../models/index.js';
import { nextSequence } from '../models/Counter.js';
import { planByKey } from './plan.service.js';
import { env } from '../config/env.js';
import { notFound, badRequest, forbidden } from '../utils/AppError.js';
import { currencyPrefix, resolveFonts, safeText, warnIfUnsupported } from './pdfFont.js';

/**
 * The receipt a shop files with its own accounts.
 *
 * A subscription that takes money and leaves nothing behind is a problem the
 * moment the shop's accountant asks what the bKash transfer was for. So every
 * verified payment gets a number and a printable page naming both sides, what
 * was bought, and the period it covers.
 *
 * Issued at **verification**, not at submission: an unverified claim is a shop
 * saying it paid, and numbering that would put a receipt in their hands for
 * money nobody has seen. Rejected payments never get one.
 *
 * The number is `DW-2026-000001` — prefix, year, sequence — from an atomic
 * counter, because two verifications in the same second must not collide and a
 * deleted row must not let a number be reused.
 */

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#d1d5db';
const ACCENT = '#4c1d95';

export interface InvoiceData {
  number: string;
  issuedAt: Date;
  issuer: {
    name: string;
    address: string;
    phone: string;
    email: string;
    bin: string;
  };
  billedTo: {
    shop: string;
    contact: string;
    email: string;
    phone: string;
    /** The shop's own BIN and drug licence, from its settings, when it has them. */
    bin: string;
    licence: string;
  };
  /** Branches beyond those the plan includes, per month — when there were any. */
  extraBranches: { count: number; pricePerBranch: number } | null;
  /** What the plan cost before a discount code, and the code — when one was used. */
  discount: { code: string; amount: number; base: number } | null;
  /** The VAT inside `amount`. Null when VAT is off. */
  vat: { percent: number; net: number; vat: number } | null;
  plan: string;
  months: number;
  coversUntil: Date | null;
  amount: number;
  currency: string;
  method: string;
  trxId: string;
  paidAt: Date | null;
  verifiedAt: Date | null;
}

const METHOD_LABEL: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  upay: 'Upay',
  rocket: 'Rocket',
  bank: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
};

const day = (d?: Date | null) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

/**
 * The number for a verified payment, issuing one if it does not have it yet.
 *
 * Lazily assigned as well as at verification, so payments verified before
 * invoices existed still produce a receipt the first time one is asked for
 * rather than needing a migration to backfill numbers nobody may ever want.
 */
export async function invoiceNumberFor(paymentId: string): Promise<string> {
  const payment = await PaymentModel.findById(paymentId).select('status invoiceNo invoicedAt');
  if (!payment) throw notFound('Payment');
  if (payment.status !== 'verified') {
    throw badRequest('An invoice is issued once the payment has been verified');
  }
  if (payment.invoiceNo) return payment.invoiceNo;

  const issuedAt = new Date();
  const year = issuedAt.getFullYear();
  const seq = await nextSequence(`invoice:${year}`);
  const number = `${env.invoice.prefix}-${year}-${String(seq).padStart(6, '0')}`;

  payment.set('invoiceNo', number);
  payment.set('invoicedAt', issuedAt);
  await payment.save();
  return number;
}

/**
 * Everything the page prints.
 *
 * `orgId` scopes it to one shop's own payments — the same function serves the
 * shop's download and the operator's, and the operator simply passes nothing.
 */
/**
 * The VAT inside a VAT-inclusive amount, to the paisa: ৳3,000 at 15% is ৳391.30
 * VAT on ৳2,608.70. Pure, for the tests.
 */
export function vatSplit(amount: number, percent: number) {
  if (!(percent > 0) || !(amount > 0)) return null;
  const vat = Math.round(((amount * percent) / (100 + percent)) * 100) / 100;
  return { percent, vat, net: Math.round((amount - vat) * 100) / 100 };
}

export async function invoiceFor(paymentId: string, orgId?: string): Promise<InvoiceData> {
  const payment = await PaymentModel.findById(paymentId).lean();
  if (!payment) throw notFound('Payment');
  if (orgId && String(payment.organization) !== orgId) throw forbidden('Not found');

  const number = await invoiceNumberFor(paymentId);
  const fresh = await PaymentModel.findById(paymentId).select('invoicedAt').lean();

  const [org, submitter, plan, settings] = await Promise.all([
    OrganizationModel.findById(payment.organization).select('name address phone email').lean(),
    UserModel.findById(payment.submittedBy).select('name email phone').lean(),
    planByKey(payment.plan),
    ShopSettingsModel.findOne({ organization: payment.organization }).select('vatBin drugLicenceNo').lean(),
  ]);
  const coupon = (payment as { coupon?: { code?: string; discount?: number } }).coupon;

  const addressOf = (a: unknown) => {
    if (!a) return '';
    if (typeof a === 'string') return a;
    const parts = a as Record<string, string | undefined>;
    return [parts.street, parts.area, parts.city, parts.district].filter(Boolean).join(', ');
  };

  return {
    number,
    issuedAt: fresh?.invoicedAt ?? new Date(),
    issuer: {
      name: env.invoice.issuer,
      address: env.invoice.address,
      phone: env.invoice.phone,
      email: env.invoice.email,
      bin: env.invoice.bin,
    },
    billedTo: {
      shop: org?.name ?? 'Shop',
      contact: submitter?.name ?? '',
      email: (org as { email?: string })?.email || submitter?.email || '',
      phone: (org as { phone?: string })?.phone || submitter?.phone || '',
      bin: settings?.vatBin ?? '',
      licence: settings?.drugLicenceNo ?? '',
    },
    extraBranches: (payment as { pricing?: { extraBranches?: number; extraBranchPrice?: number } }).pricing?.extraBranches
      ? {
          count: (payment as { pricing: { extraBranches: number } }).pricing.extraBranches,
          pricePerBranch: (payment as { pricing: { extraBranchPrice?: number } }).pricing.extraBranchPrice ?? 0,
        }
      : null,
    discount: coupon?.code && (coupon.discount ?? 0) > 0
      ? { code: coupon.code, amount: coupon.discount!, base: payment.amount + coupon.discount! }
      : null,
    vat: vatSplit(payment.amount, env.invoice.vatPercent),
    plan: plan?.name ?? payment.plan,
    months: payment.months ?? 1,
    coversUntil: payment.coversUntil ?? null,
    amount: payment.amount,
    currency: payment.currency || 'BDT',
    method: METHOD_LABEL[payment.method] ?? payment.method,
    trxId: payment.trxId || '',
    paidAt: payment.paidAt ?? null,
    verifiedAt: payment.reviewedAt ?? null,
  };
}

export const invoiceFilename = (data: InvoiceData) =>
  `${data.number}-${data.billedTo.shop.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;

/** A4 portrait. One page — a subscription receipt has one line on it. */
export async function buildInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const fonts = resolveFonts();
  warnIfUnsupported(fonts, 'invoice', data.billedTo.shop, data.issuer.name, data.issuer.address);
  const t = (v: string | undefined | null) => safeText(fonts, v ?? '');
  const money = (n: number) =>
    `${currencyPrefix(fonts, data.currency)}${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  /** Always two decimals: a VAT figure is read to the paisa. */
  const paisa = (n: number) =>
    `${currencyPrefix(fonts, data.currency)}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  /* ------------------------------------------------------------- header -- */

  doc.font(fonts.bold).fontSize(20).fillColor(ACCENT).text(t(data.issuer.name), left, 52);

  // One `text` call per line rather than one string with newlines in it:
  // without a Unicode font `safeText` strips everything outside WinAnsi, and a
  // newline is one of them — address, phone and email ran together into a single
  // wrapped paragraph.
  doc.font(fonts.regular).fontSize(9).fillColor(MUTED);
  for (const line of [data.issuer.address, data.issuer.phone, data.issuer.email].filter(Boolean)) {
    doc.text(t(line), left, doc.y + 2, { width: width * 0.55 });
  }
  if (data.issuer.bin) {
    doc.font(fonts.regular).fontSize(9).fillColor(MUTED).text(t(`BIN: ${data.issuer.bin}`));
  }

  // "Tax invoice" only when it is one: VAT on it, and our BIN to claim it against.
  const taxInvoice = Boolean(data.vat && data.issuer.bin);
  doc.font(fonts.bold).fontSize(22).fillColor(INK).text(taxInvoice ? 'TAX INVOICE' : 'INVOICE', left, 52, {
    width,
    align: 'right',
  });
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor(MUTED)
    .text(t(data.number), left, doc.y + 2, { width, align: 'right' })
    .text(day(data.issuedAt), { width, align: 'right' });

  const headerBottom = Math.max(doc.y, 130) + 10;
  doc.moveTo(left, headerBottom).lineTo(right, headerBottom).strokeColor(LINE).lineWidth(1).stroke();

  /* ------------------------------------------------------------ billed to -- */

  let y = headerBottom + 18;
  doc.font(fonts.bold).fontSize(9).fillColor(MUTED).text('BILLED TO', left, y);
  y = doc.y + 2;
  doc.font(fonts.bold).fontSize(12).fillColor(INK).text(t(data.billedTo.shop), left, y);
  doc.font(fonts.regular).fontSize(10).fillColor(MUTED);
  for (const line of [
    data.billedTo.contact,
    data.billedTo.phone,
    data.billedTo.email,
    data.billedTo.bin ? `BIN: ${data.billedTo.bin}` : '',
    data.billedTo.licence ? `Drug licence: ${data.billedTo.licence}` : '',
  ].filter(Boolean)) {
    doc.text(t(line), left, doc.y + 1);
  }

  /* ----------------------------------------------------------------- line -- */

  y = doc.y + 24;
  const col = { desc: left, qty: left + width * 0.6, amount: right };

  doc.rect(left, y, width, 24).fillColor('#f5f3ff').fill();
  doc.font(fonts.bold).fontSize(9).fillColor(ACCENT);
  doc.text('DESCRIPTION', col.desc + 8, y + 8);
  doc.text('PERIOD', col.qty, y + 8);
  doc.text('AMOUNT', left, y + 8, { width: width - 8, align: 'right' });

  y += 24;
  doc.font(fonts.regular).fontSize(11).fillColor(INK);
  doc.text(t(`${data.plan} subscription`), col.desc + 8, y + 10, { width: width * 0.55 });
  doc.text(`${data.months} month${data.months === 1 ? '' : 's'}`, col.qty, y + 10);
  // The plan's own price on the line; a discount comes off it below.
  const extrasTotal = data.extraBranches ? data.extraBranches.count * data.extraBranches.pricePerBranch * data.months : 0;
  doc.font(fonts.bold).text(money((data.discount?.base ?? data.amount) - extrasTotal), left, y + 10, { width: width - 8, align: 'right' });

  // Extra branches, as a line of their own: what they are, for how long, and what they come to.
  if (data.extraBranches && data.extraBranches.pricePerBranch > 0) {
    const eb = data.extraBranches;
    const ebTotal = eb.count * eb.pricePerBranch * data.months;
    y = doc.y + 8;
    doc.font(fonts.regular).fontSize(10).fillColor(INK);
    doc.text(t(`${eb.count} extra branch${eb.count === 1 ? '' : 'es'} × ${money(eb.pricePerBranch)} a month`), col.desc + 8, y, { width: width * 0.55 });
    doc.text(`${data.months} month${data.months === 1 ? '' : 's'}`, col.qty, y);
    doc.text(money(ebTotal), left, y, { width: width - 8, align: 'right' });
  }

  const lineBottom = doc.y + 12;
  doc.moveTo(left, lineBottom).lineTo(right, lineBottom).strokeColor(LINE).stroke();

  // The shop's real question is not the amount, it is until when they are
  // covered — so it sits on the line itself rather than in a note underneath.
  if (data.coversUntil) {
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Covers the subscription until ${day(data.coversUntil)}`, col.desc + 8, lineBottom + 6);
  }

  y = doc.y + 14;
  // A discount code: the plan's price, what the code took off, then the total.
  if (data.discount) {
    doc.font(fonts.regular).fontSize(10).fillColor(MUTED);
    doc.text('Plan price', left, y, { width: width * 0.6 });
    doc.text(money(data.discount.base), left, y, { width, align: 'right' });
    y = doc.y + 4;
    doc.text(t(`Discount (${data.discount.code})`), left, y, { width: width * 0.6 });
    doc.text(`−${money(data.discount.amount)}`, left, y, { width, align: 'right' });
    y = doc.y + 8;
  }
  doc.font(fonts.bold).fontSize(13).fillColor(INK);
  doc.text('Total paid', left, y, { width: width * 0.6 });
  doc.text(money(data.amount), left, y, { width, align: 'right' });
  // The VAT inside the total: the price includes it, so it is shown, not added.
  if (data.vat) {
    y = doc.y + 4;
    doc.font(fonts.regular).fontSize(9.5).fillColor(MUTED);
    doc.text(`Includes VAT at ${data.vat.percent}%`, left, y, { width: width * 0.6 });
    doc.text(paisa(data.vat.vat), left, y, { width, align: 'right' });
    y = doc.y + 2;
    doc.text('Price before VAT', left, y, { width: width * 0.6 });
    doc.text(paisa(data.vat.net), left, y, { width, align: 'right' });
  }

  /* -------------------------------------------------------------- payment -- */

  y = doc.y + 26;
  doc.font(fonts.bold).fontSize(9).fillColor(MUTED).text('PAYMENT', left, y);
  y = doc.y + 4;

  const rows: [string, string][] = [
    ['Method', data.method],
    ['Transaction id', data.trxId || '—'],
    ['Paid on', day(data.paidAt)],
    ['Received and verified', day(data.verifiedAt)],
  ];
  doc.fontSize(10);
  for (const [label, value] of rows) {
    doc.font(fonts.regular).fillColor(MUTED).text(label, left, y, { width: width * 0.35 });
    doc.font(fonts.bold).fillColor(INK).text(t(value), left + width * 0.35, y, {
      width: width * 0.65,
    });
    y = doc.y + 4;
  }

  /* --------------------------------------------------------------- footer -- */

  const footY = doc.page.height - doc.page.margins.bottom - 46;
  doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LINE).stroke();
  doc
    .font(fonts.regular)
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      t(
        env.invoice.footer ||
          'This receipt is issued against a verified payment. No signature is required.',
      ),
      left,
      footY + 8,
      { width, align: 'center' },
    );

  doc.end();
  return done;
}
