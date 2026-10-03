import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCan } from '../access';
import { useLinkedSearch } from '../components/useLinkedSearch';
import {
  ReceiptText,
  Search,
  Loader2,
  CloudOff,
  CalendarDays,
  ShoppingCart,
  Banknote,
  Clock,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import {
  tillApi,
  settingsApi,
  taka,
  type BillPage,
  type BillRow,
  type Sale,
  type ShopSettings,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { toLocalDate } from '@dawai/shared/lib/date';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import Pager from '../components/Pager';
import ExportCsv from '../components/ExportCsv';
import Receipt from '../components/Receipt';
import BillDetail from '../components/BillDetail';

/**
 * The sales register.
 *
 * Every shop keeps one, on paper, and it is opened for exactly three reasons:
 * somebody is standing there with a slip, somebody wants to know what a day
 * came to, or somebody is arguing about whether a bill was paid. The screen is
 * built around those three and nothing else.
 *
 * - **The bill number is the way in.** It is what the customer reads out, and
 *   they read out "forty two", not "thirteen dash zero zero four two" — so the
 *   search matches any part of it, and the name and the phone besides.
 * - **The totals are for the range, not the page.** A month means the month's
 *   figure. A total that adds up only what is on screen is a wrong number
 *   wearing a right one's clothes.
 * - **A salesman sees their own.** The server decides that, not this file; the
 *   screen simply does not offer the choice to somebody who does not have it.
 */

const TAKA_METHODS: Record<string, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'Card',
  bank: 'Bank',
  due: 'On account',
};

/**
 * `YYYY-MM-DD` for an offset in days from today, which is what the API takes.
 *
 * Through `toLocalDate`, never `toISOString().slice(0, 10)`: that reports the
 * *UTC* date, so between midnight and 6am in Dhaka the register opened on
 * yesterday — a bill rung up at 1am was sold "today" by the server and looked
 * for on the wrong day by the screen, which reads exactly like a sale that
 * never saved.
 */
const dayOf = (back = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return toLocalDate(d);
};

const RANGES = [
  { key: 'today', label: 'Today', from: () => dayOf(0), to: () => dayOf(0) },
  { key: 'yesterday', label: 'Yesterday', from: () => dayOf(1), to: () => dayOf(1) },
  { key: 'week', label: 'Last 7 days', from: () => dayOf(6), to: () => dayOf(0) },
  { key: 'month', label: 'Last 30 days', from: () => dayOf(29), to: () => dayOf(0) },
] as const;

export default function Sales() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const can = useCan();
  /* Everybody's bills, the export and the margin: three permissions, not one role. */
  const runsTheShop = can('sales.view_all');
  const canExport = can('data.export');
  const canSeeCost = can('reports.view');

  /* A bill can be linked to from anywhere — the baki khata does it — and a
     number arriving that way is looked for across a month rather than today,
     because the bill being asked about is rarely this morning's. */
  const [params] = useSearchParams();
  const linked = params.get('q') ?? '';

  const [from, setFrom] = useState(linked ? dayOf(29) : dayOf(0));
  const [to, setTo] = useState(dayOf(0));
  const [q, setQ] = useState(linked);
  useLinkedSearch(setQ);
  const [only, setOnly] = useState<'' | 'due' | 'returned'>('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<BillPage | null>(null);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState<Sale | null>(null);
  const [opening, setOpening] = useState(false);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [printing, setPrinting] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await tillApi.bills({
          from,
          to,
          q: q.trim() || undefined,
          mine: mine || undefined,
          only: only || undefined,
          page,
        }),
      );
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the bills.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, q, mine, only, page, toast]);

  /* Typing in the search box should not fire a request per keystroke. */
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => undefined);
  }, []);

  const activeRange = useMemo(
    () => RANGES.find((r) => r.from() === from && r.to() === to)?.key ?? '',
    [from, to],
  );

  const pick = (r: (typeof RANGES)[number]) => {
    setFrom(r.from());
    setTo(r.to());
    setPage(1);
  };

  const openBill = async (row: BillRow) => {
    setOpening(true);
    try {
      setOpen(await tillApi.sale(row._id));
    } catch {
      toast(t('Could not open that bill.'), 'error');
    } finally {
      setOpening(false);
    }
  };

  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const money = (v: number) => n(taka(v));
  const average = data && data.count > 0 ? data.totals.total / data.count : 0;

  const WHICH: { key: '' | 'due' | 'returned'; label: string }[] = [
    { key: '', label: 'Every bill' },
    { key: 'due', label: 'Still owed on' },
    { key: 'returned', label: 'Taken back' },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" /> {t('Sales')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Every bill, and the one somebody is holding.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runsTheShop && (
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => {
                setMine((v) => !v);
                setPage(1);
              }}
              className="btn-toggle"
            >
              <UserRound className="h-3.5 w-3.5" /> {t('Only mine')}
            </button>
          )}
          {canExport && (
            <ExportCsv what="sales" params={{ from, to }} label="Export the register" />
          )}
        </div>
      </div>

      {/* ------------------------------------------------ when, and which -- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={activeRange === r.key}
              onClick={() => pick(r)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeRange === r.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            aria-label={t('From')}
            className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`}
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <span className="text-sm text-muted-foreground">{t('to')}</span>
          <input
            type="date"
            aria-label={t('To')}
            className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`}
            value={to}
            min={from}
            max={dayOf(0)}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </span>
      </div>

      {/* -------------------------------------------------------- the totals -- */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={ShoppingCart}
          tone="bg-primary/10 text-primary"
          /* The bills as rung up — beside what was taken for them — with what
             came back off them said underneath; the profit is net of it. */
          value={data ? money(data.totals.total) : '—'}
          label={t('Sold')}
          sub={
            data
              ? `${n(data.count)} ${t(data.count === 1 ? 'bill' : 'bills')}${
                  (data.totals.returned ?? 0) > 0 ? ` · ${money(data.totals.returned ?? 0)} ${t('taken back')}` : ''
                }`
              : ''
          }
        />
        <Tile
          icon={Banknote}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          value={data ? money(data.totals.paid) : '—'}
          label={t('Taken')}
          sub={t('cash, bKash, card — what came in')}
        />
        <Tile
          icon={Clock}
          tone="bg-destructive/10 text-destructive"
          value={data ? money(data.totals.due) : '—'}
          label={t('On account')}
          sub={t('put on the baki khata on these bills')}
          bad={!!data && data.totals.due > 0}
          active={only === 'due'}
          onClick={() => {
            setOnly((v) => (v === 'due' ? '' : 'due'));
            setPage(1);
          }}
        />
        {data?.totals.margin !== undefined ? (
          <Tile
            icon={TrendingUp}
            tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            value={money(data.totals.margin)}
            label={t('Profit')}
            sub={
              data.totals.total - (data.totals.returned ?? 0) > 0
                ? `${n(Math.round((data.totals.margin / (data.totals.total - (data.totals.returned ?? 0))) * 100))}% ${t('of what was sold')}`
                : t('of what was sold')
            }
          />
        ) : (
          <Tile
            icon={TrendingUp}
            tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            value={money(average)}
            label={t('Average bill')}
            sub={t('what one customer spends')}
          />
        )}
      </div>

      {/* How the money came in — the evening's count starts here. */}
      {data && data.byMethod && data.byMethod.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">{t('How it came in')}:</span>
          {data.byMethod.map((m) => (
            <span
              key={m.method}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1"
            >
              <span className={`h-2 w-2 rounded-full ${METHOD_DOT[m.method] ?? 'bg-muted-foreground'}`} />
              <span className="font-semibold">{t(TAKA_METHODS[m.method] ?? m.method)}</span>
              <span className="tabular-nums text-muted-foreground">{money(m.amount)}</span>
            </span>
          ))}
        </div>
      )}

      {/* ------------------------------------------------- find and filter -- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {WHICH.map((w) => (
            <button
              key={w.key || 'all'}
              type="button"
              role="tab"
              aria-selected={only === w.key}
              onClick={() => {
                setOnly(w.key);
                setPage(1);
              }}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                only === w.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(w.label)}
            </button>
          ))}
        </div>
        <label className="relative block w-full sm:ml-auto sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-9 pl-9"
            placeholder={t('Bill number, name, or phone — try 0042')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label={t('Search')}
          />
        </label>
      </div>

      {/* --------------------------------------------------------- the bills -- */}
      {loading && !data ? (
        <LoadingBlock />
      ) : !data || data.sales.length === 0 ? (
        <div className="card mt-4">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ReceiptText className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('No bills in that stretch.')}</p>
            <p className="max-w-md">
              {t(
                'Widen the dates, or clear the search. A bill number reads as the day and a serial — 13-0042 — and you can search on either half.',
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className={`card mt-4 p-0 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* A phone gets a card per bill: six columns across 390px is a table
              you scroll sideways to read one row of. */}
          <ul className="divide-y divide-border sm:hidden">
            {data.sales.map((s) => (
              <li key={s._id}>
                <button
                  type="button"
                  onClick={() => void openBill(s)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <BillBadge sale={s} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{s.billNo}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{money(s.total)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {n(when(s.soldAt))} · {s.customerName || t('Walk-in')}
                      </span>
                      <BillState sale={s} money={money} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th className="pl-4">{t('Bill')}</th>
                  <th className="hidden md:table-cell">{t('Customer')}</th>
                  <th className="hidden lg:table-cell">{t('Sold by')}</th>
                  <th>{t('How paid')}</th>
                  <th className="text-right">{t('Total')}</th>
                  <th className="pr-4 text-right">{t('State')}</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr
                    key={s._id}
                    tabIndex={0}
                    role="button"
                    onClick={() => void openBill(s)}
                    onKeyDown={(e) => e.key === 'Enter' && void openBill(s)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="pl-4 pr-3">
                      <div className="flex items-center gap-3">
                        <BillBadge sale={s} />
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold">{s.billNo}</span>
                            {s.wasOffline && (
                              <CloudOff
                                className="h-3.5 w-3.5 text-muted-foreground"
                                aria-label={t('Rung up while the line was down')}
                              />
                            )}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {n(when(s.soldAt))} · {n(s.items)} {t(s.items === 1 ? 'item' : 'items')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      {s.customerName ? (
                        <>
                          <span className="font-medium">{s.customerName}</span>
                          {s.customerPhone && (
                            <span className="block text-[11px] tabular-nums text-muted-foreground">
                              {s.customerPhone}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t('Walk-in')}</span>
                      )}
                    </td>
                    <td className="hidden text-muted-foreground lg:table-cell">{s.salesmanName}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {s.methods.length ? (
                          s.methods.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${METHOD_DOT[m] ?? 'bg-muted-foreground'}`} />
                              {t(TAKA_METHODS[m] ?? m)}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </td>
                    <td className="text-right font-semibold tabular-nums">{money(s.total)}</td>
                    <td className="pr-4 text-right">
                      <BillState sale={s} money={money} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pager
            page={data.page}
            pageSize={data.limit ?? 50}
            total={data.count}
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

      {open && (
        <BillDetail
          sale={open}
          canSeeCost={canSeeCost}
          onClose={() => setOpen(null)}
          onPrint={() => setPrinting(open)}
          /* Correcting and cancelling live on the register, where somebody is
             looking at the bill rather than standing at the counter. */
          onChanged={(next) => {
            setOpen(next);
            void load();
          }}
        />
      )}

      {printing && settings && (
        <Receipt
          sale={printing}
          settings={{ ...settings, shopName: settings.shopName }}
          onDone={() => setPrinting(null)}
        />
      )}
    </div>
  );
}

/* One colour per way of paying, the same in the chips and in each row. */
const METHOD_DOT: Record<string, string> = {
  cash: 'bg-emerald-500',
  bkash: 'bg-pink-500',
  nagad: 'bg-orange-500',
  rocket: 'bg-violet-500',
  card: 'bg-sky-500',
  bank: 'bg-slate-500',
};

/** The receipt beside a bill, tinted by how it stands. */
function BillBadge({ sale: s }: { sale: BillRow }) {
  const tone =
    s.status === 'void'
      ? 'bg-muted text-muted-foreground'
      : s.status === 'returned'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : s.due > 0
          ? 'bg-destructive/10 text-destructive'
          : 'bg-primary/10 text-primary';
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden="true">
      <ReceiptText className="h-4 w-4" />
    </span>
  );
}

/** Paid, owed, taken back or cancelled — the one word a row needs. */
function BillState({ sale: s, money }: { sale: BillRow; money: (v: number) => string }) {
  const t = useT();
  if (s.status === 'void') return <span className="pill neutral shrink-0">{t('Cancelled')}</span>;
  if (s.status === 'returned') return <span className="pill pending shrink-0">{t('taken back')}</span>;
  if (s.due > 0) {
    return (
      <span className="pill danger shrink-0 tabular-nums">
        {money(s.due)} {t('due')}
      </span>
    );
  }
  return <span className="pill success shrink-0">{t('Paid')}</span>;
}

/** One tile: label and icon, figure, a line under it — the same on all four. */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
  sub,
  bad,
  active,
  onClick,
}: {
  icon: typeof ReceiptText;
  tone: string;
  value: string;
  label: string;
  sub: string;
  bad?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex w-full items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className={`value mt-1 stat-fit [--fit-max:24px] ${bad ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        {sub}
      </div>
    </>
  );
  const cls = `stat flex h-full min-h-[132px] flex-col text-left ${
    active ? 'border-primary ring-2 ring-primary/20' : ''
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-primary/45`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
