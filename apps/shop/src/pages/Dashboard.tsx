import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Clock,
  Coins,
  LayoutDashboard,
  Monitor,
  ReceiptText,
  ScanLine,
  ShoppingCart,
  Trophy,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { shopApi, tillApi, type OwnerReport, type ShopCounter } from '../api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang } from '../i18n/ui';
import { CountUp, Rise, useSeen } from '../components/motion';
import { PhoneNudge } from '../components/PhoneAlertsCard';
import { Attention, PaymentMix, PeriodCompare, dayOf, useNumbers } from './ShopReports';

/**
 * The owner's first screen.
 *
 * One page that answers "how is the shop doing" without opening four: today
 * as it stands, the week against the week before, who is on which counter
 * right now, what is selling, and the few things that need a hand. Every
 * figure is the shop's own, from the same endpoints the Reports page reads.
 * The POS is one tap away at the top, because the owner is often the one
 * ringing up the next bill.
 */

type Day = Awaited<ReturnType<typeof tillApi.day>>;
type Needs = Awaited<ReturnType<typeof shopApi.attention>>;

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

export default function Dashboard() {
  const t = useT();
  const lang = useUiLang();
  const { n, money } = useNumbers();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [day, setDay] = useState<Day | null>(null);
  const [week, setWeek] = useState<OwnerReport | null>(null);
  const [counters, setCounters] = useState<ShopCounter[]>([]);
  const [needs, setNeeds] = useState<Needs | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, w, c, a] = await Promise.all([
        tillApi.day(true),
        shopApi.ownerReport({ from: dayOf(6), to: dayOf(0) }),
        shopApi.counters().catch(() => []),
        shopApi.attention().catch(() => null),
      ]);
      setDay(d);
      setWeek(w);
      setCounters(c);
      setNeeds(a);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the figures.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
    /* Fresh every two minutes while it is open on the office screen. */
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), 120_000);
    return () => window.clearInterval(id);
  }, [load]);

  const langTag = lang === 'bn' ? 'bn-BD' : 'en-GB';
  const firstName = (user?.name ?? '').split(/\s+/).filter((w) => !/^(md|mst|mrs|mr|dr)\.?$/i.test(w))[0] ?? '';

  return (
    <div className="page">
      {/* ---- hello, and the three things done most ---- */}
      <div className="topbar flex-wrap gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" /> {t(greeting(new Date().getHours()))}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(langTag, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className="btn h-10">
            <ScanLine className="h-4 w-4" /> {t('Open the POS')}
          </Link>
          <Link to="/purchases" className="btn btn-ghost h-10">
            <Truck className="h-4 w-4" /> {t('Receive stock')}
          </Link>
          <Link to="/customers" className="btn btn-ghost h-10">
            <UserPlus className="h-4 w-4" /> {t('Customers')}
          </Link>
        </div>
      </div>

      <PhoneNudge />

      {loading || !day || !week ? (
        <LoadingBlock />
      ) : (
        <>
          <TodayBand day={day} />

          {/* ---- four figures for the week ---- */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { icon: ShoppingCart, label: t('Sold this week'), value: week.now.sales, fmt: money, before: week.before.sales },
              { icon: Coins, label: t('Margin this week'), value: week.now.margin, fmt: money, before: week.before.margin },
              { icon: ReceiptText, label: t('Bills this week'), value: week.now.bills, fmt: (v: number) => n(v), before: week.before.bills },
              { icon: Users, label: t('Average bill'), value: week.now.averageBill, fmt: money, before: week.before.averageBill },
            ].map((f, i) => {
              const change = f.before ? Math.round(((f.value - f.before) / Math.abs(f.before)) * 100) : null;
              return (
                <Rise key={f.label} delay={i * 70}>
                  <div className="stat flex h-full min-h-[118px] flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <span className="label !mt-0 leading-tight">{f.label}</span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <f.icon className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="value mt-1 stat-fit [--fit-max:22px]">
                      <CountUp value={f.value} format={f.fmt} />
                    </div>
                    {change !== null && (
                      <span
                        className={`mt-auto pt-1 text-[11.5px] font-semibold tabular-nums ${
                          change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                        }`}
                      >
                        {change >= 0 ? '▲' : '▼'} {n(Math.abs(change))}%{' '}
                        <span className="font-normal text-muted-foreground">{t('vs the week before')}</span>
                      </span>
                    )}
                  </div>
                </Rise>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <PeriodCompare
              now={week.byDay}
              before={week.byDayBefore ?? []}
              title="This week against the last"
              labels={['This week', 'The week before']}
            />
            <PaymentMix rows={week.byMethod ?? []} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <LiveCounters rows={counters} />
            <TopSellers rows={week.topProducts.slice(0, 6)} />
          </div>

          {needs && (
            <Rise className="mt-4">
              <Attention needs={needs} />
            </Rise>
          )}

          <div className="mt-6 flex justify-center">
            <Link to="/reports" className="btn btn-ghost h-10">
              <BarChart3 className="h-4 w-4" /> {t('All the reports')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Today, as one band: what came in, the bills, the margin, and the day's
 * bills hour by hour — the shape of the day so far, growing as it goes.
 */
function TodayBand({ day }: { day: Day }) {
  const t = useT();
  const { n, money } = useNumbers();
  const [ref, seen] = useSeen<HTMLDivElement>();

  /* Bills by hour, from the shop opening to closing — 8am to 11pm, widened to fit any bill outside it. */
  const hours = useMemo(() => {
    const live = day.sales.filter((s) => s.status !== 'void');
    const hs = live.map((s) => new Date(s.soldAt).getHours());
    const from = Math.min(8, ...hs);
    const to = Math.max(22, ...hs);
    const rows: { h: number; total: number; bills: number }[] = [];
    for (let h = from; h <= to; h++) rows.push({ h, total: 0, bills: 0 });
    for (const s of live) {
      const r = rows.find((x) => x.h === new Date(s.soldAt).getHours());
      if (r) {
        r.total += s.total;
        r.bills += 1;
      }
    }
    return rows;
  }, [day.sales]);
  const top = Math.max(1, ...hours.map((h) => h.total));
  const now = new Date().getHours();
  const hourLabel = (h: number) => `${n(((h + 11) % 12) + 1)}${h < 12 ? 'am' : 'pm'}`;

  return (
    <Rise className="relative mt-4 overflow-hidden rounded-[var(--radius)] border border-primary/30 bg-gradient-to-br from-primary/[0.13] via-primary/[0.05] to-transparent p-5 sm:p-6">
      <div className="relative grid gap-6 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-10">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <div className="eyebrow">{t('Sold today')}</div>
            <div className="text-3xl font-semibold tabular-nums text-primary sm:text-4xl">
              <CountUp value={day.total} format={money} duration={1200} />
            </div>
            <div className="text-xs text-muted-foreground">
              {n(day.count)} {t('bills')}
              {day.due > 0 ? ` · ${money(day.due)} ${t('on the khata')}` : ''}
            </div>
          </div>
          {day.margin !== undefined && (
            <div>
              <div className="eyebrow">{t('Margin')}</div>
              <div className="text-2xl font-semibold tabular-nums sm:text-3xl">
                <CountUp value={day.margin} format={money} />
              </div>
              <div className="text-xs text-muted-foreground">{t('after what the stock cost')}</div>
            </div>
          )}
        </div>

        {/* ---- the day, hour by hour ---- */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {t('Today, hour by hour')}
            </span>
          </div>
          {day.count === 0 ? (
            /* Nothing to draw yet: say so, and offer the way to the first bill. */
            <div className="grid h-24 place-items-center rounded-xl border border-dashed border-primary/30 bg-card/40 text-sm text-muted-foreground">
              <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                {t('No bills yet today.')}
                <Link to="/" className="font-semibold text-primary">
                  {t('Open the POS')} →
                </Link>
              </span>
            </div>
          ) : (
          <div ref={ref} className="flex h-24 items-end gap-[3px]">
            {hours.map((h, i) => (
              <div
                key={h.h}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={`${hourLabel(h.h)} — ${money(h.total)}, ${n(h.bills)} ${t('bills')}`}
              >
                <div
                  className={`w-full rounded-t-[3px] ${h.h === now ? 'bg-primary' : 'bg-primary/55 group-hover:bg-primary'} ${
                    seen ? 'motion-grow-y' : 'scale-y-0'
                  }`}
                  style={{ height: `${(h.total / top) * 100}%`, minHeight: h.total > 0 ? 3 : 1, animationDelay: `${i * 40}ms` }}
                />
              </div>
            ))}
          </div>
          )}
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{hourLabel(hours[0].h)}</span>
            <span>{hourLabel(hours[Math.floor(hours.length / 2)].h)}</span>
            <span>{hourLabel(hours[hours.length - 1].h)}</span>
          </div>
        </div>
      </div>
    </Rise>
  );
}

/** Who is on which counter right now, and what each has taken today. */
function LiveCounters({ rows }: { rows: ShopCounter[] }) {
  const t = useT();
  const { n, money } = useNumbers();
  const live = rows.filter((r) => r.isActive !== false);
  const most = Math.max(1, ...live.map((r) => r.today?.total ?? 0));
  return (
    <Rise className="card mb-0 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="mb-0">
          <Monitor className="h-4 w-4" /> {t('Counters right now')}
        </h3>
        <Link to="/counters" className="text-xs font-semibold text-primary">
          {t('All')} →
        </Link>
      </div>
      {live.length === 0 ? (
        <div className="empty mt-3">{t('No counters yet.')}</div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {live.map((c, i) => {
            const open = !!c.openShift;
            return (
              <li key={c._id}>
                <div className="flex items-center gap-3">
                  <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    {open && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{c.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{money(c.today?.total ?? 0)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{open ? c.openShift!.userName : t('Closed')}</span>
                      <span className="shrink-0 tabular-nums">
                        {n(c.today?.bills ?? 0)} {t('bills')}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="motion-grow-x h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, ((c.today?.total ?? 0) / most) * 100)}%`, animationDelay: `${i * 80}ms` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Rise>
  );
}

/** What earned the most this week, as a ranked list with bars. */
function TopSellers({ rows }: { rows: OwnerReport['topProducts'] }) {
  const t = useT();
  const { n, money } = useNumbers();
  const most = Math.max(1, ...rows.map((r) => r.margin));
  return (
    <Rise delay={80} className="card mb-0 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="mb-0">
          <Trophy className="h-4 w-4" /> {t('Best sellers this week')}
        </h3>
        <Link to="/reports" className="text-xs font-semibold text-primary">
          {t('Reports')} →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty mt-3">{t('Nothing sold in this stretch.')}</div>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {rows.map((p, i) => (
            <li key={p._id} className="flex items-center gap-3">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${
                  i < 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'
                }`}
              >
                {n(i + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(p.margin)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="motion-grow-x h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (p.margin / most) * 100)}%`, animationDelay: `${i * 70}ms` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {n(p.pieces)} {t('pieces')} · {money(p.sales)} {t('sold')}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Rise>
  );
}
