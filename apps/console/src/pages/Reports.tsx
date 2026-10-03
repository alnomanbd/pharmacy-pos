import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  CreditCard,
  Download,
  FileBarChart,
  Globe,
  Layers,
  Receipt,
  ShoppingCart,
  Store,
  Trophy,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { platformApi, type PlatformStretch, type StretchPoint } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { Rise } from '@dawai/shared/components/motion';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { errorMessage, BTN_OUTLINE } from '../lib/ui';
import { useRange, RangeBar, Hero, CompareTile, PeriodBars, MixBar, RankList, rangeLine, taka, num, downloadCsv } from '../components/Stretch';

/**
 * The platform's reports: money, growth, and how the shops are using Dawai —
 * any stretch against the same number of days before it, every table one
 * click from a CSV.
 *
 * Money is for whoever may see what the company turns over; the other two are
 * for anybody who can see the shops.
 */

type Tab = 'money' | 'growth' | 'use';

const day = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Reports() {
  const { toast } = useToast();
  const r = useRange('30');
  const [data, setData] = useState<PlatformStretch | null>(null);
  const [tab, setTab] = useState<Tab>('use');
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    setData(null);
    platformApi
      .stretch(r.range)
      .then((d) => {
        setData(d);
        /* Somebody who may see money starts on money. */
        setTab((t) => (t === 'use' && d.money ? 'money' : t));
      })
      .catch((e) => toast(errorMessage(e, 'Could not load the report.'), 'error'));
  }, [r.range, toast]);

  const tabs: { key: Tab; label: string; icon: typeof Wallet }[] = [
    ...(data?.money ? [{ key: 'money' as const, label: 'Money', icon: Wallet }] : []),
    { key: 'growth', label: 'Growth', icon: UserPlus },
    { key: 'use', label: 'Shops’ use', icon: Store },
  ];
  void role;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground">Any stretch against the same number of days before it — and every table as a file.</p>
        </div>
        <div className="flex rounded-xl bg-muted p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <RangeBar r={r} />
      {data && <p className="-mt-2 mb-4 text-xs text-muted-foreground">{rangeLine(data.range)}</p>}

      {!data ? (
        <LoadingBlock />
      ) : tab === 'money' && data.money ? (
        <MoneyTab d={data} />
      ) : tab === 'growth' ? (
        <GrowthTab d={data} />
      ) : (
        <UseTab d={data} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ money -- */

function MoneyTab({ d }: { d: PlatformStretch }) {
  const m = d.money!;
  const avg = (x: { now: number }, n: { now: number }) => (n.now ? x.now / n.now : 0);
  const avgBefore = m.payments.before ? m.received.before / m.payments.before : 0;
  return (
    <>
      <Hero icon={Wallet} label="Received" now={m.received.now} before={m.received.before} format={taka} line={m.series.map((p) => p.total)} sub={`${m.payments.now} payments accepted`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CompareTile icon={Receipt} tone="bg-primary/10 text-primary" label="Payments accepted" now={m.payments.now} before={m.payments.before} />
        <CompareTile icon={CreditCard} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label="Average payment" now={avg(m.received, m.payments)} before={avgBefore} format={taka} delay={60} />
        <CompareTile icon={BadgeCheck} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label="Paid for the first time" now={d.growth.firstPaid.now} before={d.growth.firstPaid.before} delay={120} />
        <CompareTile icon={UserMinus} tone="bg-destructive/10 text-destructive" label="Lost — did not renew" now={d.growth.lost.now} before={d.growth.lost.before} upIsBad delay={180} />
      </div>
      <div className="mt-4">
        <PeriodBars title="Received, this stretch against the last" now={m.series} before={m.prev} format={taka} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MixBar icon={Layers} title="By plan" rows={m.byPlan.map((p) => ({ label: p.plan, value: p.total }))} format={taka} />
        <MixBar icon={CreditCard} title="By how they paid" rows={m.byMethod.map((p) => ({ label: p.method, value: p.total }))} format={taka} />
        <RankList icon={Trophy} title="Who paid most" rows={m.topPayers.map((p) => ({ id: p.id, name: p.name, value: p.total, sub: `${p.count}×` }))} format={taka} />
      </div>
      <DailyTable title="Day by day" file={`dawai-received-${d.range.from}-${d.range.to}.csv`} rows={m.series} cols={['Payments', 'Received']} cells={(p) => [p.count, p.total]} format={[num, taka]} />
    </>
  );
}

/* ----------------------------------------------------------------- growth -- */

function GrowthTab({ d }: { d: PlatformStretch }) {
  const g = d.growth;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CompareTile icon={UserPlus} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label="Sign-ups" now={g.signups.now} before={g.signups.before} />
        <CompareTile icon={BadgeCheck} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label="Paid for the first time" now={g.firstPaid.now} before={g.firstPaid.before} delay={60} />
        <CompareTile icon={UserMinus} tone="bg-destructive/10 text-destructive" label="Lost — did not renew" now={g.lost.now} before={g.lost.before} upIsBad delay={120} />
        <CompareTile icon={Store} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" label="Paying shops now" now={d.use.payingNow} before={d.use.payingNow} delay={180} />
      </div>
      <div className="mt-4">
        <PeriodBars title="Sign-ups, this stretch against the last" now={g.signups.series} before={g.signups.prev} pick={(p) => p.count} />
      </div>
      <TableCard
        icon={UserMinus}
        title="Lost in this stretch"
        note="Paid before, and the subscription ran out without a renewal."
        empty="Nobody was lost in this stretch."
        file={`dawai-lost-${d.range.from}-${d.range.to}.csv`}
        head={['Shop', 'Plan', 'Ran out']}
        rows={g.lost.shops.map((s) => ({ id: s.id, cells: [s.name, s.plan, day(s.endedAt.slice(0, 10))] }))}
      />
      <DailyTable title="Sign-ups day by day" file={`dawai-signups-${d.range.from}-${d.range.to}.csv`} rows={g.signups.series} cols={['Sign-ups']} cells={(p) => [p.count]} format={[num]} />
    </>
  );
}

/* -------------------------------------------------------------------- use -- */

function UseTab({ d }: { d: PlatformStretch }) {
  const u = d.use;
  const avgBill = u.bills.now ? u.sold.now / u.bills.now : 0;
  const avgBillBefore = u.bills.before ? u.sold.before / u.bills.before : 0;
  return (
    <>
      <Hero icon={ShoppingCart} label="Sold through Dawai" now={u.sold.now} before={u.sold.before} format={taka} line={u.series.map((p) => p.total)} sub={`${num(u.bills.now)} bills across ${u.activeShops.now} shop${u.activeShops.now === 1 ? '' : 's'}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CompareTile icon={Receipt} tone="bg-primary/10 text-primary" label="Bills rung up" now={u.bills.now} before={u.bills.before} />
        <CompareTile icon={CreditCard} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label="Average bill" now={avgBill} before={avgBillBefore} format={taka} delay={60} />
        <CompareTile icon={Store} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" label="Shops that sold" now={u.activeShops.now} before={u.activeShops.before} delay={120} />
        <CompareTile icon={Globe} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label="Online orders" now={u.onlineOrders.now} before={u.onlineOrders.before} delay={180} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PeriodBars title="Sold through Dawai, this stretch against the last" now={u.series} before={u.prev} format={taka} />
        <RankList icon={Trophy} title="Busiest shops" rows={u.topShops.map((s) => ({ id: s.id, name: s.name, value: s.total, sub: `${num(s.bills)} bills` }))} format={taka} />
      </div>
      <TableCard
        icon={AlertTriangle}
        title="Paying shops that sold nothing"
        note="Paying, and not one bill in this stretch — the shops most likely not to renew. Worth a call."
        empty="Every paying shop sold something in this stretch."
        file={`dawai-quiet-shops-${d.range.from}-${d.range.to}.csv`}
        head={['Shop', 'Plan', 'Paid until']}
        rows={u.quiet.map((s) => ({ id: s.id, cells: [s.name, s.plan, day(s.paidUntil.slice(0, 10))] }))}
      />
      <TableCard
        icon={Trophy}
        title="Busiest shops"
        empty="No shop sold anything in this stretch."
        file={`dawai-busiest-shops-${d.range.from}-${d.range.to}.csv`}
        head={['Shop', 'Plan', 'Bills', 'Sold']}
        rows={u.topShops.map((s) => ({ id: s.id, cells: [s.name, s.plan, num(s.bills), taka(s.total)], raw: [s.name, s.plan, s.bills, s.total] }))}
      />
      <DailyTable title="Day by day" file={`dawai-shop-sales-${d.range.from}-${d.range.to}.csv`} rows={u.series} cols={['Bills', 'Sold']} cells={(p) => [p.count, p.total]} format={[num, taka]} />
    </>
  );
}

/* ----------------------------------------------------------------- tables -- */

function TableCard({
  icon: Icon,
  title,
  note,
  empty,
  file,
  head,
  rows,
}: {
  icon: typeof Wallet;
  title: string;
  note?: string;
  empty: string;
  file: string;
  head: string[];
  rows: { id: string; cells: ReactNode[]; raw?: (string | number)[] }[];
}) {
  return (
    <Rise className="card mt-4 !mb-0">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="mb-0 flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" /> {title}
          </h3>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            className={BTN_OUTLINE}
            onClick={() => downloadCsv(file, head, rows.map((r) => r.raw ?? r.cells.map((c) => String(c ?? ''))))}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="empty py-6">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={h} className={i > 1 ? 'text-right' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {r.cells.map((c, i) => (
                    <td key={i} className={i > 1 ? 'text-right tabular-nums' : ''}>
                      {i === 0 ? (
                        <Link to={`/shops/${r.id}`} className="font-medium hover:text-primary">
                          {c}
                        </Link>
                      ) : (
                        c
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Rise>
  );
}

function DailyTable({
  title,
  file,
  rows,
  cols,
  cells,
  format,
}: {
  title: string;
  file: string;
  rows: StretchPoint[];
  cols: string[];
  cells: (p: StretchPoint) => number[];
  format: ((v: number) => string)[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Rise className="card mt-4 !mb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0">{title}</h3>
        <div className="flex gap-2">
          <button type="button" className={BTN_OUTLINE} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show'} the table
          </button>
          <button type="button" className={BTN_OUTLINE} onClick={() => downloadCsv(file, ['Day', ...cols], rows.map((p) => [p.dayKey, ...cells(p)]))}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="table w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th>Day</th>
                {cols.map((c) => (
                  <th key={c} className="text-right">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.dayKey}>
                  <td className="tabular-nums">{day(p.dayKey)}</td>
                  {cells(p).map((v, i) => (
                    <td key={i} className="text-right tabular-nums">
                      {format[i](v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Rise>
  );
}
