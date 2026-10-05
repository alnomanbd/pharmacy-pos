import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  CalendarDays,
  Search,
  ReceiptText,
  Wallet,
  Boxes,
  Users,
  LogIn,
  Settings2,
  Trash2,
  Layers,
  Quote,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { useCan } from '../access';
import { shopApi, type ActivityGroup, type ActivityPage, type ActivityRow } from '../api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { toLocalDate } from '@dawai/shared/lib/date';
import Pager from '../components/Pager';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Who did what in the shop, and when.
 *
 * The owner's page and nobody else's — the server refuses anybody who is not
 * the account's owner. Every bill rung up, every delivery, every change of a
 * price or a setting, every sign-in and sign-out, and every deletion with the
 * reason that had to be typed, read from the append-only trail as a timeline:
 * a day at a time, newest first, the time and the person on every line.
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

const GROUPS: { key: ActivityGroup | ''; label: string; icon: typeof Layers; tone: string }[] = [
  { key: '', label: 'Everything', icon: Layers, tone: 'bg-muted text-muted-foreground' },
  { key: 'sales', label: 'Sales', icon: ReceiptText, tone: 'bg-primary/10 text-primary' },
  { key: 'money', label: 'Money', icon: Wallet, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  { key: 'stock', label: 'Stock', icon: Boxes, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  { key: 'people', label: 'People', icon: Users, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { key: 'signin', label: 'Sign-in', icon: LogIn, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { key: 'setup', label: 'Setup', icon: Settings2, tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  { key: 'bin', label: 'Recycle Bin', icon: Trash2, tone: 'bg-destructive/10 text-destructive' },
];
const lookOf = (g: string) => GROUPS.find((x) => x.key === g) ?? GROUPS[0]!;

/** What happened, as a person would say it. */
const SAID: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'auth.session.revoke': 'signed a device out',
  'auth.session.revoke_others': 'signed out every other device',
  'password.change': 'changed their password',
  'password.reset': 'reset their password',
  'shop.sale.create': 'rang up a bill',
  'shop.sale.return': 'took a return',
  'sale.edit': 'corrected a bill',
  'sale.void': 'cancelled a bill',
  'sale.revert': 'put a bill back',
  'sale.hold': 'held a bill',
  'sale.return': 'took a return',
  'shop.shift.open': 'opened the POS',
  'shop.shift.close': 'closed the day',
  'shop.customer.create': 'added a customer',
  'shop.customer.update': 'changed a customer',
  'shop.customer.payment': 'took a baki payment',
  'shop.customer.remind': 'sent a reminder',
  'shop.supplier.create': 'added a company',
  'shop.supplier.update': 'changed a company',
  'shop.supplier.payment': 'paid a company',
  'shop.supplier.return': 'sent stock back to a company',
  'shop.settings.update': 'changed the settings',
  'shop.rack.create': 'added a rack',
  'shop.rack.update': 'changed a rack',
  'shop.product.create': 'added an item',
  'shop.product.update': 'changed an item',
  'shop.purchase.create': 'recorded a delivery',
  'shop.stock.adjust': 'adjusted stock',
  'shop.count.start': 'started a stock count',
  'shop.count.update': 'counted stock',
  'shop.count.apply': 'applied a stock count',
  'shop.count.abandon': 'dropped a stock count',
  'shop.order.create': 'wrote an order',
  'shop.order.status': 'moved an order on',
  'shop.staff.create': 'added staff',
  'shop.staff.update': 'changed staff',
  'shop.staff.password': 'set a staff password',
  'shop.counter.create': 'added a counter',
  'shop.counter.update': 'changed a counter',
  'shop.expense.create': 'recorded an expense',
  'shop.expense.update': 'corrected an expense',
  'shop.income.create': 'recorded income',
  'shop.income.update': 'corrected income',
  'shop.cash.create': 'recorded owner & bank money',
  'shop.cash.update': 'corrected owner & bank money',
  'shop.month.close': 'closed a month',
  'shop.month.reopen': 'reopened a month',
  'shop.delete': 'deleted',
  'shop.restore': 'brought back',
};

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  pharmacist: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  salesman: 'bg-primary/10 text-primary',
};
const ROLE_WORD: Record<string, string> = { admin: 'Owner', pharmacist: 'Pharmacist', salesman: 'Salesman' };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => !/^(md|dr|mr|mrs|ms)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—';

const PAGE_SIZE = 40;

export default function Activity() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [from, setFrom] = useState(() => dayOf(6));
  const [to, setTo] = useState(() => dayOf(0));
  const [group, setGroup] = useState<ActivityGroup | ''>('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(true);
  /* Anybody but the owner is refused by the server; say so once, plainly. */
  /* The account's owner alone — the server refuses anybody else, so nobody
     else asks it. */
  const role = useAuthStore((st) => st.user?.role);
  const allowed = useCan()('audit.view');
  const [denied, setDenied] = useState(() => !!role && !allowed);

  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await shopApi.activity({
          from,
          to,
          group: group || undefined,
          who: who || undefined,
          q: query || undefined,
          page,
          limit: PAGE_SIZE,
        }),
      );
    } catch (e: unknown) {
      const res = (e as { response?: { status?: number; data?: { message?: string } } }).response;
      if (res?.status === 403) setDenied(true);
      else toast(res?.data?.message || t('Could not load the activity.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, group, who, query, page, toast, t]);

  useEffect(() => {
    if (!denied) void load();
  }, [load, denied]);

  const activeRange = useMemo(() => RANGES.find((r) => r.from() === from && r.to() === to)?.key ?? '', [from, to]);
  const setRange = (f: string, tt: string) => {
    setFrom(f);
    setTo(tt);
    setPage(1);
  };

  /* The page's lines, under the day they happened. */
  const days = useMemo(() => {
    const out: { day: string; rows: ActivityRow[] }[] = [];
    for (const r of data?.data ?? []) {
      const d = new Date(r.at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = out[out.length - 1];
      if (last && last.day === key) last.rows.push(r);
      else out.push({ day: key, rows: [r] });
    }
    return out;
  }, [data]);

  const heading = (at: string) => {
    const d = new Date(at);
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(d)) / 86_400_000);
    if (diff === 0) return t('Today');
    if (diff === 1) return t('Yesterday');
    return n(d.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  };
  const clock = (at: string) => n(new Date(at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }));

  if (denied) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty py-14">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('Only the owner sees this')}</p>
            <p className="max-w-md">{t('The activity trail is the owner’s own record of who did what — ask the owner if you need something from it.')}</p>
          </div>
        </div>
      </div>
    );
  }

  const groups = data?.groups;
  const totalAll = groups ? Object.values(groups).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ActivityIcon className="h-5 w-5" /> {t('Activity')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Who did what, and when — every bill, change, deletion, sign-in and sign-out.')}
          </p>
        </div>
        <span className="pill neutral">
          <ShieldCheck className="h-3.5 w-3.5" /> {t('Only the owner sees this')}
        </span>
      </div>

      {/* ---- when ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={activeRange === r.key}
              onClick={() => setRange(r.from(), r.to())}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeRange === r.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input type="date" aria-label={t('From')} className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`} value={from} max={to} onChange={(e) => setRange(e.target.value, to)} />
          <span className="text-sm text-muted-foreground">{t('to')}</span>
          <input type="date" aria-label={t('To')} className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`} value={to} min={from} max={dayOf(0)} onChange={(e) => setRange(from, e.target.value)} />
        </span>
      </div>

      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          {/* ---- four tiles, one shape ---- */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Layers} tone="bg-primary/10 text-primary" label={t('Things done')} value={n(totalAll)}>
              {n(data.people.length)} {t(data.people.length === 1 ? 'person' : 'people')}
            </Tile>
            <Tile icon={ReceiptText} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label={t('Sales')} value={n(groups?.sales ?? 0)}>
              {t('bills rung up, corrected or returned')}
            </Tile>
            <Tile icon={LogIn} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400" label={t('Sign-in')} value={n(groups?.signin ?? 0)}>
              {t('sign-ins and sign-outs')}
            </Tile>
            <Tile icon={Trash2} tone="bg-destructive/10 text-destructive" label={t('Recycle Bin')} value={n(groups?.bin ?? 0)}>
              {t('deleted or brought back')}
            </Tile>
          </div>

          <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              {/* ---- find and filter ---- */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
                  {GROUPS.map((g) => {
                    const c = g.key ? groups?.[g.key] ?? 0 : totalAll;
                    return (
                      <button
                        key={g.key || 'all'}
                        type="button"
                        role="tab"
                        aria-selected={group === g.key}
                        onClick={() => {
                          setGroup(g.key);
                          setPage(1);
                        }}
                        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          group === g.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        } ${c === 0 && g.key ? 'opacity-50' : ''}`}
                      >
                        <g.icon className="h-3.5 w-3.5" />
                        {t(g.label)}
                        <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">{n(c)}</span>
                      </button>
                    );
                  })}
                </div>
                <select
                  className="input h-9 w-full sm:w-48"
                  aria-label={t('Who')}
                  value={who}
                  onChange={(e) => {
                    setWho(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('Everybody')}</option>
                  {data.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="relative block w-full sm:ml-auto sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Bill no., name, amount…')} aria-label={t('Search')} />
                </label>
              </div>

              {data.data.length === 0 ? (
                <div className="card mt-4">
                  <div className="empty py-12">
                    <ActivityIcon className="h-6 w-6" />
                    <p>{t('Nothing happened in this stretch.')}</p>
                  </div>
                </div>
              ) : (
                <div className={`mt-4 flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                  {days.map((d) => (
                    <section key={d.day}>
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {heading(d.rows[0]!.at)}
                        <span className="h-px flex-1 bg-border" />
                        <span className="tabular-nums">{n(d.rows.length)}</span>
                      </h3>
                      <ol className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-card">
                        {d.rows.map((r) => {
                          const look = lookOf(r.group);
                          return (
                            <li key={r._id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
                              <span className="w-16 shrink-0 pt-0.5 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                                {clock(r.at)}
                              </span>
                              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ROLE_TONE[r.role] ?? 'bg-muted text-muted-foreground'}`}>
                                {initials(r.who)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm">
                                  <span className="font-semibold">{r.who || t('Somebody')}</span>{' '}
                                  <span className="text-muted-foreground">{t(SAID[r.action] ?? r.action)}</span>
                                </p>
                                {r.label && <p className="truncate text-[12px] font-medium">{r.label}</p>}
                                {r.reason && (
                                  <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                                    <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0 break-words">{r.reason}</span>
                                  </p>
                                )}
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
                                  {r.role && <span>{t(ROLE_WORD[r.role] ?? r.role)}</span>}
                                  {r.ip && (
                                    <span className="inline-flex items-center gap-1 font-mono">
                                      <Globe className="h-3 w-3" /> {r.ip}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${look.tone}`} title={t(look.label)}>
                                <look.icon className="h-3.5 w-3.5" />
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
                  <Pager page={data.page} pageSize={data.limit} total={data.total} onPage={setPage} />
                </div>
              )}
            </div>

            {/* ---- who was active ---- */}
            <aside className="card mb-0 min-w-0 xl:sticky xl:top-0">
              <h3>
                <Users className="h-4 w-4" /> {t('Who was active')}
              </h3>
              {data.people.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('Nobody, in this stretch.')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.people.map((p) => {
                    const on = who === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setWho(on ? '' : p.id);
                            setPage(1);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${on ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}
                        >
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10.5px] font-bold ${ROLE_TONE[p.role] ?? 'bg-muted text-muted-foreground'}`}>
                            {initials(p.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.name}</span>
                            <span className="block text-[10.5px] text-muted-foreground">
                              {t(ROLE_WORD[p.role] ?? p.role)} · {t('last')} {clock(p.last)}
                            </span>
                          </span>
                          <span className="rounded-full bg-muted px-2 text-[11px] font-semibold tabular-nums">{n(p.count)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>
        </>
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
  icon: typeof Layers;
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
