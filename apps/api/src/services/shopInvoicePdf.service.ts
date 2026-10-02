import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Types } from 'mongoose';

import { PurchaseModel, ShopSettingsModel } from '../models/index.js';
import { storage } from './storage.service.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { currencyPrefix, resolveFonts, safeText, warnIfUnsupported } from './pdfFont.js';
import { pdfWords, type PdfLang } from './pdfWords.js';
import { bnAmountInWords } from '../utils/bnWords.js';
import type { Actor } from './shop.service.js';
import { branchMatch } from './branchScope.service.js';

/**
 * The two documents a pharmacy is asked for on paper that is not a till roll.
 *
 * The thermal slip is the right paper for a customer buying a strip of Napa,
 * and it is the wrong paper for everything else. A company buying its staff's
 * medicine wants something to file, an NGO wants something to claim against,
 * and the shop's own accountant wants the delivery from Square as a sheet that
 * matches the invoice in the folder. None of that fits on 80mm, and photographs
 * of a curling receipt are what people were doing instead.
 *
 * So, two A4 documents from the records that already exist:
 *
 * - **The customer's invoice**, off a `Sale` — every line with its batch, what
 *   was paid and how, and what is still on account.
 * - **The delivery**, off a `Purchase` — what a company sent, batch by batch,
 *   with the bonus in its own column and the cost per piece that was derived
 *   from it. Headed "delivery" rather than "invoice" on purpose: the invoice is
 *   the company's document and this is the shop's record of receiving it.
 *
 * Both carry a QR of the same handful of facts, for the same reason the till
 * roll does — plain text a phone reads with nothing installed, so a document
 * that has been filed, faxed or photographed is still worth something.
 *
 * Built like the subscription invoice: explicit `y` positions rather than flowing
 * from wherever the last write left the cursor, because flowing layout is what
 * makes generated documents drift — one long shop name and the totals block
 * lands on the footer.
 */

const INK = '#111827';
const BODY = '#374151';
const MUTED = '#6b7280';
const HAIR = '#e5e7eb';
const WASH = '#ecfdf5';
/* The shop's green, the same as its screens: a document a customer carries away
   should read as coming from the pharmacy that printed it. */
const ACCENT = '#065f46';
const ACCENT_SOFT = '#a7f3d0';
/* Still-owed runs in the accent's red, the one note of alarm on the sheet. */
const RED = '#b91c1c';

/**
 * A colour mixed towards another, as six hex digits.
 *
 * pdfkit takes `#rrggbb` and nothing else. An eight-digit `#rrggbb44` — the
 * obvious way to ask for a tint — is not rejected: it is parsed as something
 * else entirely, which is how a shop's green table header first came out
 * orange. So tints are computed here rather than written as alpha.
 */
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

/**
 * ৳1,234.50 in words, the way an amount is read out here.
 *
 * Lakh and crore, not million: "one hundred and twenty thousand taka" means
 * nothing at a counter in Dhaka. The pharmacy app has the same function for the
 * till roll, which is a duplicate on purpose — the browser bundle and this
 * service share no code, and the alternative is a round trip to the server
 * before a receipt can be printed at a counter whose line is down.
 */
export function inWords(amount: number): string {
  const ones = [
    '',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const under100 = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}`;

  const under1000 = (x: number): string =>
    x < 100 ? under100(x) : `${ones[Math.floor(x / 100)]} hundred${x % 100 ? ` ${under100(x % 100)}` : ''}`;

  const whole = Math.floor(Math.abs(amount));
  if (whole === 0) return 'zero';

  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000);
  const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1000);
  const rest = whole % 1000;
  if (crore) parts.push(`${under1000(crore)} crore`);
  if (lakh) parts.push(`${under1000(lakh)} lakh`);
  if (thousand) parts.push(`${under1000(thousand)} thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}

/* ------------------------------------------------------------------ data -- */

/** What the shop's own letterhead says, and how it is drawn. */
export interface LetterheadShop {
  name: string;
  address: string;
  phone: string;
  drugLicenceNo: string;
  vatBin: string;
  logo: Buffer | null;
  /** The shop's own letterhead, as pictures, for the `image` and `pad` styles. */
  header?: Buffer | null;
  footer?: Buffer | null;
  look: {
    style?: 'dawai' | 'image' | 'pad';
    padTopMm?: number;
    padBottomMm?: number;
    paper: 'A4' | 'A5';
    accent: string;
    showLogo: boolean;
    showQr: boolean;
    showBatch: boolean;
    signatureLabel: string;
    terms: string;
  };
}

export interface DeliveryLine {
  name: string;
  batchNo: string;
  expiry: Date | null;
  qtyPieces: number;
  bonusPieces: number;
  rate: number;
  amount: number;
}

/**
 * One delivery, as the shop's own record of receiving it.
 *
 * Called a delivery rather than an invoice on purpose: the invoice is the
 * company's document and lives in a folder with a signature on it. This is what
 * the shop wrote down when the boxes were opened — batch by batch, with the
 * bonus in its own column and the cost per piece that was derived from both.
 */
export interface DeliverySheetData {
  /** The paper's language: the shop's "Bangla on the receipt" choice. */
  lang?: PdfLang;
  /** Drawn for the settings screen: a pad's own header and footer are shown, not left blank. */
  preview?: boolean;
  /** The alignment page: the printable area outlined, to hold against a pad. */
  align?: boolean;
  shop: LetterheadShop;
  number: string;
  issuedAt: Date;
  party: { name: string; phone: string };
  enteredBy: string;
  lines: DeliveryLine[];
  subTotal: number;
  discount: number;
  vat: number;
  total: number;
  paid: number;
  note: string;
}

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw badRequest('That id is not valid');
  return new Types.ObjectId(id);
};

const DEFAULT_LOOK: LetterheadShop['look'] = {
  style: 'dawai',
  padTopMm: 45,
  padBottomMm: 20,
  paper: 'A4',
  accent: '#065f46',
  showLogo: true,
  showQr: true,
  showBatch: true,
  signatureLabel: 'For the shop',
  terms: '',
};

/**
 * The letterhead, as this shop has set it up.
 *
 * Every value has a default that produces a correct sheet, so a shop that never
 * opens the settings screen still gets something it can hand over. A logo that
 * cannot be read is dropped rather than raised: a missing picture is not a
 * reason to fail a document somebody is standing at a printer waiting for.
 */
export async function letterheadOf(org: string): Promise<LetterheadShop> {
  const settings = await ShopSettingsModel.findOne({ organization: org }).lean();
  const look = { ...DEFAULT_LOOK, ...((settings?.invoice ?? {}) as Partial<LetterheadShop['look']>) };

  let logo: Buffer | null = null;
  if (look.showLogo && settings?.logo) {
    logo = await storage.read(settings.logo).catch(() => null);
  }
  /* The letterhead pictures are read whatever the style: the pad style shows
     them in the preview, to line the page up against. */
  const [header, footer] = await Promise.all([
    settings?.letterheadHeader ? storage.read(settings.letterheadHeader).catch(() => null) : null,
    settings?.letterheadFooter ? storage.read(settings.letterheadFooter).catch(() => null) : null,
  ]);

  return {
    name: settings?.shopName?.trim() || 'Pharmacy',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    drugLicenceNo: settings?.drugLicenceNo ?? '',
    vatBin: settings?.vatBin ?? '',
    logo,
    header,
    footer,
    look: {
      ...look,
      /* A colour that is not a colour reaches pdfkit as a throw halfway through
         a print. The validator rejects one on the way in; this is the second
         line, for a value written before that validator existed. */
      accent: /^#[0-9a-fA-F]{6}$/.test(look.accent) ? look.accent : DEFAULT_LOOK.accent,
    },
  };
}

export async function deliverySheet(actor: Actor, id: string): Promise<DeliverySheetData> {
  const purchase = await PurchaseModel.findOne({ _id: oid(id), organization: actor.org, ...branchMatch(actor.branch) })
    .populate('supplier', 'name phone')
    .lean();
  if (!purchase) throw notFound('Delivery');

  const supplier = purchase.supplier as unknown as { name?: string; phone?: string } | null;

  return {
    shop: await letterheadOf(actor.org),
    number: purchase.invoiceNo || '—',
    issuedAt: purchase.invoiceDate,
    party: { name: supplier?.name ?? 'Company', phone: supplier?.phone ?? '' },
    enteredBy: purchase.createdByName ?? '',
    lines: purchase.lines.map((l) => ({
      name: l.name,
      batchNo: l.batchNo ?? '',
      expiry: l.expiry ?? null,
      qtyPieces: l.qtyPieces,
      bonusPieces: l.bonusPieces ?? 0,
      rate: money2(l.tradePricePerPiece),
      amount: money2(l.lineTotal),
    })),
    subTotal: money2(purchase.subTotal),
    discount: money2(purchase.discount),
    vat: money2(purchase.vat),
    total: money2(purchase.total),
    paid: money2(purchase.paidAmount),
    note: purchase.note ?? '',
  };
}

export const deliveryFilename = (data: DeliverySheetData) => {
  const who = data.party.name
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
  const number = data.number.replace(/[^a-z0-9-]+/gi, '');
  return `delivery-${number || 'no-number'}${who ? `-${who}` : ''}.pdf`;
};

/**
 * What the square says.
 *
 * The same shape as the till roll's — who, then which document, then the money
 * — and short for the same reason: every character makes it denser, and a dense
 * square photocopied off an A4 sheet is one that does not scan.
 */
export function deliveryQrText(data: DeliverySheetData) {
  const head = [data.shop.name, data.shop.address, data.shop.phone && `Mob: ${data.shop.phone}`]
    .map((line) => (line || '').trim())
    .filter(Boolean);

  return [
    ...head,
    '',
    `Delivery from: ${data.party.name}`,
    `Invoice: ${data.number}`,
    day(data.issuedAt),
    `Total: Tk ${data.total}`,
  ].join('\n');
}

/** What the settings screen has typed and not saved yet, drawn over what is stored. */
export interface LetterheadDraft {
  shop?: Partial<Pick<LetterheadShop, 'name' | 'address' | 'phone' | 'drugLicenceNo' | 'vatBin'>>;
  look?: Partial<LetterheadShop['look']>;
}

/** A sample sheet, for a shop deciding what its paper should look like. */
export async function sampleDelivery(
  actor: Actor,
  draft: LetterheadDraft = {},
  flags: { preview?: boolean; align?: boolean } = {},
): Promise<DeliverySheetData> {
  const stored = await letterheadOf(actor.org);
  const typed = Object.fromEntries(Object.entries(draft.shop ?? {}).filter(([, v]) => v !== undefined));
  const shop: LetterheadShop = {
    ...stored,
    ...typed,
    name: (typed.name as string | undefined)?.trim() || stored.name,
    look: { ...stored.look, ...Object.fromEntries(Object.entries(draft.look ?? {}).filter(([, v]) => v !== undefined)) },
  };
  /* The logo is read only when it was stored on; switching it on in the draft
     of a shop that has one has to show it too. */
  if (draft.look?.showLogo && !stored.logo) {
    const s = await ShopSettingsModel.findOne({ organization: actor.org }).select('logo').lean();
    if (s?.logo) shop.logo = await storage.read(s.logo).catch(() => null);
  }
  if (draft.look?.showLogo === false) shop.logo = null;
  return {
    ...flags,
    shop,
    number: 'SQ-88120',
    issuedAt: new Date(),
    party: { name: 'Square Depot, Mirpur', phone: '01555000111' },
    enteredBy: actor.name,
    lines: [
      {
        name: 'Napa 500mg Tablet',
        batchNo: 'B-7741',
        expiry: new Date(Date.now() + 550 * 86_400_000),
        qtyPieces: 1000,
        bonusPieces: 100,
        rate: 0.86,
        amount: 860,
      },
      {
        name: 'Seclo 20mg Capsule',
        batchNo: 'S-2210',
        expiry: new Date(Date.now() + 400 * 86_400_000),
        qtyPieces: 600,
        bonusPieces: 0,
        rate: 5.1,
        amount: 3060,
      },
    ],
    subTotal: 3920,
    discount: 120,
    vat: 0,
    total: 3800,
    paid: 2000,
    note: 'A sample sheet — nothing here was delivered.',
  };
}

/* ------------------------------------------------------------------- pdf -- */

/**
 * The sheet, drawn on the shop's own letterhead.
 *
 * Two things shape how this is built:
 *
 * - **The letterhead goes on every page**, and is stamped *after* the content
 *   rather than before it. A delivery of sixty lines runs to three pages, and a
 *   header drawn as each page opens is a header somebody has to remember at
 *   every `addPage` — including the ones pdfkit adds by itself. Buffered pages
 *   mean it is painted once, at the end, over every page there turned out to
 *   be, and the page count in the footer is knowable at all.
 * - **Positions are explicit**, not flowed from wherever the last write left
 *   the cursor. Flowing layout is what makes generated documents drift: one
 *   long company name and the totals block lands on the footer.
 */
export async function buildDeliveryPdf(data: DeliverySheetData): Promise<Buffer> {
  const fonts = resolveFonts();
  warnIfUnsupported(fonts, 'delivery sheet', data.shop.name, data.shop.address, data.party.name);
  const t = (v: string | undefined | null) => safeText(fonts, v ?? '');
  /* Bangla only where a font can draw it; otherwise the words would vanish. */
  const bn = fonts.unicode && data.lang === 'bn';
  const w = pdfWords(bn ? 'bn' : 'en');
  const money = (n: number) =>
    `${currencyPrefix(fonts, 'BDT').trimEnd()} ${money2(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const look = data.shop.look;
  const accent = look.accent;
  /* The table head's wash and the band's secondary text, mixed from the accent
     rather than fixed: a shop that chooses maroon should not get a green table
     header underneath it. */
  const wash = mix(accent, '#ffffff', 0.9);
  const soft = mix(accent, '#ffffff', 0.62);
  /* A quieter wash and an edge for the two panels on the page — they share the
     master palette but should not shout like the table's head wash does. */
  const wash2 = mix(accent, '#ffffff', 0.95);
  const panelEdge = mix(accent, '#ffffff', 0.74);

  /* A small bottom margin for pdfkit itself: where the content stops is worked
     out below for each style, and a pad's foot can sit lower than 40pt. */
  const doc = new PDFDocument({ size: look.paper, margins: { top: 40, left: 40, right: 40, bottom: 6 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bandH = look.paper === 'A5' ? 76 : 92;
  const footH = 34;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const style = look.style ?? 'dawai';
  const mm = (v: number) => (v * 72) / 25.4;

  /*
   * How much of the page the letterhead takes, top and foot, in each style.
   *
   * - dawai: the band, and the rule with the small print under the content.
   * - image: the shop's header and footer pictures, across the full width, at
   *   their own proportions — capped, so a tall scan cannot eat the page.
   * - pad: what the owner measured on their pad with a ruler.
   */
  const pictureH = (img: Buffer | null | undefined, cap: number) => {
    if (!img) return 0;
    try {
      const o = (doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }).openImage(img);
      return Math.min(cap, (pageW * o.height) / o.width);
    } catch {
      return 0;
    }
  };
  let headH: number;
  let footReserve: number;
  if (style === 'image') {
    headH = pictureH(data.shop.header, pageH * 0.3);
    footReserve = pictureH(data.shop.footer, pageH * 0.18);
  } else if (style === 'pad') {
    headH = mm(Math.max(0, Math.min(120, look.padTopMm ?? 45)));
    footReserve = mm(Math.max(0, Math.min(80, look.padBottomMm ?? 20)));
  } else {
    headH = bandH;
    footReserve = 40;
  }
  /** The line under the content: the small print and the page count. */
  const footTextY = style === 'dawai' ? pageH - 40 - footH + 8 : pageH - footReserve - 16;
  const bottom = style === 'dawai' ? pageH - 40 - footH : footTextY - 14;
  /*
   * Where content starts on any page.
   *
   * On someone else's letterhead the sheet still has to say what it is, so the
   * title and number take a line of their own under it.
   */
  const titleY = headH + (style === 'pad' ? 8 : 14);
  const top = style === 'dawai' ? bandH + 26 : titleY + 34;

  const fitLine = (
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

  const field = (label: string, value: string, x: number, y: number, w: number) => {
    doc
      .font(fonts.bold)
      .fontSize(7)
      .fillColor(accent)
      .text(label.toUpperCase(), x, y, {
        width: w,
        lineBreak: false,
        characterSpacing: bn ? 0 : 0.9,
      });
    doc
      .font(fonts.regular)
      .fontSize(10.5)
      .fillColor(INK)
      .text(t(value || '—'), x, y + 12, { width: w, lineGap: 1 });
  };

  /* ------------------------------------------------------------------ who -- */

  /*
   * The four facts that tie the sheet to the invoice sit in a panel rather
   * than on the white page: a hair-rule box with a 3pt accent bar across the
   * top — the same motif the totals keep below. Grouped, they read as one
   * block of "who and when" instead of four labels the eye has to join up.
   */
  const panelTop = top;
  const panelH = 88;
  doc.rect(left, panelTop, width, panelH).strokeColor(panelEdge).lineWidth(0.9).stroke();
  doc.rect(left, panelTop, width, 3).fillColor(accent).fill();

  const half = width / 2;
  const colW = half - 20;
  const row1 = panelTop + 16;
  const row2 = panelTop + 50;
  field(w('Received from'), data.party.name, left + 14, row1, colW);
  field(w('Invoice date'), day(data.issuedAt), left + half + 6, row1, colW);
  field(w('Phone'), data.party.phone, left + 14, row2, colW);
  field(w('Entered by'), data.enteredBy, left + half + 6, row2, colW);

  let y = panelTop + panelH + 24;

  /* ---------------------------------------------------------------- lines -- */

  /*
   * A5 is not a narrow A4.
   *
   * The number columns have fixed widths because figures have to line up, so on
   * a narrower sheet it is the *item* column that has to give — and it ran to a
   * negative width, which pdfkit does not reject: it tries to wrap text into it
   * forever, and the process dies of memory rather than of an error. The batch
   * column is the first thing dropped, then the expiry, because on a half sheet
   * the name and the money are what somebody is reading.
   */
  const narrow = width < 400;
  const batch = look.showBatch && !narrow;
  /*
   * Laid out right to left from the amount.
   *
   * Every number column is right-aligned inside a box of its own, and the boxes
   * are subtracted from the right edge in order — which is the only way they
   * cannot overlap. Fractions of the width put the rate under the amount the
   * first time a figure ran to five digits.
   */
  const AMOUNT_W = narrow ? 74 : 86;
  const RATE_W = narrow ? 44 : 52;
  /* On a half sheet the bonus rides with the quantity — "1000 +100" — rather
     than taking a column the item name cannot spare. */
  const FREE_W = narrow ? 0 : 38;
  const QTY_W = narrow ? 62 : 44;
  const EXPIRY_W = narrow ? 58 : 74;
  const BATCH_W = 70;
  const amountX = right - 8 - AMOUNT_W;
  const rateX = amountX - RATE_W;
  const freeX = rateX - FREE_W;
  const qtyX = freeX - QTY_W;
  const expiryX = qtyX - EXPIRY_W;
  const batchX = batch ? expiryX - BATCH_W : expiryX;
  const itemX = left + 8;
  const itemW = Math.max(60, batchX - itemX - 8);

  const headRow = () => {
    doc.rect(left, y, width, 22).fillColor(wash).fill();
    doc.font(fonts.bold).fontSize(7).fillColor(accent);
    doc.text(w('ITEM'), itemX, y + 8, { characterSpacing: bn ? 0 : 0.7, lineBreak: false });
    if (batch) doc.text(w('BATCH'), batchX, y + 8, { characterSpacing: bn ? 0 : 0.7, lineBreak: false });
    doc.text(w('EXPIRY'), expiryX, y + 8, { characterSpacing: bn ? 0 : 0.7, lineBreak: false });
    doc.text(w('QTY'), qtyX, y + 8, { characterSpacing: bn ? 0 : 0.7, width: QTY_W, align: 'right' });
    if (!narrow) {
      doc.text(w('FREE'), freeX, y + 8, { characterSpacing: bn ? 0 : 0.7, width: FREE_W, align: 'right' });
    }
    doc.text(w('RATE'), rateX, y + 8, { characterSpacing: bn ? 0 : 0.7, width: RATE_W, align: 'right' });
    doc.text(w('AMOUNT'), amountX, y + 8, {
      width: AMOUNT_W,
      align: 'right',
      characterSpacing: bn ? 0 : 0.7,
    });
    /* The accent rule under the head — the one strong line on the page, drawing
       the eye down the figures rather than at them. */
    doc
      .moveTo(left, y + 22)
      .lineTo(right, y + 22)
      .strokeColor(accent)
      .lineWidth(1.2)
      .stroke();
    y += 26;
  };

  headRow();

  const rowH = 20;
  for (const line of data.lines) {
    /*
     * Room for the row, for the totals that follow it, and for the square and
     * the signature under those.
     *
     * Reserved together on purpose: reserving only the totals produced a third
     * sheet holding nothing but a QR and a signature line, which is a sheet
     * somebody pays for and throws away.
     */
    if (y + rowH > bottom - (narrow ? 180 : 280)) {
      doc.addPage();
      y = top;
      headRow();
    }

    fitLine(t(line.name), itemX, y, itemW, fonts.regular, 9.5, 7, INK);

    doc.font(fonts.regular).fontSize(8.5).fillColor(MUTED);
    if (batch) {
      doc.text(t(line.batchNo || '—'), batchX, y + 1, { width: BATCH_W - 6, lineBreak: false });
    }
    doc.text(line.expiry ? day(line.expiry) : '—', expiryX, y + 1, {
      width: EXPIRY_W - 4,
      lineBreak: false,
    });

    doc.fontSize(9.5).fillColor(BODY);
    doc.text(
      narrow && line.bonusPieces ? `${line.qtyPieces} +${line.bonusPieces}` : String(line.qtyPieces),
      qtyX,
      y,
      { width: QTY_W, align: 'right' },
    );
    if (!narrow) {
      doc.text(line.bonusPieces ? `+${line.bonusPieces}` : '—', freeX, y, {
        width: FREE_W,
        align: 'right',
      });
    }
    doc.text(money2(line.rate).toFixed(2), rateX, y, { width: RATE_W, align: 'right' });
    doc.font(fonts.bold).fillColor(INK).text(money(line.amount), amountX, y, {
      width: AMOUNT_W,
      align: 'right',
    });

    y += rowH - 6;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(HAIR).lineWidth(0.5).stroke();
    y += 6;
  }

  /* --------------------------------------------------------------- totals -- */

  y += 12;
  const boxW = 230;
  const boxX = right - boxW;
  const totalsTop = y;
  const owed = money2(data.total - data.paid);

  const disc = data.discount > 0;
  const vat = data.vat > 0;
  const anyoneOwed = owed > 0.009;

  /* The totals sit in their own washed panel, with the bill's bottom line on a
     band of the accent, so the number that actually changes hands is the one
     eye lands on. The panel's height is known before anything is drawn — the
     rows inside are fixed once the discount, VAT and balance are known — so
     the box can be painted first and the figures laid over it. */
  const tallyPad = 8;
  const tallyH =
    tallyPad + 16 + (disc ? 16 : 0) + (vat ? 16 : 0) + 14 + 26 + 16 + (anyoneOwed ? 18 : 0) + tallyPad;

  doc.roundedRect(boxX, totalsTop, boxW, tallyH, 6).fillColor(wash2).fill();
  doc.roundedRect(boxX, totalsTop, boxW, tallyH, 6).strokeColor(panelEdge).lineWidth(0.8).stroke();

  const inner = boxX + 12;
  let ty = totalsTop + tallyPad;
  const tally = (label: string, value: string, { red }: { red?: boolean } = {}) => {
    doc
      .font(red ? fonts.bold : fonts.regular)
      .fontSize(10)
      .fillColor(red ? RED : BODY)
      .text(label, inner, ty, { width: boxW * 0.5 });
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(red ? RED : INK)
      .text(value, inner, ty, { width: boxW - 24, align: 'right' });
    ty += red ? 18 : 16;
  };

  tally(w('Sub total'), money(data.subTotal));
  if (disc) tally(w('Discount'), `- ${money(data.discount)}`);
  if (vat) tally(w('VAT'), money(data.vat));

  ty += 4;
  doc
    .moveTo(inner, ty)
    .lineTo(boxX + boxW - 12, ty)
    .strokeColor(HAIR)
    .lineWidth(0.8)
    .stroke();
  ty += 8;

  const bandTop = ty - 2;
  doc
    .rect(boxX + 5, bandTop, boxW - 10, 24)
    .fillColor(accent)
    .fill();
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor('#ffffff')
    .text(w('Total'), inner, bandTop + 6, { width: boxW * 0.5 });
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor('#ffffff')
    .text(money(data.total), inner, bandTop + 6, { width: boxW - 24, align: 'right' });
  ty = bandTop + 30;

  tally(w('Paid'), money(data.paid));
  if (anyoneOwed) tally(w('Still owed'), money(owed), { red: true });

  /*
   * The amount in words sits beside the totals rather than under them.
   *
   * It is the line a bank and an accountant actually go by, and on the left it
   * fills the space a three-line delivery would otherwise leave blank.
   */
  doc
    .font(fonts.bold)
    .fontSize(7)
    .fillColor(MUTED)
    .text(w('AMOUNT IN WORDS'), left, totalsTop, {
      width: width - boxW - 24,
      characterSpacing: bn ? 0 : 0.9,
      lineBreak: false,
    });
  doc
    .font(fonts.regular)
    .fontSize(9.5)
    .fillColor(BODY)
    .text(
      bn ? `${bnAmountInWords(data.total)} ${w('Taka only')}` : `${inWords(data.total)} taka only`,
      left,
      totalsTop + 12,
      {
        width: width - boxW - 24,
      },
    );

  /* Under the words rather than at a fixed offset from them: on a half sheet
     the words wrap to three lines, and a fixed offset drew the note through
     them. */
  if (data.note) {
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text(t(data.note), left, doc.y + 6, { width: width - boxW - 24 });
  }

  /*
   * The content's real bottom — the totals panel's, or the words and the note's,
   * whichever runs deeper — is what the square-and-signature block's room is
   * measured from. Left at the panel's top, a tall panel is judged to leave
   * room and the block is then drawn straight over the figures.
   */
  y = Math.max(totalsTop + tallyH + 8, doc.y + 8);

  /* ------------------------------------------------- the square and a line -- */

  /*
   * The square and the signature go under the totals, not at the foot.
   *
   * A three-line delivery pinned to the bottom of an A4 leaves a hand's width
   * of nothing in the middle of the page, which reads as a document that failed
   * to finish printing. They follow the content, and if the content has left no
   * room they take a page of their own rather than sit on the footer.
   */
  /*
   * The square and the signature sit at the foot of the last page.
   *
   * With one condition: they go on the page the totals are on if there is room
   * for them there, and they shrink before they take a page of their own. A
   * third sheet holding nothing but a QR and a signature line is a third sheet
   * somebody pays for and then throws away.
   */
  let room = bottom - y - 12;
  const qrSize = narrow ? 64 : room >= 108 ? 84 : 56;
  const blockH = qrSize + 24;
  if (room < blockH) {
    doc.addPage();
    y = top;
    room = bottom - y - 12;
  }
  const blockY = bottom - blockH;

  if (look.showQr) {
    const qrPng = await QRCode.toBuffer(deliveryQrText(data), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
    });
    doc.image(qrPng, left, blockY, { width: qrSize });
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        w(narrow ? 'Scan for our details' : 'Scan for this delivery and our details'),
        left,
        blockY + qrSize + 4,
        { width: narrow ? 120 : 110, lineBreak: !narrow },
      );
  }

  if (look.signatureLabel) {
    const lineY = blockY + qrSize - 18;
    doc
      .moveTo(right - 180, lineY)
      .lineTo(right, lineY)
      .strokeColor(HAIR)
      .lineWidth(0.8)
      .stroke();
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(t(w(look.signatureLabel)), right - 180, lineY + 6, { width: 180, align: 'center' });
  }

  /* ------------------------------------------------------------ letterhead -- */

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);

    if (style !== 'dawai') {
      stampOwnLetterhead(i, pages.count);
      continue;
    }

    /* ---- the band ---- */
    doc.rect(0, 0, doc.page.width, bandH).fillColor(accent).fill();
    /* A hint of lift where the letterhead ends, so the colour block reads as a
       header rather than a rectangle the paper was dipped in. */
    doc
      .rect(0, bandH, doc.page.width, 1.5)
      .fillColor(mix(accent, '#000000', 0.18))
      .fill();

    let textX = left;
    if (data.shop.logo) {
      try {
        /* A square box, so a wide logo scales down to it and a tall one is
           capped by it — neither can push the shop's name off the band. */
        doc.image(data.shop.logo, left, 18, { fit: [54, 54], align: 'center', valign: 'center' });
        textX = left + 66;
      } catch {
        /* An unreadable image is not a reason to fail the document. */
      }
    }

    const nameW = right - textX - width * 0.28;
    fitLine(t(data.shop.name), textX, 20, nameW, fonts.bold, look.paper === 'A5' ? 16 : 20, 11, '#ffffff');
    if (data.shop.address) {
      fitLine(t(data.shop.address), textX, 48, nameW, fonts.regular, 9, 7, soft);
    }
    const idLine = t(
      [
        data.shop.phone && `${w('Mob')}: ${data.shop.phone}`,
        data.shop.drugLicenceNo && `${w('Drug Licence')}: ${data.shop.drugLicenceNo}`,
        data.shop.vatBin && `BIN: ${data.shop.vatBin}`,
      ]
        .filter(Boolean)
        .join('  ·  '),
    );
    if (idLine) fitLine(idLine, textX, 62, nameW, fonts.regular, 9, 7, soft);

    doc
      .font(fonts.bold)
      .fontSize(look.paper === 'A5' ? 16 : 20)
      .fillColor('#ffffff')
      .text(w('DELIVERY'), left, 24, { width, align: 'right', characterSpacing: bn ? 0 : 2.5 });
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(soft)
      .text(t(data.number), left, look.paper === 'A5' ? 46 : 52, { width, align: 'right' });

    /* ---- the foot ---- */
    const footY = footTextY;
    doc
      .moveTo(left, footY - 6)
      .lineTo(right, footY - 6)
      .strokeColor(accent)
      .lineWidth(1.5)
      .stroke();

    /* The shop's own small print, or — for a shop that has typed none — its
       name and address again, which is what a letterhead's foot is for. */
    const terms = t(look.terms).trim();
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(terms || t([data.shop.name, data.shop.address].filter(Boolean).join(' · ')), left, footY, {
        width: width - 90,
      });

    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`${w('Page')} ${i + 1} ${w('of')} ${pages.count}`, left, footY, { width, align: 'right' });
  }

  doc.flushPages();
  doc.end();
  return done;

  /**
   * The shop's own letterhead: its pictures, or its pad's blank space, with the
   * sheet's title under the header and the small print over the foot.
   */
  function stampOwnLetterhead(i: number, count: number) {
    const drawPicture = (img: Buffer, y: number, h: number) => {
      try {
        doc.image(img, 0, y, { width: pageW, height: h });
      } catch {
        /* An unreadable picture is not a reason to fail the document. */
      }
    };

    if (style === 'image') {
      if (data.shop.header && headH) drawPicture(data.shop.header, 0, headH);
      if (data.shop.footer && footReserve) drawPicture(data.shop.footer, pageH - footReserve, footReserve);
    } else if (data.preview && !data.align) {
      /* A pad's printed parts are never printed again; on screen they are shown
         where they will be, so the page can be judged against them. */
      const shade = (y: number, h: number, label: string, img?: Buffer | null) => {
        if (!h) return;
        if (img) {
          /* At the photo's own proportions, not stretched to the measurement:
             the point is to see whether the blank line falls where the
             printed part really ends. */
          const natural = pictureH(img, pageH * 0.4);
          doc.save();
          doc.opacity(0.55);
          drawPicture(img, y === 0 ? 0 : pageH - natural, natural);
          doc.restore();
        } else {
          doc.rect(0, y, pageW, h).fillColor('#eef0f2').fill();
          doc
            .font(fonts.regular)
            .fontSize(8)
            .fillColor(MUTED)
            .text(label, 0, y + h / 2 - 4, { width: pageW, align: 'center', lineBreak: false });
        }
      };
      shade(0, headH, w('Your pad’s printed header — left blank'), data.shop.header);
      shade(pageH - footReserve, footReserve, w('Your pad’s printed footer — left blank'), data.shop.footer);
    }

    if (data.align) {
      /* The printable area, outlined, with its measurements: printed on plain
         paper and held against a pad to the light. */
      doc
        .rect(left, headH, width, pageH - footReserve - headH)
        .dash(4, { space: 3 })
        .strokeColor(accent)
        .lineWidth(0.8)
        .stroke()
        .undash();
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor(accent)
        /* Outside the box, on the part the pad has printed, so they never sit on the sheet's own lines. */
        .text(`${w('Top')} ${look.padTopMm ?? 45} mm`, left, Math.max(4, headH - 12), { width, align: 'right', lineBreak: false })
        .text(`${w('Bottom')} ${look.padBottomMm ?? 20} mm`, left, Math.min(pageH - 12, pageH - footReserve + 4), {
          width,
          align: 'right',
          lineBreak: false,
        });
    }

    /* ---- what the sheet is ---- */
    doc
      .font(fonts.bold)
      .fontSize(look.paper === 'A5' ? 13 : 15)
      .fillColor(accent)
      .text(w('DELIVERY'), left, titleY, { characterSpacing: bn ? 0 : 2, lineBreak: false });
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text(t(data.number), left, titleY + 4, { width, align: 'right', lineBreak: false });
    doc
      .moveTo(left, titleY + 22)
      .lineTo(right, titleY + 22)
      .strokeColor(accent)
      .lineWidth(1)
      .stroke();

    /* ---- the foot: the shop's small print, and the page count ---- */
    doc
      .moveTo(left, footTextY - 5)
      .lineTo(right, footTextY - 5)
      .strokeColor(HAIR)
      .lineWidth(0.6)
      .stroke();
    const terms = t(look.terms).trim();
    if (terms) {
      doc.font(fonts.regular).fontSize(7.5).fillColor(MUTED).text(terms, left, footTextY, { width: width - 90, lineBreak: false, ellipsis: true });
    }
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`${w('Page')} ${i + 1} ${w('of')} ${count}`, left, footTextY, { width, align: 'right', lineBreak: false });
  }
}
