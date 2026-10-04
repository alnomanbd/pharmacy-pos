import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLinkedSearch } from '../components/useLinkedSearch';
import {
  CalendarX2,
  Loader2,
  Send,
  PackageX,
  TriangleAlert,
  Clock,
  CalendarClock,
  CircleHelp,
  Search,
  RefreshCw,
  X,
} from 'lucide-react';
import { shopApi, taka, type StockBatch, type Supplier } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import ConfirmWithReason from '../components/ConfirmWithReason';
import Pager from '../components/Pager';
import { useT, useNumerals, useUiLang, bnNumerals } from '../i18n/ui';
import { useAlertStore } from '../alerts/useStockAlerts';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * What is going out of date, and what to do about it.
 *
 * The report an owner renews for. Money sitting on a shelf with a date on it is
 * the loss a pharmacy actually makes, and the difference between finding out in
 * February and finding out in November is the whole of it.
 *
 * Three buckets, because each has a different answer: **gone** is a write-off,
 * **this month** is a discount or a quick word with the rep, and **the next
 * few months** is time to send it back on the next delivery. Sending back is
 * the action on this page, ticked straight from the list — a shop does it once
 * a month with the rep standing there, not one strip at a time.
 *
 * One list with tabs rather than a table per bucket, so a shop with three
 * hundred lots gets a page it can move through, and the tick boxes survive
 * moving between tabs and pages — the rep's pile is built across all of them.
 */

/**
 * The report populates `product` and `supplier`, so they arrive as objects
 * where the plain batch type has ids. Widened here rather than in the shared
 * type, because every other reader of a batch wants the id.
 */
type Row = Omit<StockBatch, 'product' | 'supplier'> & {
  product?: string | { name?: string; strength?: string; genericName?: string; rackLabel?: string };
  supplier?: string | { _id: string; name?: string } | null;
};

type Tab = 'all' | 'expired' | 'month' | 'later';

/** Lots per page. Enough to fill a laptop screen, few enough to tick through. */
const PAGE_SIZE = 15;
/** Where "this month" ends and "later" starts. */
const MONTH_DAYS = 30;
/** How far ahead the page looks. */
const HORIZON_DAYS = 120;

const product = (r: Row) => (typeof r.product === 'object' ? r.product : undefined);
const nameOf = (r: Row) => product(r)?.name || '';
const supplierOf = (r: Row) =>
  r.supplier && typeof r.supplier === 'object' ? r.supplier : null;

const daysLeft = (iso: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;

const bucketOf = (r: Row): Exclude<Tab, 'all'> => {
  const d = daysLeft(r.expiry) ?? Infinity;
  return d < 0 ? 'expired' : d <= MONTH_DAYS ? 'month' : 'later';
};

const worth = (r: Row) => r.qtyOnHand * (r.costPerPiece || 0);

export default function Expiry() {
  const t = useT();
  const { stop } = useNumerals();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [undated, setUndated] = useState(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [supplierId, setSupplierId] = useState('');
  const [busy, setBusy] = useState(false);
  const [writingOff, setWritingOff] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  /* The bell links here with a batch number: "show me lot D-10007". */
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get('q') ?? '');
  useLinkedSearch(setQ);
  const [page, setPage] = useState(1);

  /* Counts and figures in the reader's digits; batch numbers stay as printed. */
  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);
  const money = useCallback((v: number) => (lang === 'bn' ? bnNumerals(taka(v)) : taka(v)), [lang]);
  const monthOf = useCallback(
    (iso: string | null) => {
      if (!iso) return '—';
      const s = new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      return lang === 'bn' ? bnNumerals(s) : s;
    },
    [lang],
  );

  const load = useCallback(async () => {
    try {
      const [report, sup] = await Promise.all([shopApi.expiry(HORIZON_DAYS), shopApi.suppliers()]);
      setRows([...(report.expired.rows as Row[]), ...(report.soon.rows as Row[])]);
      setUndated(report.undated ?? 0);
      setSuppliers(sup);
      if (sup.length === 1) setSupplierId(sup[0]._id);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load the expiry list.', 'error');
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---- the four tiles ---- */
  const buckets = useMemo(() => {
    const out = {
      expired: { lots: 0, value: 0 },
      month: { lots: 0, value: 0 },
      later: { lots: 0, value: 0 },
    };
    for (const r of rows) {
      const b = out[bucketOf(r)];
      b.lots += 1;
      b.value += worth(r);
    }
    return out;
  }, [rows]);

  /* ---- what the list shows ---- */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== 'all' && bucketOf(r) !== tab) return false;
      if (!needle) return true;
      const p = product(r);
      return [p?.name, p?.genericName, r.batchNo, supplierOf(r)?.name]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [rows, tab, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  /* A write-off can empty the last page; fall back rather than show nothing. */
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const chosen = rows.filter((r) => picked[r._id]);
  const chosenValue = chosen.reduce((sum, r) => sum + worth(r), 0);
  const allShownPicked = shown.length > 0 && shown.every((r) => picked[r._id]);

  const pickShown = (on: boolean) =>
    setPicked((prev) => {
      const next = { ...prev };
      for (const r of shown) next[r._id] = on;
      return next;
    });

  const sendBack = async () => {
    if (!supplierId || chosen.length === 0) return;
    const to = suppliers.find((s) => s._id === supplierId)?.name ?? '';
    if (
      !(await confirmAction({
        title: t('Send these lots back to the supplier?'),
        message: `${n(chosen.length)} ${t(chosen.length === 1 ? 'lot' : 'lots')} · ${money(chosenValue)} → ${to}${stop} ${t('Their stock leaves the shelf now, and their cost comes off what you owe this supplier.')}`,
        confirmLabel: t('Send back'),
        tone: 'danger',
        icon: 'warning',
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await shopApi.returnToSupplier(supplierId, {
        lines: chosen.map((r) => ({ batchId: r._id, pieces: r.qtyOnHand })),
        reason: 'Expiry and damage',
      });
      useAlertStore.getState().refresh();
      toast(`${chosen.length} lots sent back · ${taka(res.credit)} off what you owe.`);
      setPicked({});
      await load();
    } catch (e: unknown) {
      const err = (e as { response?: { data?: { message?: string } } }).response;
      toast(err?.data?.message || 'Could not send those back.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const writeOff = async (row: Row) => {
    setBusy(true);
    try {
      await shopApi.adjust({
        batchId: row._id,
        qtyDelta: -row.qtyOnHand,
        move: 'expiry',
        reason: `Expired ${new Date(row.expiry ?? '').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`,
      });
      useAlertStore.getState().refresh();
      toast(`${nameOf(row)} written off.`);
      setWritingOff(null);
      setPicked((prev) => ({ ...prev, [row._id]: false }));
      await load();
    } catch (e: unknown) {
      const err = (e as { response?: { data?: { message?: string } } }).response;
      toast(err?.data?.message || 'Could not write that off.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock />;

  const total = buckets.expired.value + buckets.month.value + buckets.later.value;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'expired', label: 'Expired', count: buckets.expired.lots },
    { key: 'month', label: 'Within 30 days', count: buckets.month.lots },
    { key: 'later', label: '31–120 days', count: buckets.later.lots },
  ];

  return (
    <div className="page pb-24">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <CalendarX2 className="h-5 w-5" /> {t('Expiry')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {money(total)} {t('on the shelf with a date on it — the loss worth catching early.')}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost h-9"
          onClick={() => {
            setReloading(true);
            void load();
          }}
          disabled={reloading}
        >
          <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
      </div>

      {/* ---- four tiles, one shape: icon, figure, label, a line under it ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={TriangleAlert}
          tone="bad"
          value={money(buckets.expired.value)}
          label={t('Already expired')}
          sub={`${n(buckets.expired.lots)} ${t('lots')} · ${t('write off or send back')}`}
          active={tab === 'expired'}
          onClick={() => {
            setTab('expired');
            setPage(1);
          }}
        />
        <Tile
          icon={Clock}
          tone="warn"
          value={money(buckets.month.value)}
          label={t('Within 30 days')}
          sub={`${n(buckets.month.lots)} ${t('lots')} · ${t('sell these first')}`}
          active={tab === 'month'}
          onClick={() => {
            setTab('month');
            setPage(1);
          }}
        />
        <Tile
          icon={CalendarClock}
          tone="calm"
          value={money(buckets.later.value)}
          label={t('31–120 days')}
          sub={`${n(buckets.later.lots)} ${t('lots')} · ${t('talk to the rep')}`}
          active={tab === 'later'}
          onClick={() => {
            setTab('later');
            setPage(1);
          }}
        />
        <Tile
          icon={CircleHelp}
          tone="muted"
          value={n(undated)}
          label={t('No date recorded')}
          sub={t('older lots — check the strip')}
        />
      </div>

      {/* ---- the list ---- */}
      <div className="card mt-4 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
            {TABS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={tab === x.key}
                onClick={() => {
                  setTab(x.key);
                  setPage(1);
                }}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === x.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(x.label)}
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    x.key === 'expired' && x.count > 0
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
              placeholder={t('Medicine, batch or company…')}
              aria-label={t('Search')}
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="empty py-12">
            <PackageX className="h-6 w-6" />
            <p>{q ? t('Nothing matches that.') : t('Nothing here. Good.')}</p>
            {/* This page holds only what is expired or close to it; a lot
                with years to go is on the Stock page. */}
            {q.trim() && (
              <p className="text-xs">
                {t(`Only lots that expire within ${HORIZON_DAYS} days are here.`)}{' '}
                <Link to={`/stock?q=${encodeURIComponent(q.trim())}`} className="font-medium text-primary hover:underline">
                  {t('Look in Stock')} →
                </Link>
              </p>
            )}
          </div>
        ) : (
          <>
          {/* A phone gets a card per lot: eight columns across 390px broke the
              batch number in two and pushed the worth off the screen. */}
          <ul className="divide-y divide-border sm:hidden">
            {shown.map((r) => {
              const left = daysLeft(r.expiry);
              const b = bucketOf(r);
              const p = product(r);
              return (
                <li key={r._id} className={`flex gap-3 px-4 py-3 ${picked[r._id] ? 'bg-primary/5' : ''}`}>
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    aria-label={`Send ${nameOf(r)} back`}
                    checked={!!picked[r._id]}
                    onChange={(e) => setPicked((prev) => ({ ...prev, [r._id]: e.target.checked }))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold">{nameOf(r)}</span>{' '}
                        {p?.strength && <span className="text-muted-foreground">{p.strength}</span>}
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(worth(r))}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {[p?.genericName, supplierOf(r)?.name].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {t('Batch')} <span className="font-mono">{r.batchNo || '—'}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {monthOf(r.expiry)} · {n(r.qtyOnHand)} {t('pcs')}
                      </span>
                      {left !== null && (
                        <span className={`pill !py-0 ${b === 'expired' ? 'danger' : b === 'month' ? 'pending' : 'neutral'}`}>
                          {left < 0 ? `${n(Math.abs(left))} ${t('days ago')}` : `${n(left)} ${t('days left')}`}
                        </span>
                      )}
                      {b === 'expired' && (
                        <button
                          type="button"
                          disabled={busy}
                          className="ml-auto rounded-md px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                          onClick={() => setWritingOff(r)}
                        >
                          {t('Write off')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th className="w-10 pl-4">
                    <input
                      type="checkbox"
                      aria-label={t('Pick everything on this page')}
                      checked={allShownPicked}
                      onChange={(e) => pickShown(e.target.checked)}
                    />
                  </th>
                  <th>{t('Item')}</th>
                  <th>{t('Batch')}</th>
                  <th>{t('Company')}</th>
                  <th>{t('Expiry')}</th>
                  <th className="text-right">{t('On hand')}</th>
                  <th className="text-right">{t('Worth')}</th>
                  <th className="pr-4" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const left = daysLeft(r.expiry);
                  const b = bucketOf(r);
                  const p = product(r);
                  return (
                    <tr key={r._id} className={picked[r._id] ? 'bg-primary/5' : undefined}>
                      <td className="pl-4">
                        <input
                          type="checkbox"
                          aria-label={`Send ${nameOf(r)} back`}
                          checked={!!picked[r._id]}
                          onChange={(e) =>
                            setPicked((prev) => ({ ...prev, [r._id]: e.target.checked }))
                          }
                        />
                      </td>
                      <td className="pr-3">
                        <span className="font-semibold">{nameOf(r)}</span>{' '}
                        {p?.strength && (
                          <span className="text-muted-foreground">{p.strength}</span>
                        )}
                        <span className="block text-[11px] text-muted-foreground">
                          {[p?.genericName, p?.rackLabel && `${t('rack')} ${p.rackLabel}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs">{r.batchNo || '—'}</td>
                      <td className="text-xs text-muted-foreground">{supplierOf(r)?.name || '—'}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {monthOf(r.expiry)}
                        {left !== null && (
                          <span
                            className={`pill mt-0.5 flex w-fit ${
                              b === 'expired' ? 'danger' : b === 'month' ? 'pending' : 'neutral'
                            }`}
                          >
                            {left < 0
                              ? `${n(Math.abs(left))} ${t('days ago')}`
                              : `${n(left)} ${t('days left')}`}
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{n(r.qtyOnHand)}</td>
                      <td className="text-right tabular-nums">{money(worth(r))}</td>
                      <td className="pr-4 text-right">
                        {b === 'expired' && (
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setWritingOff(r)}
                          >
                            {t('Write off')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* ---- the pager, only when there is more than one page ---- */}
        <Pager
          page={current}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPage={setPage}
          className="border-t border-border px-4 py-3"
        />
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        {t(
          'Sending back takes the strips off the shelf and reduces what you owe that company, valued at what you paid — not at MRP, which the company would not accept either. Writing off takes them off the shelf and keeps the loss where it happened.',
        )}
      </p>

      {/*
        The send-back bar, only once something is ticked.

        Floating over the foot of the page rather than sitting in a tile at the
        top, because the ticking happens down in the list — and a shop picking
        across three pages should not have to scroll back up to finish.
      */}
      {chosen.length > 0 && (
        <div className="sticky bottom-3 z-30 mt-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3 shadow-xl">
            <div className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
              <strong>
                {n(chosen.length)} {t(chosen.length === 1 ? 'lot picked' : 'lots picked')}
              </strong>
              <span className="text-muted-foreground"> · {money(chosenValue)}</span>
            </div>
            <select
              className="input h-9 min-w-0 flex-1 sm:w-auto sm:min-w-44 sm:flex-none"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              aria-label={t('Send back to')}
            >
              <option value="">{t('Send back to…')}</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn h-9"
              disabled={busy || !supplierId}
              onClick={() => void sendBack()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{' '}
              {t('Send back')}
            </button>
            <button
              type="button"
              onClick={() => setPicked({})}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('Clear')}
              title={t('Clear')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <ConfirmWithReason
        open={writingOff !== null}
        title={t('Write off this lot')}
        message={
          writingOff
            ? `${nameOf(writingOff)} — ${writingOff.qtyOnHand} piece${
                writingOff.qtyOnHand === 1 ? '' : 's'
              }, worth ${taka(worth(writingOff))}. It stays in
              the ledger with your name on it — that is the point.`
            : ''
        }
        confirmLabel="Write it off"
        placeholder={t('Past its date — kept with the loss')}
        busy={busy}
        onCancel={() => setWritingOff(null)}
        onConfirm={() => void (writingOff && writeOff(writingOff))}
      />
    </div>
  );
}

const TONES = {
  bad: 'bg-destructive/10 text-destructive',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  calm: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
} as const;

/**
 * One tile. Every tile has the same four parts in the same places, and the
 * grid stretches them to one height, so a long label on one never makes it
 * taller than its neighbours.
 */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
  sub,
  active,
  onClick,
}: {
  icon: typeof Clock;
  tone: keyof typeof TONES;
  value: string;
  label: string;
  sub: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 min-h-[2.4em] leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div
        className={`value mt-2 stat-fit [--fit-max:26px] ${tone === 'bad' ? 'text-destructive' : ''}`}
      >
        {value}
      </div>
      <div className="mt-auto line-clamp-2 min-h-[2.6em] pt-2 text-[11.5px] leading-snug text-muted-foreground">{sub}</div>
    </>
  );
  const cls = `stat flex h-full min-h-[150px] flex-col text-left ${
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
