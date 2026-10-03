import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  Building2,
  Headset,
  Inbox,
  ClipboardList,
  NotebookPen,
  CalendarClock,
  ArrowUpRight,
  CheckCircle2,
  Wallet,
  UserPlus,
  ShoppingCart,
  BadgeCheck,
  Globe,
  Layers,
  Trophy,
  CalendarRange,
  UserMinus,
  Store,
} from 'lucide-react';
import { platformApi, type PlatformOverview, type PlatformStretch, type ShopNote } from '../api';
import { useRange, RangeBar, Hero, CompareTile, PeriodBars, MixBar, RankList, rangeLine } from '../components/Stretch';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { errorMessage } from '../lib/ui';
import { CountUp, Rise, Ring, useSeen } from '@dawai/shared/components/motion';

/**
 * How the business is doing, and what needs doing today.
 *
 * Tiles for the handful of numbers worth knowing every morning, each with what
 * it is compared against; the day's queue, each line a link to where it is
 * worked; and two six-month charts, one measure each — sign-ups and, for whoever
 * may see it, money received. Never two scales on one chart.
 */

const taka = (n: number) => `৳ ${Math.round(n).toLocaleString('en-BD')}`;
const MONTH = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });

const TODO: { key: keyof PlatformOverview['todo']; one: string; many: string; href: string; icon: typeof Receipt }[] = [
  { key: 'pendingPayments', one: 'payment to check', many: 'payments to check', href: '/payments?status=pending', icon: Receipt },
  { key: 'pendingApprovals', one: 'shop waiting for approval', many: 'shops waiting for approval', href: '/?status=pending', icon: Building2 },
  { key: 'supportWaiting', one: 'support conversation waiting', many: 'support conversations waiting', href: '/support', icon: Headset },
  { key: 'followUpsDue', one: 'follow-up due today', many: 'follow-ups due today', href: '#follow-ups', icon: NotebookPen },
  { key: 'renewalsDue7d', one: 'shop ending within a week', many: 'shops ending within a week', href: '/renewals', icon: CalendarClock },
  { key: 'newDemoRequests', one: 'new demo request', many: 'new demo requests', href: '/leads', icon: Inbox },
  { key: 'pendingMedicineRequests', one: 'medicine request', many: 'medicine requests', href: '/requests', icon: ClipboardList },
];

export default function Overview() {
  const { toast } = useToast();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [followUps, setFollowUps] = useState<ShopNote[]>([]);
  /* The stretch: this month by default, against the same days before it. */
  const r = useRange('month');
  const [stretch, setStretch] = useState<PlatformStretch | null>(null);
  useEffect(() => {
    setStretch(null);
    platformApi
      .stretch(r.range)
      .then(setStretch)
      .catch((e) => toast(errorMessage(e, 'Could not load the figures for that stretch.'), 'error'));
  }, [r.range, toast]);

  useEffect(() => {
    platformApi
      .overview()
      .then(setData)
      .catch((e) => toast(errorMessage(e, 'Could not load the overview.'), 'error'));
    platformApi
      .followUps(20)
      .then((r) => setFollowUps(r.data))
      .catch(() => undefined);
  }, [toast]);

  if (!data) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }

  const todo = TODO.filter((t) => data.todo[t.key] > 0);
  const { money } = data;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" /> Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* ---- the stretch, against the one before it ---- */}
      <RangeBar r={r} />
      {stretch && <p className="-mt-2 mb-4 text-xs text-muted-foreground">{rangeLine(stretch.range)}</p>}

      {!stretch ? (
        <LoadingBlock />
      ) : (
        <>
          {/* The headline: what the shops paid us — or, for whoever may not see money, what they sold through Dawai. */}
          {stretch.money ? (
            <Hero
              icon={Wallet}
              label="Received"
              now={stretch.money.received.now}
              before={stretch.money.received.before}
              format={taka}
              line={stretch.money.series.map((p) => p.total)}
              sub={`${stretch.money.payments.now} payment${stretch.money.payments.now === 1 ? '' : 's'} accepted`}
              extra={
                money && (
                  <>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Monthly revenue now</span>
                    <div className="mt-0.5 text-2xl font-bold tabular-nums text-primary">
                      <CountUp value={money.mrr} format={taka} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      from {data.shops.paying} paying shop{data.shops.paying === 1 ? '' : 's'}
                    </p>
                  </>
                )
              }
            />
          ) : (
            <Hero
              icon={ShoppingCart}
              label="Sold through Dawai"
              now={stretch.use.sold.now}
              before={stretch.use.sold.before}
              format={taka}
              line={stretch.use.series.map((p) => p.total)}
              sub={`${stretch.use.bills.now.toLocaleString('en-BD')} bills across ${stretch.use.activeShops.now} shop${stretch.use.activeShops.now === 1 ? '' : 's'}`}
            />
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CompareTile icon={UserPlus} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label="Sign-ups" now={stretch.growth.signups.now} before={stretch.growth.signups.before} />
            <CompareTile icon={BadgeCheck} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label="Paid for the first time" now={stretch.growth.firstPaid.now} before={stretch.growth.firstPaid.before} delay={60} />
            <CompareTile icon={UserMinus} tone="bg-destructive/10 text-destructive" label="Lost — did not renew" now={stretch.growth.lost.now} before={stretch.growth.lost.before} upIsBad delay={120} />
            <CompareTile icon={Globe} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label="Online orders in shops" now={stretch.use.onlineOrders.now} before={stretch.use.onlineOrders.before} delay={180} />
            <CompareTile icon={ShoppingCart} tone="bg-primary/10 text-primary" label="Sold through Dawai" now={stretch.use.sold.now} before={stretch.use.sold.before} format={taka} delay={240} />
            <CompareTile icon={Receipt} tone="bg-primary/10 text-primary" label="Bills rung up" now={stretch.use.bills.now} before={stretch.use.bills.before} delay={300} />
            <CompareTile icon={Store} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" label="Shops that sold" now={stretch.use.activeShops.now} before={stretch.use.activeShops.before} delay={360} />
            <Rise delay={420} className="stat flex h-full min-h-[128px] items-center justify-between gap-3">
              <div>
                <span className="label !mt-0">Trial to paid</span>
                <div className="value mt-1 tabular-nums">
                  {data.conversion.paid} of {data.conversion.signedUp}
                </div>
                <span className="text-[11px] text-muted-foreground">signed up in the last 90 days</span>
              </div>
              <Ring value={data.conversion.rate} size={64} label={`Trial to paid: ${data.conversion.rate ?? 0}%`} />
            </Rise>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {stretch.money ? (
              <PeriodBars title="Received, this stretch against the last" now={stretch.money.series} before={stretch.money.prev} format={taka} />
            ) : (
              <PeriodBars title="Sold through Dawai, this stretch against the last" now={stretch.use.series} before={stretch.use.prev} format={taka} />
            )}
            {stretch.money ? (
              <MixBar icon={Layers} title="Received by plan" rows={stretch.money.byPlan.map((p) => ({ label: p.plan, value: p.total }))} format={taka} empty="Nothing received in this stretch." />
            ) : (
              <RankList icon={Trophy} title="Busiest shops" rows={stretch.use.topShops.map((s) => ({ id: s.id, name: s.name, value: s.total, sub: `${s.bills} bills` }))} format={taka} />
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <PeriodBars title="Sign-ups, this stretch against the last" now={stretch.growth.signups.series} before={stretch.growth.signups.prev} pick={(p) => p.count} delay={80} />
            {stretch.money ? (
              <RankList icon={Trophy} title="Busiest shops" rows={stretch.use.topShops.map((s) => ({ id: s.id, name: s.name, value: s.total, sub: `${s.bills} bills` }))} format={taka} />
            ) : (
              <MixBar icon={Building2} title="Shops by where they stand" rows={[
                { label: 'Paying', value: data.shops.paying },
                { label: 'On trial', value: data.shops.onTrial },
                { label: 'Waiting for approval', value: data.shops.pending },
                { label: 'Suspended', value: data.shops.suspended },
              ]} />
            )}
          </div>
        </>
      )}

      <ShopMix shops={data.shops} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="card !mb-0">
          <h3 className="mb-2">Waiting on us</h3>
          {todo.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nothing waiting. Everything is answered.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {todo.map((t, i) => {
                const n = data.todo[t.key];
                const inner = (
                  <>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <t.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <strong className="block text-lg tabular-nums">{n}</strong>
                      <span className="text-xs text-muted-foreground">{n === 1 ? t.one : t.many}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </>
                );
                const cls = `motion-rise group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.04]`;
                // A same-page anchor for the follow-ups below; a route for everything else.
                return t.href.startsWith('#') ? (
                  <a key={t.key} href={t.href} className={cls} style={{ animationDelay: `${i * 60}ms` }}>
                    {inner}
                  </a>
                ) : (
                  <Link key={t.key} to={t.href} className={cls} style={{ animationDelay: `${i * 60}ms` }}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        {/* What the shops paid and when, month by month, for the half-year view. */}
        <MonthLine data={data} />
      </div>

      {data.leaving.length > 0 && (
        <div className="card mt-4">
          <h3 className="mb-2">Why shops did not renew <span className="text-xs font-normal text-muted-foreground">· last 90 days, in their words</span></h3>
          <div className="space-y-1.5">
            {data.leaving.map((l) => {
              const max = Math.max(...data.leaving.map((x) => x.count));
              return (
                <div key={l.reason} className="flex items-center gap-3 text-sm">
                  <span className="w-56 shrink-0 truncate">{l.label}</span>
                  <span className="h-2 flex-1 rounded-full bg-muted">
                    <span className="motion-grow-x block h-2 rounded-full" style={{ width: `${(l.count / max) * 100}%`, background: 'hsl(var(--primary))' }} />
                  </span>
                  <strong className="w-8 shrink-0 text-right tabular-nums">{l.count}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {followUps.length > 0 && (
        <div className="card mt-4" id="follow-ups">
          <h3 className="mb-2 flex items-center gap-2">
            <NotebookPen className="h-4 w-4" /> Follow-ups due
          </h3>
          <div className="divide-y divide-border">
            {followUps.map((n) => {
              const shop = typeof n.organization === 'object' && n.organization ? n.organization : null;
              const overdue = n.followUpAt && new Date(n.followUpAt) < new Date(new Date().setHours(0, 0, 0, 0));
              return (
                <Link key={n._id} to={shop ? `/shops/${shop._id}` : '/'} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm hover:text-primary">
                  <strong className="shrink-0">{shop?.name ?? 'A shop'}</strong>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{n.body}</span>
                  <span className={`pill ${overdue ? 'cancelled' : 'waiting'}`}>{overdue ? 'overdue' : 'today'}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Every shop, by where it stands — one bar, four parts, each named with its
 * count, so the colour is never the only way to read it. The four are the
 * validated categorical slots (see the shared theme), in a fixed order.
 */
function ShopMix({ shops }: { shops: PlatformOverview['shops'] }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const parts = [
    { key: 'paying', label: 'Paying', n: shops.paying, color: 'var(--mix-0)', href: '/?status=active' },
    { key: 'trial', label: 'On trial', n: shops.onTrial, color: 'var(--mix-2)', href: '/?plan=trial' },
    { key: 'pending', label: 'Waiting for approval', n: shops.pending, color: 'var(--mix-3)', href: '/?status=pending' },
    { key: 'suspended', label: 'Suspended', n: shops.suspended, color: 'var(--mix-1)', href: '/?status=suspended' },
  ];
  const total = Math.max(1, parts.reduce((a, p) => a + p.n, 0));
  return (
    <Rise delay={120} className="card mt-4 !mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="mb-0 flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Shops by where they stand
        </h3>
        <span className="text-xs text-muted-foreground">{shops.total} in all</span>
      </div>
      <div ref={ref} className="mt-4 flex h-4 gap-[2px] overflow-hidden rounded-full bg-muted">
        {parts.map((p, i) =>
          p.n > 0 ? (
            <div
              key={p.key}
              className={`h-full first:rounded-l-full last:rounded-r-full ${seen ? 'motion-grow-x' : 'scale-x-0'}`}
              style={{ width: `${(p.n / total) * 100}%`, background: p.color, animationDelay: `${150 + i * 110}ms` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {parts.map((p) => (
          <Link key={p.key} to={p.href} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-muted">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.label}</span>
            <strong className="tabular-nums">{p.n}</strong>
          </Link>
        ))}
      </div>
    </Rise>
  );
}

/**
 * Six months at a glance: sign-ups as bars, and — for whoever may see money —
 * what was received as a line drawn over them. The stretch above answers
 * "how is this month going"; this answers "which way is the business going".
 */
function MonthLine({ data }: { data: PlatformOverview }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const months = data.signups.byMonth;
  const topSign = Math.max(1, ...months.map((m) => m.count));
  const received = data.money?.byMonth ?? [];
  const topMoney = Math.max(1, ...received.map((m) => m.total));
  const W = 600;
  const H = 160;
  const x = (i: number) => (months.length > 1 ? (i / (months.length - 1)) * (W - 40) + 20 : W / 2);
  const pts = received.map((m, i) => [x(i), H - 12 - (m.total / topMoney) * (H - 30)]);
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  return (
    <Rise delay={140} className="card !mb-0 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" /> Six months
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/60" /> Sign-ups
          </span>
          {data.money && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-primary" /> Received
            </span>
          )}
        </div>
      </div>
      <div ref={ref} className="relative mt-4">
        <div className="flex h-40 items-end gap-3 border-b border-border px-2">
          {months.map((m, i) => (
            <div key={m.month} className="flex h-full flex-1 flex-col justify-end" title={`${MONTH(m.month)}: ${m.count} sign-ups${received[i] ? `, ${taka(received[i].total)} received` : ''}`}>
              <div
                className={`mx-auto w-full max-w-10 rounded-t-[5px] bg-sky-500/50 ${seen ? 'motion-grow-y' : 'scale-y-0'}`}
                style={{ height: `${(m.count / topSign) * 100}%`, minHeight: m.count ? 3 : 0, animationDelay: `${i * 90}ms` }}
              />
            </div>
          ))}
        </div>
        {data.money && received.length > 1 && (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full" aria-hidden="true">
            <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" pathLength={1000} className={seen ? 'motion-draw' : 'opacity-0'} />
          </svg>
        )}
        <div className="mt-1.5 flex gap-3 px-2">
          {months.map((m) => (
            <span key={m.month} className="flex-1 text-center text-[10px] text-muted-foreground">
              {MONTH(m.month)}
            </span>
          ))}
        </div>
      </div>
    </Rise>
  );
}
