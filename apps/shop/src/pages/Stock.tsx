import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLinkedSearch } from '../components/useLinkedSearch';
import {
  Boxes,
  Plus,
  Search,
  Loader2,
  TriangleAlert,
  PackageX,
  ClipboardCheck,
  ScanBarcode,
  Pencil,
  Trash2,
  Truck,
  Wallet,
  TrendingDown,
  CalendarClock,
  Pill,
  ShoppingBag,
  Inbox,
  MessageSquarePlus,
  ArrowRightLeft,
  FileSpreadsheet,
} from 'lucide-react';
import {
  shopApi,
  taka,
  packOf,
  type ShopProduct,
  type StockBatch,
  type CatalogueMedicine,
  type ShopRack,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useNumerals, useUiLang, bnNumerals } from '../i18n/ui';
import Pager from '../components/Pager';
import Modal from '../components/Modal';
import MedicineInfo from '../components/MedicineInfo';
import ExportCsv from '../components/ExportCsv';
import { confirmAction } from '@dawai/shared/lib/confirm';
import ConfirmWithReason from '../components/ConfirmWithReason';
import { useAlertStore } from '../alerts/useStockAlerts';
import { fetchBranchSwitcher } from '../branch';
import { CountUp } from '../components/motion';
import { AskForMedicine, MedicineRequestsPanel } from '../components/MedicineRequests';

/**
 * What is on the shelf.
 *
 * Three questions in one table, because they are always asked together: how
 * many are there, when does the earliest lot expire, and what is it worth. On
 * hand is shown in the shop's own words — "2 box 3 strip" — beside the piece
 * count, since the person holding the box counts in boxes and the software
 * counts in pieces, and both have to be true at once.
 */

const expiryTone = (iso: string | null) => {
  if (!iso) return '';
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return 'text-destructive font-semibold';
  if (days < 90) return 'text-destructive';
  return 'text-muted-foreground';
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';

/* A delivery's day, not its month: "which one came on the 12th" is how a lot
   is found again. */
const dayOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const MOVE_WORDS: Record<string, string> = {
  purchase: 'Received',
  purchase_return: 'Sent back',
  sale: 'Sold',
  sale_return: 'Returned',
  damage: 'Damaged',
  expiry: 'Expired',
  adjustment: 'Count corrected',
  sale_void: 'Bill cancelled',
  transfer: 'Transferred',
  opening: 'Opening stock',
};

/**
 * Every piece that came in or went out, and who moved it.
 *
 * The shelf tab answers "what is here"; this answers "where did it go", which
 * is the question asked the day the count comes up short. It is the ledger the
 * stock is kept by, read as it was written — newest first, with the time it
 * was entered and the name against it.
 */
function History({ productId }: { productId: string }) {
  const t = useT();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof shopApi.productLedger>> | null>(null);

  useEffect(() => {
    shopApi
      .productLedger(productId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [productId]);

  if (!rows) return <LoadingBlock />;
  if (rows.length === 0) {
    return (
      <div className="empty">
        <p>{t('Nothing has moved yet.')}</p>
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-auto">
      <table className="table w-full text-sm">
        <thead>
          <tr>
            <th>{t('When')}</th>
            <th>{t('What')}</th>
            <th className="text-right">{t('Pieces')}</th>
            <th className="text-right">{t('Left in lot')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id}>
              <td className="whitespace-nowrap text-muted-foreground">{when(r.createdAt)}</td>
              <td>
                <span className="font-semibold">{t(MOVE_WORDS[r.move] ?? r.move)}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {[r.reason, r.actorName].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td
                className={`text-right tabular-nums ${
                  r.qtyDelta > 0 ? 'text-primary' : 'text-destructive'
                }`}
              >
                {r.qtyDelta > 0 ? `+${r.qtyDelta}` : `−${-r.qtyDelta}`}
              </td>
              <td className="text-right tabular-nums">{r.balanceAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Status = 'all' | 'low' | 'out' | 'expiring';
type Sort = 'name' | 'onHand' | 'expiry' | 'value';

/** Items per page. The server pages them; this is what one page asks for. */
const PAGE_SIZE = 25;

const EMPTY_SUMMARY = { items: 0, value: 0, low: 0, out: 0, expiring: 0, expiryDays: 90 };

/** Where an item stands, in the one word the counter needs. */
const standing = (p: ShopProduct): 'out' | 'low' | 'ok' =>
  p.onHand <= 0 ? 'out' : p.reorderLevel > 0 && p.onHand <= p.reorderLevel ? 'low' : 'ok';

export default function Stock() {
  const t = useT();
  /* How many branches the shop has — the transfer button is only for more than one. */
  const [branchCount, setBranchCount] = useState(1);
  useEffect(() => {
    fetchBranchSwitcher()
      .then((d) => setBranchCount(d.count))
      .catch(() => undefined);
  }, []);
  const lang = useUiLang();
  const { toast } = useToast();
  /* The rack page links here with a shelf in the URL: "show me what is on R2"
     is the question a shelf check starts with. */
  const [params, setParams] = useSearchParams();
  const rackId = params.get('rack') ?? '';
  const [racks, setRacks] = useState<ShopRack[]>([]);
  const [rows, setRows] = useState<ShopProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  /* The bell links here with an item's name: "show me Rolac". */
  const [q, setQ] = useState(() => params.get('q') ?? '');
  useLinkedSearch(setQ);
  /* What the server is asked for — the box, a moment after the typing stops,
     so a name typed at speed is one request and not nine. */
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [page, setPage] = useState(1);
  /* A string, not a flag: an added request opens "new item" with its brand
     already typed in. */
  const [adding, setAdding] = useState<string | false>(false);
  const [requests, setRequests] = useState(false);
  const [open, setOpen] = useState<ShopProduct | null>(null);

  const n = useCallback(
    (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)),
    [lang],
  );
  const money = useCallback((v: number) => n(taka(v)), [n]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const res = await shopApi.products({
        q: query || undefined,
        status: status === 'all' ? undefined : status,
        sort,
        rackId: rackId || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.data);
      setTotal(res.total);
      if (res.summary) setSummary(res.summary);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load the stock list.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, status, sort, rackId, page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    shopApi
      .racks()
      .then(setRacks)
      .catch(() => undefined);
  }, []);

  const pick = (next: Status) => {
    setStatus((cur) => (cur === next && next !== 'all' ? 'all' : next));
    setPage(1);
  };

  const filtering = !!(query || rackId || status !== 'all');

  const TABS: { key: Status; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: summary.items },
    { key: 'low', label: 'To reorder', count: summary.low },
    { key: 'out', label: 'Out of stock', count: summary.out },
    { key: 'expiring', label: 'Expiring soon', count: summary.expiring },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Boxes className="h-5 w-5" /> {t('Stock')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('What you sell, and how much of it is left.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsv what="stock" label="Export the list" />
          <Link to="/import?what=stock" className="btn btn-ghost h-9">
            <FileSpreadsheet className="h-4 w-4" /> {t('Import')}
          </Link>
          {/* The shelf against the screen. Beside the list, because that is
              where somebody is standing when they notice the two disagree. */}
          <Link to="/count" className="btn btn-ghost h-9">
            <ClipboardCheck className="h-4 w-4" /> {t('Count the shelf')}
          </Link>
          {/* Two different acts that both sound like "add stock". A new item
              puts a name on the list; stock — the pieces, their batch, their
              expiry and the day they came — only ever arrives on a delivery,
              so the list and the ledger can never disagree about where it
              came from. */}
          <Link to="/purchases" className="btn btn-ghost h-9">
            <Truck className="h-4 w-4" /> {t('Receive stock')}
          </Link>
          {/* Only for a shop with more than one branch: somewhere to send it. */}
          {branchCount > 1 && (
            <Link to="/transfers" className="btn btn-ghost h-9">
              <ArrowRightLeft className="h-4 w-4" /> {t('Send to a branch')}
            </Link>
          )}
          {/* What the shop asked Dawai to put in the catalogue. Here, beside
              "new item", because that is where a missing medicine is noticed. */}
          <button type="button" className="btn btn-ghost h-9" onClick={() => setRequests(true)}>
            <Inbox className="h-4 w-4" /> {t('Medicine requests')}
          </button>
          <button
            type="button"
            className="btn h-9"
            onClick={() => setAdding('')}
            title={t('A new name on the list — the stock itself comes in on a delivery')}
          >
            <Plus className="h-4 w-4" /> {t('New item')}
          </button>
        </div>
      </div>

      {/* ---- four tiles, one shape; three of them are also filters ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Wallet}
          tone="bg-primary/10 text-primary"
          value={<CountUp value={summary.value} format={money} />}
          label={t('Value on the shelf')}
          sub={`${n(summary.items)} ${t('items on the list')}`}
          active={status === 'all' && filtering === false}
          onClick={() => pick('all')}
        />
        <Tile
          icon={TrendingDown}
          tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          value={<CountUp value={summary.low} format={n} />}
          label={t('To reorder')}
          sub={t('at or below the level you set')}
          active={status === 'low'}
          onClick={() => pick('low')}
          warn={summary.low > 0}
        />
        <Tile
          icon={PackageX}
          tone="bg-destructive/10 text-destructive"
          value={<CountUp value={summary.out} format={n} />}
          label={t('Out of stock')}
          sub={t('nothing left to sell')}
          active={status === 'out'}
          onClick={() => pick('out')}
          bad={summary.out > 0}
        />
        <Tile
          icon={CalendarClock}
          tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          value={<CountUp value={summary.expiring} format={n} />}
          label={t('Expiring soon')}
          sub={`${t('first lot within')} ${n(summary.expiryDays)} ${t('days')}`}
          active={status === 'expiring'}
          onClick={() => pick('expiring')}
        />
      </div>

      {/* ---- find, filter, order ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={status === x.key}
              onClick={() => {
                setStatus(x.key);
                setPage(1);
              }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === x.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(x.label)}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  x.key === 'out' && x.count > 0
                    ? 'bg-destructive/15 text-destructive'
                    : x.key === 'low' && x.count > 0
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-background/70 text-muted-foreground'
                }`}
              >
                {n(x.count)}
              </span>
            </button>
          ))}
        </div>

        <select
          className="input h-9 w-[calc(50%-0.375rem)] sm:w-44"
          aria-label={t('Filter by rack')}
          value={rackId}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('rack', e.target.value);
            else next.delete('rack');
            setParams(next, { replace: true });
            setPage(1);
          }}
        >
          <option value="">{t('Every rack')}</option>
          {racks.map((r) => (
            <option key={r._id} value={r._id}>
              {r.name}
            </option>
          ))}
          <option value="none">{t('Not placed yet')}</option>
        </select>

        <select
          className="input h-9 w-[calc(50%-0.375rem)] sm:w-44"
          aria-label={t('Sort by')}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as Sort);
            setPage(1);
          }}
        >
          <option value="name">{t('Sort: name')}</option>
          <option value="onHand">{t('Sort: least on hand')}</option>
          <option value="expiry">{t('Sort: expires first')}</option>
          <option value="value">{t('Sort: most value')}</option>
        </select>

        <label className="relative block w-full sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-9 pl-9"
            data-latin
            placeholder={t('Brand, generic, company or code…')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
              <Boxes className="h-7 w-7" />
            </span>
            {filtering ? (
              <p>{t('Nothing matches that.')}</p>
            ) : (
              <>
                <p className="font-semibold">{t('Nothing on the list yet.')}</p>
                <p className="max-w-md">
                  {t(
                    'Add what you sell — the medicines come from the shared catalogue every shop sells from, and everything else you can type in yourself.',
                  )}
                </p>
                <button type="button" className="btn mt-2 h-9" onClick={() => setAdding('')}>
                  <Plus className="h-4 w-4" /> {t('Add the first item')}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card mt-4 p-0">
          {/* A phone gets a card per item: six columns across 390px is a table
              you scroll sideways to read one row of. */}
          <ul className="divide-y divide-border sm:hidden">
            {rows.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => setOpen(p)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <ItemBadge product={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">
                        {p.name}
                        {p.strength && (
                          <span className="font-normal text-muted-foreground"> {p.strength}</span>
                        )}
                      </span>
                      <OnHand product={p} n={n} align="right" bare />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {[
                          p.onHand > 0 && n(packOf(p.onHand, p)),
                          p.rackLabel && `${t('rack')} ${p.rackLabel}`,
                          `${money(p.mrpPerPiece)} / ${t('pc')}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <ExpiryPill iso={p.nearestExpiry} n={n} />
                    </div>
                    <LotTag product={p} n={n} />
                    <LevelBar product={p} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th className="pl-4">{t('Item')}</th>
                  <th>{t('Rack')}</th>
                  <th className="min-w-[9rem]">{t('On hand')}</th>
                  <th className="text-right">{t('MRP / pc')}</th>
                  <th>{t('Expiry & batch')}</th>
                  <th className="hidden pr-4 text-right lg:table-cell">{t('Value')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p._id}
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => setOpen(p)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpen(p)}
                  >
                    <td className="pl-4 pr-3">
                      <div className="flex items-center gap-3">
                        <ItemBadge product={p} />
                        <div className="min-w-0">
                          <span className="font-semibold">{p.name}</span>
                          {p.strength && (
                            <span className="text-muted-foreground"> {p.strength}</span>
                          )}
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[p.genericName, p.companyName].filter(Boolean).join(' · ') ||
                              t('Not a medicine')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {p.rackLabel ? (
                        <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs">
                          {p.rackLabel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <OnHand product={p} n={n} />
                      <LevelBar product={p} />
                    </td>
                    <td className="text-right tabular-nums">{money(p.mrpPerPiece)}</td>
                    <td>
                      <div className="flex flex-col items-start gap-0.5">
                        <ExpiryPill iso={p.nearestExpiry} n={n} />
                        <LotTag product={p} n={n} />
                      </div>
                    </td>
                    <td className="hidden pr-4 text-right tabular-nums lg:table-cell">
                      {money(p.stockValue)}
                    </td>
                  </tr>
                ))}
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

      {open && (
        <Batches
          product={open}
          racks={racks}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            await load();
          }}
          onEdited={(p) => setOpen((cur) => (cur ? { ...cur, ...p } : cur))}
          onGone={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
      {adding !== false && (
        <AddItem
          racks={racks}
          initialQ={adding}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
      {requests && (
        <MedicineRequestsPanel
          onClose={() => setRequests(false)}
          onStock={(brand) => {
            setRequests(false);
            setAdding(brand);
          }}
        />
      )}
    </div>
  );
}

/** One tile: label and icon, figure, a line under it — the same on all four. */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
  sub,
  active,
  onClick,
  bad,
  warn,
}: {
  icon: typeof Boxes;
  tone: string;
  value: React.ReactNode;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  bad?: boolean;
  warn?: boolean;
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
      <div
        className={`value mt-1 stat-fit [--fit-max:24px] ${
          bad ? 'text-destructive' : warn ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
      >
        {value}
      </div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        {sub}
      </div>
    </button>
  );
}

/* The badge beside a name: a pill for a medicine, a bag for the rest, tinted
   by where the item stands so an empty shelf reads before its name does. */
function ItemBadge({ product: p }: { product: ShopProduct }) {
  const s = standing(p);
  const tone =
    s === 'out'
      ? 'bg-destructive/10 text-destructive'
      : s === 'low'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : 'bg-primary/10 text-primary';
  const Icon = p.isMedicine === false ? ShoppingBag : Pill;
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function OnHand({
  product: p,
  n,
  align = 'left',
  bare = false,
}: {
  product: ShopProduct;
  n: (v: number | string) => string;
  align?: 'left' | 'right';
  /** The figure alone, where the pack breakdown is shown somewhere else. */
  bare?: boolean;
}) {
  const t = useT();
  const s = standing(p);
  return (
    <span className={`block shrink-0 ${align === 'right' ? 'text-right' : ''}`}>
      <span
        className={`font-semibold tabular-nums ${
          s === 'out' ? 'text-destructive' : s === 'low' ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
      >
        {n(p.onHand)}
      </span>
      <span className={`ml-1.5 text-[11px] text-muted-foreground ${bare && p.onHand > 0 ? 'hidden' : ''}`}>
        {/* Below zero means more went out than the screen knew about —
            usually a bill rung up while the line was down. The shelf is the
            truth; count it. */}
        {p.onHand < 0 ? t('count this shelf') : p.onHand > 0 ? n(packOf(p.onHand, p)) : t('none left')}
      </span>
    </span>
  );
}

/**
 * How full, against the level the shop set.
 *
 * The level sits a third of the way along, so "at the level" is a bar a third
 * full and a well-stocked shelf fills it. With no level set there is nothing to
 * measure against, and no bar is drawn rather than one that means nothing.
 */
function LevelBar({ product: p }: { product: ShopProduct }) {
  if (!(p.reorderLevel > 0)) return null;
  const s = standing(p);
  const share = Math.max(0, Math.min(1, p.onHand / (p.reorderLevel * 3)));
  return (
    <span className="mt-1.5 block h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-muted">
      <span
        className={`motion-grow-x block h-full rounded-full ${
          s === 'out' ? 'bg-destructive' : s === 'low' ? 'bg-amber-500' : 'bg-primary'
        }`}
        style={{ width: `${Math.max(share * 100, s === 'out' ? 0 : 4)}%` }}
      />
    </span>
  );
}

/**
 * Which lot a row is selling from — its batch number, as printed on the strip.
 * When a search found the item by a batch, that batch, lit up.
 */
function LotTag({ product: p, n }: { product: ShopProduct; n: (v: number | string) => string }) {
  const t = useT();
  if (!p.lot?.batchNo) return null;
  const more = (p.lotCount ?? 1) - 1;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate text-[11px] ${
        p.lot.matched ? 'rounded bg-primary/10 px-1 font-medium text-primary' : 'text-muted-foreground'
      }`}
    >
      <span className="truncate">
        {t('Batch')} <span className="font-mono">{p.lot.batchNo}</span>
      </span>
      {more > 0 && <span className="shrink-0">+{n(more)}</span>}
    </span>
  );
}

function ExpiryPill({ iso, n }: { iso: string | null; n: (v: number | string) => string }) {
  const t = useT();
  if (!iso) return <span className="text-[11px] text-muted-foreground">—</span>;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const tone = days < 0 ? 'danger' : days < 90 ? 'pending' : 'neutral';
  return (
    <span className={`pill shrink-0 whitespace-nowrap !py-0 text-[11px] tabular-nums ${tone}`}>
      {days < 0 ? `${t('Expired')} · ` : ''}
      {n(shortDate(iso))}
    </span>
  );
}

/**
 * The lots behind one row, and the only way to move stock by hand.
 *
 * A count that disagrees with the screen, a crushed strip, something past its
 * date. Every one of them needs a reason, because the unexplained adjustment is
 * the line an owner finds three months later and cannot account for.
 */
/**
 * The code on the pack, against the row it belongs to.
 *
 * It lives inside the item's own dialog rather than on a screen of its own,
 * because giving a shop's list its codes is not a project somebody sits down
 * to do — it happens one item at a time, at the moment somebody has the box in
 * their hand and notices there is no code against it.
 *
 * The field is an ordinary text input on purpose: a scanner is a keyboard. It
 * types the code and presses Enter, which submits the form, which is exactly
 * the behaviour wanted — hold the box under the beam and it is saved.
 */
function Barcode({ product, onSaved }: { product: ShopProduct; onSaved: () => Promise<void> }) {
  const t = useT();
  const { toast } = useToast();
  const [code, setCode] = useState(product.barcode ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = code.trim();
    if (next === (product.barcode ?? '')) return;
    setBusy(true);
    try {
      await shopApi.updateProduct(product._id, { barcode: next });
      toast(next ? 'Code saved.' : 'Code cleared.');
      await onSaved();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      /* The server names the product that already holds the code, which is the
         only useful thing to say here — the person is holding two boxes. */
      toast(res?.data?.message || 'Could not save that code.', 'error');
      setCode(product.barcode ?? '');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="min-w-[12rem] flex-1">
        <label
          className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
          htmlFor="product-barcode"
        >
          <ScanBarcode className="h-3.5 w-3.5" /> {t('Barcode')}
        </label>
        <input
          id="product-barcode"
          className="input h-9"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          data-latin
          placeholder={t('Scan the pack, or type the code')}
          autoComplete="off"
          maxLength={64}
        />
      </div>
      <button type="submit" className="btn h-9" disabled={busy || code.trim() === (product.barcode ?? '')}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
      </button>
    </form>
  );
}

function Batches({
  product,
  racks,
  onClose,
  onChanged,
  onEdited,
  onGone,
}: {
  product: ShopProduct;
  racks: ShopRack[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  /** The row's own fields changed — the dialog's heading follows. */
  onEdited: (p: Partial<ShopProduct>) => void;
  /** Moved to the bin. */
  onGone: () => void;
}) {
  const productId = product._id;
  const t = useT();
  const { num, stop } = useNumerals();
  const { toast } = useToast();
  const [batches, setBatches] = useState<StockBatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState('');
  const [qty, setQty] = useState('');
  const [move, setMove] = useState('damage');
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [binning, setBinning] = useState(false);
  const [view, setView] = useState<'shelf' | 'history' | 'info'>('shelf');

  const bin = async (why: string) => {
    setBusy(true);
    try {
      await shopApi.binIt('product', productId, why);
      toast(`${product.name} ${t('moved to the Recycle Bin')}.`);
      onGone();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      /* The server says how many pieces are still on the shelf, which is the
         answer — write them off first. */
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    setBatches(await shopApi.batches(productId));
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const adjust = async (batchId: string) => {
    const n = Number(qty);
    if (!n) return;
    const batch = batches?.find((b) => b._id === batchId);
    const why = move === 'damage' ? 'Damaged' : move === 'expiry' ? 'Expired' : 'Count was wrong';
    if (
      !(await confirmAction({
        title: t('Take these pieces off stock?'),
        message: `${num(Math.abs(n))} ${t('pieces')} · ${product.name}${batch?.batchNo ? ` (${batch.batchNo})` : ''} · ${t(why)}: ${reason.trim()}${stop} ${t('They leave stock now, and the ledger keeps your name against it.')}`,
        confirmLabel: t('Take them off'),
        tone: 'danger',
        icon: 'warning',
      }))
    )
      return;
    setBusy(true);
    try {
      await shopApi.adjust({ batchId, qtyDelta: -Math.abs(n), move, reason: reason.trim() });
      useAlertStore.getState().refresh();
      toast('Stock adjusted.');
      setAdjusting('');
      setQty('');
      setReason('');
      await load();
      await onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not adjust that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">
              {product.name} {product.strength}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('Soonest expiry first — which is the order a sale takes them in.')}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t('Edit')}
              title={t('Edit')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setBinning(true)}
              disabled={product.onHand > 0}
              aria-label={t('Delete')}
              title={
                product.onHand > 0
                  ? t('Still on the shelf — take it off stock first, so the ledger says where it went')
                  : t('Delete')
              }
              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Barcode product={product} onSaved={onChanged} />

        <div className="seg mb-3">
          {(['shelf', 'history', ...(product.isMedicine ? (['info'] as const) : [])] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className="seg-btn"
            >
              {key === 'shelf' ? t('On the shelf') : key === 'history' ? t('History') : t('Medicine info')}
            </button>
          ))}
        </div>

        {view === 'info' ? (
          <MedicineInfo productId={productId} />
        ) : view === 'history' ? (
          <History productId={productId} />
        ) : !batches ? (
          <LoadingBlock />
        ) : batches.length === 0 ? (
          <div className="empty">
            <PackageX className="h-5 w-5" />
            <p>{t('None of this in stock.')}</p>
            <Link to="/purchases" className="btn btn-ghost h-9">
              <Truck className="h-4 w-4" /> {t('Receive stock')}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>{t('Batch')}</th>
                  <th>{t('Expiry')}</th>
                  <th className="hidden sm:table-cell">{t('Received')}</th>
                  <th className="whitespace-nowrap text-right">{t('Cost / pc')}</th>
                  <th className="whitespace-nowrap text-right">{t('On hand')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b._id}>
                    <td className="whitespace-nowrap font-mono text-xs">{b.batchNo || '—'}</td>
                    <td className={`whitespace-nowrap tabular-nums ${expiryTone(b.expiry)}`}>
                      {shortDate(b.expiry)}
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="tabular-nums">
                        {dayOf(b.purchase?.invoiceDate ?? b.receivedAt ?? null)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {[b.supplier?.name, b.purchase?.invoiceNo && `inv ${b.purchase.invoiceNo}`]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{taka(b.costPerPiece)}</td>
                    <td className="text-right font-semibold tabular-nums">
                      {b.qtyOnHand}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="whitespace-nowrap text-xs font-semibold text-muted-foreground hover:text-foreground"
                        onClick={() => setAdjusting(adjusting === b._id ? '' : b._id)}
                      >
                        {t('Take off')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {adjusting && (
          <div className="mt-4 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[90px_130px_1fr_auto]">
            <input
              className="input h-9"
              inputMode="numeric"
              placeholder={t('Pieces')}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <select className="input h-9" value={move} onChange={(e) => setMove(e.target.value)}>
              <option value="damage">{t('Damaged')}</option>
              <option value="expiry">{t('Expired')}</option>
              <option value="adjustment">{t('Count was wrong')}</option>
            </select>
            <input
              className="input h-9"
              placeholder={t('Why — this is kept')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              className="btn h-9"
              disabled={busy || !qty || reason.trim().length < 2}
              onClick={() => void adjust(adjusting)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Take off')}
            </button>
            <p className="text-[11px] text-muted-foreground sm:col-span-4">
              <TriangleAlert className="mr-1 inline h-3 w-3" />
              {t('It stays in the ledger with your name on it. That is the point.')}
            </p>
          </div>
        )}

        {editing && (
          <EditItem
            product={product}
            racks={racks}
            onClose={() => setEditing(false)}
            onSaved={async (p) => {
              setEditing(false);
              onEdited(p);
              await onChanged();
            }}
          />
        )}

        <ConfirmWithReason
          open={binning}
          title={t('Delete this item')}
          message={t(
            'It goes to the Recycle Bin, not away — every bill and delivery that named it keeps saying so, and you can bring it back whenever you like.',
          )}
          confirmLabel={t('Move it to the Recycle Bin')}
          busy={busy}
          onConfirm={(why) => void bin(why)}
          onCancel={() => setBinning(false)}
        />
    </Modal>
  );
}

/**
 * Correcting an item on the list.
 *
 * Everything the add form asked, except where it came from: a medicine's name
 * is the catalogue's, so the box and the shelf keep spelling it the
 * same, and only something typed in by hand can be renamed. Stock is counted
 * in pieces, so changing the pack size changes how "2 box 3 strip" reads and
 * never how many pieces there are.
 */
function EditItem({
  product,
  racks,
  onClose,
  onSaved,
}: {
  product: ShopProduct;
  racks: ShopRack[];
  onClose: () => void;
  onSaved: (p: Partial<ShopProduct>) => Promise<void>;
}) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: product.name,
    piecesPerStrip: String(product.piecesPerStrip),
    stripsPerBox: String(product.stripsPerBox),
    mrpPerPiece: String(product.mrpPerPiece || ''),
    rackId: product.rack ?? '',
    rackLabel: product.rackLabel ?? '',
    reorderLevel: product.reorderLevel ? String(product.reorderLevel) : '',
    prescriptionOnly: !!product.prescriptionOnly,
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const ready = product.isMedicine || form.name.trim().length > 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = (await shopApi.updateProduct(product._id, {
        ...(product.isMedicine ? {} : { name: form.name.trim() }),
        piecesPerStrip: Number(form.piecesPerStrip) || 1,
        stripsPerBox: Number(form.stripsPerBox) || 1,
        mrpPerPiece: Number(form.mrpPerPiece) || 0,
        /* The same rule as adding: a shelf that exists, or a typed label for a
           shop that has not set its shelves up. */
        ...(racks.length > 0 ? { rackId: form.rackId } : { rackLabel: form.rackLabel.trim() }),
        reorderLevel: Number(form.reorderLevel) || 0,
        prescriptionOnly: form.prescriptionOnly,
      })) as Partial<ShopProduct>;
      toast(t('Saved.'));
      await onSaved(saved);
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = 'mb-1 block text-xs font-semibold text-muted-foreground';

  return (
    <Modal onClose={onClose} className="w-full max-w-lg" z={60}>
      <div className="mb-4">
        <h3 className="mb-0 text-base">{t('Edit this item')}</h3>
        <p className="text-xs text-muted-foreground">
          {product.isMedicine
            ? t('The name comes from the catalogue, so it stays spelled the way the box prints it.')
            : t('Anything typed in by hand can be renamed.')}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className={label} htmlFor="edit-name">
            {t('Name')}
          </label>
          <input
            id="edit-name"
            className="input h-10"
            value={product.isMedicine ? `${product.name} ${product.strength ?? ''}`.trim() : form.name}
            onChange={set('name')}
            disabled={product.isMedicine}
            autoFocus={!product.isMedicine}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="edit-pps">
              {t('Pieces in a strip')}
            </label>
            <input
              id="edit-pps"
              className="input h-10"
              inputMode="numeric"
              value={form.piecesPerStrip}
              onChange={set('piecesPerStrip')}
            />
          </div>
          <div>
            <label className={label} htmlFor="edit-spb">
              {t('Strips in a box')}
            </label>
            <input
              id="edit-spb"
              className="input h-10"
              inputMode="numeric"
              value={form.stripsPerBox}
              onChange={set('stripsPerBox')}
            />
          </div>
          <div>
            <label className={label} htmlFor="edit-mrp">
              {t('MRP per piece')}
            </label>
            <input
              id="edit-mrp"
              className="input h-10"
              inputMode="decimal"
              value={form.mrpPerPiece}
              onChange={set('mrpPerPiece')}
              placeholder="1.20"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="edit-rack">
              {t('Rack')}
            </label>
            {racks.length > 0 ? (
              <select
                id="edit-rack"
                className="input h-10"
                value={form.rackId}
                onChange={(e) => setForm({ ...form, rackId: e.target.value })}
              >
                <option value="">{t('Not placed yet')}</option>
                {racks.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="edit-rack"
                className="input h-10"
                value={form.rackLabel}
                onChange={set('rackLabel')}
                placeholder="R2-A"
              />
            )}
          </div>
          <div>
            <label className={label} htmlFor="edit-reorder">
              {t('Tell me when it drops to')}
            </label>
            <input
              id="edit-reorder"
              className="input h-10"
              inputMode="numeric"
              value={form.reorderLevel}
              onChange={set('reorderLevel')}
              placeholder="100"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.prescriptionOnly}
            onChange={(e) => setForm({ ...form, prescriptionOnly: e.target.checked })}
          />
          {t('Sold only against a prescription')}
        </label>

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || !ready}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}


/**
 * Adding something to the shop's list.
 *
 * From the shared catalogue where it is a medicine — the same list every shop
 * sells from, so a brand is spelled the same on the shelf and on the bill — and
 * typed in by hand where it is not, because every pharmacy here also sells
 * syringes, baby food and soap.
 */
function AddItem({
  onClose,
  onAdded,
  racks,
  initialQ = '',
}: {
  onClose: () => void;
  onAdded: () => void;
  racks: ShopRack[];
  /** A brand to start the search with — one that was just added on request. */
  initialQ?: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [tab, setTab] = useState<'medicine' | 'other'>('medicine');
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<CatalogueMedicine[]>([]);
  /* The text the hits are for, so "nothing found" is only said once the
     search has actually come back, not while it is still on its way. */
  const [searched, setSearched] = useState('');
  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState<CatalogueMedicine | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    piecesPerStrip: '10',
    stripsPerBox: '10',
    mrpPerPiece: '',
    rackId: '',
    rackLabel: '',
    reorderLevel: '',
    barcode: '',
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (tab !== 'medicine' || q.trim().length < 2) {
      setHits([]);
      setSearched('');
      return;
    }
    const t = setTimeout(async () => {
      const asked = q.trim();
      try {
        const res = await shopApi.catalogue(asked);
        setHits(Array.isArray(res) ? res : res.data);
      } catch {
        setHits([]);
      }
      setSearched(asked);
    }, 250);
    return () => clearTimeout(t);
  }, [q, tab]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await shopApi.createProduct({
        medicineId: tab === 'medicine' ? picked?._id : undefined,
        name: tab === 'other' ? form.name.trim() : undefined,
        isMedicine: tab === 'medicine',
        piecesPerStrip: Number(form.piecesPerStrip) || 1,
        stripsPerBox: Number(form.stripsPerBox) || 1,
        mrpPerPiece: Number(form.mrpPerPiece) || 0,
        /* A shelf that exists wins; a typed label is for a shop that has not
           set its shelves up yet; neither is required. */
        rackId: form.rackId || undefined,
        rackLabel: form.rackId ? undefined : form.rackLabel.trim() || undefined,
        reorderLevel: Number(form.reorderLevel) || 0,
        /* Most items are added without one and scanned later, from the item's
           own dialog; this is here for the one being held at the time. */
        barcode: form.barcode.trim() || undefined,
      });
      toast('Added to your list.');
      onAdded();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not add that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const ready = tab === 'medicine' ? !!picked : form.name.trim().length > 1;

  return (
    <>
    {/* Not dismissable while the request form is on top of it, so one Escape
        closes the form and not both. */}
    <Modal onClose={asking ? undefined : onClose} className="w-full max-w-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">{t('Add an item')}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                'A medicine from the catalogue, or anything else you sell. The pieces, batch and expiry come in afterwards, on a delivery under Purchases.',
              )}
            </p>
          </div>
        </div>

        <div className="seg mb-3">
          {(['medicine', 'other'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className="seg-btn"
            >
              {t === 'medicine' ? 'Medicine' : 'Something else'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {tab === 'medicine' ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-q">
                {t('Find it in the catalogue')}
              </label>
              <input
                id="add-q"
                className="input h-10"
                value={picked ? `${picked.brandName} ${picked.strength ?? ''}`.trim() : q}
                onChange={(e) => {
                  setPicked(null);
                  setQ(e.target.value);
                }}
                placeholder="Napa, Seclo, Monas…"
                autoFocus
              />
              {!picked && hits.length > 0 && (
                <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-border">
                  {hits.map((m) => (
                    <button
                      key={m._id}
                      type="button"
                      className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                      onClick={() => {
                        setPicked(m);
                        setHits([]);
                      }}
                    >
                      <span className="font-semibold">{m.brandName}</span>{' '}
                      <span className="text-muted-foreground">{m.strength}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {m.genericName}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-muted"
                    onClick={() => setAsking(true)}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
                    {t('Can’t find it? Ask us to add it')}
                  </button>
                </div>
              )}
              {/* Nothing in the catalogue by that name: the way on is to ask
                  for it, so it is spelled once for every shop — or, for what
                  is not a medicine at all, the other tab. */}
              {!picked && hits.length === 0 && searched !== '' && searched === q.trim() && (
                <div className="mt-1 rounded-lg border border-dashed border-border px-3 py-3 text-sm">
                  <p className="text-muted-foreground">{t('Nothing in the catalogue by that name.')}</p>
                  <button
                    type="button"
                    className="btn btn-ghost mt-2 h-9 w-full justify-center text-primary sm:w-auto"
                    onClick={() => setAsking(true)}
                  >
                    <MessageSquarePlus className="h-4 w-4" /> {t('Can’t find it? Ask us to add it')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-name">
                {t('What is it called?')}
              </label>
              <input
                id="add-name"
                className="input h-10"
                value={form.name}
                onChange={set('name')}
                placeholder={t('Syringe 5ml · Baby food · Savlon')}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-pps">
                {t('Pieces in a strip')}
              </label>
              <input
                id="add-pps"
                className="input h-10"
                inputMode="numeric"
                value={form.piecesPerStrip}
                onChange={set('piecesPerStrip')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-spb">
                {t('Strips in a box')}
              </label>
              <input
                id="add-spb"
                className="input h-10"
                inputMode="numeric"
                value={form.stripsPerBox}
                onChange={set('stripsPerBox')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-mrp">
                {t('MRP per piece')}
              </label>
              <input
                id="add-mrp"
                className="input h-10"
                inputMode="decimal"
                value={form.mrpPerPiece}
                onChange={set('mrpPerPiece')}
                placeholder="1.20"
              />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground">
            A bottle or a tube is 1 and 1 — one rule for everything, so nothing is a special case.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-rack">
                {t('Rack')}
              </label>
              {racks.length > 0 ? (
                <select
                  id="add-rack"
                  className="input h-10"
                  value={form.rackId}
                  onChange={(e) => setForm({ ...form, rackId: e.target.value })}
                >
                  <option value="">{t('Work it out from the rules')}</option>
                  {racks.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="add-rack"
                  className="input h-10"
                  value={form.rackLabel}
                  onChange={set('rackLabel')}
                  placeholder="R2-A"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="add-reorder">
                {t('Tell me when it drops to')}
              </label>
              <input
                id="add-reorder"
                className="input h-10"
                inputMode="numeric"
                value={form.reorderLevel}
                onChange={set('reorderLevel')}
                placeholder="100"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
                htmlFor="add-barcode"
              >
                <ScanBarcode className="h-3.5 w-3.5" /> {t('Barcode')}
              </label>
              <input
                id="add-barcode"
                className="input h-10"
                value={form.barcode}
                onChange={set('barcode')}
                data-latin
                placeholder={t('Scan the pack, or type the code')}
                autoComplete="off"
                maxLength={64}
              />
            </div>
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn" disabled={busy || !ready}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add item
            </button>
          </div>
        </form>
    </Modal>
    {asking && <AskForMedicine initialBrand={q} onClose={() => setAsking(false)} />}
    </>
  );
}
