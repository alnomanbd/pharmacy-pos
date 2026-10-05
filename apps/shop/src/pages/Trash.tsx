import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2,
  RotateCcw,
  ReceiptText,
  Boxes,
  Users,
  Building2,
  LayoutGrid,
  Monitor,
  Loader2,
  Wallet,
  Search,
  CalendarClock,
  UserRound,
  Layers,
  Quote,
  ShieldCheck,
  HandCoins,
  Landmark,
} from 'lucide-react';
import { shopApi, type BinItem } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import ConfirmWithReason from '../components/ConfirmWithReason';
import Pager from '../components/Pager';
import { useT, useUiLang, bnNumerals, useNumerals } from '../i18n/ui';

/**
 * The bin.
 *
 * Nothing a shopkeeper deletes is gone, and this is where it went. One screen
 * for all of it — a bill, an item, a customer, a company, a shelf, a counter,
 * an expense — because "I deleted something and I want it back" is one
 * thought, and making somebody remember which page they deleted it from is
 * making them do the filing.
 *
 * Every line carries who threw it away, when, and the reason they had to type.
 * That is not bookkeeping for its own sake: the question an owner opens this
 * page with is almost never "what is in here", it is "who deleted that, and
 * what did they say" — which is why the list reads as a timeline, day by day,
 * with the reason quoted on each line.
 *
 * A bill comes back **cancelled**, not live. The money and the stock were
 * reversed when it went in, and putting those back is a second act with its own
 * reason — "I did not mean to delete that" and "that sale did happen after all"
 * are different sentences.
 */

/* An icon and a hue per kind of thing, so a glance down the list reads it. */
const LOOK: Record<BinItem['kind'], { icon: typeof Boxes; tone: string }> = {
  sale: { icon: ReceiptText, tone: 'bg-primary/10 text-primary' },
  product: { icon: Boxes, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  customer: { icon: Users, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  supplier: { icon: Building2, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  rack: { icon: LayoutGrid, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  counter: { icon: Monitor, tone: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
  expense: { icon: Wallet, tone: 'bg-destructive/10 text-destructive' },
  income: { icon: HandCoins, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  cashmove: { icon: Landmark, tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
};
/* Anything the server learns to bin before this screen does still draws. */
const lookOf = (k: string) => LOOK[k as BinItem['kind']] ?? { icon: Trash2, tone: 'bg-muted text-muted-foreground' };

const KINDS = [
  { key: '', label: 'Everything' },
  { key: 'sale', label: 'Bills' },
  { key: 'product', label: 'Items' },
  { key: 'customer', label: 'Customers' },
  { key: 'supplier', label: 'Suppliers' },
  { key: 'rack', label: 'Racks' },
  { key: 'counter', label: 'Counters' },
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'cashmove', label: 'Owner & bank' },
] as const;

/** Lines per page. The bin comes whole; this is how much one screen shows. */
const PAGE_SIZE = 20;

const time = (iso: string, lang: string) =>
  iso ? new Date(iso).toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

/** A day's heading in the timeline: Today, Yesterday, or the date. */
const dayHeading = (iso: string, t: (k: string) => string, lang: string) => {
  if (!iso) return t('Undated');
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return t('Today');
  if (diff === 1) return t('Yesterday');
  // The browser writes a Bangla date itself — বুধবার, ৩০ সেপ্টেম্বর ২০২৬ — month and day names included.
  return d.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export default function Trash() {
  const t = useT();
  const { stop } = useNumerals();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<BinItem[]>([]);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState<BinItem | null>(null);
  const [busy, setBusy] = useState(false);

  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);
  /*
   * The server writes each line's summary in English — "Walk-in · ৳650",
   * "rack R1", "৳120 owed", "৳80 · other". Read part by part here: the words
   * the shop knows go over to Bangla, figures take Bangla digits, and what
   * somebody typed (a note, a name) is left exactly as they typed it.
   */
  const say = useCallback(
    (text?: string) =>
      (text ?? '')
        .split(' · ')
        .map((part) => {
          const rack = /^rack (.+)$/.exec(part);
          if (rack) return `${t('rack')} ${rack[1]}`;
          const owed = /^(৳[\d,.]+) owed$/.exec(part);
          if (owed) return `${n(owed[1]!)} ${t('owed')}`;
          if (/^৳[\d,.]+$/.test(part) || /^\d{4}-\d{2}-\d{2}$/.test(part)) return n(part);
          return t(part);
        })
        .join(' · '),
    [n, t],
  );

  /*
   * The whole bin, always, and the tabs filter it here.
   *
   * A bin is small — nobody deletes a thousand things — and fetching only the
   * chosen kind would make every other tab's count disappear the moment one was
   * picked, which is exactly when those counts are worth seeing.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await shopApi.trash());
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not open the Recycle Bin.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      if (asking.kind === 'sale') await shopApi.restoreSale(asking.id);
      else await shopApi.unbin(asking.kind, asking.id);
      toast(`${asking.title} ${t('is back')}${stop}`);
      setAsking(null);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not bring that back.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.kind, (by.get(r.kind) ?? 0) + 1);
    return by;
  }, [rows]);

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86_400_000;
    const people = new Map<string, number>();
    for (const r of rows) if (r.deletedByName) people.set(r.deletedByName, (people.get(r.deletedByName) ?? 0) + 1);
    const top = [...people.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      week: rows.filter((r) => r.deletedAt && new Date(r.deletedAt).getTime() >= week).length,
      people: people.size,
      top,
      latest: rows[0],
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!needle || [r.title, r.meta, r.reason, r.deletedByName].some((s) => s?.toLowerCase().includes(needle))),
    );
  }, [rows, kind, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /* The page's lines, grouped under the day they were thrown away. */
  const days = useMemo(() => {
    const groups: { heading: string; items: BinItem[] }[] = [];
    for (const r of shown) {
      const heading = dayHeading(r.deletedAt, t, lang);
      const last = groups[groups.length - 1];
      if (last && last.heading === heading) last.items.push(r);
      else groups.push({ heading, items: [r] });
    }
    return groups;
  }, [shown, t]);

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> {t('Recycle Bin')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Everything deleted, who deleted it, and the way back.')}
          </p>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <LoadingBlock />
      ) : (
        <>
          {/* ---- four tiles, one shape ---- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Trash2} tone="bg-destructive/10 text-destructive" label={t('In the Recycle Bin')} value={n(rows.length)}>
              {n(counts.size)} {t(counts.size === 1 ? 'kind of thing' : 'kinds of thing')}
            </Tile>
            <Tile icon={CalendarClock} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400" label={t('This week')} value={n(stats.week)}>
              {t('deleted in the last 7 days')}
            </Tile>
            <Tile icon={UserRound} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label={t('Deleted by')} value={n(stats.people)}>
              {stats.top ? `${t('mostly')} ${stats.top[0]} (${n(stats.top[1])})` : t('nobody yet')}
            </Tile>
            <Tile icon={Layers} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label={t('Latest')} value={stats.latest ? t(stats.latest.label) : '—'}>
              {stats.latest ? `${stats.latest.title}` : t('the Recycle Bin is empty')}
            </Tile>
          </div>

          {/* ---- find and filter ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
              {KINDS.map((k) => {
                const c = k.key ? counts.get(k.key) ?? 0 : rows.length;
                const Icon = k.key ? lookOf(k.key).icon : Layers;
                return (
                  <button
                    key={k.key || 'all'}
                    type="button"
                    role="tab"
                    aria-selected={kind === k.key}
                    onClick={() => {
                      setKind(k.key);
                      setPage(1);
                    }}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      kind === k.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    } ${c === 0 && k.key ? 'opacity-50' : ''}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(k.label)}
                    <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {n(c)}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="relative block w-full sm:ml-auto sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input h-9 pl-9"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder={t('Name, reason or who…')}
                aria-label={t('Search')}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="card mt-4">
              <div className="empty py-12">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <p className="font-semibold">{rows.length ? t('Nothing matches that.') : t('Nothing in the Recycle Bin.')}</p>
                {!rows.length && (
                  <p className="max-w-lg">
                    {t(
                      'Deleting anything in the shop puts it here rather than destroying it — a bill, an item, a customer, a company, a shelf, a counter. Bring it back from here whenever you need to.',
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {days.map((d) => (
                <section key={d.heading}>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {d.heading}
                    <span className="h-px flex-1 bg-border" />
                    <span className="tabular-nums">{n(d.items.length)}</span>
                  </h3>
                  <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-card">
                    {d.items.map((r) => {
                      const look = lookOf(r.kind);
                      return (
                        <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${look.tone}`}>
                            <look.icon className="h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="truncate font-semibold">{say(r.title)}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${look.tone}`}>
                                {t(r.label)}
                              </span>
                            </div>
                            {r.meta && <p className="truncate text-[11.5px] text-muted-foreground">{say(r.meta)}</p>}
                            {r.reason && (
                              <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                                <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 break-words">{r.reason}</span>
                              </p>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {t('Deleted by')} <span className="font-medium text-foreground">{r.deletedByName || '—'}</span> ·{' '}
                              {n(time(r.deletedAt, lang))}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost ml-auto h-9 w-9 shrink-0 border border-border !px-0 sm:w-auto sm:!px-3"
                            onClick={() => setAsking(r)}
                            aria-label={t('Restore')}
                            title={t('Restore')}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('Restore')}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
            </div>
          )}
        </>
      )}

      <ConfirmWithReason
        open={asking !== null}
        tone="normal"
        reason={false}
        title={t('Bring this back')}
        message={
          asking?.kind === 'sale'
            ? t(
                'The bill comes back onto the register still cancelled — its stock and its money stay reversed. Put it back from the bill itself to un-cancel it.',
              )
            : t('It goes back on the shop’s list exactly as it was.')
        }
        confirmLabel={t('Restore')}
        busy={busy}
        onConfirm={() => void restore()}
        onCancel={() => setAsking(null)}
      />

      {busy && rows.length === 0 && (
        <div className="blocking">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon,
  tone,
  label,
  value,
  children,
}: {
  icon: typeof Trash2;
  tone: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="stat flex h-full min-h-[128px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="value mt-1 stat-fit [--fit-max:22px]">{value}</div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">{children}</div>
    </div>
  );
}
