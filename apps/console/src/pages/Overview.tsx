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
  ArrowDownRight,
  CheckCircle2,
  Wallet,
  TrendingUp,
  UserPlus,
  UserMinus,
  Store,
} from 'lucide-react';
import { platformApi, type PlatformOverview, type ShopNote } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { errorMessage } from '../lib/ui';
import { CountUp, Rise, Ring, Sparkline, useSeen } from '@dawai/shared/components/motion';

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

/** "+3 on last month", "−৳1,500 on last month", or "same as last month". */
function Delta({ now, before, money = false }: { now: number; before: number; money?: boolean }) {
  const diff = now - before;
  if (diff === 0) return <span className="text-xs text-muted-foreground">same as last month</span>;
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const amount = money ? taka(Math.abs(diff)) : Math.abs(diff).toLocaleString();
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`} />
      {up ? '+' : '−'}
      {amount} on last month
    </span>
  );
}

function Tile({
  label,
  value,
  format = (n: number) => n.toLocaleString(),
  sub,
  icon: Icon,
  tone = 'bg-primary/10 text-primary',
  delay = 0,
  side,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  sub?: React.ReactNode;
  icon: typeof Receipt;
  tone?: string;
  delay?: number;
  /** Beside the figure, on the right — a ring, for a share. */
  side?: React.ReactNode;
}) {
  return (
    <Rise delay={delay} className="h-full">
      <div className="card !mb-0 flex h-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          </div>
          <div className="mt-2.5 text-2xl font-bold tabular-nums">
            <CountUp value={value} format={format} />
          </div>
          {sub && <div className="mt-1">{sub}</div>}
        </div>
        {side}
      </div>
    </Rise>
  );
}

/**
 * Six months as bars, one measure.
 *
 * Thin bars rounded at the top and square on the baseline, a hairline baseline
 * and no grid, the value in text ink on hover or focus, and the month under
 * each bar. Every bar is focusable, so the numbers are not mouse-only.
 */
function Bars({ title, rows, format }: { title: string; rows: { label: string; value: number }[]; format: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [plot, seen] = useSeen<HTMLDivElement>();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const empty = rows.every((r) => r.value === 0);
  return (
    <div className="card !mb-0">
      <h3 className="mb-3">{title}</h3>

      <div ref={plot} className="relative flex h-40 items-end gap-2 border-b border-border pt-6" role="list" aria-label={title}>
        {/* Six flat months say "nothing yet" better in words than as a blank chart. */}
        {empty && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">Nothing in the last six months yet.</p>}
        {rows.map((r, i) => (
          <div
            key={r.label}
            role="listitem"
            tabIndex={0}
            aria-label={`${r.label}: ${format(r.value)}`}
            className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {hover === i && (
              <span className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground shadow-sm">
                {format(r.value)}
              </span>
            )}
            <span
              className={`block w-full max-w-10 rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''} ${
                seen ? 'motion-grow-y' : 'scale-y-0'
              }`}
              style={{
                height: `${(r.value / max) * 100}%`,
                minHeight: r.value > 0 ? 2 : 0,
                background: i === rows.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.65)',
                animationDelay: `${i * 90}ms`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {rows.map((r, i) => (
          <span key={r.label} className={`flex-1 text-center text-[11px] ${i === rows.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

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

      {/* ---- the headline: what the shops pay us, and its shape ---- */}
      {money && (
        <Rise className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent p-5 sm:p-6">
          <Sparkline
            values={money.byMonth.map((m) => m.total)}
            className="absolute bottom-0 right-0 h-2/5 w-full opacity-50 sm:h-3/5 sm:w-1/2"
          />
          <div className="relative flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-4 w-4 text-primary" /> Monthly revenue
              </div>
              <div className="mt-1 text-4xl font-bold tabular-nums text-primary">
                <CountUp value={money.mrr} format={taka} duration={1200} />
              </div>
              <div className="text-xs text-muted-foreground">
                from {data.shops.paying} paying shop{data.shops.paying === 1 ? '' : 's'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" /> Received this month
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                <CountUp value={money.thisMonth} format={taka} />
              </div>
              <Delta now={money.thisMonth} before={money.lastMonth} money />
            </div>
          </div>
        </Rise>
      )}

      {/* ---- four figures ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Store}
          label="Paying shops"
          value={data.shops.paying}
          sub={<span className="text-xs text-muted-foreground">{data.shops.onTrial} on trial · {data.shops.total} in all</span>}
        />
        <Tile
          icon={UserPlus}
          tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          label="Sign-ups this month"
          value={data.signups.thisMonth}
          delay={70}
          sub={<Delta now={data.signups.thisMonth} before={data.signups.lastMonth} />}
        />
        <Tile
          icon={TrendingUp}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          label="Trial to paid"
          value={data.conversion.paid}
          format={(n) => `${n} of ${data.conversion.signedUp}`}
          delay={140}
          sub={<span className="text-xs text-muted-foreground">signed up in the last 90 days</span>}
          side={<Ring value={data.conversion.rate} size={64} label={`Trial to paid: ${data.conversion.rate ?? 0}%`} />}
        />
        <Tile
          icon={UserMinus}
          tone="bg-destructive/10 text-destructive"
          label="Lost in 30 days"
          value={data.lost30d}
          delay={210}
          sub={
            <Link to="/renewals" className="text-xs text-primary hover:underline">
              paid before, not renewed →
            </Link>
          }
        />
      </div>

      <ShopMix shops={data.shops} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="card !mb-0">
          <h3 className="mb-2">Today</h3>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Bars title="Sign-ups" rows={data.signups.byMonth.map((m) => ({ label: MONTH(m.month), value: m.count }))} format={(n) => `${n} sign-up${n === 1 ? '' : 's'}`} />
          {money && <Bars title="Received" rows={money.byMonth.map((m) => ({ label: MONTH(m.month), value: m.total }))} format={taka} />}
        </div>
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
