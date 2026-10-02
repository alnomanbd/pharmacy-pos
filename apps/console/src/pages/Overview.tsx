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
} from 'lucide-react';
import { platformApi, type PlatformOverview, type ShopNote } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { errorMessage } from '../lib/ui';

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

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="card !mb-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
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
  const max = Math.max(1, ...rows.map((r) => r.value));
  const empty = rows.every((r) => r.value === 0);
  return (
    <div className="card !mb-0">
      <h3 className="mb-3">{title}</h3>

      <div className="relative flex h-40 items-end gap-2 border-b border-border pt-6" role="list" aria-label={title}>
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
              className={`block w-full max-w-10 rounded-t-[4px] transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
              style={{ height: `${(r.value / max) * 100}%`, minHeight: r.value > 0 ? 2 : 0, background: 'hsl(var(--primary))' }}
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

      <div className={`grid grid-cols-2 gap-3 ${money ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {money && <Tile label="Monthly revenue" value={taka(money.mrr)} sub={<span className="text-xs text-muted-foreground">from {data.shops.paying} paying shop{data.shops.paying === 1 ? '' : 's'}</span>} />}
        {money && <Tile label="Received this month" value={taka(money.thisMonth)} sub={<Delta now={money.thisMonth} before={money.lastMonth} money />} />}
        <Tile label="Paying shops" value={data.shops.paying.toLocaleString()} sub={<span className="text-xs text-muted-foreground">{data.shops.onTrial} on trial · {data.shops.total} in all</span>} />
        <Tile label="Sign-ups this month" value={data.signups.thisMonth.toLocaleString()} sub={<Delta now={data.signups.thisMonth} before={data.signups.lastMonth} />} />
        <Tile
          label="Trial to paid"
          value={data.conversion.rate === null ? '—' : `${data.conversion.rate}%`}
          sub={<span className="text-xs text-muted-foreground">{data.conversion.paid} of {data.conversion.signedUp} signed up in 90 days</span>}
        />
        <Tile
          label="Lost in 30 days"
          value={data.lost30d.toLocaleString()}
          sub={
            <Link to="/renewals" className="text-xs text-primary hover:underline">
              paid before, not renewed →
            </Link>
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="card !mb-0">
          <h3 className="mb-2">Today</h3>
          {todo.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Nothing waiting. Everything is answered.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {todo.map((t) => {
                const n = data.todo[t.key];
                const inner = (
                  <>
                    <t.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <strong className="tabular-nums">{n}</strong> {n === 1 ? t.one : t.many}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </>
                );
                const cls = 'flex items-center gap-3 py-2.5 text-sm hover:text-primary';
                // A same-page anchor for the follow-ups below; a route for everything else.
                return t.href.startsWith('#') ? (
                  <a key={t.key} href={t.href} className={cls}>
                    {inner}
                  </a>
                ) : (
                  <Link key={t.key} to={t.href} className={cls}>
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
                    <span className="block h-2 rounded-full" style={{ width: `${(l.count / max) * 100}%`, background: 'hsl(var(--primary))' }} />
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
