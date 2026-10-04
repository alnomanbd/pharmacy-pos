import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Wallet,
  Download,
  Clock,
  Building2,
  CalendarClock,
  BadgeCheck,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { platformApi, downloadBlob } from '../api';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useToast } from '@dawai/shared/components/Toast';
import { confirmAction } from '@dawai/shared/lib/confirm';
import { useTheme } from '@dawai/shared/hooks/useTheme';
import type { PlatformRevenue, RevenueGranularity } from '@dawai/shared/types';
import { CountUp, Rise, Sparkline, useSeen } from '@dawai/shared/components/motion';

/**
 * What we sold.
 *
 * Every number on this page is a **verified** subscription payment — money an
 * operator has actually matched to the receiving account. Claims that are still
 * waiting are shown once, on their own tile, as a pipeline; counting them as
 * revenue would mean the month's total moved every time an old one was rejected.
 *
 * The four tiles at the top do not follow the date range on purpose. "How much
 * did we sell today" is what this page gets opened for, and it should still be
 * answered when somebody left the range on last quarter.
 */

const taka = (n: number) => `৳ ${Math.round(n).toLocaleString('en-BD')}`;

/**
 * Two hues for the one split that has two series — new customers against
 * renewals. Validated for lightness, chroma, CVD separation and contrast
 * against each mode's own surface, so the dark set is chosen rather than
 * flipped. Everything else on this page is a single-hue magnitude chart and
 * uses the app's own `--primary`.
 */
const SPLIT = {
  light: { fresh: '#7c3aed', renewal: '#0d9488' },
  dark: { fresh: '#8b5cf6', renewal: '#0d9488' },
};

const METHOD_LABEL: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  upay: 'Upay',
  rocket: 'Rocket',
  bank: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  unknown: 'Unrecorded',
};

type PresetKey = '7d' | '30d' | 'month' | 'year';

/**
 * Deliberately not worded like the tiles above.
 *
 * A button reading "This month" beside a tile reading "This month" invites the
 * reading that one drives the other, and it does not — the tiles are fixed and
 * these move the chart. "Month to date" says the same range in different words.
 */
const PRESETS: { key: PresetKey; label: string; granularity: RevenueGranularity }[] = [
  { key: '7d', label: 'Last 7 days', granularity: 'day' },
  { key: '30d', label: 'Last 30 days', granularity: 'day' },
  { key: 'month', label: 'Month to date', granularity: 'day' },
  { key: 'year', label: 'Year to date', granularity: 'month' },
];

/** `YYYY-MM-DD` in the browser's own calendar — what a date input speaks. */
function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rangeFor(preset: PresetKey) {
  const to = new Date();
  const from = new Date(to);
  if (preset === '7d') from.setDate(to.getDate() - 6);
  else if (preset === '30d') from.setDate(to.getDate() - 29);
  else if (preset === 'month') from.setDate(1);
  else from.setMonth(0, 1);
  return { from: localDate(from), to: localDate(to) };
}

/**
 * One row of a magnitude breakdown.
 *
 * A bar list rather than a pie: these are amounts to compare, the labels are
 * words, and a pie makes both jobs harder. One hue, because the length is the
 * encoding — the colour is not saying anything a reader has to decode.
 */
function BarRow({
  label,
  value,
  detail,
  share,
}: {
  label: string;
  value: string;
  detail?: string;
  share: number;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums">
          {value}
          {detail && <span className="ml-2 text-xs text-muted-foreground">{detail}</span>}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="motion-grow-x h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
          style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function Revenue() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const split = theme === 'dark' ? SPLIT.dark : SPLIT.light;

  const [preset, setPreset] = useState<PresetKey>('30d');
  const [from, setFrom] = useState(() => rangeFor('30d').from);
  const [to, setTo] = useState(() => rangeFor('30d').to);
  const [granularity, setGranularity] = useState<RevenueGranularity>('day');
  const [data, setData] = useState<PlatformRevenue | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await platformApi.revenue({ from, to, granularity }));
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load the sales figures.', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, granularity, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const r = rangeFor(p.key);
    setPreset(p.key);
    setFrom(r.from);
    setTo(r.to);
    setGranularity(p.granularity);
  };

  const chart = useMemo(
    () => (data?.series ?? []).map((p) => ({ ...p, name: p.label })),
    [data],
  );

  /** The series as a spreadsheet — the same rows the chart is drawn from. */
  const exportCsv = async () => {
    if (!data) return;
    if (
      !(await confirmAction({
        title: 'Export the sales figures?',
        message: `${data.series.length} row${data.series.length === 1 ? '' : 's'} of verified subscription money, ${from} to ${to} — keep the file somewhere safe.`,
        confirmLabel: 'Download the CSV',
        icon: 'export',
      }))
    )
      return;
    const header = ['Period', 'Sales', 'Amount (BDT)'];
    const lines = data.series.map((p) => [p.label, p.count, p.total]);
    const csv = [header, ...lines]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadBlob(
      // The BOM is what makes Excel read the Taka sign and Bangla names right.
      new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }),
      `platform-sales-${from}-to-${to}.csv`,
    );
    toast('Sales figures downloaded.');
  };

  if (loading && !data) return <LoadingBlock label="Loading sales..." />;

  const s = data?.summary;
  const p = data?.period;
  const planTop = Math.max(1, ...(data?.byPlan ?? []).map((r) => r.total));
  const methodTop = Math.max(1, ...(data?.byMethod ?? []).map((r) => r.total));
  const splitTotal = Math.max(1, (p?.newCustomers ?? 0) + (p?.renewals ?? 0));
  const topPaid = Math.max(1, ...(data?.topShops ?? []).map((c) => c.total));

  const tiles = [
    { label: 'Today', figure: s?.today, icon: Wallet },
    { label: 'This week', figure: s?.week, icon: TrendingUp },
    { label: 'This month', figure: s?.month, icon: CalendarClock },
    { label: 'This year', figure: s?.year, icon: BadgeCheck },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Sales
          </h1>
          <p className="text-sm text-muted-foreground">
            Subscription money we have verified — day by day, by plan, and by account.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
          onClick={() => void exportCsv()}
          disabled={!data?.series.length}
          title="Download this period's figures as a spreadsheet"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/*
        The standing picture, independent of the range below. Each tile carries
        the count as well as the amount: one ৳15,000 sale and five ৳3,000 ones
        are the same money and a very different day.
      */}
      <Rise className="relative mt-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent p-5 sm:p-6">
        <Sparkline
          values={(data?.series ?? []).map((x) => x.total)}
          className="absolute bottom-0 right-0 h-2/5 w-full opacity-50 sm:h-3/5 sm:w-1/2"
        />
        <div className="relative flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            {/* The range chosen below, not the fixed tiles: the band and its line move with the filters. */}
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-4 w-4 text-primary" /> {PRESETS.find((x) => x.key === preset)?.label ?? 'Chosen dates'}
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-primary">
              <CountUp value={p?.total ?? 0} format={taka} duration={1200} />
            </div>
            <div className="text-xs text-muted-foreground">
              {p?.count ?? 0} verified sale{p?.count === 1 ? '' : 's'}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" /> Average sale
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={p?.average ?? 0} format={taka} />
            </div>
            <div className="text-xs text-muted-foreground">
              {p?.newCustomers ?? 0} new · {p?.renewals ?? 0} renewals
            </div>
          </div>
        </div>
      </Rise>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Rise key={t.label} delay={i * 70} className="stat flex items-start justify-between">
            <div>
              <div className="value">
                <CountUp value={t.figure?.total ?? 0} format={taka} />
              </div>
              <div className="label">{t.label}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {t.figure?.count ?? 0} sale{t.figure?.count === 1 ? '' : 's'}
              </div>
            </div>
            <span className="stat-icon">
              <t.icon className="h-4 w-4" />
            </span>
          </Rise>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="stat">
          <div className="value"><CountUp value={s?.allTime.total ?? 0} format={taka} /></div>
          <div className="label">All time</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {s?.allTime.count ?? 0} verified payment{s?.allTime.count === 1 ? '' : 's'}
          </div>
        </div>
        {/* Not revenue — a queue. It links to the queue so it can be cleared. */}
        <Link to="/payments?status=pending" className="stat block hover:bg-muted">
          <div className="value"><CountUp value={s?.pending.total ?? 0} format={taka} /></div>
          <div className="label flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Awaiting verification
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {s?.pending.count ?? 0} claim{s?.pending.count === 1 ? '' : 's'} to check
          </div>
        </Link>
        <div className="stat">
          <div className="value"><CountUp value={data?.subscribers.paying ?? 0} format={String} /></div>
          <div className="label flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Paying accounts
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {data?.subscribers.onTrial ?? 0} still on trial
          </div>
        </div>
        <div className="stat">
          <div className="value"><CountUp value={data?.subscribers.expiringIn30Days ?? 0} format={String} /></div>
          <div className="label">Expiring in 30 days</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            paid subscriptions to renew
          </div>
        </div>
      </div>

      {/* Filters in one row above the chart they act on. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {PRESETS.map((x) => (
          <button
            key={x.key}
            onClick={() => applyPreset(x)}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ${
              preset === x.key
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card hover:bg-muted'
            }`}
          >
            {x.label}
          </button>
        ))}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="h-9 w-[9.5rem] rounded-md border border-border bg-card px-2 text-sm"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset('' as PresetKey);
            }}
            aria-label="From date"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            className="h-9 w-[9.5rem] rounded-md border border-border bg-card px-2 text-sm"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset('' as PresetKey);
            }}
            aria-label="To date"
          />
          <select
            className="input h-9 w-auto"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as RevenueGranularity)}
            aria-label="Group by"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      </div>

      <div className="card mt-4">
        <h3 className="flex flex-wrap items-center gap-2">
          <Wallet className="h-4 w-4" />
          {granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'} sales
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {taka(p?.total ?? 0)} over {p?.count ?? 0} sale{p?.count === 1 ? '' : 's'} · average{' '}
            {taka(p?.average ?? 0)}
          </span>
        </h3>
        <div className="h-64">
          {chart.length === 0 ? (
            <div className="empty">Nothing sold in this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev-bar" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity={1} />
                    <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  width={64}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => (Number(v) >= 1000 ? `${Number(v) / 1000}k` : String(v))}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  formatter={(value, _n, item) => [
                    `${taka(Number(value) || 0)} · ${item?.payload?.count ?? 0} sale(s)`,
                    'Sold',
                  ]}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {/* One series, so no legend — the heading names it. */}
                <Bar
                  dataKey="total"
                  fill="url(#rev-bar)"
                  radius={[4, 4, 0, 0]}
                  name="Sold"
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card">
          <h3 className="mb-3">By plan</h3>
          {(data?.byPlan.length ?? 0) === 0 ? (
            <div className="empty">No sales in this period.</div>
          ) : (
            data!.byPlan.map((r) => (
              <BarRow
                key={r.plan}
                label={r.name}
                value={taka(r.total)}
                detail={`${r.count}× · ${r.months}m`}
                share={r.total / planTop}
              />
            ))
          )}
        </div>

        <div className="card">
          <h3 className="mb-3">How they paid</h3>
          {(data?.byMethod.length ?? 0) === 0 ? (
            <div className="empty">No sales in this period.</div>
          ) : (
            data!.byMethod.map((r) => (
              <BarRow
                key={r.method}
                label={METHOD_LABEL[r.method] || r.method}
                value={taka(r.total)}
                detail={`${r.count}×`}
                share={r.total / methodTop}
              />
            ))
          )}
        </div>

        {/*
          Two series, so both are named beside their colour rather than left to
          it. Winning a shop and keeping one are different problems, and a
          single "sales" count hides which of them a month actually was.
        */}
        <div className="card">
          <h3 className="mb-3">New vs renewals</h3>
          {(p?.count ?? 0) === 0 ? (
            <div className="empty">No sales in this period.</div>
          ) : (
            <>
              <SplitBar>
                <div
                  className="motion-grow-x rounded-l-full"
                  style={{
                    width: `${((p?.newCustomers ?? 0) / splitTotal) * 100}%`,
                    background: split.fresh,
                  }}
                />
                <div
                  className="motion-grow-x flex-1 rounded-r-full"
                  style={{ background: split.renewal, animationDelay: '150ms' }}
                />
              </SplitBar>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: split.fresh }}
                  />
                  <span>First-time customers</span>
                  <strong className="ml-auto tabular-nums">{p?.newCustomers ?? 0}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: split.renewal }}
                  />
                  <span>Renewals</span>
                  <strong className="ml-auto tabular-nums">{p?.renewals ?? 0}</strong>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                An account counts as first-time on the period its very first verified payment falls
                in.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card mt-4">
        <h3 className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Who paid the most
        </h3>
        {(data?.topShops.length ?? 0) === 0 ? (
          <div className="empty">No sales in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Account</th>
                  <th className="py-2 pr-3 font-semibold">Plan</th>
                  <th className="py-2 pr-3 text-right font-semibold">Payments</th>
                  <th className="py-2 pr-3 text-right font-semibold">Paid</th>
                  <th className="py-2 text-right font-semibold">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {data!.topShops.map((c, idx) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${
                            idx < 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="min-w-0">
                          <Link className="font-medium hover:underline" to={`/shops/${c.id}`}>
                            {c.name}
                          </Link>
                          <span className="mt-1 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-muted">
                            <span
                              className="motion-grow-x block h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(3, (c.total / topPaid) * 100)}%`, animationDelay: `${idx * 60}ms` }}
                            />
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.plan || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">
                      {taka(c.total)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {c.lastPaidAt
                        ? new Date(c.lastPaidAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** The two-part split, grown in once it is on screen. */
function SplitBar({ children }: { children: React.ReactNode }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className={`flex h-3 gap-0.5 overflow-hidden rounded-full ${seen ? '' : '[&>*]:scale-x-0'}`}>
      {children}
    </div>
  );
}
