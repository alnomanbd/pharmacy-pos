import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Loader2,
  Printer,
  Plus,
  Check,
  Ban,
  Wand2,
  Search,
  Truck,
  Send,
  FilePen,
  PackageCheck,
  TriangleAlert,
  Building2,
  Eye,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  shopApi,
  packOf,
  type Supplier,
  type ShopOrder,
  type SuggestedLine,
  type ShopProduct,
  lineProductId,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import ConfirmWithReason from '../components/ConfirmWithReason';
import { useT, useUiLang, bnNumerals, useNumerals } from '../i18n/ui';
import Pager from '../components/Pager';
import Modal from '../components/Modal';
import { confirmAction } from '@dawai/shared/lib/confirm';
import OrderSheet, { orderNo } from '../components/OrderSheet';

/**
 * The scrap of paper the order used to be written on.
 *
 * The shop could record a delivery and could be told what was running low, and
 * there was nothing in between — so a week after the rep's visit there was no
 * way to tell what had been asked for and never came. This is that middle
 * step, and it is kept as close to the paper as possible: a company, a list of
 * names with quantities, and three things that can happen to it.
 *
 * The list writes itself from the reorder levels the shop was already keeping
 * and is then edited, because a screen that starts empty is a screen somebody
 * fills in from a scrap of paper anyway. Each suggested row carries the company
 * the stock last arrived from, which is how a list gets split between two reps
 * who come on two different days.
 *
 * There are no prices anywhere on it. The rate is the company's to state on the
 * invoice, and an order carrying a guessed one is an argument with the rep.
 *
 * And it ends at the delivery. "It has arrived" opens Purchases with the order
 * already typed in; what the invoice actually brought is kept against each
 * line, so the order shows what came short — which is the question it exists
 * to answer — and the rest can be ordered again in one tap.
 */

/** What came short on an order that arrived with its delivery. */
const shortOf = (o: ShopOrder) =>
  o.status === 'received' && o.purchase
    ? o.lines.filter((l) => (l.qtyReceived ?? 0) < l.qtyPieces)
    : [];

/** A shop item, shaped like a suggested row so both sit in one table. */
const asRow = (p: ShopProduct): SuggestedLine => ({
  productId: p._id,
  name: p.name,
  strength: p.strength ?? '',
  rackLabel: p.rackLabel ?? '',
  onHand: p.onHand,
  reorderLevel: p.reorderLevel,
  piecesPerStrip: p.piecesPerStrip,
  stripsPerBox: p.stripsPerBox,
  suggestPieces: Math.max(1, p.piecesPerStrip),
  lastSupplierId: '',
  lastSupplierName: '',
});

const STATUS_LABEL: Record<string, string> = {
  open: 'Written',
  sent: 'Given to the rep',
  received: 'Arrived',
  cancelled: 'Cancelled',
};

/* The reading a colour has to carry. */
const STATUS_PILL: Record<string, string> = {
  open: 'pending',
  sent: 'info',
  received: 'success',
  cancelled: 'danger',
};

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

type Tab = 'all' | 'short' | ShopOrder['status'];

/** Order cards per page: four rows of three on a laptop. */
const PAGE_SIZE = 12;

/* The three steps an order walks through, and how far this one has got. */
const STEPS = ['Written', 'Given to the rep', 'Arrived'] as const;
const stepOf = (o: ShopOrder) =>
  o.status === 'received' ? 3 : o.status === 'sent' ? 2 : o.status === 'open' ? 1 : 0;

/* One hue per state, for the band along the top of a card. */
const STATUS_BAND: Record<string, string> = {
  open: 'bg-amber-500',
  sent: 'bg-sky-500',
  received: 'bg-primary',
  cancelled: 'bg-muted-foreground/40',
};

export default function Orders() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [writing, setWriting] = useState<false | RestOf | null>(false);
  const navigate = useNavigate();
  const [open, setOpen] = useState<ShopOrder | null>(null);
  const [cancelling, setCancelling] = useState<ShopOrder | null>(null);
  const [dropping, setDropping] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  /* Counts and dates in the reader's digits; order numbers stay as printed. */
  const n = useCallback(
    (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)),
    [lang],
  );

  const load = useCallback(async () => {
    try {
      /* Everything the server will give, paged here: a shop writes a few a
         week, so two hundred is months of them. */
      const [list, companies] = await Promise.all([
        shopApi.orders({ limit: 200 }),
        shopApi.suppliers(),
      ]);
      setOrders(list);
      setSuppliers(companies);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the orders.'), 'error');
      setOrders([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = async (order: ShopOrder, status: 'sent' | 'received', message: string) => {
    try {
      await shopApi.setOrderStatus(order._id, { status });
      toast(message);
      setOpen(null);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    }
  };

  const drop = async (reason: string) => {
    if (!cancelling) return;
    setDropping(true);
    try {
      await shopApi.setOrderStatus(cancelling._id, { status: 'cancelled', reason });
      toast(t('Order cancelled.'));
      setCancelling(null);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not cancel that.'), 'error');
    } finally {
      setDropping(false);
    }
  };

  const all = useMemo(() => orders ?? [], [orders]);
  const count = (s: ShopOrder['status']) => all.filter((o) => o.status === s).length;
  const shortCount = all.filter((o) => shortOf(o).length > 0).length;
  const waiting = count('open') + count('sent');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((o) => {
      if (tab === 'short') {
        if (shortOf(o).length === 0) return false;
      } else if (tab !== 'all' && o.status !== tab) return false;
      if (!needle) return true;
      return [o.supplierName, orderNo(o), o.createdByName, ...o.lines.map((l) => l.name)]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [all, tab, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const pick = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: all.length },
    { key: 'open', label: 'Written', count: count('open') },
    { key: 'sent', label: 'Given to the rep', count: count('sent') },
    { key: 'received', label: 'Arrived', count: count('received') },
    { key: 'short', label: 'Came short', count: shortCount },
    { key: 'cancelled', label: 'Cancelled', count: count('cancelled') },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> {t('Orders')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {waiting > 0
              ? `${n(waiting)} ${t('still to come in.')}`
              : t('What you have asked a company for, before it arrives.')}
          </p>
        </div>
        <button type="button" className="btn h-9" onClick={() => setWriting(null)}>
          <Plus className="h-4 w-4" /> {t('Write an order')}
        </button>
      </div>

      {!orders ? (
        <LoadingBlock />
      ) : orders.length === 0 ? (
        <div className="card">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ClipboardList className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('No orders written yet.')}</p>
            <p className="max-w-md">
              {t(
                'Write one and the list fills itself from what is below its reorder level — you edit it rather than start it.',
              )}
            </p>
            <button type="button" className="btn mt-2 h-9" onClick={() => setWriting(null)}>
              <Plus className="h-4 w-4" /> {t('Write the first order')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---- four tiles, one shape; each one is also a filter ---- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              icon={FilePen}
              tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
              value={n(count('open'))}
              label={t('Written')}
              sub={t('not given to a rep yet')}
              active={tab === 'open'}
              onClick={() => pick('open')}
            />
            <Tile
              icon={Send}
              tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              value={n(count('sent'))}
              label={t('With the rep')}
              sub={t('waiting for the delivery')}
              active={tab === 'sent'}
              onClick={() => pick('sent')}
            />
            <Tile
              icon={PackageCheck}
              tone="bg-primary/10 text-primary"
              value={n(count('received'))}
              label={t('Arrived')}
              sub={t('closed against a delivery')}
              active={tab === 'received'}
              onClick={() => pick('received')}
            />
            <Tile
              icon={TriangleAlert}
              tone="bg-destructive/10 text-destructive"
              value={n(shortCount)}
              label={t('Came short')}
              sub={t('less came than was asked for')}
              active={tab === 'short'}
              onClick={() => pick('short')}
              bad={shortCount > 0}
            />
          </div>

          {/* ---- find and filter ---- */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
              role="tablist"
            >
              {TABS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === x.key}
                  onClick={() => pick(x.key)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    tab === x.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(x.label)}
                  <span
                    className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                      x.key === 'short' && x.count > 0
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-background/70 text-muted-foreground'
                    }`}
                  >
                    {n(x.count)}
                  </span>
                </button>
              ))}
            </div>
            <label className="relative block w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input h-9 pl-9"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                data-latin
                placeholder={t('Company, order no. or medicine…')}
                aria-label={t('Search')}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="card mt-4">
              <div className="empty py-10">
                <ClipboardList className="h-6 w-6" />
                <p>{q ? t('Nothing matches that.') : t('Nothing here. Good.')}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((o) => (
                <OrderCard
                  key={o._id}
                  order={o}
                  n={n}
                  onOpen={() => setOpen(o)}
                  onSend={() => void move(o, 'sent', t('Marked as given to the rep.'))}
                  onDeliver={() => navigate(`/purchases?order=${o._id}`)}
                />
              ))}
            </div>
          )}

          <Pager
            page={current}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPage={setPage}
            className="mt-4"
          />
        </>
      )}

      {writing !== false && (
        <WriteOrder
          suppliers={suppliers}
          initial={writing ?? undefined}
          onClose={() => setWriting(false)}
          onWritten={async () => {
            setWriting(false);
            await load();
          }}
        />
      )}

      {open && (
        <OrderDetail
          order={open}
          supplier={suppliers.find((s) => s._id === open.supplier)}
          onClose={() => setOpen(null)}
          onSend={() => move(open, 'sent', t('Marked as given to the rep.'))}
          onReceive={async () => {
            if (
              !(await confirmAction({
                title: `${t('Close order')} ${orderNo(open)} ${t('without a delivery?')}`,
                message: t('It is marked as arrived, but nothing is added to stock and nothing is owed to the supplier.'),
                confirmLabel: t('Close the order'),
                tone: 'danger',
                icon: 'close',
              }))
            )
              return;
            void move(open, 'received', t('Marked as arrived.'));
          }}
          onDeliver={() => navigate(`/purchases?order=${open._id}`)}
          onOrderRest={() => {
            const rest = shortOf(open).map((l) => ({
              productId: lineProductId(l),
              name: l.name,
              qtyPieces: l.qtyPieces - (l.qtyReceived ?? 0),
            }));
            setOpen(null);
            setWriting({ supplierId: open.supplier, fromNo: orderNo(open), lines: rest });
          }}
          onCancel={() => {
            setCancelling(open);
            setOpen(null);
          }}
        />
      )}

      <ConfirmWithReason
        open={!!cancelling}
        title={t('Cancel this order')}
        message={
          cancelling
            ? `${cancelling.supplierName} — ${cancelling.lines.length} items. The list stays on this screen with the reason against it.`
            : ''
        }
        confirmLabel="Cancel the order"
        placeholder={t('The rep says they cannot supply it')}
        busy={dropping}
        onCancel={() => setCancelling(null)}
        onConfirm={(reason) => void drop(reason)}
      />
    </div>
  );
}

/** One tile: icon, figure, label and a line under it, the same on all four. */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
  sub,
  active,
  onClick,
  bad,
}: {
  icon: typeof Send;
  tone: string;
  value: string;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  bad?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stat flex h-full min-h-[132px] flex-col text-left hover:border-primary/45 ${
        active ? 'border-primary ring-2 ring-primary/20' : ''
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className={`value mt-1 !text-[28px] ${bad ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        {sub}
      </div>
    </button>
  );
}

/**
 * The three steps as dots on a line, filled as far as this order has got.
 *
 * On a card it is the shape alone; in the order itself each step carries the
 * day it happened, which is what "when did I give this to him" is asking.
 */
function Steps({
  order,
  n,
  dated = false,
}: {
  order: ShopOrder;
  n: (v: number | string) => string;
  dated?: boolean;
}) {
  const t = useT();
  const step = stepOf(order);
  const dates = [order.createdAt, order.sentAt, order.receivedAt];
  return (
    <ol className="flex items-start">
      {STEPS.map((label, i) => {
        const done = step > i;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-[7px] h-0.5 w-full ${
                  done ? 'bg-primary' : 'bg-border'
                }`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 grid h-4 w-4 place-items-center rounded-full border-2 ${
                done ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
              }`}
            >
              {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <span
              className={`mt-1 text-[10.5px] leading-tight ${
                done ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {t(label)}
            </span>
            {dated && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {done && dates[i] ? n(when(dates[i])) : ' '}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One order. Fixed parts in fixed places, and `auto-rows-fr` on the grid, so a
 * cancelled order with a long reason is no taller than a fresh one.
 */
function OrderCard({
  order: o,
  n,
  onOpen,
  onSend,
  onDeliver,
}: {
  order: ShopOrder;
  n: (v: number | string) => string;
  onOpen: () => void;
  onSend: () => void;
  onDeliver: () => void;
}) {
  const t = useT();
  const short = shortOf(o);
  const pieces = o.lines.reduce((sum, l) => sum + l.qtyPieces, 0);

  /* The line under the steps says the one thing worth knowing about it. */
  const remark =
    o.status === 'cancelled'
      ? o.closeReason || t('Cancelled')
      : short.length > 0
        ? `${n(short.length)} ${t('of')} ${n(o.lines.length)} ${t('items came less than ordered')}`
        : o.status === 'received'
          ? t('Everything asked for came.')
          : o.note ||
            o.lines
              .slice(0, 3)
              .map((l) => l.name)
              .join(', ');

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card transition-shadow hover:shadow-md ${
        o.status === 'cancelled' ? 'opacity-75' : ''
      }`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 ${STATUS_BAND[o.status] ?? 'bg-border'}`}
        aria-hidden="true"
      />

      <button type="button" onClick={onOpen} className="flex flex-1 flex-col p-4 pt-5 text-left">
        <div className="flex w-full items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold" title={o.supplierName}>
              {o.supplierName}
            </h3>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{orderNo(o)}</p>
          </div>
          <span className={`pill shrink-0 ${STATUS_PILL[o.status] ?? 'neutral'}`}>
            {t(STATUS_LABEL[o.status] ?? o.status)}
          </span>
        </div>

        <div className="mt-3 grid w-full grid-cols-3 gap-2 rounded-xl bg-muted/50 px-3 py-2 text-center">
          <Figure value={n(o.lines.length)} label={t('Items')} />
          <Figure value={n(pieces)} label={t('Pieces')} />
          <Figure value={n(when(o.createdAt))} label={t('Written')} />
        </div>

        <div className="mt-3 w-full">
          <Steps order={o} n={n} />
        </div>

        <p
          className={`mt-3 line-clamp-2 min-h-[2.5em] w-full text-xs leading-snug ${
            short.length > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'
          }`}
        >
          {remark}
        </p>

        <p className="mt-auto w-full truncate pt-1 text-[11px] text-muted-foreground">
          {t('by')} {o.createdByName || '—'}
        </p>
      </button>

      {/* The next thing to do with it, one tap from the list. */}
      <div className="border-t border-border text-xs font-semibold">
        {o.status === 'open' ? (
          <button
            type="button"
            onClick={onSend}
            className="flex w-full items-center justify-center gap-1.5 py-2.5 text-primary transition-colors hover:bg-primary/5"
          >
            <Check className="h-3.5 w-3.5" /> {t('Given to the rep')}
          </button>
        ) : o.status === 'sent' ? (
          <button
            type="button"
            onClick={onDeliver}
            className="flex w-full items-center justify-center gap-1.5 py-2.5 text-primary transition-colors hover:bg-primary/5"
          >
            <Truck className="h-3.5 w-3.5" /> {t('It has arrived — record the delivery')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-center gap-1.5 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" /> {t('Open the order')}
          </button>
        )}
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ writing one -- */

/** "Order the rest": the company, the order it follows on from, and what came short. */
interface RestOf {
  supplierId: string;
  fromNo: string;
  lines: { productId: string; name: string; qtyPieces: number }[];
}

/** A row for a line whose item has not been looked up yet — the name is enough to show. */
const stubRow = (l: { productId: string; name: string }): SuggestedLine => ({
  productId: l.productId,
  name: l.name,
  strength: '',
  rackLabel: '',
  onHand: 0,
  reorderLevel: 0,
  piecesPerStrip: 1,
  stripsPerBox: 1,
  suggestPieces: 1,
  lastSupplierId: '',
  lastSupplierName: '',
});

function WriteOrder({
  suppliers,
  initial,
  onClose,
  onWritten,
}: {
  suppliers: Supplier[];
  /** "Order the rest": the company and what came short, already on the list. */
  initial?: RestOf;
  onClose: () => void;
  onWritten: () => Promise<void>;
}) {
  const t = useT();
  const { num } = useNumerals();
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [suggested, setSuggested] = useState<SuggestedLine[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.lines ?? []).map((l) => [l.productId, String(l.qtyPieces)])),
  );
  /*
   * Anything on the shop's list, not only what is below its level.
   *
   * The suggestion is a start, not a fence: most shops never set a reorder
   * level on most items, and the rep takes orders for whatever the shop asks.
   * Rows added by hand stay on the list whatever the company filter says.
   */
  const [extra, setExtra] = useState<SuggestedLine[]>(() => (initial?.lines ?? []).map(stubRow));
  /* Items on the order that have since been deleted from the shop's list —
     shown, so nothing silently drops off, and left off what is sent. */
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const [found, setFound] = useState<ShopProduct[]>([]);

  useEffect(() => {
    if (find.trim().length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setFound((await shopApi.products({ q: find.trim(), limit: 20 })).data);
      } catch {
        setFound([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [find]);

  /*
   * The short lines of an order being re-ordered.
   *
   * On the list at once, from the order's own names, and then each is looked
   * up by name for its pack size and what is on the shelf — one search per
   * line rather than one fetch of the whole list, which stops at 200 items and
   * would lose the rest in a bigger shop. An item that is no longer on the
   * shop's list is kept on screen and marked, rather than vanishing.
   */
  useEffect(() => {
    if (!initial?.lines.length) return;
    void (async () => {
      const looked = await Promise.all(
        initial.lines.map(async (l) => {
          try {
            const hits = (await shopApi.products({ q: l.name, limit: 20 })).data;
            return hits.find((p) => p._id === l.productId) ?? null;
          } catch {
            return undefined; // not known — leave the row as it is
          }
        }),
      );
      setExtra(initial.lines.map((l, i) => (looked[i] ? asRow(looked[i]!) : stubRow(l))));
      setGone(new Set(initial.lines.filter((_, i) => looked[i] === null).map((l) => l.productId)));
    })();
  }, [initial]);

  const addItem = (p: ShopProduct) => {
    setExtra((prev) => (prev.some((r) => r.productId === p._id) ? prev : [asRow(p), ...prev]));
    setQty((prev) => ({ ...prev, [p._id]: prev[p._id] || String(Math.max(1, p.piecesPerStrip)) }));
    setFind('');
    setFound([]);
  };
  const [note, setNote] = useState('');
  const [theirsOnly, setTheirsOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  /*
   * The whole list is fetched once, unfiltered, and split on screen.
   *
   * Choosing a company then refetching would make the quantities somebody has
   * already typed disappear, and a shopkeeper who is halfway down the shelf
   * when they realise the rep is from the other company should not lose the
   * list.
   */
  useEffect(() => {
    void (async () => {
      try {
        setSuggested(await shopApi.suggestOrder());
      } catch {
        setSuggested([]);
      }
    })();
  }, []);

  /*
   * Theirs, or everything.
   *
   * Splitting the list by who the stock last came from is what makes two reps
   * on two days workable — but it is a filter, not a rule: a shop orders
   * something from a company it has never bought that item from all the time,
   * and a screen that simply hides it leaves them no way to ask. So the split
   * is on by default and can be switched off.
   */
  const rows = useMemo(() => {
    /* Ordering the rest is about the rest: the reorder suggestions stay off
       the list, and anything else can still be added from the search. */
    if (initial) return extra;
    const mine = new Set(extra.map((r) => r.productId));
    const list = (suggested ?? []).filter((r) => !mine.has(r.productId));
    const theirs =
      !supplierId || !theirsOnly ? list : list.filter((r) => r.lastSupplierId === supplierId);
    return [...extra, ...theirs];
  }, [initial, suggested, extra, supplierId, theirsOnly]);

  const fill = () => {
    const next = { ...qty };
    for (const r of rows) next[r.productId] = String(r.suggestPieces);
    setQty(next);
  };

  const lines = Object.entries(qty)
    .filter(([productId]) => !gone.has(productId))
    .map(([productId, value]) => ({ productId, qtyPieces: Number(value) || 0 }))
    .filter((l) => l.qtyPieces > 0);

  const submit = async () => {
    if (!supplierId) {
      toast(t('Which company is this order for?'), 'error');
      return;
    }
    if (lines.length === 0) {
      toast(t('Put something on the list first.'), 'error');
      return;
    }
    setBusy(true);
    try {
      await shopApi.createOrder({ supplierId, note: note.trim() || undefined, lines });
      toast(t('Order written.'));
      await onWritten();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not write that order.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">
              {initial ? `${t('Order the rest of')} ${initial.fromNo}` : t('Write an order')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {initial
                ? t('What came short, with the amount still to come. Change an amount, clear it to leave a line off, or add anything else below.')
                : t('Everything at or below its reorder level, with the company it last came from.')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input h-10 w-auto"
            aria-label={t('Company')}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">{t('Which company…')}</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          {!initial && (
            <>
              <button type="button" className="btn btn-secondary h-10" onClick={fill}>
                <Wand2 className="h-4 w-4" /> {t('Fill in the suggested amounts')}
              </button>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={theirsOnly}
                  onChange={(e) => setTheirsOnly(e.target.checked)}
                />
                {t('Only what you last bought from them')}
              </label>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {num(lines.length)} {t('on the list')}
          </span>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-10 pl-9"
            data-latin
            placeholder={t('Add any item — brand or generic…')}
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          {found.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
              {found.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                  onClick={() => addItem(p)}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{p.name}</span>{' '}
                    <span className="text-muted-foreground">{p.strength}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {num(p.onHand)} {t('on hand')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {!suggested && !initial ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <div className="empty">
              {supplierId && theirsOnly
                ? t('Nothing you last bought from this company is low — untick the box, or add any item above.')
                : t('Nothing is at its reorder level — add any item above. Set levels on the stock list to have this fill itself.')}
            </div>
          ) : (
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>{t('Item')}</th>
                  <th>{t('Rack')}</th>
                  <th className="text-right">{t('On hand')}</th>
                  <th>{t('Last from')}</th>
                  <th className="text-right">{t('Order (pieces)')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} className={gone.has(r.productId) ? 'opacity-50' : ''}>
                    <td className="pr-3">
                      {r.name} <span className="text-muted-foreground">{r.strength}</span>
                      {gone.has(r.productId) && (
                        <span className="block text-[11px] text-destructive">
                          {t('No longer on your list — left off this order')}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground">{r.rackLabel || '—'}</td>
                    <td className="text-right tabular-nums">
                      <span className={r.onHand <= 0 ? 'font-semibold text-destructive' : ''}>
                        {r.onHand}
                      </span>
                      {r.reorderLevel > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          {t('level')} {num(r.reorderLevel)}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground">
                      {r.lastSupplierName || (extra.some((x) => x.productId === r.productId) ? '—' : t('Never bought'))}
                    </td>
                    <td className="text-right">
                      <input
                        className="input h-9 w-28 text-right"
                        inputMode="numeric"
                        disabled={gone.has(r.productId)}
                        aria-label={`Order ${r.name}`}
                        placeholder={String(r.suggestPieces)}
                        value={qty[r.productId] ?? ''}
                        onChange={(e) => setQty({ ...qty, [r.productId]: e.target.value })}
                      />
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {packOf(Number(qty[r.productId]) || r.suggestPieces, r)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <input
            className="input h-10 flex-1"
            placeholder={t('Note — anything to tell the rep')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
          <button type="button" className="btn btn-ghost h-10" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="button" className="btn h-10" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Write the order')}
          </button>
        </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- reading one -- */

function OrderDetail({
  order,
  supplier,
  onClose,
  onSend,
  onReceive,
  onDeliver,
  onOrderRest,
  onCancel,
}: {
  order: ShopOrder;
  supplier?: Supplier;
  onClose: () => void;
  onSend: () => void;
  /** Closing by hand, with no delivery behind it. */
  onReceive: () => void;
  /** Recording the delivery it arrived on. */
  onDeliver: () => void;
  onOrderRest: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const arrived = order.status === 'received' && !!order.purchase;
  const short = shortOf(order);

  /* The paper is its own sheet now (see OrderSheet) — this dialog no longer
     has to double as the printout, so it uses the shop's ordinary shell. */
  const [printing, setPrinting] = useState(false);
  const donePrinting = useCallback(() => setPrinting(false), []);

  return (
    <Modal onClose={onClose} className="flex max-h-[90vh] w-full max-w-2xl flex-col">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">{order.supplierName}</h3>
            <p className="font-mono text-[11px] text-muted-foreground">{orderNo(order)}</p>
            <p className="text-xs text-muted-foreground">
              <span className={`pill ${STATUS_PILL[order.status] ?? 'neutral'}`}>
                {t(STATUS_LABEL[order.status] ?? order.status)}
              </span>{' '}
              · {t('written')} {when(order.createdAt)} {t('by')} {order.createdByName}
              {order.sentAt ? ` · ${t('given')} ${when(order.sentAt)}` : ''}
              {order.receivedAt ? ` · ${t('arrived')} ${when(order.receivedAt)}` : ''}
            </p>
          </div>
        </div>

        {/* Where it is, and the day each step happened. A cancelled order says
            so and why, instead of a line of empty dots. */}
        {order.status === 'cancelled' ? (
          <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <Ban className="mr-1.5 inline h-4 w-4 text-destructive" />
            {t('Cancelled')}
            {order.closeReason ? ` — ${order.closeReason}` : ''}
          </p>
        ) : (
          <div className="mb-4 rounded-xl border border-border bg-muted/30 px-3 pb-2 pt-3">
            <Steps order={order} n={n} dated />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>{t('Item')}</th>
                <th className="text-right">{t('Was on hand')}</th>
                <th className="text-right">{t('Asked for')}</th>
                {arrived && <th className="text-right">{t('Came')}</th>}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l._id}>
                  <td className="pr-3">
                    {l.name}
                    {l.note && (
                      <span className="block text-[11px] text-muted-foreground">{l.note}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {l.onHandAtOrder}
                  </td>
                  <td className="text-right font-semibold tabular-nums">{l.qtyPieces}</td>
                  {arrived && (
                    <td
                      className={`text-right tabular-nums ${
                        (l.qtyReceived ?? 0) < l.qtyPieces ? 'font-semibold text-destructive' : 'text-primary'
                      }`}
                    >
                      {l.qtyReceived ?? 0}
                      {(l.qtyReceived ?? 0) < l.qtyPieces && (
                        <span className="block text-[11px]">
                          {l.qtyPieces - (l.qtyReceived ?? 0)} {t('short')}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {order.note && (
            <p className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
              {order.note}
            </p>
          )}

          {arrived && (
            <p
              className={`mt-3 rounded-md border p-3 text-sm ${
                short.length ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5'
              }`}
            >
              {short.length
                ? `${short.length} ${t('of')} ${order.lines.length} ${t('items came less than ordered — the rest can be ordered again below.')}`
                : t('Everything asked for came.')}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            className="btn btn-ghost h-9"
            onClick={() => setPrinting(true)}
            disabled={printing}
          >
            <Printer className="h-4 w-4" /> {t('Print')}
          </button>
          {(order.status === 'open' || order.status === 'sent') && (
            <button type="button" className="btn btn-ghost h-9 text-destructive" onClick={onCancel}>
              <Ban className="h-4 w-4" /> {t('Cancel the order')}
            </button>
          )}
          {order.status === 'open' && (
            <button type="button" className="btn h-9" onClick={onSend}>
              <Check className="h-4 w-4" /> {t('Given to the rep')}
            </button>
          )}
          {order.status === 'sent' && (
            <>
              <button
                type="button"
                className="btn btn-ghost h-9"
                onClick={onReceive}
                title={t('For goods that came without an invoice to enter')}
              >
                {t('Close without a delivery')}
              </button>
              <button type="button" className="btn h-9" onClick={onDeliver}>
                <Truck className="h-4 w-4" /> {t('It has arrived — record the delivery')}
              </button>
            </>
          )}
          {short.length > 0 && (
            <button type="button" className="btn h-9" onClick={onOrderRest}>
              <Plus className="h-4 w-4" /> {t('Order the rest')}
            </button>
          )}
        </div>

      {printing && <OrderSheet orderId={order._id} supplier={supplier} onDone={donePrinting} />}
    </Modal>
  );
}
