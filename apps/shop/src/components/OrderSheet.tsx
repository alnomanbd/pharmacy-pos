import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import {
  shopApi,
  settingsApi,
  packOfPlain as packOf,
  type ShopOrder,
  type ShopSettings,
  type Supplier,
  type OrderedProduct,
} from '../api';
import { bnNumerals } from '../i18n/ui';

/**
 * The order, on A4, as it is handed to the rep.
 *
 * It used to be the dialog printed as it stood — the app's own page behind it,
 * buttons and all. A rep keeps this sheet and a depot files it, so it is the
 * shop's letterhead and a purchase order in the ordinary shape: who is asking,
 * who is being asked, what, how much, and who signed for it.
 *
 * Quantities read the way the rep writes them — "10 strip", "2 box" — with the
 * piece count beside for anyone checking against the shelf. There are no
 * prices, for the reason there are none on the screen: the rate is the
 * company's to state on its invoice.
 *
 * Printed the way the receipt is: portalled to `<body>`, so a print rule can
 * hide everything that is not the sheet, and `@page` set to A4.
 */

const day = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const stamp = (d: Date) =>
  d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/* The shop's mark in the letterhead, from its name — there is no logo to use,
   and two letters in the shop's colour read as a letterhead where a bare name
   reads as a form. */
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'Rx';

/* The printed page, in millimetres — the CSS and the measuring both read these. */
const PAGE_MM = 297;
const MARGIN_TOP = 10;
const MARGIN_BOTTOM = 12;
const HEAD = 34;
const FOOT = 12;
/* What is left for the order itself on each page, between the spacers. */
const BODY_MM = PAGE_MM - MARGIN_TOP - MARGIN_BOTTOM - (HEAD + 4) - (FOOT + 4);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS: Record<string, string> = {
  open: 'Draft',
  sent: 'Placed',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** A stable reference for the paper — the order's own id, shortened. */
/*
 * The sheet's words, in the shop's paper language — the same "Bangla on the
 * receipt" switch, so everything the shop hands over reads alike.
 */
const OS_WORDS = {
  en: {
    title: 'Purchase Order', printed: 'Printed', cancelled: 'CANCELLED', orderTo: 'Order to', attn: 'Attn',
    phone: 'Phone', rep: 'Representative', visits: 'Visits on', order: 'Order', written: 'Written',
    placed: 'Placed', received: 'Received', status: 'Status', item: 'Item', qty: 'Quantity', pieces: 'Pieces',
    remarks: 'Remarks', one: 'item', many: 'items', instructions: 'Instructions',
    t1: 'Rates, discount and bonus as per your invoice — no prices are stated on this order.',
    t2: 'Please write the batch number and expiry date of every item on the invoice.',
    t3: 'Please quote order no', t3b: 'on the invoice.', orderedBy: 'Ordered by',
    receivedBy: 'Received by — representative, with date',
    days: DAYS,
    statusOf: STATUS,
  },
  bn: {
    title: 'ক্রয় আদেশ', printed: 'ছাপা', cancelled: 'বাতিল', orderTo: 'যাকে অর্ডার', attn: 'দৃষ্টি আকর্ষণ',
    phone: 'ফোন', rep: 'প্রতিনিধি', visits: 'আসেন', order: 'অর্ডার', written: 'লেখা হয়েছে',
    placed: 'দেওয়া হয়েছে', received: 'এসেছে', status: 'অবস্থা', item: 'পণ্য', qty: 'পরিমাণ', pieces: 'পিস',
    remarks: 'মন্তব্য', one: 'টি পণ্য', many: 'টি পণ্য', instructions: 'নির্দেশনা',
    t1: 'দাম, ছাড় আর বোনাস আপনার চালান অনুযায়ী — এই অর্ডারে কোনো দাম লেখা নেই।',
    t2: 'চালানে প্রতিটি পণ্যের ব্যাচ নম্বর আর মেয়াদ লিখে দিন।',
    t3: 'চালানে অর্ডার নং', t3b: 'লিখে দিন।', orderedBy: 'অর্ডার দিয়েছেন',
    receivedBy: 'বুঝে নিয়েছেন — প্রতিনিধি, তারিখসহ',
    days: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
    statusOf: { open: 'খসড়া', sent: 'দেওয়া হয়েছে', received: 'এসেছে', cancelled: 'বাতিল' } as Record<string, string>,
  },
};

export const orderNo = (o: { _id: string; createdAt: string }) =>
  `PO-${o.createdAt.slice(2, 4)}${o.createdAt.slice(5, 7)}-${o._id.slice(-5).toUpperCase()}`;

export default function OrderSheet({
  orderId,
  supplier,
  onDone,
}: {
  orderId: string;
  /** The company's details from the list already on screen. */
  supplier?: Supplier;
  onDone: () => void;
}) {
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const bodyRef = useRef<HTMLTableCellElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  /* Where the signatures go: how much space above them, and whether they
     start a page of their own. Null until the sheet has been measured. */
  const [sign, setSign] = useState<{ space: number; newPage: boolean } | null>(null);
  const bn = !!shop?.printBangla;
  const w = OS_WORDS[bn ? 'bn' : 'en'];
  /* Figures and dates in the paper's language; the order number stays as printed. */
  const say = (v: string | number) => (bn ? bnNumerals(String(v)) : String(v));

  useEffect(() => {
    Promise.all([
      shopApi.order(orderId),
      /* A shop with no header set up still prints — its name falls back. */
      settingsApi.get().catch(() => null),
    ])
      .then(([o, s]) => {
        setOrder(o);
        setShop(s);
      })
      .catch(() => setFailed(true));
  }, [orderId]);

  useEffect(() => {
    if (failed) onDone();
  }, [failed, onDone]);

  /*
   * The signatures at the foot of the last page, not wherever the list ends.
   *
   * CSS cannot say "the bottom of the last page", so the sheet is measured
   * once on screen — laid out at exactly the printed width — and the page
   * breaks are worked out the way the browser will make them: whole rows
   * only, the column headings repeated on each new page. What is left of the
   * last page goes above the signatures. When they do not fit, they start a
   * page of their own and sit at its foot.
   */
  useLayoutEffect(() => {
    if (!order || !bodyRef.current || !signRef.current) return;
    const mm = 96 / 25.4;
    const page = BODY_MM * mm;
    const atoms = Array.from(bodyRef.current.querySelectorAll<HTMLElement>('[data-atom]'));
    const rects = atoms.map((a) => a.getBoundingClientRect());
    const head = atoms.findIndex((a) => a.dataset.atom === 'head');
    const headH = head >= 0 ? rects[head + 1].top - rects[head].top : 0;

    let used = 0;
    atoms.forEach((a, i) => {
      /* Each block's share of the page runs to where the next one starts, so
         the gaps between them are counted too. */
      const h = i + 1 < atoms.length ? rects[i + 1].top - rects[i].top : rects[i].height;
      if (used > 0 && used + h > page) {
        used = a.dataset.atom === 'row' ? headH : 0;
      }
      used += h;
    });

    const signH = signRef.current.getBoundingClientRect().height;
    const safety = 5 * mm;
    const gap = 10 * mm;
    const fits = used + gap + signH + safety <= page;
    setSign(
      fits
        ? { space: (page - used - signH - safety) / mm, newPage: false }
        : { space: (page - signH - safety) / mm, newPage: true },
    );
  }, [order, shop]);

  useEffect(() => {
    if (!order || !sign) return;
    /* Taken down when the dialog closes, not when `print()` returns — some
       browsers return at once and would print the page behind an empty sheet. */
    const after = () => onDone();
    window.addEventListener('afterprint', after);
    /* One frame for the browser to lay the sheet out before it measures it. */
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [order, sign, onDone]);

  if (!order) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/30">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>,
      document.body,
    );
  }

  const arrived = order.status === 'received' && !!order.purchase;
  const item = (p: ShopOrder['lines'][number]['product']): OrderedProduct | null =>
    typeof p === 'string' ? null : p;
  const totalPieces = order.lines.reduce((n, l) => n + l.qtyPieces, 0);
  const shopName = shop?.shopName || 'Pharmacy';
  const no = orderNo(order);
  const contact = [
    shop?.address,
    shop?.phone && `Phone ${shop.phone}`,
    shop?.drugLicenceNo && `DL ${shop.drugLicenceNo}`,
  ].filter(Boolean);

  /*
   * Header and footer on every page, the lines between them.
   *
   * The browser repeats a `position: fixed` element on each printed page, so
   * the letterhead and the foot are fixed — and the body sits in a table whose
   * empty header and footer rows are exactly their height, which the browser
   * also repeats on each page. That is what keeps line 31 from printing
   * underneath the letterhead on page two. On screen none of this applies and
   * the sheet reads top to bottom.
   */

  const sheet = (
    <div className="order-sheet">
      <style>{`
        @page {
          size: A4;
          margin: ${MARGIN_TOP}mm 14mm ${MARGIN_BOTTOM}mm;
          @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font: 7.5pt 'Segoe UI', Arial, sans-serif;
            color: #888;
          }
        }
        @media print {
          body > *:not(.order-sheet) { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .order-sheet {
            position: static !important;
            transform: none !important;
            width: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .os-header { position: fixed; top: 0; left: 0; right: 0; height: ${HEAD}mm; }
          .os-footer { position: fixed; bottom: 0; left: 0; right: 0; height: ${FOOT}mm; }
          .os-space-top { height: ${HEAD + 4}mm; }
          .os-space-bottom { height: ${FOOT + 4}mm; }
        }
        @media screen {
          .order-sheet {
            position: fixed;
            z-index: 9999;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            /* Exactly the printed width, so what is measured here is what
               the printer lays out. */
            width: 210mm;
            max-width: 96vw;
            max-height: 92vh;
            overflow: auto;
            padding: 10mm 14mm;
            box-shadow: 0 10px 40px rgb(0 0 0 / .35);
            display: flex;
            flex-direction: column;
          }
          .os-header { order: 1; margin-bottom: 6mm; }
          .os-page { order: 2; }
          .os-footer { order: 3; margin-top: 8mm; }
          .os-space-top, .os-space-bottom { display: none; }
        }
        .order-sheet {
          --brand: #127a6c;
          --brand-soft: #e7f3f1;
          background: #fff;
          color: #1a1a1a;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          font-size: 10pt;
          line-height: 1.42;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .order-sheet * { box-sizing: border-box; }

        /* ---- the letterhead ---- */
        .os-header { background: #fff; }
        .os-band { height: 2.2mm; background: var(--brand); border-radius: 0 0 1mm 1mm; }
        .os-lh {
          display: flex; align-items: center; gap: 4.5mm;
          padding: 4.5mm 0 3.5mm; border-bottom: 1px solid #d9d9d9;
        }
        .os-mark {
          width: 15mm; height: 15mm; flex: none; border-radius: 3mm;
          background: var(--brand); color: #fff;
          display: grid; place-items: center;
          font-size: 15pt; font-weight: 700; letter-spacing: .02em;
        }
        .os-who { flex: 1; min-width: 0; }
        .os-shop { font-size: 16pt; font-weight: 700; letter-spacing: -.01em; line-height: 1.1; color: #111; }
        .os-shop-bn { font-size: 10pt; font-weight: 600; color: #333; margin-top: .6mm; }
        .os-contact { font-size: 8.3pt; color: #555; margin-top: 1.2mm; }
        .os-contact span + span::before { content: '·'; margin: 0 1.8mm; color: #aaa; }
        .os-doc { text-align: right; flex: none; }
        .os-doc-title {
          font-size: 12.5pt; font-weight: 700; letter-spacing: .16em; color: var(--brand);
          text-transform: uppercase;
        }
        .os-doc-no {
          margin-top: 1mm; font-family: ui-monospace, Consolas, monospace;
          font-size: 10.5pt; font-weight: 700; color: #111;
        }
        .os-doc-date { font-size: 8.5pt; color: #555; }

        /* ---- the foot ---- */
        .os-footer {
          background: #fff; border-top: 1px solid #d9d9d9; padding-top: 2.5mm;
          display: flex; justify-content: space-between; gap: 6mm;
          font-size: 7.8pt; color: #777;
        }
        .os-footer b { color: #333; font-weight: 600; }
        .os-footer span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* ---- the body ---- */
        .os-page { width: 100%; border-collapse: collapse; }
        .os-page > tbody > tr > td, .os-page > thead > tr > td, .os-page > tfoot > tr > td { padding: 0; }
        .os-parties { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 4mm; margin-bottom: 6mm; }
        .os-box { border: 1px solid #dcdcdc; border-radius: 2mm; padding: 3mm 3.5mm; break-inside: avoid; }
        .os-box.brand { border-color: var(--brand); background: var(--brand-soft); }
        .os-label {
          font-size: 7pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
          color: var(--brand); margin-bottom: 1.2mm;
        }
        .os-strong { font-weight: 700; font-size: 10.5pt; color: #111; }
        .os-small { font-size: 8.5pt; color: #555; }
        .os-kv { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
        .os-kv td { padding: .35mm 0; }
        .os-kv td:first-child { color: #666; }
        .os-kv td:last-child { text-align: right; font-weight: 600; }

        .os-items { width: 100%; border-collapse: collapse; }
        .os-items thead th {
          background: var(--brand); color: #fff;
          font-size: 7.6pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
          text-align: left; padding: 2.2mm 2.5mm;
        }
        .os-items thead th:first-child { border-radius: 1.2mm 0 0 1.2mm; }
        .os-items thead th:last-child { border-radius: 0 1.2mm 1.2mm 0; }
        .os-items td { border-bottom: 1px solid #e6e6e6; padding: 1.6mm 2.5mm; vertical-align: top; }
        .os-items td .os-small { font-size: 7.8pt; line-height: 1.3; }
        .os-items tr.total td {
          border-top: 1.5px solid #111; border-bottom: 0; font-weight: 700; padding-top: 2.4mm;
          background: none !important;
        }
        .os-items tbody tr:nth-child(even) td { background: #fafafa; }
        .os-items tr { break-inside: avoid; page-break-inside: avoid; }
        .os-items .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .os-items .idx { width: 8mm; color: #888; }
        .os-items .short { color: #b00020; font-weight: 700; }
        .os-items tfoot td {
          border-top: 1.5px solid #111; border-bottom: 0; font-weight: 700; padding-top: 2.6mm;
          background: none !important;
        }

        .os-note {
          margin-top: 5mm; border-left: 3px solid var(--brand); background: var(--brand-soft);
          padding: 3mm 4mm; white-space: pre-wrap; break-inside: avoid;
        }
        .os-terms { margin: 5mm 0 0; padding-left: 4.5mm; font-size: 8.3pt; color: #555; break-inside: avoid; }
        .os-terms li { margin: .5mm 0; }
        .os-sign {
          display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; break-inside: avoid;
        }
        .os-sign .who { font-weight: 600; min-height: 5mm; margin-bottom: 1mm; }
        .os-sign .line { border-top: 1px solid #111; padding-top: 1.5mm; font-size: 8.5pt; color: #444; }
        .os-cancel {
          margin-bottom: 4mm; padding: 2.5mm 4mm; border: 1.5px solid #b00020; color: #b00020;
          font-weight: 700; text-align: center; letter-spacing: .06em; border-radius: 1.5mm;
        }
      `}</style>

      {/* ---- the letterhead: on every page ---- */}
      <header className="os-header">
        <div className="os-band" />
        <div className="os-lh">
          <div className="os-mark">{initials(shopName)}</div>
          <div className="os-who">
            <div className="os-shop">{shopName}</div>
            {shop?.shopNameBn && <div className="os-shop-bn">{shop.shopNameBn}</div>}
            {contact.length > 0 && (
              <div className="os-contact">
                {contact.map((c) => (
                  <span key={c as string}>{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="os-doc">
            <div className="os-doc-title">{w.title}</div>
            <div className="os-doc-no">{no}</div>
            <div className="os-doc-date">{say(day(order.createdAt))}</div>
          </div>
        </div>
      </header>

      {/* ---- the foot: on every page ---- */}
      <footer className="os-footer">
        <span>
          <b>{shopName}</b>
          {shop?.phone ? ` · ${shop.phone}` : ''}
        </span>
        <span>{no}</span>
        <span>
          {w.printed} {say(stamp(new Date()))}
        </span>
      </footer>

      <table className="os-page">
        <thead>
          <tr>
            <td>
              <div className="os-space-top" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="os-space-bottom" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td ref={bodyRef}>
              {order.status === 'cancelled' && (
                <div className="os-cancel" data-atom="block">
                  {w.cancelled}
                  {order.closeReason ? ` — ${order.closeReason}` : ''}
                </div>
              )}

              {/* ---- who is asking whom ---- */}
              <div className="os-parties" data-atom="block">
                <div className="os-box brand">
                  <div className="os-label">{w.orderTo}</div>
                  <div className="os-strong">{order.supplierName}</div>
                  <div className="os-small">
                    {supplier?.contactPerson && (
                      <div>
                        {w.attn}: {supplier.contactPerson}
                      </div>
                    )}
                    {supplier?.phone && (
                      <div>
                        {w.phone}: {supplier.phone}
                      </div>
                    )}
                    {supplier?.address && <div>{supplier.address}</div>}
                  </div>
                </div>
                <div className="os-box">
                  <div className="os-label">{w.rep}</div>
                  <div className="os-strong">{supplier?.repName || '—'}</div>
                  <div className="os-small">
                    {supplier?.repPhone && (
                      <div>
                        {w.phone}: {supplier.repPhone}
                      </div>
                    )}
                    {typeof supplier?.repVisitDay === 'number' && (
                      <div>
                        {w.visits} {w.days[supplier.repVisitDay]}
                      </div>
                    )}
                  </div>
                </div>
                <div className="os-box">
                  <div className="os-label">{w.order}</div>
                  <table className="os-kv">
                    <tbody>
                      <tr>
                        <td>{w.written}</td>
                        <td>{say(day(order.createdAt))}</td>
                      </tr>
                      {order.sentAt && (
                        <tr>
                          <td>{w.placed}</td>
                          <td>{say(day(order.sentAt))}</td>
                        </tr>
                      )}
                      {order.receivedAt && (
                        <tr>
                          <td>{w.received}</td>
                          <td>{say(day(order.receivedAt))}</td>
                        </tr>
                      )}
                      <tr>
                        <td>{w.status}</td>
                        <td>{w.statusOf[order.status] ?? order.status}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ---- what ---- */}
              <table className="os-items">
                <thead>
                  <tr data-atom="head">
                    <th className="idx">#</th>
                    <th>{w.item}</th>
                    <th className="num">{w.qty}</th>
                    <th className="num">{w.pieces}</th>
                    {arrived && <th className="num">{w.received}</th>}
                    <th>{w.remarks}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l, i) => {
                    const p = item(l.product);
                    const got = l.qtyReceived ?? 0;
                    return (
                      <tr key={l._id} data-atom="row">
                        <td className="idx">{say(i + 1)}</td>
                        <td>
                          <strong>{p?.name ?? l.name}</strong>
                          {p?.strength ? ` ${p.strength}` : ''}
                          {(p?.genericName || p?.companyName) && (
                            <div className="os-small">
                              {[p?.genericName, p?.companyName].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="num">{say(p ? packOf(l.qtyPieces, p) : l.qtyPieces)}</td>
                        <td className="num">{say(l.qtyPieces)}</td>
                        {arrived && (
                          <td className={`num ${got < l.qtyPieces ? 'short' : ''}`}>
                            {say(got)}
                            {got < l.qtyPieces ? ` (−${say(l.qtyPieces - got)})` : ''}
                          </td>
                        )}
                        <td className="os-small">{l.note || ''}</td>
                      </tr>
                    );
                  })}
                  {/* A row, not a table footer: a footer repeats on every
                      printed page, and a total belongs once, at the end. */}
                  <tr className="total" data-atom="row">
                    <td />
                    <td>
                      {say(order.lines.length)} {order.lines.length === 1 ? w.one : w.many}
                    </td>
                    <td />
                    <td className="num">{say(totalPieces)}</td>
                    {arrived && (
                      <td className="num">
                        {say(order.lines.reduce((n, l) => n + (l.qtyReceived ?? 0), 0))}
                      </td>
                    )}
                    <td />
                  </tr>
                </tbody>
              </table>

              {order.note && (
                <div className="os-note" data-atom="block">
                  <div className="os-label">{w.instructions}</div>
                  {order.note}
                </div>
              )}

              <ul className="os-terms" data-atom="block">
                <li>{w.t1}</li>
                <li>{w.t2}</li>
                <li>
                  {w.t3} {no} {w.t3b}
                </li>
              </ul>

              {/* ---- who signed for it: at the foot of the last page ---- */}
              <div style={{ breakBefore: sign?.newPage ? 'page' : 'auto' }}>
                <div style={{ height: `${sign ? sign.space : 10}mm` }} />
              <div className="os-sign" ref={signRef}>
                <div>
                  <div className="who">{order.createdByName || ''}</div>
                  <div className="line">
                    {w.orderedBy} — {shopName}
                  </div>
                </div>
                <div>
                  <div className="who" />
                  <div className="line">{w.receivedBy}</div>
                </div>
              </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return createPortal(sheet, document.body);
}
