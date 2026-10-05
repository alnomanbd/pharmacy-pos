import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Home,
  Users,
  Zap,
  Truck,
  Package,
  MoreHorizontal,
  CalendarDays,
  Search,
  ListOrdered,
  Crown,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import {
  shopApi,
  taka,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
  type ShopExpense,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { toLocalDate } from '@dawai/shared/lib/date';
import ConfirmWithReason from '../components/ConfirmWithReason';
import Pager from '../components/Pager';
import { useT, useUiLang, bnNumerals, useNumerals } from '../i18n/ui';
import Modal from '../components/Modal';

/**
 * Money out of the drawer that is not coming back.
 *
 * The reports can say what a sale earned and what a delivery cost, and neither
 * of those is the price of standing open — the rent, the salary, the power.
 * Those lines live here, and one running figure follows them into the owner's
 * report, where the margin becomes the kept profit.
 *
 * A month is the shape this page keeps, because that is how the landlord and
 * the salesman ask — and every stretch is shown against the same number of
 * days before it, the way the reports do, because a total with nothing beside
 * it cannot be high or low.
 */

const dayOf = (back = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return toLocalDate(d);
};

const monthStart = (offset = 0) =>
  toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1));
const monthEnd = (offset = 0) =>
  toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + offset + 1, 0));

const RANGES = [
  { key: 'thismonth', label: 'This month', from: () => monthStart(0), to: () => dayOf(0) },
  { key: 'lastmonth', label: 'Last month', from: () => monthStart(-1), to: () => monthEnd(-1) },
  { key: 'month', label: 'Last 30 days', from: () => dayOf(29), to: () => dayOf(0) },
  { key: 'quarter', label: 'Last 90 days', from: () => dayOf(89), to: () => dayOf(0) },
] as const;

/** Days in a stretch, both ends counted. */
const daysIn = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);

/** The same number of days immediately before a stretch. */
const before = (from: string, to: string) => {
  const days = daysIn(from, to);
  const end = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};

const fmt = (key: string) =>
  new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/* An icon and a hue per kind of spending, the same on the list, the bars and
   the form — so "the purple one" is always the salary. */
const CATEGORY_LOOK: Record<ExpenseCategory, { icon: typeof Home; tone: string; bar: string }> = {
  rent: { icon: Home, tone: 'bg-primary/10 text-primary', bar: 'bg-primary' },
  salary: { icon: Users, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  utility: { icon: Zap, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  transport: { icon: Truck, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', bar: 'bg-sky-500' },
  supplies: { icon: Package, tone: 'bg-pink-500/10 text-pink-600 dark:text-pink-400', bar: 'bg-pink-500' },
  other: { icon: MoreHorizontal, tone: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground' },
};
const lookOf = (c: string) => CATEGORY_LOOK[c as ExpenseCategory] ?? CATEGORY_LOOK.other;

/** Lines per page. The stretch comes whole; this is how much of it one screen shows. */
const PAGE_SIZE = 15;

/**
 * The expenses, on a page of their own or as a tab of Accounts.
 *
 * Inside Accounts the stretch is the Accounts page's — one date range over the
 * whole book — so the heading and the range controls step aside and the tab
 * follows the dates it is given.
 */
export function ExpensesView({
  range,
  onChanged,
}: { range?: { from: string; to: string }; onChanged?: () => void } = {}) {
  const embedded = !!range;
  const t = useT();
  const { stop } = useNumerals();
  const lang = useUiLang();
  const { toast } = useToast();
  const [from, setFrom] = useState(() => monthStart(0));
  const [to, setTo] = useState(() => dayOf(0));
  /* `editing = 'new'` opens the recorder; a row opens the same box to correct it. */
  const [editing, setEditing] = useState<ShopExpense | 'new' | null>(null);
  const [binning, setBinning] = useState<ShopExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [rows, setRows] = useState<ShopExpense[]>([]);
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);
  const money = useCallback((v: number) => n(taka(v)), [n]);

  const load = useCallback(async () => {
    try {
      const prior = before(from, to);
      const [res, last] = await Promise.all([
        shopApi.expenses({ from, to }),
        shopApi.expenses(prior).catch(() => null),
      ]);
      setRows(res.data);
      setAmount(res.amount);
      setPrevious(last ? last.amount : null);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the expenses.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRange = useMemo(
    () => RANGES.find((r) => r.from() === from && r.to() === to)?.key ?? '',
    [from, to],
  );

  /* The whole stretch is on the page, so the split is worked out here and is
     the stretch's, not one page's. */
  const byCategory = useMemo(() => {
    const sums = new Map<string, { amount: number; lines: number }>();
    for (const r of rows) {
      const cur = sums.get(r.category) ?? { amount: 0, lines: 0 };
      cur.amount += r.amount;
      cur.lines += 1;
      sums.set(r.category, cur);
    }
    return [...sums.entries()].map(([c, v]) => ({ category: c, ...v })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!category || r.category === category) &&
        (!needle || [r.note, t(EXPENSE_CATEGORY_LABEL[r.category] ?? r.category)].some((s) => s?.toLowerCase().includes(needle))),
    );
  }, [rows, category, q, t]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const days = daysIn(from, to);
  const biggest = byCategory[0];

  const bin = async (reason: string) => {
    if (!binning) return;
    setBusy(true);
    try {
      await shopApi.binIt('expense', binning._id, reason);
      toast(`${taka(binning.amount)} ${t('moved to the Recycle Bin')}${stop}`);
      setBinning(null);
      await load();
      onChanged?.();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const setRange = (f: string, tt: string) => {
    setFrom(f);
    setTo(tt);
    setPage(1);
  };

  useEffect(() => {
    if (range) setRange(range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from, range?.to]);

  return (
    <div className={embedded ? 'mt-4' : 'page'}>
      {embedded ? (
        <div className="flex justify-end">
          <button type="button" className="btn h-9" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('Record an expense')}
          </button>
        </div>
      ) : (
      <>
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> {t('Expenses')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('What the shop itself costs — the rent, the power, the people — that turns the margin into the kept profit.')}
          </p>
        </div>
        <button type="button" className="btn h-9" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('Record an expense')}
        </button>
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
          <input
            type="date"
            aria-label={t('From')}
            className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`}
            value={from}
            max={to}
            onChange={(e) => setRange(e.target.value, to)}
          />
          <span className="text-sm text-muted-foreground">{t('to')}</span>
          <input
            type="date"
            aria-label={t('To')}
            className={`input h-9 w-auto ${activeRange ? '' : 'border-primary ring-2 ring-primary/15'}`}
            value={to}
            min={from}
            max={dayOf(0)}
            onChange={(e) => setRange(from, e.target.value)}
          />
        </span>
      </div>
      </>
      )}

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          {/* ---- four tiles, one shape ---- */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Wallet} tone="bg-destructive/10 text-destructive" label={t('Spent this stretch')} value={money(amount)}>
              <Change now={amount} before={previous} money={money} n={n} />
            </Tile>
            <Tile icon={ListOrdered} tone="bg-primary/10 text-primary" label={t('Lines')} value={n(rows.length)}>
              <span className="text-[11.5px] text-muted-foreground">
                {n(days)} {t('days')}
              </span>
            </Tile>
            <Tile
              icon={Crown}
              tone={biggest ? lookOf(biggest.category).tone : 'bg-muted text-muted-foreground'}
              label={t('Biggest cost')}
              value={biggest ? t(EXPENSE_CATEGORY_LABEL[biggest.category] ?? biggest.category) : '—'}
            >
              <span className="text-[11.5px] text-muted-foreground">
                {biggest
                  ? `${money(biggest.amount)} · ${n(amount > 0 ? Math.round((biggest.amount / amount) * 100) : 0)}%`
                  : t('nothing recorded')}
              </span>
            </Tile>
            <Tile icon={CalendarClock} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label={t('A day, on average')} value={money(amount / days)}>
              <span className="text-[11.5px] text-muted-foreground">{t('what standing open costs')}</span>
            </Tile>
          </div>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {/* ---- where it went ---- */}
            <div className="card mb-0 min-w-0">
              <h3>{t('Where it went')}</h3>
              {byCategory.length === 0 ? (
                <div className="empty">{t('Nothing recorded yet in this stretch.')}</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {byCategory.map((c) => {
                    const look = lookOf(c.category);
                    const on = category === c.category;
                    return (
                      <li key={c.category}>
                        <button
                          type="button"
                          onClick={() => {
                            setCategory(on ? '' : (c.category as ExpenseCategory));
                            setPage(1);
                          }}
                          aria-pressed={on}
                          className={`w-full rounded-xl px-2 py-2 text-left transition-colors ${
                            on ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${look.tone}`}>
                              <look.icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2 text-sm">
                                <span className="font-medium">{t(EXPENSE_CATEGORY_LABEL[c.category] ?? c.category)}</span>
                                <span className="font-semibold tabular-nums">{money(c.amount)}</span>
                              </span>
                              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                                <span
                                  className={`motion-grow-x block h-full rounded-full ${look.bar}`}
                                  style={{ width: `${amount > 0 ? Math.max(2, (c.amount / amount) * 100) : 0}%` }}
                                />
                              </span>
                              <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                                {n(c.lines)} {t(c.lines === 1 ? 'line' : 'lines')} ·{' '}
                                {n(amount > 0 ? Math.round((c.amount / amount) * 100) : 0)}%
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ---- the lines ---- */}
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
                  {(['', ...EXPENSE_CATEGORIES] as const).map((c) => (
                    <button
                      key={c || 'all'}
                      type="button"
                      role="tab"
                      aria-selected={category === c}
                      onClick={() => {
                        setCategory(c);
                        setPage(1);
                      }}
                      className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        category === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {c ? t(EXPENSE_CATEGORY_LABEL[c]) : t('All')}
                    </button>
                  ))}
                </div>
                <label className="relative block w-full sm:ml-auto sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="input h-9 pl-9"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                    placeholder={t('Search the notes…')}
                    aria-label={t('Search')}
                  />
                </label>
              </div>

              {filtered.length === 0 ? (
                <div className="card mb-0">
                  <div className="empty py-10">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Wallet className="h-7 w-7" />
                    </span>
                    <p>{rows.length ? t('Nothing matches that.') : t('Nothing recorded yet in this stretch.')}</p>
                    {!rows.length && (
                      <button type="button" className="btn mt-2 h-9" onClick={() => setEditing('new')}>
                        <Plus className="h-4 w-4" /> {t('Record an expense')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card mb-0 p-0">
                  <ul className="divide-y divide-border">
                    {shown.map((r) => {
                      const look = lookOf(r.category);
                      return (
                        <li key={r._id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${look.tone}`}>
                            <look.icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-semibold">
                                {t(EXPENSE_CATEGORY_LABEL[r.category] ?? r.category)}
                              </span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.amount)}</span>
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="truncate">
                                {n(fmt(r.dayKey))}
                                {r.note ? ` · ${r.note}` : ''}
                              </span>
                            </span>
                          </span>
                          <span className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={t('Edit')}
                              title={t('Edit')}
                              onClick={() => setEditing(r)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label={t('Delete')}
                              title={t('Delete')}
                              onClick={() => setBinning(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <Pager
                    page={current}
                    pageSize={PAGE_SIZE}
                    total={filtered.length}
                    onPage={setPage}
                    className="border-t border-border px-4 py-3"
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && (
        <ExpenseModal
          current={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            onChanged?.();
          }}
        />
      )}

      <ConfirmWithReason
        open={binning !== null}
        title={t('Delete this expense')}
        message={t('It goes to the Recycle Bin, not away — say why, and it is kept with it.')}
        confirmLabel={t('Move it to the Recycle Bin')}
        busy={busy}
        onConfirm={(why) => void bin(why)}
        onCancel={() => setBinning(null)}
      />
    </div>
  );
}

/** One tile: label and icon, figure, and a line under it — the same on all four. */
function Tile({
  icon: Icon,
  tone,
  label,
  value,
  children,
}: {
  icon: typeof Wallet;
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
      <div className="mt-auto pt-1">{children}</div>
    </div>
  );
}

/**
 * Against the same number of days before — and for spending, up is the bad
 * direction. The word says which way as well as the colour, so it reads in
 * print and to somebody who cannot tell red from green.
 */
function Change({
  now,
  before: was,
  money,
  n,
}: {
  now: number;
  before: number | null;
  money: (v: number) => string;
  n: (v: number | string) => string;
}) {
  const t = useT();
  if (was === null) return null;
  const flat = now === was;
  const up = now > was;
  const pct = was > 0 ? Math.round(((now - was) / was) * 100) : null;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`pill !py-0 tabular-nums ${flat ? 'neutral' : up ? 'danger' : 'success'}`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {flat ? t('same') : `${t(up ? 'up' : 'down')}${pct !== null ? ` ${n(Math.abs(pct))}%` : ''}`}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {t('was')} {money(was)}
      </span>
    </span>
  );
}

function ExpenseModal({
  current,
  onClose,
  onSaved,
}: {
  current: ShopExpense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [amount, setAmount] = useState(current ? String(current.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory>(current ? current.category : 'other');
  const [date, setDate] = useState(current ? current.dayKey : dayOf(0));
  const [note, setNote] = useState(current?.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast(t('How much went out?'), 'error');
      return;
    }
    setBusy(true);
    try {
      if (current) {
        await shopApi.updateExpense(current._id, { amount: value, category, date, note });
        toast(t('Saved'));
      } else {
        await shopApi.createExpense({ amount: value, category, date, note });
        toast(t('Expense recorded'));
      }
      onSaved();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
      <h2 className="mb-4 text-lg font-bold">
        {current ? t('Correct this expense') : t('Record an expense')}
      </h2>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('Amount')}</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
              ৳
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="input h-12 pl-8 text-lg font-semibold tabular-nums"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </span>
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium">{t('For')}</span>
          <div className="grid grid-cols-3 gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const look = lookOf(c);
              const on = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(c)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                    on ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${look.tone}`}>
                    <look.icon className="h-4 w-4" />
                  </span>
                  {t(EXPENSE_CATEGORY_LABEL[c])}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1 flex items-center justify-between text-sm font-medium">
            {t('Date')}
            <span className="flex gap-1">
              {[
                [0, 'Today'],
                [1, 'Yesterday'],
              ].map(([back, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDate(dayOf(back as number))}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    date === dayOf(back as number) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t(label as string)}
                </button>
              ))}
            </span>
          </span>
          <input
            type="date"
            className="input h-10"
            value={date}
            max={dayOf(0)}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t('Date')}
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('Note')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </span>
          <textarea
            className="input min-h-20"
            value={note}
            maxLength={2000}
            placeholder={t('The landlord, the reason — the context that makes the number mean anything.')}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn h-10 disabled:opacity-50" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {current ? t('Save') : t('Record')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Expenses() {
  return <ExpensesView />;
}
