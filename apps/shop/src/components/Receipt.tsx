import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { taka, type Sale, type ShopSettings } from '../api';
import { bnNumerals } from '../i18n/ui';
import { bnAmountInWords } from './bnWords';
import { BRAND } from '../brand';

/**
 * The bill, as it comes off the roll.
 *
 * This is the only thing most customers keep from a pharmacy — it goes in a
 * pocket with the shop's name on it, and it is what somebody brings back when
 * a strip is wrong. So it is the shop's paper, not ours: their name, their
 * address, their drug licence number, and our line in small type at the foot
 * where it belongs.
 *
 * ## Width
 *
 * Thermal rolls here are 80mm or 58mm and no shop chooses which one it already
 * owns, so the width is a setting and anything unusual can be typed in
 * millimetres. It is not cosmetic: a bill laid out for 80mm printed on a 58mm
 * roll loses its right-hand column, which is the money. The whole sheet is
 * sized from one number — `--paper` — and the type steps down with it, because
 * 58mm cannot carry the same columns 80mm can.
 *
 * ## Printing
 *
 * A thermal printer is a normal printer to a browser, so this prints through
 * `window.print()` with an `@page` size that matches the roll. Nothing here
 * needs a driver, an app, or a bridge — which matters, because the machine at
 * the counter is somebody's old Windows box and the printer was bought from a
 * shop in Elephant Road.
 */

const dt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/** ৳1,234.50 → "One thousand two hundred thirty four taka fifty poisha". */
function inWords(n: number): string {
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const under100 = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`;

  const under1000 = (x: number): string =>
    x < 100
      ? under100(x)
      : `${ones[Math.floor(x / 100)]} hundred${x % 100 ? ' ' + under100(x % 100) : ''}`;

  /* Lakh and crore, because that is how an amount is read out here — a bill for
     "one hundred and twenty thousand" means nothing at a counter in Dhaka. */
  const whole = Math.floor(n);
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

/**
 * What the square on the paper says when somebody points a phone at it.
 *
 * Plain text, not a link: a link needs a server that is up, a page that still
 * exists in three years, and a shop that never changes its domain — and the
 * thing a customer actually wants off this slip is the shop's number and what
 * they paid. A phone's own camera shows this as it is written and offers to
 * call the number, with nothing installed and nothing loaded.
 *
 * Kept short on purpose. Every character makes the square denser, and a dense
 * square printed by a thermal head on cheap paper is one that does not scan.
 */
export function receiptQrText(shop: ReceiptShop, sale: Sale, when: string) {
  const reference = sale.billNo.replace('WAITING · ', '');
  /* A shop that has not filled its address in gets no blank line where one
     would have been — the square is read as plain text, and a gap in the middle
     of it looks like something failed to print. */
  const phone = (shop.phone || '').trim();
  const head = [(shop.shopName || '').trim() || 'Pharmacy', (shop.address || '').trim()]
    .filter(Boolean)
    .concat(phone ? [`Mob: ${phone}`] : []);

  return [
    ...head,
    '',
    `Bill: ${reference}`,
    when,
    `Total: Tk ${Math.round(sale.total * 100) / 100}`,
  ].join('\n');
}


/**
 * The square itself, drawn as rectangles rather than fetched as an image.
 *
 * `QRCode.create` is synchronous, which is the whole reason it is used here:
 * the sheet prints ~120ms after it mounts, and a QR that arrives from a promise
 * after that is a blank space on the paper. Drawn as one `<rect>` per dark
 * module with `shapeRendering="crispEdges"`, so a thermal head puts down whole
 * dots instead of grey edges.
 */
export function QrSquare({ text, mm }: { text: string; mm: number }) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(text, { errorCorrectionLevel: 'M' });
    } catch {
      /* Nothing on the paper is worth failing a sale for. */
      return null;
    }
  }, [text]);

  if (!qr) return null;

  const size = qr.modules.size;
  const data = qr.modules.data;
  /* Four modules of quiet zone, which is what the spec asks for and what a
     phone needs to find the square against the rest of the receipt. */
  const quiet = 4;
  const span = size + quiet * 2;

  const rects: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (data[row * size + col]) rects.push(`${col + quiet},${row + quiet}`);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={`${mm}mm`}
      height={`${mm}mm`}
      shapeRendering="crispEdges"
      /* Centred by margin rather than by `text-align`: the app's own reset
         makes an `svg` a block, so the alignment on the paragraph around it
         does nothing and the square sits against the left edge. */
      style={{ display: 'block', margin: '0 auto' }}
      role="img"
      aria-label="Shop details and this bill"
    >
      <rect x="0" y="0" width={span} height={span} fill="#fff" />
      {rects.map((at) => {
        const [x, y] = at.split(',');
        return <rect key={at} x={x} y={y} width="1" height="1" fill="#000" />;
      })}
    </svg>
  );
}

/*
 * The slip's own words, in the shop's choice of language — not the language of
 * whoever is at the till. A customer reads the paper; the setting is the
 * shop's ("Bangla on the receipt"), so every copy comes out the same.
 */
const WORDS = {
  en: {
    mob: 'Mob', licence: 'Drug Licence', follow: 'Bill number to follow — keep this slip',
    cancelled: '*** CANCELLED ***', reference: 'Reference', bill: 'Bill', date: 'Date', soldBy: 'Sold by',
    customer: 'Customer', discount: 'Discount', total: 'Total', given: 'Cash given', change: 'Change',
    baki: 'On account (baki)', words: 'In words', only: 'taka only', saved: 'You saved',
    scan: 'Scan for our address, phone and this bill', batch: 'B',
  },
  bn: {
    mob: 'মোবাইল', licence: 'ড্রাগ লাইসেন্স', follow: 'বিল নম্বর পরে দেওয়া হবে — স্লিপটা রাখুন',
    cancelled: '*** বাতিল ***', reference: 'রেফারেন্স', bill: 'বিল', date: 'তারিখ', soldBy: 'বিক্রেতা',
    customer: 'ক্রেতা', discount: 'ছাড়', total: 'মোট', given: 'দেওয়া টাকা', change: 'ফেরত',
    baki: 'বাকি', words: 'কথায়', only: 'টাকা মাত্র', saved: 'আপনার সাশ্রয়',
    scan: 'ঠিকানা, ফোন আর এই বিলের জন্য স্ক্যান করুন', batch: 'ব্যাচ',
  },
} as const;

const METHOD_BN: Record<string, string> = {
  cash: 'ক্যাশ', bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', card: 'কার্ড', bank: 'ব্যাংক',
};

export interface ReceiptShop extends Partial<ShopSettings> {
  shopName?: string;
}

export default function Receipt({
  sale,
  settings: shop,
  onDone,
  auto = true,
}: {
  sale: Sale;
  settings: ReceiptShop;
  onDone?: () => void;
  /** Open the print dialog as soon as it is on screen. */
  auto?: boolean;
}) {
  /* A branch's own address and phone, where it has them, in place of the shop's. */
  const b = sale.branchInfo;
  const settings: ReceiptShop = b
    ? { ...shop, address: b.address?.trim() || shop.address, phone: b.phone?.trim() || shop.phone }
    : shop;
  const width = settings.paperWidthMm || (settings.paperSize === '58' ? 58 : 80);
  const narrow = width < 70;
  const bn = !!settings.printBangla;
  const w = WORDS[bn ? 'bn' : 'en'];
  /* Figures in the slip's language; bill and batch numbers stay as printed. */
  const say = (v: string) => (bn ? bnNumerals(v) : v);
  const tk = (v: number) => say(taka(v));

  useEffect(() => {
    if (!auto) return;
    /* One frame, so the browser has laid the sheet out before it measures it
       for the printer. Without it a long bill prints its first page blank. */
    const t = setTimeout(() => {
      window.print();
      onDone?.();
    }, 120);
    return () => clearTimeout(t);
  }, [auto, onDone]);

  const paid = sale.payments?.filter((p) => p.method !== 'due') ?? [];
  const savings = sale.discount || 0;
  /* The same date string the paper shows, so the two cannot drift apart. */
  const soldAt = dt(sale.soldAt);
  /* The square stays in plain English: every phone reads it. */
  const qrText = receiptQrText(settings, sale, soldAt);

  const sheet = (
    <div
      className="receipt-sheet"
      data-printing={auto ? '1' : undefined}
      style={{ ['--paper' as string]: `${width}mm` }}
    >
      <style>{`
        @page { size: ${width}mm auto; margin: 0; }
        @media print {
          /*
           * Everything except the paper.
           *
           * This only works because the sheet is portalled to <body>: rendered
           * inside the React root it is a grandchild, and this rule hides the
           * root along with the receipt inside it — which prints a blank page
           * and looks exactly like a broken printer.
           */
          body > *:not(.receipt-sheet) { display: none !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          /* Static, not absolute: a roll is of unknown length, and a sheet
             pinned to the top-left of one page loses everything below it. */
          .receipt-sheet {
            position: static !important;
            /* The roll's width, kept even if the driver ignores @page and hands
               back an A4 box — a receipt stretched across A4 is unreadable. */
            width: var(--paper) !important;
            max-width: 100% !important;
            margin: 0 !important;
            transform: none !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
          }
        }
        .receipt-sheet {
          width: var(--paper);
          padding: 4mm 3mm 6mm;
          margin: 0 auto;
          background: #fff;
          color: #000;
          font-family: ui-monospace, 'Courier New', monospace;
          font-size: ${narrow ? '10px' : '11.5px'};
          line-height: 1.45;
        }
        /*
         * On screen, while the print dialog is open, the paper is shown as a
         * sheet in the middle rather than dropped at the foot of the page —
         * the counter can see what is about to come out, and the app does not
         * jump. Print media ignores all of this.
         */
        @media screen {
          .receipt-sheet[data-printing='1'] {
            position: fixed;
            z-index: 9999;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            max-height: 90vh;
            overflow: auto;
            box-shadow: 0 10px 40px rgb(0 0 0 / .35);
          }
        }
        .receipt-sheet .center { text-align: center; }
        .receipt-sheet .right { text-align: right; }
        .receipt-sheet .bold { font-weight: 700; }
        .receipt-sheet .name {
          font-size: ${narrow ? '14px' : '16px'};
          font-weight: 700;
          letter-spacing: .02em;
        }
        .receipt-sheet .rule { border-top: 1px dashed #000; margin: 2mm 0; }
        .receipt-sheet table { width: 100%; border-collapse: collapse; }
        .receipt-sheet td { vertical-align: top; padding: .4mm 0; }
        .receipt-sheet .muted { opacity: .75; }
        .receipt-sheet .total { font-size: ${narrow ? '13px' : '15px'}; font-weight: 700; }
      `}</style>

      {/* ---- the shop's own head ---- */}
      <div className="center">
        <div className="name">{settings.shopName || 'Pharmacy'}</div>
        {settings.shopNameBn && <div className="bold">{settings.shopNameBn}</div>}
        {b?.name && <div className="bold">{b.name}</div>}
        {settings.address && <div className="muted">{settings.address}</div>}
        {settings.phone && (
          <div className="muted">
            {w.mob}: {settings.phone}
          </div>
        )}
        {settings.drugLicenceNo && (
          <div className="muted">
            {w.licence}: {settings.drugLicenceNo}
          </div>
        )}
        {/* The BIN only where the shop is registered — most pharmacies are not,
            because medicine is exempt. */}
        {settings.vatBin && <div className="muted">BIN: {settings.vatBin}</div>}
      </div>

      <div className="rule" />

      {/* A bill rung up while the line was down has no number yet — only the
          shop can issue one. The paper says so rather than inventing one. */}
      {sale.billNo.startsWith('WAITING') && (
        <div className="center bold">{w.follow}</div>
      )}

      {/* A reprint of a cancelled bill has to say so on its face, or it is a
          receipt for a sale that did not happen. */}
      {sale.status === 'void' && <div className="center bold">{w.cancelled}</div>}

      <table>
        <tbody>
          <tr>
            <td>{sale.billNo.startsWith('WAITING') ? w.reference : w.bill}</td>
            <td className="right bold">{sale.billNo.replace('WAITING · ', '')}</td>
          </tr>
          <tr>
            <td>{w.date}</td>
            <td className="right">{say(soldAt)}</td>
          </tr>
          <tr>
            <td>{w.soldBy}</td>
            <td className="right">{sale.salesmanName}</td>
          </tr>
          {sale.customerName && (
            <tr>
              <td>{w.customer}</td>
              <td className="right">
                {sale.customerName}
                {sale.customerPhone ? ` · ${sale.customerPhone}` : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="rule" />

      {/* ---- what they bought ---- */}
      <table>
        <tbody>
          {sale.lines.map((l, i) => (
            <tr key={`${l.name}-${i}`}>
              <td colSpan={2}>
                <div className="bold">{l.name}</div>
                <table>
                  <tbody>
                    <tr>
                      <td className="muted">
                        {say(String(l.qtyPieces))} × {tk(l.pricePerPiece)}
                        {l.batchNo ? ` · ${w.batch}:${l.batchNo}` : ''}
                      </td>
                      <td className="right">{tk(l.lineTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rule" />

      <table>
        <tbody>
          {sale.discount > 0 && (
            <tr>
              <td>{w.discount}</td>
              <td className="right">− {tk(sale.discount)}</td>
            </tr>
          )}
          {/* Only where the shop charges it, which in this country means a shop
              selling more than medicine. */}
          {(sale.vat ?? 0) > 0 && (
            <tr>
              <td>
                {bn ? 'ভ্যাট' : 'VAT'}
                {sale.vatPercent ? ` ${say(String(sale.vatPercent))}%` : ''}
              </td>
              <td className="right">{tk(sale.vat ?? 0)}</td>
            </tr>
          )}
          <tr>
            <td className="total">{w.total}</td>
            <td className="right total">{tk(sale.total)}</td>
          </tr>
          {paid.map((p, i) => (
            <tr key={`${p.method}-${i}`}>
              <td className="muted">{bn ? (METHOD_BN[p.method] ?? p.method) : p.method}</td>
              <td className="right muted">{tk(p.amount)}</td>
            </tr>
          ))}
          {/*
            The note and the change.

            On the paper because it is the half of the transaction a customer
            checks in the doorway — ৳1000 given, ৳430 back — and a receipt that
            shows only what the shop kept is a receipt they cannot check.
          */}
          {(sale.changeGiven ?? 0) > 0 && (
            <>
              <tr>
                <td className="muted">{w.given}</td>
                <td className="right muted">{tk(sale.cashTendered ?? 0)}</td>
              </tr>
              <tr>
                <td className="bold">{w.change}</td>
                <td className="right bold">{tk(sale.changeGiven ?? 0)}</td>
              </tr>
            </>
          )}
          {sale.due > 0 && (
            <tr>
              <td className="bold">{w.baki}</td>
              <td className="right bold">{tk(sale.due)}</td>
            </tr>
          )}
          {/* Loyalty points: what this bill earned and spent, and where they stand. */}
          {(sale.loyalty?.earned || sale.loyalty?.redeemed) && (
            <tr>
              <td className="muted">{bn ? 'পয়েন্ট' : 'Points'}</td>
              <td className="right muted">
                {sale.loyalty?.redeemed ? `−${say(String(sale.loyalty.redeemed))} ` : ''}
                {sale.loyalty?.earned ? `+${say(String(sale.loyalty.earned))}` : ''}
                {sale.pointsBalance !== undefined ? ` = ${say(String(sale.pointsBalance))}` : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* In words, the way an amount is said out loud here. */}
      <div className="muted" style={{ marginTop: '1.5mm' }}>
        {w.words}: {bn ? bnAmountInWords(sale.total) : inWords(sale.total)} {w.only}
      </div>

      {settings.showSavings && savings > 0 && (
        <div className="center bold" style={{ marginTop: '1.5mm' }}>
          {w.saved} {tk(savings)}
        </div>
      )}

      <div className="rule" />

      {/*
        The square, above the shop's own words.

        Low on the slip because it is the part somebody uses after they have
        left — the shop's number when a strip turns out to be wrong, and what
        they paid when they cannot read the thermal print six months later. It
        carries the address whether or not the head above it did.
      */}
      <div className="center" style={{ margin: '1.5mm 0' }}>
        {/* 26mm on an 80mm roll and 22mm on a 58mm one: with the quiet zone
            inside it that leaves about half a millimetre per module, which is
            four dots on the 203dpi head these shops own and the point at which
            a phone stops struggling. */}
        <QrSquare text={qrText} mm={narrow ? 22 : 26} />
        <div className="muted" style={{ fontSize: narrow ? '8px' : '9px' }}>
          {w.scan}
        </div>
      </div>

      <div className="rule" />

      <div className="center muted">
        {settings.footer && <div>{settings.footer}</div>}
        {settings.footerBn && <div>{settings.footerBn}</div>}
        <div style={{ marginTop: '2mm', opacity: 0.6 }}>{BRAND.name}</div>
      </div>
    </div>
  );

  /*
   * Straight onto <body> when it is going to the printer, and left where it
   * was written when it is only a preview.
   *
   * The print rule above hides every child of <body> that is not the paper. A
   * receipt rendered inside the app's root is hidden along with the root, and
   * the printer spits out a blank page — which is indistinguishable, at a
   * counter, from a printer that is not working. The settings preview is the
   * other case: it belongs inside its box on the page, and never prints.
   */
  return auto ? createPortal(sheet, document.body) : sheet;
}
