import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Loader2,
  Trash2,
  Gift,
  Search,
  CalendarDays,
  Banknote,
  Clock,
  Building2,
} from 'lucide-react';
import {
  shopApi,
  taka,
  type Purchase,
  type ShopProduct,
  type ShopOrder,
  type Supplier,
  lineProductId,
} from '../api';
import { useSearchParams } from 'react-router-dom';
import { useLinkedSearch } from '../components/useLinkedSearch';
import { useToast } from '@dawai/shared/components/Toast';
import DeliveryDetail from '../components/DeliveryDetail';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { todayLocal } from '@dawai/shared/lib/date';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import Pager from '../components/Pager';
import Modal from '../components/Modal';
import { expiryMonth, monthPassed } from '../pos/expiry';
import { useAlertStore } from '../alerts/useStockAlerts';

/**
 * Deliveries in.
 *
 * The form is the shape of the invoice on the counter, not the shape of the
 * database: a company, its invoice number, and then a line per item in boxes
 * and strips with the bonus beside it. Everything else — pieces, cost per
 * piece, the batch on the shelf, what the company is now owed — falls out of
 * that on the server.
 *
 * Bonus is a field rather than a note because it is money: "10 + 1" means
 * eleven strips arrived and ten were paid for, and a shop that cannot record
 * that is a shop whose margin report is wrong on most of its lines.
 */

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const supplierName = (p: Purchase) =>
  typeof p.supplier === 'string' ? '—' : p.supplier?.name || '—';

/** Deliveries per page. The server pages them; this is what one page asks for. */
const PAGE_SIZE = 20;

type PaidFilter = 'all' | 'due' | 'paid';

export default function Purchases() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [total, setTotal] = useState(0);
  const [month, setMonth] = useState({ deliveries: 0, total: 0, paid: 0 });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /* The delivery somebody has clicked on, fetched whole — the list carries
     enough to scan and not enough to check against the invoice. */
  const [open, setOpen] = useState<Purchase | null>(null);
  const [opening, setOpening] = useState(false);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  /* The top bar's search links here with an invoice number. */
  useLinkedSearch(setQ);
  /* What the server is asked for — the box, a moment after the typing stops. */
  const [query, setQuery] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [paid, setPaid] = useState<PaidFilter>('all');
  /*
   * Arriving from an order: "It has arrived" on the Orders page lands here
   * with the order in the URL, and the delivery opens already typed in from
   * it. The person fills in what only the invoice knows — batch, expiry, rate
   * — and corrects the quantities to what actually came.
   */
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const [fromOrder, setFromOrder] = useState<ShopOrder | null>(null);

  const n = useCallback(
    (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)),
    [lang],
  );
  const money = useCallback((v: number) => n(taka(v)), [n]);

  useEffect(() => {
    if (!orderId) return;
    shopApi
      .order(orderId)
      .then((o) => {
        setFromOrder(o);
        setAdding(true);
      })
      .catch(() => toast('Could not open that order.', 'error'));
  }, [orderId, toast]);

  const closeDelivery = () => {
    setAdding(false);
    setFromOrder(null);
    if (orderId) {
      const next = new URLSearchParams(params);
      next.delete('order');
      setParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const res = await shopApi.purchases({
        page,
        limit: PAGE_SIZE,
        q: query || undefined,
        supplierId: supplierId || undefined,
        paid: paid === 'all' ? undefined : paid,
      });
      setRows(res.data);
      setTotal(res.total);
      if (res.thisMonth) setMonth(res.thisMonth);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load the deliveries.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, query, supplierId, paid, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The companies, once: for the filter, and for what the shop owes them. */
  useEffect(() => {
    shopApi
      .suppliers()
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  const show = async (id: string) => {
    setOpening(true);
    try {
      setOpen(await shopApi.purchase(id));
    } catch {
      toast('Could not open that delivery.', 'error');
    } finally {
      setOpening(false);
    }
  };

  const owed = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0);
  const owedTo = suppliers.filter((s) => (s.balance || 0) > 0).length;
  const filtering = !!(query || supplierId || paid !== 'all');
  const monthName = new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long' });

  const PAID_TABS: { key: PaidFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'due', label: 'On account' },
    { key: 'paid', label: 'Paid in full' },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> {t('Purchases')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('What came in, from whom, on what invoice.')}
          </p>
        </div>
        <button type="button" className="btn h-9" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> {t('Record a delivery')}
        </button>
      </div>

      {/* ---- four tiles, one shape ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={CalendarDays}
          tone="bg-primary/10 text-primary"
          value={money(month.total)}
          label={`${t('Bought in')} ${monthName}`}
          sub={`${n(month.deliveries)} ${t(month.deliveries === 1 ? 'delivery' : 'deliveries')}`}
        />
        <Tile
          icon={Banknote}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          value={money(month.paid)}
          label={t('Paid at the door')}
          sub={t('this month')}
        />
        <Tile
          icon={Clock}
          tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          value={money(Math.max(0, month.total - month.paid))}
          label={t('Put on account')}
          sub={t('this month')}
        />
        <Tile
          icon={Building2}
          tone="bg-destructive/10 text-destructive"
          value={money(owed)}
          label={t('Owed to companies')}
          sub={`${n(owedTo)} ${t(owedTo === 1 ? 'company' : 'companies')} · ${t('all time')}`}
          bad={owed > 0}
        />
      </div>

      {/* ---- find and filter ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {PAID_TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={paid === x.key}
              onClick={() => {
                setPaid(x.key);
                setPage(1);
              }}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                paid === x.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        <select
          className="input h-9 w-full sm:w-52"
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setPage(1);
          }}
          aria-label={t('Company')}
        >
          <option value="">{t('Every company')}</option>
          {suppliers.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="relative block w-full sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-9 pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Invoice no. or company…')}
            aria-label={t('Search')}
          />
        </label>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="card mt-4">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Truck className="h-7 w-7" />
            </span>
            {filtering ? (
              <p>{t('Nothing matches that.')}</p>
            ) : (
              <>
                <p className="font-semibold">{t('No deliveries recorded yet.')}</p>
                <p className="max-w-md">
                  {t(
                    'Enter one the way the invoice reads — boxes, strips and the bonus — and the batches, the cost per piece and the company’s balance all follow from it.',
                  )}
                </p>
                <button type="button" className="btn mt-2 h-9" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> {t('Record the first delivery')}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card mt-4 p-0">
          {/* A phone gets a card per delivery: six columns across 390px is a
              table you scroll sideways to read one row of. */}
          <ul className="divide-y divide-border sm:hidden">
            {rows.map((p) => {
              const share = p.total > 0 ? Math.min(1, p.paidAmount / p.total) : 1;
              const due = Math.max(0, p.total - p.paidAmount);
              const name = supplierName(p);
              return (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => void show(p._id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{name}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{money(p.total)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">
                          {n(when(p.invoiceDate))}
                          {p.invoiceNo && <span className="font-mono"> · {p.invoiceNo}</span>} ·{' '}
                          {n(p.lines.length)} {t('Lines')}
                        </span>
                        {due > 0 ? (
                          <span className="pill pending shrink-0 !px-1.5 !py-0 text-[10.5px]">
                            {money(due)} {t('due')}
                          </span>
                        ) : (
                          <span className="pill success shrink-0 !px-1.5 !py-0 text-[10.5px]">
                            {t('Paid')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${due > 0 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${share * 100}%` }}
                        />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th className="pl-4">{t('Company')}</th>
                  <th>{t('Date')}</th>
                  <th>{t('Invoice')}</th>
                  <th className="text-right">{t('Lines')}</th>
                  <th className="text-right">{t('Total')}</th>
                  <th className="min-w-[10rem] pr-4">{t('Paid')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const share = p.total > 0 ? Math.min(1, p.paidAmount / p.total) : 1;
                  const due = Math.max(0, p.total - p.paidAmount);
                  const name = supplierName(p);
                  return (
                    <tr
                      key={p._id}
                      tabIndex={0}
                      role="button"
                      onClick={() => void show(p._id)}
                      onKeyDown={(e) => e.key === 'Enter' && void show(p._id)}
                      className="cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary"
                            aria-hidden="true"
                          >
                            {initials(name)}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate font-semibold">{name}</span>
                            {p.createdByName && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {t('by')} {p.createdByName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {n(when(p.invoiceDate))}
                      </td>
                      <td>
                        {p.invoiceNo ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {p.invoiceNo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{n(p.lines.length)}</td>
                      <td className="text-right font-semibold tabular-nums">{money(p.total)}</td>
                      <td className="pr-4">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="tabular-nums">{money(p.paidAmount)}</span>
                          {due > 0 ? (
                            <span className="pill pending !px-1.5 !py-0 text-[10.5px]">
                              {money(due)} {t('due')}
                            </span>
                          ) : (
                            <span className="pill success !px-1.5 !py-0 text-[10.5px]">
                              {t('Paid')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${due > 0 ? 'bg-amber-500' : 'bg-primary'}`}
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={setPage}
            className="border-t border-border px-4 py-3"
          />
        </div>
      )}

      {opening && (
        <div className="blocking">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {open && <DeliveryDetail purchase={open} onClose={() => setOpen(null)} />}

      {adding && (
        <NewDelivery
          order={fromOrder}
          onClose={closeDelivery}
          onSaved={() => {
            closeDelivery();
            void load();
            shopApi
              .suppliers()
              .then(setSuppliers)
              .catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

/** Two letters for a company's badge: "Square Pharmaceuticals" is SP. */
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—';

/** One tile: label and icon, figure, a line under it — the same on all four. */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
  sub,
  bad,
}: {
  icon: typeof Truck;
  tone: string;
  value: string;
  label: string;
  sub: string;
  bad?: boolean;
}) {
  return (
    <div className="stat flex h-full min-h-[132px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className={`value mt-1 stat-fit [--fit-max:24px] ${bad ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        {sub}
      </div>
    </div>
  );
}

/** A line with nothing but the item filled in. */
const blankLine = (p: ShopProduct): DraftLine => ({
  productId: p._id,
  name: p.name,
  piecesPerStrip: p.piecesPerStrip,
  stripsPerBox: p.stripsPerBox,
  isMedicine: p.isMedicine !== false,
  batchNo: '',
  expiry: '',
  boxes: '',
  strips: '',
  bonusStrips: '',
  tradePricePerPiece: '',
  mrpPerPiece: p.mrpPerPiece ? String(p.mrpPerPiece) : '',
});

interface DraftLine {
  productId: string;
  name: string;
  piecesPerStrip: number;
  stripsPerBox: number;
  /* Medicine lines cannot be saved without an expiry; the rest can. */
  isMedicine: boolean;
  batchNo: string;
  expiry: string;
  boxes: string;
  strips: string;
  bonusStrips: string;
  tradePricePerPiece: string;
  mrpPerPiece: string;
}

/** The invoice on the counter, typed in. */
function NewDelivery({
  order,
  onClose,
  onSaved,
}: {
  /** The order this delivery answers, when it came from one. */
  order?: ShopOrder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  /* The shop's own date: a delivery entered at 1am should not be filed under
     yesterday, which is what the UTC date does in Dhaka. */
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [paidAmount, setPaidAmount] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([shopApi.suppliers(), shopApi.products({ limit: 200 })]);
      setSuppliers(s);
      setProducts(p.data);
      if (order) {
        setSupplierId(order.supplier);
        /* What was asked for, in strips where it divides into strips, since
           that is how the invoice will read it. */
        setLines(
          order.lines.flatMap((l) => {
            const prod = p.data.find((x) => x._id === lineProductId(l));
            if (!prod) return [];
            const pps = Math.max(1, prod.piecesPerStrip);
            return [
              {
                ...blankLine(prod),
                strips: String(Math.ceil(l.qtyPieces / pps)),
              },
            ];
          }),
        );
      } else if (s.length === 1) setSupplierId(s[0]._id);
    })();
  }, [order]);

  const addLine = (productId: string) => {
    const p = products.find((x) => x._id === productId);
    if (!p) return;
    setLines((prev) => [...prev, blankLine(p)]);
    setPick('');
  };

  const setLine = (i: number, key: keyof DraftLine, value: string) =>
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, [key]: value } : l)));

  /* The same arithmetic the server does, shown while typing — a shopkeeper
     checks the total against the paper before pressing save, and finding out
     afterwards is finding out too late. */
  const piecesOf = (l: DraftLine) =>
    (Number(l.boxes) || 0) * l.stripsPerBox * l.piecesPerStrip +
    (Number(l.strips) || 0) * l.piecesPerStrip;
  const bonusOf = (l: DraftLine) => (Number(l.bonusStrips) || 0) * l.piecesPerStrip;
  const lineTotal = (l: DraftLine) => piecesOf(l) * (Number(l.tradePricePerPiece) || 0);

  const subTotal = useMemo(() => lines.reduce((n, l) => n + lineTotal(l), 0), [lines]);

  /* What is wrong with a line's expiry, if anything — shown under the field
     and holding the save button, so the invoice is fixed before it is sent. */
  const expiryProblem = (l: DraftLine): string | null => {
    if (!l.expiry.trim()) return l.isMedicine ? 'Expiry needed' : null;
    const ym = expiryMonth(l.expiry);
    if (!ym) return 'Write it as MM/YY';
    if (monthPassed(ym)) return 'Already expired';
    return null;
  };
  const expiryOk = lines.every((l) => expiryProblem(l) === null);

  const submit = async () => {
    if (!supplierId || lines.length === 0 || !expiryOk) return;
    setBusy(true);
    try {
      await shopApi.createPurchase({
        supplierId,
        orderId: order?._id,
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        paidAmount: Number(paidAmount) || 0,
        lines: lines.map((l) => ({
          productId: l.productId,
          batchNo: l.batchNo.trim(),
          expiry: expiryMonth(l.expiry) ?? undefined,
          boxes: Number(l.boxes) || 0,
          strips: Number(l.strips) || 0,
          bonusStrips: Number(l.bonusStrips) || 0,
          tradePricePerPiece: Number(l.tradePricePerPiece) || 0,
          mrpPerPiece: Number(l.mrpPerPiece) || 0,
        })),
      });
      useAlertStore.getState().refresh();
      toast(
        order
          ? 'Delivery recorded — stock is in, and the order shows what came.'
          : 'Delivery recorded — stock and the company’s balance are updated.',
      );
      onSaved();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not record that delivery.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-4xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">{t('Record a delivery')}</h3>
            <p className="text-xs text-muted-foreground">
              {order
                ? t('From the order — change the quantities to what actually came, and remove anything that did not.')
                : t('As the invoice reads. Pieces, cost and batches are worked out from it.')}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="pu-sup">
              {t('Company')}
            </label>
            <select
              id="pu-sup"
              className="input h-10"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{t('Pick one')}</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="pu-inv">
              {t('Invoice no')}
            </label>
            <input
              id="pu-inv"
              className="input h-10"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="INC-90210"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="pu-date">
              {t('Date')}
            </label>
            <input
              id="pu-date"
              type="date"
              className="input h-10"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">{t('What came')}</strong>
            {/* As wide as the screen allows and no wider: sized to its longest
                name, it ran off the right of a phone. */}
            <select
              className="input h-9 w-full min-w-0 sm:w-auto sm:max-w-xs"
              value={pick}
              onChange={(e) => addLine(e.target.value)}
            >
              <option value="">{t('Add an item…')}</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} {p.strength ?? ''}
                </option>
              ))}
            </select>
          </div>

          {lines.length === 0 ? (
            <div className="empty">
              <p>{t('No lines yet. Add the first item from the list above.')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lines.map((l, i) => (
                <div key={`${l.productId}-${i}`} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <strong className="text-sm">{l.name}</strong>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, n) => n !== i))}
                      aria-label={t('Remove line')}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-6">
                    <Field label="Batch">
                      <input
                        className="input h-9"
                        value={l.batchNo}
                        onChange={(e) => setLine(i, 'batchNo', e.target.value)}
                        placeholder="B-7741"
                      />
                    </Field>
                    <Field label={l.isMedicine ? 'Expiry *' : 'Expiry'}>
                      <input
                        className={`input h-9 tabular-nums ${
                          l.expiry && expiryProblem(l) ? 'border-destructive' : ''
                        }`}
                        inputMode="numeric"
                        value={l.expiry}
                        onChange={(e) => setLine(i, 'expiry', e.target.value)}
                        placeholder="MM/YY"
                        aria-invalid={!!expiryProblem(l)}
                      />
                      {expiryProblem(l) && (
                        <span
                          className={`mt-0.5 block text-[11px] ${
                            l.expiry ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {expiryProblem(l)}
                        </span>
                      )}
                    </Field>
                    <Field label="Box">
                      <input
                        className="input h-9"
                        inputMode="numeric"
                        value={l.boxes}
                        onChange={(e) => setLine(i, 'boxes', e.target.value)}
                      />
                    </Field>
                    <Field label="Strip">
                      <input
                        className="input h-9"
                        inputMode="numeric"
                        value={l.strips}
                        onChange={(e) => setLine(i, 'strips', e.target.value)}
                      />
                    </Field>
                    <Field label="Bonus strip">
                      <input
                        className="input h-9"
                        inputMode="numeric"
                        value={l.bonusStrips}
                        onChange={(e) => setLine(i, 'bonusStrips', e.target.value)}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="Trade / pc">
                      <input
                        className="input h-9"
                        inputMode="decimal"
                        value={l.tradePricePerPiece}
                        onChange={(e) => setLine(i, 'tradePricePerPiece', e.target.value)}
                        placeholder="0.90"
                      />
                    </Field>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {piecesOf(l)} pieces charged
                      {bonusOf(l) > 0 && (
                        <>
                          {' '}
                          <Gift className="inline h-3 w-3" /> +{bonusOf(l)} free
                        </>
                      )}
                    </span>
                    <span className="tabular-nums">{taka(lineTotal(l))}</span>
                    {piecesOf(l) + bonusOf(l) > 0 && lineTotal(l) > 0 && (
                      <span className="tabular-nums">
                        cost {taka(lineTotal(l) / (piecesOf(l) + bonusOf(l)))} / pc
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="pu-paid">
              {t('Paid now')}
            </label>
            <input
              id="pu-paid"
              className="input h-10 w-40"
              inputMode="decimal"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="0"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('The rest goes on the company’s account.')}
            </p>
          </div>

          <div className="text-right">
            <div className="eyebrow">
              {t('Invoice total')}
            </div>
            <div className="text-xl font-semibold tabular-nums">{taka(subTotal)}</div>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !supplierId || lines.length === 0 || !expiryOk}
              title={expiryOk ? undefined : 'Every medicine needs its expiry, as MM/YY'}
              onClick={() => void submit()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save delivery
            </button>
          </div>
        </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
