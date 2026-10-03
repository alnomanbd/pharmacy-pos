import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TrendingView from '../components/TrendingView';
import { useCan } from '../access';
import {
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  PackageX,
  TriangleAlert,
  FileDown,
  Wallet,
  ShoppingCart,
  Truck,
  Clock,
  Coins,
  HandCoins,
  Building2,
  ReceiptText,
  CalendarX2,
  CalendarClock,
  ClipboardList,
  ArrowRight,
  CalendarDays,
  Receipt,
  Table2,
  Trophy,
  PiggyBank,
} from 'lucide-react';
import {
  tillApi,
  shopApi,
  taka,
  openPdf,
  EXPENSE_CATEGORY_LABEL,
  type BookRow,
  type OwnerReport,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { toLocalDate } from '@dawai/shared/lib/date';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { CountUp, Rise, useSeen } from '../components/motion';

/**
 * Two questions, and they are not the same question.
 *
 * **Today** is the closing-time question: what came in, in what form, and who
 * still owes me. It gets read every evening while the shutter is coming down,
 * which is why it is first and why it is small.
 *
 * **The stretch** is the question an owner asks once a month sitting down: is
 * this month better than last, which shelf earns its space, which company is
 * worth the credit, and what has been sitting there since it was delivered.
 * Every figure on it is shown against the same number of days immediately
 * before, because a number with nothing beside it cannot be good or bad.
 *
 * The margin is on both because this page is the owner's; a salesman's own day
 * is on the POS itself, and the server refuses them the shop-wide figure rather
 * than trusting this screen to hide it.
 */

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

export const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'Card',
  bank: 'Bank',
  due: 'On account',
};

/* The same dot per way of paying as on the Sales page and the POS. */
const METHOD_DOT: Record<string, string> = {
  cash: 'bg-emerald-500',
  bkash: 'bg-pink-500',
  nagad: 'bg-orange-500',
  rocket: 'bg-violet-500',
  card: 'bg-sky-500',
  bank: 'bg-slate-500',
};

/** The shop's own calendar day, not the UTC one. See Sales.tsx. */
export const dayOf = (back = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return toLocalDate(d);
};

const RANGES = [
  /* The calendar's runs first — "this week" and "this month" are how an owner
     talks about the time, and Monday-to-now and the 1st-to-now are those runs
     as the ledger keeps them. The rolling stretches follow for the question
     "how have the last N days gone". */
  { key: 'thisweek', label: 'This week', from: () => dayOf((new Date().getDay() + 6) % 7), to: () => dayOf(0) },
  {
    key: 'thismonth',
    label: 'This month',
    from: () => toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    to: () => dayOf(0),
  },
  { key: 'week', label: 'Last 7 days', from: () => dayOf(6), to: () => dayOf(0) },
  { key: 'month', label: 'Last 30 days', from: () => dayOf(29), to: () => dayOf(0) },
  { key: 'quarter', label: 'Last 90 days', from: () => dayOf(89), to: () => dayOf(0) },
] as const;

export const shortDay = (key: string) =>
  new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });

/** Figures in the reader's digits; bill numbers and dates as the paper reads them. */
export function useNumbers() {
  const lang = useUiLang();
  return useMemo(() => {
    const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
    return { n, money: (v: number) => n(taka(v)) };
  }, [lang]);
}

export default function ShopReports() {
  const [tab, setTab] = useState<'today' | 'stretch' | 'trending'>('today');
  const t = useT();
  /* A salesman gets the counter's day — no cost, no margin, no companies —
     and not the stretch, which is the owner's sit-down question. */
  const backRoom = useCan()('reports.view');

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> {t('Reports')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'today'
              ? t('What came in today, and who still owes what.')
              : tab === 'trending'
                ? t('Which medicines are selling more, less, or not at all.')
                : t('This stretch against the one before it.')}
          </p>
        </div>
        {backRoom && (
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              ['today', 'Today'],
              ['stretch', 'The stretch'],
              ['trending', 'Trending'],
            ]}
          />
        )}
      </div>

      {tab === 'today' || !backRoom ? <TodayView backRoom={backRoom} /> : tab === 'trending' ? <TrendingView /> : <StretchView />}
    </div>
  );
}

/* ------------------------------------------------------------------ today -- */

/** How many of today's bills the page shows before sending you to the register. */
const TODAY_BILLS = 12;

function TodayView({ backRoom }: { backRoom: boolean }) {
  const t = useT();
  const { n, money } = useNumbers();
  const { toast } = useToast();
  const [day, setDay] = useState<Awaited<ReturnType<typeof tillApi.day>> | null>(null);
  /* The khata from its own paged endpoint: the whole book's figure, and the
     few who owe most — the till's name list stops at a hundred people. */
  const [owing, setOwing] = useState<BookRow[]>([]);
  const [book, setBook] = useState({ owing: 0, owed: 0 });
  const [owed, setOwed] = useState(0);
  const [cameIn, setCameIn] = useState({ count: 0, value: 0, pieces: 0 });
  const [attention, setAttention] = useState<Awaited<ReturnType<typeof shopApi.attention>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const langTag = useUiLangTag();

  const load = useCallback(async () => {
    try {
      const [d, khata, suppliers, needs, today] = await Promise.all([
        tillApi.day(true),
        tillApi.customerBook({ show: 'owing', sort: 'owed', limit: 8 }),
        /* A salesman is refused the companies, and should still get their day
           rather than an error page. */
        backRoom ? shopApi.suppliers().catch(() => []) : Promise.resolve([]),
        backRoom ? shopApi.attention().catch(() => null) : Promise.resolve(null),
        backRoom
          ? shopApi.todayReport().catch(() => ({ dayKey: '', cameIn: { count: 0, value: 0, pieces: 0 } }))
          : Promise.resolve({ dayKey: '', cameIn: { count: 0, value: 0, pieces: 0 } }),
      ]);
      setDay(d);
      setOwing(khata.data);
      setBook({ owing: khata.summary.owing, owed: khata.summary.owed });
      setOwed(suppliers.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0));
      setAttention(needs);
      setCameIn(today.cameIn);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load the figures.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, backRoom]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock />;

  const methods = Object.entries(day?.byMethod ?? {}).sort((a, b) => b[1] - a[1]);
  const takenTotal = methods.reduce((sum, [, v]) => sum + v, 0);
  const most = Math.max(1, ...methods.map(([, v]) => v), day?.due ?? 0);
  const bills = day?.sales ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          {new Date().toLocaleDateString(langTag, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <button
          type="button"
          className="btn btn-ghost h-9"
          onClick={() => {
            openPdf('/shop/reports/today.pdf').catch(() => toast('Could not open the sheet.', 'error'));
          }}
        >
          <FileDown className="h-4 w-4" /> {t('PDF')}
        </button>
      </div>

      {/* ---- six tiles, one shape ---- */}
      <div className={`grid grid-cols-2 gap-3 ${backRoom ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-3'}`}>
        <Tile
          icon={ShoppingCart}
          tone="bg-primary/10 text-primary"
          label={t('Sold today')}
          value={money(day?.total ?? 0)}
            amount={day?.total ?? 0}
          sub={`${n(day?.count ?? 0)} ${t('bills')}${
            (day?.returned ?? 0) > 0 ? ` · ${money(day?.returned ?? 0)} ${t('taken back')}` : ''
          }`}
        />
        {backRoom && (
        <Tile
            icon={Coins}
            tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            label={t('Margin')}
            value={money(day?.margin ?? 0)}
            amount={day?.margin ?? 0}
            sub={t('after what the stock cost')}
          />
        )}
        <Tile
          icon={Clock}
          tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          label={t('On account today')}
          value={money(day?.due ?? 0)}
            amount={day?.due ?? 0}
          sub={t('left on the khata')}
        />
        {backRoom && (
        <Tile
            icon={Truck}
            tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
            label={t('Came in today')}
            value={money(cameIn.value)}
            amount={cameIn.value}
            sub={`${n(cameIn.count)} ${t('deliveries')}`}
          />
        )}
        <Tile
          icon={HandCoins}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          label={t('Owed to you')}
          value={money(book.owed)}
            amount={book.owed}
          sub={`${n(book.owing)} ${t('on the baki khata')}`}
        />
        {backRoom && (
        <Tile
            icon={Building2}
            tone="bg-destructive/10 text-destructive"
            label={t('You owe')}
            value={money(owed)}
            amount={owed}
            sub={t('to the companies')}
            bad={owed > 0}
          />
        )}
      </div>

      {attention && <Attention needs={attention} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card mb-0 min-w-0">
            <h3>
              <Wallet className="h-4 w-4" /> {t('How it was paid')}
            </h3>
            {methods.length === 0 && !(day?.due ?? 0) ? (
              <div className="empty">{t('Nothing sold yet today.')}</div>
            ) : (
              <ul className="flex flex-col gap-3">
                {methods.map(([method, amount]) => (
                  <MethodRow
                    key={method}
                    dot={METHOD_DOT[method] ?? 'bg-muted-foreground'}
                    label={t(METHOD_LABEL[method] ?? method)}
                    value={money(amount)}
                    share={amount / most}
                    note={takenTotal > 0 ? `${n(Math.round((amount / takenTotal) * 100))}%` : ''}
                  />
                ))}
                {(day?.due ?? 0) > 0 && (
                  <MethodRow
                    dot="bg-destructive"
                    label={t('Left on account today')}
                    value={money(day!.due)}
                    share={day!.due / most}
                    note=""
                    muted
                  />
                )}
              </ul>
            )}
          </div>

          {owing.length > 0 && (
            <div className="card mb-0 min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="mb-0">
                  <Users className="h-4 w-4" /> {t('Baki khata')}
                </h3>
                <Link to="/customers" className="text-xs font-semibold text-primary hover:underline">
                  {t('Open')} <ArrowRight className="inline h-3 w-3" />
                </Link>
              </div>
              <ul className="flex flex-col">
                {owing.map((c) => (
                  <li
                    key={c._id}
                    className="flex items-center gap-3 border-t border-border py-2 text-sm first:border-t-0 first:pt-0"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-[11px] font-bold text-destructive">
                      {c.name.replace(/\(.*?\)/g, '').trim().slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      {c.phone && (
                        <span className="block text-[11px] tabular-nums text-muted-foreground">{c.phone}</span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums text-destructive">{money(c.balance)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card mb-0 min-w-0 p-0">
          <div className="flex items-center justify-between gap-2 px-5 pt-5">
            <h3 className="mb-0">
              <ReceiptText className="h-4 w-4" /> {t('Today’s bills')}
              <span className="font-normal text-muted-foreground">({n(day?.count ?? bills.length)})</span>
            </h3>
            <Link to="/sales" className="text-xs font-semibold text-primary hover:underline">
              {t('All in Sales')} <ArrowRight className="inline h-3 w-3" />
            </Link>
          </div>
          {bills.length === 0 ? (
            <div className="empty py-10">{t('Nothing sold yet today.')}</div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th className="pl-5">{t('Bill')}</th>
                    <th>{t('Time')}</th>
                    <th className="hidden sm:table-cell">{t('Sold by')}</th>
                    <th>{t('Customer')}</th>
                    <th className="pr-5 text-right">{t('Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.slice(0, TODAY_BILLS).map((s) => (
                    <tr key={s._id}>
                      <td className="pl-5 font-mono text-xs font-semibold">{s.billNo}</td>
                      <td className="whitespace-nowrap tabular-nums text-muted-foreground">{n(time(s.soldAt))}</td>
                      <td className="hidden text-muted-foreground sm:table-cell">{s.salesmanName}</td>
                      <td>
                        {s.customerName || <span className="text-muted-foreground">{t('Walk-in')}</span>}
                        {s.due > 0 && (
                          <span className="pill danger ml-1.5 !py-0 text-[10px]">
                            {money(s.due)} {t('due')}
                          </span>
                        )}
                      </td>
                      <td className="pr-5 text-right font-semibold tabular-nums">
                        {money(s.total)}
                        {s.status === 'returned' && (
                          <span className="block text-[11px] font-normal text-destructive">{t('returned')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(day?.count ?? bills.length) > TODAY_BILLS && (
                <Link
                  to="/sales"
                  className="block border-t border-border px-5 py-3 text-center text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  +{n((day?.count ?? bills.length) - TODAY_BILLS)} {t('more — see them all in Sales')}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** The locale to write today's date in, so Bangla reads as Bangla. */
function useUiLangTag() {
  return useUiLang() === 'bn' ? 'bn-BD' : 'en-GB';
}

function MethodRow({
  dot,
  label,
  value,
  share,
  note,
  muted = false,
}: {
  dot: string;
  label: string;
  value: string;
  share: number;
  note: string;
  muted?: boolean;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={`flex items-center gap-2 ${muted ? 'text-muted-foreground' : 'font-medium'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
          {label}
          {note && <span className="text-[11px] font-normal text-muted-foreground">{note}</span>}
        </span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      {/* One hue for every bar: the dot carries which method it is, the bar
          only how much. */}
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`motion-grow-x h-full rounded-full ${muted ? 'bg-destructive/60' : 'bg-primary'}`}
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
      </div>
    </li>
  );
}

/**
 * The five things that get worse while nobody is looking.
 *
 * Each already had a screen, and a screen only tells somebody who goes to look
 * — so stock goes out of date on a shelf nobody opens and an order given to a
 * rep is never chased. They sit here, on the page an owner opens every evening
 * anyway, as cards that link to the screen that can do something about them.
 *
 * A card that has nothing to say is not shown at all. A dashboard of five
 * permanent zeroes is a dashboard people stop reading, and then the one that is
 * not a zero goes unread with it.
 */
export function Attention({ needs }: { needs: NonNullable<Awaited<ReturnType<typeof shopApi.attention>>> }) {
  const t = useT();
  const { n, money } = useNumbers();

  const rows = [
    needs.expired.batches > 0 && {
      key: 'expired',
      to: '/expiry',
      icon: CalendarX2,
      figure: n(needs.expired.batches),
      text: t(needs.expired.batches === 1 ? 'lot past its date' : 'lots past their date'),
      sub: `${money(needs.expired.value)} ${t('at cost')}`,
      tone: 'danger' as const,
    },
    needs.expiringSoon.batches > 0 && {
      key: 'soon',
      to: '/expiry',
      icon: CalendarClock,
      figure: n(needs.expiringSoon.batches),
      text: t('lots go out of date soon'),
      sub: `${t('within')} ${n(needs.expiringSoon.days)} ${t('days')} · ${money(needs.expiringSoon.value)}`,
      tone: 'warn' as const,
    },
    needs.toReorder > 0 && {
      key: 'reorder',
      to: '/stock',
      icon: TrendingDown,
      figure: n(needs.toReorder),
      text: t(needs.toReorder === 1 ? 'item to reorder' : 'items to reorder'),
      sub: t('at or below the level you set'),
      tone: 'warn' as const,
    },
    needs.ordersWaiting > 0 && {
      key: 'orders',
      to: '/orders',
      icon: ClipboardList,
      figure: n(needs.ordersWaiting),
      text: t(needs.ordersWaiting === 1 ? 'order not come in' : 'orders not come in'),
      sub: t('written or with the rep'),
      tone: 'calm' as const,
    },
    needs.khata.customers > 0 && {
      key: 'khata',
      to: '/customers',
      icon: Users,
      figure: money(needs.khata.owed),
      text: t('out on the baki khata'),
      sub: `${n(needs.khata.customers)} ${t('people owe')}`,
      tone: 'calm' as const,
    },
  ].filter(Boolean) as {
    key: string;
    to: string;
    icon: typeof Users;
    figure: string;
    text: string;
    sub: string;
    tone: 'danger' | 'warn' | 'calm';
  }[];

  if (rows.length === 0) return null;

  const TONE = {
    danger: 'border-destructive/30 bg-destructive/5 [&_.ico]:bg-destructive/10 [&_.ico]:text-destructive',
    warn: 'border-amber-500/30 bg-amber-500/5 [&_.ico]:bg-amber-500/15 [&_.ico]:text-amber-600 dark:[&_.ico]:text-amber-400',
    calm: 'border-border bg-card [&_.ico]:bg-primary/10 [&_.ico]:text-primary',
  };

  return (
    <div className="mt-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <TriangleAlert className="h-4 w-4" /> {t('Worth a look')}
      </h3>
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((r) => (
          <Link
            key={r.key}
            to={r.to}
            className={`group flex h-full items-start gap-3 rounded-[var(--radius)] border p-3.5 transition-shadow hover:shadow-md ${TONE[r.tone]}`}
          >
            <span className="ico grid h-9 w-9 shrink-0 place-items-center rounded-xl">
              <r.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold leading-tight tabular-nums">{r.figure}</span>
              <span className="block text-xs font-medium">{r.text}</span>
              <span className="line-clamp-2 block text-[11px] text-muted-foreground">{r.sub}</span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- stretch -- */

function StretchView() {
  const t = useT();
  const { n, money } = useNumbers();
  const { toast } = useToast();
  const [from, setFrom] = useState(dayOf(29));
  const [to, setTo] = useState(dayOf(0));
  const [report, setReport] = useState<OwnerReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await shopApi.ownerReport({ from, to }));
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load the figures.', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRange = useMemo(
    () => RANGES.find((r) => r.from() === from && r.to() === to)?.key ?? '',
    [from, to],
  );

  const topMargin = Math.max(1, ...(report?.topProducts ?? []).map((p) => p.margin));
  const spent = report?.expenseCategories.reduce((sum, e) => sum + e.amount, 0) ?? 0;

  return (
    <>
      {/* ---- when ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={activeRange === r.key}
              onClick={() => {
                setFrom(r.from());
                setTo(r.to());
              }}
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
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">{t('to')}</span>
          <input
            type="date"
            aria-label={t('To')}
            className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`}
            value={to}
            min={from}
            max={dayOf(0)}
            onChange={(e) => setTo(e.target.value)}
          />
        </span>
        <button
          type="button"
          className="btn btn-ghost h-9 sm:ml-auto"
          onClick={() => {
            openPdf(`/shop/reports/owner.pdf?from=${from}&to=${to}`).catch(() =>
              toast('Could not open the sheet.', 'error'),
            );
          }}
        >
          <FileDown className="h-4 w-4" /> {t('PDF')}
        </button>
      </div>
      {report && (
        <p className="mt-2 text-xs text-muted-foreground">
          {n(report.range.days)} {t('days')} · {t('against')} {n(shortDay(report.range.previousFrom))} —{' '}
          {n(shortDay(report.range.previousTo))}, {t('the same number of days before it.')}
        </p>
      )}

      {loading || !report ? (
        <LoadingBlock />
      ) : (
        <>
          {/* ---- the headline: what was kept ---- */}
          <Rise
            className={`relative mt-4 flex flex-wrap items-center gap-4 overflow-hidden rounded-[var(--radius)] border p-5 sm:p-6 ${
              report.now.net >= 0
                ? 'border-primary/30 bg-gradient-to-br from-primary/[0.12] via-primary/[0.05] to-transparent'
                : 'border-destructive/30 bg-destructive/5'
            }`}
          >
            <Sparkline rows={report.byDay} negative={report.now.net < 0} />
            {/* Positioned, so they sit over the line drawn behind them. */}
            <span
              className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                report.now.net >= 0 ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'
              }`}
            >
              <PiggyBank className="h-6 w-6" />
            </span>
            <div className="relative min-w-0 flex-1">
              <div className="eyebrow">{t('Net profit')}</div>
              <div
                className={`text-3xl font-semibold tabular-nums sm:text-4xl ${
                  report.now.net >= 0 ? 'text-primary' : 'text-destructive'
                }`}
              >
                <CountUp value={report.now.net} format={money} duration={1200} />
              </div>
              <div className="text-xs text-muted-foreground">
                {`${money(report.now.margin)} ${t('margin')}`}
                {(report.now.otherIncome ?? 0) > 0 && ` + ${money(report.now.otherIncome ?? 0)} ${t('other income')}`}
                {report.now.expenses > 0
                  ? ` − ${money(report.now.expenses)} ${t('spent on the shop')}`
                  : ` — ${t('no spending recorded')}`}
              </div>
            </div>
            <div className="relative">
              <Delta now={report.now.net} before={report.before.net} money={money} n={n} />
            </div>
          </Rise>

          {/* ---- six figures, each against last time ---- */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Compare icon={ShoppingCart} label={t('Sold')} now={report.now.sales} before={report.before.sales} money={money} n={n} isMoney />
            <Compare icon={Coins} label={t('Margin')} now={report.now.margin} before={report.before.margin} money={money} n={n} isMoney />
            <Compare
              icon={Wallet}
              label={t('Spent')}
              now={report.now.expenses}
              before={report.before.expenses}
              money={money}
              n={n}
              isMoney
              /* Spending more is the one figure where up is the bad direction. */
              upIsBad
            />
            <Compare icon={Receipt} label={t('Bills')} now={report.now.bills} before={report.before.bills} money={money} n={n} />
            <Compare
              icon={ReceiptText}
              label={t('Average bill')}
              now={report.now.averageBill}
              before={report.before.averageBill}
              money={money}
              n={n}
              isMoney
            />
            <Compare
              icon={Truck}
              label={t('Came in')}
              now={report.now.cameIn.value}
              before={report.before.cameIn.value}
              money={money}
              n={n}
              isMoney
              neutral
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <PeriodCompare now={report.byDay} before={report.byDayBefore ?? []} />
            <PaymentMix rows={report.byMethod ?? []} />
          </div>

          <DailyChart rows={report.byDay} />

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="card mb-0 min-w-0">
              <h3>
                <Trophy className="h-4 w-4" /> {t('What earned the most')}
              </h3>
              <p className="card-sub">{t('Ranked by what it made this shop, not by how much of it left the shelf.')}</p>
              {report.topProducts.length === 0 ? (
                <div className="empty">{t('Nothing sold in this stretch.')}</div>
              ) : (
                <ol className="flex flex-col gap-2.5">
                  {report.topProducts.map((p, i) => (
                    <li key={p._id} className="flex items-center gap-3">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${
                          i < 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {n(i + 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{p.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{money(p.margin)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className="motion-grow-x block h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(2, (p.margin / topMargin) * 100)}%`, animationDelay: `${i * 60}ms` }}
                          />
                        </span>
                        <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                          {n(p.pieces)} {t('pieces')} · {money(p.sales)} {t('sold')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="card mb-0 min-w-0">
              <h3>
                <Building2 className="h-4 w-4" /> {t('Which company is worth it')}
              </h3>
              <p className="card-sub">{t('Margin on the stock each one supplied, traced through the batch it sold from.')}</p>
              {report.bySupplier.length === 0 ? (
                <div className="empty">{t('Nothing sold in this stretch.')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table w-full text-sm">
                    <thead>
                      <tr>
                        <th>{t('Company')}</th>
                        <th className="text-right">{t('Sold')}</th>
                        <th className="text-right">{t('Profit')}</th>
                        <th className="text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.bySupplier.map((s) => (
                        <tr key={s._id || s.name}>
                          <td className="font-medium">{s.name}</td>
                          <td className="text-right tabular-nums">{money(s.sales)}</td>
                          <td className="text-right font-semibold tabular-nums">{money(s.margin)}</td>
                          <td className="text-right">
                            <span
                              className={`pill !py-0 tabular-nums ${
                                s.marginPercent >= 20 ? 'success' : s.marginPercent >= 10 ? 'neutral' : 'pending'
                              }`}
                            >
                              {n(s.marginPercent)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {report.expenseCategories.length > 0 && (
            <div className="card mt-4">
              <h3>
                <Wallet className="h-4 w-4" /> {t('What the shop cost')}
              </h3>
              <p className="card-sub">
                {t('The stretch spending by what it was for — where the margin becomes the kept profit.')}
              </p>
              <ul className="flex flex-col gap-2.5">
                {report.expenseCategories.map((e) => (
                  <li key={e.category}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{t(EXPENSE_CATEGORY_LABEL[e.category] ?? e.category)}</span>
                      <span className="font-semibold tabular-nums">
                        {money(e.amount)}
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          {spent > 0 ? `${n(Math.round((e.amount / spent) * 100))}%` : ''}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="motion-grow-x h-full rounded-full bg-primary"
                        style={{ width: `${spent > 0 ? Math.max(2, (e.amount / spent) * 100) : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
                <li className="flex items-baseline justify-between border-t border-border pt-2.5 text-sm">
                  <span className="font-semibold">{t('Total')}</span>
                  <span className="font-bold tabular-nums">{money(report.now.expenses)}</span>
                </li>
              </ul>
            </div>
          )}

          <div className="card mt-4">
            <h3>
              <PackageX className="h-4 w-4" /> {t('Sitting there')}
              {report.deadStock.length > 0 && (
                <span className="font-normal text-muted-foreground">({n(report.deadStock.length)})</span>
              )}
            </h3>
            <p className="card-sub">
              {t(
                'On the shelf through the whole stretch without selling one piece, valued at what you paid for it — the dearest first, because that is the money that could be on something that moves.',
              )}
            </p>
            {report.deadStock.length === 0 ? (
              <div className="empty">{t('Everything on the shelf sold at least once.')}</div>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <table className="table w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th>{t('Item')}</th>
                      <th>{t('Rack')}</th>
                      <th className="text-right">{t('On hand')}</th>
                      <th className="text-right">{t('Value')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.deadStock.map((d) => (
                      <tr key={d._id}>
                        <td>
                          <span className="font-medium">{d.name}</span>{' '}
                          <span className="text-muted-foreground">{d.strength}</span>
                        </td>
                        <td>
                          {d.rackLabel ? (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{d.rackLabel}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{n(d.onHand)}</td>
                        <td className="text-right font-semibold tabular-nums">{money(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- pieces -- */

function Tabs<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K;
  onChange: (k: K) => void;
  options: [K, string][];
}) {
  const t = useT();
  return (
    <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            value === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

/** One tile: label and icon, figure, a line under it — the same on every tile. */
function Tile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  bad,
  amount,
}: {
  icon: typeof Users;
  tone: string;
  label: string;
  value: string;
  sub: string;
  bad?: boolean;
  /** The figure as a number, so it can count up; `value` is what it settles on. */
  amount?: number;
}) {
  const { money } = useNumbers();
  return (
    <div className="stat flex h-full min-h-[128px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className={`value mt-1 stat-fit [--fit-max:20px] ${bad ? 'text-destructive' : ''}`}>
        {amount !== undefined ? <CountUp value={amount} format={money} /> : value}
      </div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">{sub}</div>
    </div>
  );
}

/**
 * Which way a figure went since last time, as a pill.
 *
 * The arrow is never the only thing saying which way — the word and the
 * percentage beside it do too, so the pill still reads on a printout, in
 * forced colours, and to somebody who cannot tell the green from the red.
 */
function Delta({
  now,
  before,
  money,
  n,
  isMoney = true,
  upIsBad = false,
  neutral = false,
}: {
  now: number;
  before: number;
  money: (v: number) => string;
  n: (v: number | string) => string;
  isMoney?: boolean;
  upIsBad?: boolean;
  neutral?: boolean;
}) {
  const t = useT();
  const show = (v: number) => (isMoney ? money(v) : n(v));
  const change = before !== 0 ? Math.round(((now - before) / Math.abs(before)) * 1000) / 10 : null;
  const flat = now === before;
  const up = now > before;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const good = neutral || flat ? null : up !== upIsBad;
  const tone = good === null ? 'neutral' : good ? 'success' : 'danger';
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`pill ${tone} !py-0.5 tabular-nums`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {flat ? t('same') : `${up ? t('up') : t('down')}${change !== null ? ` ${n(Math.abs(change))}%` : ''}`}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {t('was')} {show(before)}
      </span>
    </span>
  );
}

/** A figure, and the same figure last time. */
function Compare({
  icon: Icon,
  label,
  now,
  before,
  money,
  n,
  isMoney = false,
  upIsBad = false,
  neutral = false,
}: {
  icon: typeof Users;
  label: string;
  now: number;
  before: number;
  money: (v: number) => string;
  n: (v: number | string) => string;
  isMoney?: boolean;
  upIsBad?: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="stat flex h-full min-h-[128px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="value mt-1 stat-fit [--fit-max:20px]">
        <CountUp value={now} format={(v) => (isMoney ? money(v) : n(v))} />
      </div>
      <div className="mt-auto pt-1">
        <Delta now={now} before={before} money={money} n={n} isMoney={isMoney} upIsBad={upIsBad} neutral={neutral} />
      </div>
    </div>
  );
}

/**
 * The stretch, day by day.
 *
 * One series, so there is nothing to tell apart and no legend to carry — the
 * heading names it. Bars rather than a line because a shop's days are separate
 * events, not a continuous quantity, and an empty day has to read as a gap on
 * the floor rather than as a line drawn through it.
 *
 * Three quiet gridlines with their figures give the heights a scale; the best
 * day carries its own label, because that is the one an owner looks for; every
 * bar carries its figures on hover and in its `title`; and the same numbers
 * are one tap away as a table, for anybody who would rather read than compare
 * heights.
 */
function DailyChart({
  rows,
}: {
  rows: { dayKey: string; sales: number; margin: number; bills: number }[];
}) {
  const t = useT();
  const { n, money } = useNumbers();
  const [asTable, setAsTable] = useState(false);
  const [plotRef, seen] = useSeen<HTMLDivElement>();

  if (rows.length === 0) return null;

  const peak = Math.max(1, ...rows.map((r) => r.sales));
  /* A round top for the scale, so the gridlines land on figures a person
     would say — ৳20,000, not ৳18,437. */
  const step = 10 ** Math.floor(Math.log10(peak));
  const top = Math.ceil(peak / step) * step;
  const busiest = rows.reduce((best, r) => (r.sales > best.sales ? r : best), rows[0]);
  const sold = rows.reduce((sum, r) => sum + r.sales, 0);
  const mid = rows[Math.floor(rows.length / 2)];

  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="mb-0">
          <BarChart3 className="h-4 w-4" /> {t('Sold each day')}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {money(sold)} {t('in all')} · {t('best day')} {n(shortDay(busiest.dayKey))} {t('at')}{' '}
            {money(busiest.sales)}
          </span>
          <button
            type="button"
            className="btn-toggle !h-7 !px-2 text-xs"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          >
            <Table2 className="h-3.5 w-3.5" /> {t(asTable ? 'Chart' : 'Table')}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="table w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th>{t('Day')}</th>
                <th className="text-right">{t('Bills')}</th>
                <th className="text-right">{t('Sold')}</th>
                <th className="text-right">{t('Margin')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dayKey}>
                  <td className="tabular-nums">{n(shortDay(r.dayKey))}</td>
                  <td className="text-right tabular-nums">{n(r.bills)}</td>
                  <td className="text-right font-semibold tabular-nums">{money(r.sales)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{money(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          {/* The scale, in the same ink as the rest of the chart's text. */}
          <div className="relative h-44 w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
            {[1, 0.5, 0].map((f) => (
              <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - f) * 100}%` }}>
                {money(top * f)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {/* Recessive gridlines: there to be read against, not looked at. */}
            {[1, 0.5].map((f) => (
              <span
                key={f}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
                style={{ top: `${(1 - f) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <div
              ref={plotRef}
              className="relative flex h-44 items-end gap-[2px] border-b border-border"
              role="img"
              aria-label={t('Sales by day')}
            >
              {rows.map((r, i) => {
                const best = r.dayKey === busiest.dayKey && r.sales > 0;
                /* The tip hangs off the bar's own side near the edges, so the
                   first and last days do not push it off the card. */
                const edge = i < rows.length * 0.15 ? 'left-0' : i > rows.length * 0.85 ? 'right-0' : 'left-1/2 -translate-x-1/2';
                return (
                  <div
                    key={r.dayKey}
                    /* The column is the full height of the plot and stacks its
                       bar at the bottom: a percentage height has nothing to
                       resolve against unless its parent has one. The column
                       is also the hit target, so a one-pixel day can still be
                       hovered. */
                    className="group relative flex h-full flex-1 flex-col justify-end"
                    title={`${shortDay(r.dayKey)} — ${taka(r.sales)} over ${r.bills} bills`}
                  >
                    {best && (
                      <span className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-foreground"
                        style={{ bottom: `calc(${(r.sales / top) * 100}% + 4px)` }}
                      >
                        {money(r.sales)}
                      </span>
                    )}
                    <div
                      className={`w-full rounded-t-[4px] transition-colors ${seen ? 'motion-grow-y' : 'scale-y-0'} ${
                        best ? 'bg-primary' : 'bg-primary/70 group-hover:bg-primary'
                      }`}
                      style={{
                        height: `${(r.sales / top) * 100}%`,
                        minHeight: r.sales > 0 ? 2 : 0,
                        animationDelay: `${Math.min(900, i * (900 / rows.length))}ms`,
                      }}
                    />
                    <div className={`pointer-events-none absolute top-0 z-10 hidden whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg group-hover:block ${edge}`}>
                      <span className="font-semibold">{n(shortDay(r.dayKey))}</span>
                      <span className="block tabular-nums">{money(r.sales)}</span>
                      <span className="block tabular-nums text-muted-foreground">
                        {n(r.bills)} {t('bills')} · {money(r.margin)} {t('margin')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>{n(shortDay(rows[0].dayKey))}</span>
              {rows.length > 2 && <span>{n(shortDay(mid.dayKey))}</span>}
              <span>{n(shortDay(rows[rows.length - 1].dayKey))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ pictures -- */

/**
 * The stretch's margin, day by day, as one quiet line behind the headline.
 *
 * Decoration with a meaning: the shape of the month an owner has just been
 * told the total of. It draws itself in once, and carries no figures — the
 * figures are the headline's job and the daily chart's.
 */
export function Sparkline({ rows, negative }: { rows: { margin: number }[]; negative: boolean }) {
  const [ref, seen] = useSeen<SVGSVGElement>();
  if (rows.length < 2) return null;
  const vals = rows.map((r) => r.margin);
  const hi = Math.max(...vals, 1);
  const lo = Math.min(...vals, 0);
  const W = 400;
  const H = 100;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      /* Low along the band's floor, under the words rather than through them. */
      className="pointer-events-none absolute bottom-0 right-0 h-2/5 w-full opacity-40 sm:h-3/5 sm:w-1/2"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={negative ? 'text-destructive' : 'text-primary'}>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#spark-fill)" className={seen ? 'motion-rise' : 'opacity-0'} />
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1000}
          className={seen ? 'motion-draw' : 'opacity-0'}
        />
      </g>
    </svg>
  );
}

/**
 * This stretch against the one before it, in four or so equal pieces.
 *
 * Grouped bars, two series: the stretch in the brand's colour, the one before
 * in a quiet grey, side by side in each piece — the same picture the website
 * shows, drawn from the shop's own bills. The pieces are weeks for a month,
 * days for a week, a fortnight for a quarter, so there are never too many to
 * read. Each piece names both figures on hover and in its label.
 */
export function PeriodCompare({
  now,
  before,
  title = 'This stretch against the last',
  labels = ['This stretch', 'The one before'],
}: {
  now: { dayKey: string; sales: number }[];
  before: { dayKey: string; sales: number }[];
  title?: string;
  labels?: [string, string];
}) {
  const t = useT();
  const { n, money } = useNumbers();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (now.length === 0) return null;

  const size = now.length <= 7 ? 1 : now.length <= 31 ? 7 : 14;
  const chunks = (rows: { sales: number }[]) => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size).reduce((a, r) => a + r.sales, 0));
    return out;
  };
  const a = chunks(now);
  const b = chunks(before);
  const top = Math.max(1, ...a, ...b);
  /* The last piece is often short — two days of a fifth week — and says so,
     rather than looking like a week that went badly. */
  const label = (i: number) => {
    if (size === 1) return n(shortDay(now[i].dayKey));
    const len = Math.min(size, now.length - i * size);
    return len < size ? `${n(len)} ${t('days')}` : `${t(size === 7 ? 'Week' : 'Fortnight')} ${n(i + 1)}`;
  };

  return (
    <Rise className="card mb-0 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0">
          <BarChart3 className="h-4 w-4" /> {t(title)}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> {t(labels[0])}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" /> {t(labels[1])}
          </span>
        </div>
      </div>
      <div ref={ref} className="relative mt-5 flex h-44 items-end gap-3 border-b border-border sm:gap-5" onMouseLeave={() => setHover(null)}>
        {a.map((v, i) => (
          <div
            key={i}
            tabIndex={0}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${label(i)}: ${money(v)}, ${t('the one before')} ${money(b[i] ?? 0)}`}
            className="relative flex h-full flex-1 items-end justify-center gap-[2px] outline-none"
          >
            {[b[i] ?? 0, v].map((x, j) => (
              <div
                key={j}
                className={`w-full max-w-8 rounded-t-[4px] ${j === 1 ? 'bg-primary' : 'bg-muted-foreground/40'} ${seen ? 'motion-grow-y' : 'scale-y-0'}`}
                style={{ height: `${(x / top) * 100}%`, minHeight: x > 0 ? 2 : 0, animationDelay: `${i * 110 + j * 60}ms` }}
              />
            ))}
            {hover === i && (
              <div
                className={`pointer-events-none absolute -top-2 z-10 w-max -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg ${
                  i === 0 ? 'left-0' : i === a.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                }`}
              >
                <span className="font-semibold">{label(i)}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-primary" />
                  <span className="text-muted-foreground">{t('This stretch')}</span>
                  <span className="ml-auto pl-3 font-semibold tabular-nums">{money(v)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" />
                  <span className="text-muted-foreground">{t('The one before')}</span>
                  <span className="ml-auto pl-3 font-semibold tabular-nums">{money(b[i] ?? 0)}</span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3 sm:gap-5">
        {a.map((_, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground">
            {label(i)}
          </span>
        ))}
      </div>
    </Rise>
  );
}

/* The four categorical slots, in order, validated light and dark; the rest fold into Other. */
const MIX_SLOTS = ['var(--mix-0)', 'var(--mix-1)', 'var(--mix-2)', 'var(--mix-3)'];

/**
 * How the stretch was paid for — one bar split by method, every part named.
 *
 * Four methods at most, the rest folded into "Other": a fifth colour is the
 * one nobody can tell from the fourth. A two-pixel gap between the parts, and
 * the figure and the share written beside each swatch, so the colour is never
 * the only way to read it.
 */
export function PaymentMix({ rows }: { rows: { method: string; amount: number; bills: number }[] }) {
  const t = useT();
  const { n, money } = useNumbers();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const main = rows.slice(0, 4);
  const rest = rows.slice(4).reduce((a, r) => a + r.amount, 0);
  const parts = [
    ...main.map((r, i) => ({ key: r.method, label: t(METHOD_LABEL[r.method] ?? r.method), amount: r.amount, color: MIX_SLOTS[i] })),
    ...(rest > 0 ? [{ key: 'other', label: t('Other'), amount: rest, color: 'var(--mix-other)' }] : []),
  ];

  return (
    <Rise delay={80} className="card mb-0 flex min-w-0 flex-col">
      <h3>
        <Wallet className="h-4 w-4" /> {t('How customers paid')}
      </h3>
      {total <= 0 ? (
        <div className="empty">{t('Nothing sold in this stretch.')}</div>
      ) : (
        <>
          <div ref={ref} className="mt-2 flex h-4 gap-[2px] overflow-hidden rounded-full">
            {parts.map((p, i) => (
              <div
                key={p.key}
                className={`h-full first:rounded-l-full last:rounded-r-full ${seen ? 'motion-grow-x' : 'scale-x-0'}`}
                style={{ width: `${(p.amount / total) * 100}%`, background: p.color, animationDelay: `${200 + i * 110}ms` }}
              />
            ))}
          </div>
          <ul className="mt-5 flex flex-col gap-2.5">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2.5 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">
                  {n(Math.round((p.amount / total) * 100))}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Rise>
  );
}
