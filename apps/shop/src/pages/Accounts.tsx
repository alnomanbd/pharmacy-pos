import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Landmark,
  CalendarDays,
  PiggyBank,
  ShoppingCart,
  Coins,
  HandCoins,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Building2,
  Boxes,
  ReceiptText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Gift,
  Stethoscope,
  Percent,
  Home,
  MoreHorizontal,
  Scale,
  ArrowRight,
  ArrowLeftRight,
  Undo2,
  LogOut,
  LogIn,
  Lock,
  LockOpen,
  CheckCircle2,
} from 'lucide-react';
import {
  shopApi,
  taka,
  EXPENSE_CATEGORY_LABEL,
  INCOME_CATEGORIES,
  INCOME_CATEGORY_LABEL,
  type IncomeCategory,
  type ShopAccounts,
  type ShopIncome,
  type BookLine,
  CASH_MOVE_KINDS,
  CASH_MOVE_LABEL,
  type CashMove,
  type CashMoveKind,
  type MonthRow,
} from '../api';
import { ExpensesView } from './Expenses';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { toLocalDate } from '@dawai/shared/lib/date';
import ConfirmWithReason from '../components/ConfirmWithReason';
import Pager from '../components/Pager';
import Modal from '../components/Modal';
import { CountUp } from '../components/motion';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';


/** This month in Dhaka, as the server keys it — `2026-09`. */
const THIS_MONTH = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit' }).format(new Date());

/**
 * The shop's accounts: every taka in and out, in one place.
 *
 * Nothing on this page is entered here except the money that comes in without
 * a bill — the company's cash-back, a service charge. Everything else is
 * already counted where it happens: the till, the baki khata, a company's
 * statement, the Expenses page. What was missing was the view that puts them
 * side by side, which is how an owner closes a month:
 *
 * - **Overview** — did the shop make money (profit and loss, earned when sold),
 *   where did the cash go (money in and out, as it crossed the counter), and
 *   where it stands today (owed, owing, on the shelf).
 * - **Cash book** — the same stretch as lines, day by day, the way the shop's
 *   own register reads.
 * - **Other income** — the one thing recorded here.
 */

const dayOf = (back = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return toLocalDate(d);
};
const monthStart = (offset = 0) => toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1));
const monthEnd = (offset = 0) => toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + offset + 1, 0));

const RANGES = [
  { key: 'thismonth', label: 'This month', from: () => monthStart(0), to: () => dayOf(0) },
  { key: 'lastmonth', label: 'Last month', from: () => monthStart(-1), to: () => monthEnd(-1) },
  { key: 'month', label: 'Last 30 days', from: () => dayOf(29), to: () => dayOf(0) },
  { key: 'quarter', label: 'Last 90 days', from: () => dayOf(89), to: () => dayOf(0) },
] as const;

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  card: 'Card',
  bank: 'Bank',
  cheque: 'Cheque',
};
const METHOD_DOT: Record<string, string> = {
  cash: 'bg-emerald-500',
  bkash: 'bg-pink-500',
  nagad: 'bg-orange-500',
  rocket: 'bg-violet-500',
  card: 'bg-sky-500',
  bank: 'bg-slate-500',
  cheque: 'bg-amber-500',
};

const INCOME_LOOK: Record<IncomeCategory, { icon: typeof Gift; tone: string }> = {
  bonus: { icon: Gift, tone: 'bg-primary/10 text-primary' },
  service: { icon: Stethoscope, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  commission: { icon: Percent, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  rent: { icon: Home, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  other: { icon: MoreHorizontal, tone: 'bg-muted text-muted-foreground' },
};
const incomeLook = (c: string) => INCOME_LOOK[c as IncomeCategory] ?? INCOME_LOOK.other;

/* The cash book's lines: what kind of money, drawn the same every time. */
const BOOK_LOOK: Record<BookLine['kind'], { icon: typeof Gift; tone: string }> = {
  takings: { icon: ShoppingCart, tone: 'bg-primary/10 text-primary' },
  khata: { icon: Users, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  income: { icon: HandCoins, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  supplier: { icon: Building2, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  expense: { icon: Wallet, tone: 'bg-destructive/10 text-destructive' },
  capital: { icon: LogIn, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  drawing: { icon: LogOut, tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  refund: { icon: Undo2, tone: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
  bank_deposit: { icon: Landmark, tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  bank_withdrawal: { icon: Landmark, tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
};

const MOVE_LOOK: Record<CashMoveKind, { icon: typeof Gift; tone: string }> = {
  capital: BOOK_LOOK.capital,
  drawing: BOOK_LOOK.drawing,
  refund: BOOK_LOOK.refund,
  bank_deposit: BOOK_LOOK.bank_deposit,
  bank_withdrawal: BOOK_LOOK.bank_withdrawal,
};

const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const fmtShort = (key: string) =>
  new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

type Tab = 'overview' | 'book' | 'income' | 'expenses' | 'owner' | 'close';
const TAB_KEYS: Tab[] = ['overview', 'book', 'income', 'expenses', 'owner', 'close'];
const BOOK_PAGE = 30;

export default function Accounts() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  /* A tab can be linked to — the old Expenses page sends people to its own. */
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(asked && TAB_KEYS.includes(asked) ? asked : 'overview');
  const setTab = (next: Tab) => {
    setTabState(next);
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };
  const [from, setFrom] = useState(() => monthStart(0));
  const [to, setTo] = useState(() => dayOf(0));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ShopAccounts | null>(null);
  const [loading, setLoading] = useState(true);

  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);
  const money = useCallback((v: number) => n(taka(v)), [n]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await shopApi.accounts({ from, to, page, limit: BOOK_PAGE }));
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the accounts.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, page, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRange = useMemo(() => RANGES.find((r) => r.from() === from && r.to() === to)?.key ?? '', [from, to]);
  const setRange = (f: string, tt: string) => {
    setFrom(f);
    setTo(tt);
    setPage(1);
  };

  const TABS: { key: Tab; label: string; icon: typeof Gift }[] = [
    { key: 'overview', label: 'Overview', icon: Scale },
    { key: 'book', label: 'Cash book', icon: ReceiptText },
    { key: 'income', label: 'Other income', icon: HandCoins },
    { key: 'expenses', label: 'Expenses', icon: Wallet },
    { key: 'owner', label: 'Owner & bank', icon: ArrowLeftRight },
    { key: 'close', label: 'Month close', icon: Lock },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Landmark className="h-5 w-5" /> {t('Accounts')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Every taka in and out — did the shop make money, and where did the cash go.')}
          </p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={tab === x.key}
              onClick={() => setTab(x.key)}
              title={t(x.label)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === x.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <x.icon className="h-4 w-4" /> <span className={tab === x.key ? '' : 'hidden xl:inline'}>{t(x.label)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- when (the month close has its own months) ---- */}
      <div className={`flex flex-wrap items-center gap-3 ${tab === 'close' ? 'hidden' : ''}`}>
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

      {tab === 'income' ? (
        <IncomeView from={from} to={to} n={n} money={money} onChanged={() => void load()} />
      ) : tab === 'expenses' ? (
        <ExpensesView range={{ from, to }} onChanged={() => void load()} />
      ) : tab === 'owner' ? (
        <OwnerBank from={from} to={to} bank={data?.position.bank ?? 0} n={n} money={money} onChanged={() => void load()} />
      ) : tab === 'close' ? (
        <MonthClose n={n} money={money} onChanged={() => void load()} />
      ) : !data ? (
        <LoadingBlock />
      ) : tab === 'overview' ? (
        <Overview data={data} n={n} money={money} />
      ) : (
        <CashBook data={data} loading={loading} n={n} money={money} onPage={setPage} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- overview -- */

function Overview({ data, n, money }: { data: ShopAccounts; n: (v: number | string) => string; money: (v: number) => string }) {
  const t = useT();
  const p = data.profit;
  const c = data.cash;
  const pos = data.position;
  const gain = p.net >= 0;
  const worth = pos.stockValue + pos.receivable + pos.bank - pos.payable;

  return (
    <>
      {/* ---- the headline ---- */}
      <div
        className={`mt-4 flex flex-wrap items-center gap-4 rounded-[var(--radius)] border p-5 ${
          gain ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'
        }`}
      >
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
            gain ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'
          }`}
        >
          <PiggyBank className="h-6 w-6" />
        </span>
        {/* At least this wide, so on a phone the money in and out wraps to a
            line of its own instead of squeezing the sentence one word a line. */}
        <div className="min-w-[12rem] flex-1">
          <div className="eyebrow">{t(gain ? 'Net profit' : 'Net loss')}</div>
          <div className={`text-3xl font-semibold tabular-nums ${gain ? 'text-primary' : 'text-destructive'}`}>
            {money(Math.abs(p.net))}
          </div>
          <div className="text-xs text-muted-foreground">
            {money(p.margin)} {t('margin')} + {money(p.otherIncome)} {t('other income')} − {money(p.expenses)}{' '}
            {t('spent on the shop')}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 border-t border-border/70 pt-3 text-center sm:flex sm:w-auto sm:gap-6 sm:border-0 sm:pt-0">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Money in')}</div>
            <div className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(c.in)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Money out')}</div>
            <div className="text-lg font-semibold tabular-nums text-destructive">{money(c.out)}</div>
          </div>
        </div>
      </div>

      {/* ---- four tiles, one shape ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={ShoppingCart} tone="bg-primary/10 text-primary" label={t('Sold')} value={<CountUp value={p.sales} format={money} />}>
          {n(p.bills)} {t('bills')}
        </Tile>
        <Tile icon={Coins} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label={t('Gross margin')} value={<CountUp value={p.margin} format={money} />}>
          {n(p.marginPercent)}% {t('of what was sold')}
        </Tile>
        <Tile icon={HandCoins} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label={t('Other income')} value={<CountUp value={p.otherIncome} format={money} />}>
          {t('bonus, service charge, commission')}
        </Tile>
        <Tile icon={Wallet} tone="bg-destructive/10 text-destructive" label={t('Expenses')} value={<CountUp value={p.expenses} format={money} />}>
          {t('rent, salary, bills')}
        </Tile>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* ---- profit and loss, as a statement ---- */}
        <div className="card mb-0 min-w-0">
          <h3>
            <Scale className="h-4 w-4" /> {t('Profit and loss')}
          </h3>
          <p className="card-sub">{t('Earned when sold — a bill on the khata counts the day it was made.')}</p>
          <dl className="text-sm">
            <Row label={t('Sales')} value={money(p.sales)} />
            {p.returns > 0 && <Row label={t('Returned by customers')} value={`− ${money(p.returns)}`} muted />}
            <Row label={t('Cost of the stock sold')} value={`− ${money(p.cost)}`} muted />
            <Row label={t('Gross margin')} value={money(p.margin)} strong rule />
            <Row label={t('Other income')} value={`+ ${money(p.otherIncome)}`} muted />
            <Row label={t('Shop expenses')} value={`− ${money(p.expenses)}`} muted />
            <div
              className={`mt-2 flex items-baseline justify-between rounded-xl px-3 py-2.5 ${
                gain ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
              }`}
            >
              <dt className="font-semibold">{t(gain ? 'Net profit' : 'Net loss')}</dt>
              <dd className="text-lg font-bold tabular-nums">{money(Math.abs(p.net))}</dd>
            </div>
          </dl>
          {p.onAccount > 0 && (
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              {money(p.onAccount)} {t('of those sales is still on the baki khata — earned, not yet received.')}
            </p>
          )}
        </div>

        {/* ---- where it stands, today ---- */}
        <div className="card mb-0 min-w-0">
          <h3>
            <Landmark className="h-4 w-4" /> {t('Where the shop stands today')}
          </h3>
          <p className="card-sub">{t('Not the stretch above — what is owed, owing and on the shelf right now.')}</p>
          <div className="flex flex-col gap-2">
            <Position to="/customers" icon={Users} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label={t('Customers owe you')} value={money(pos.receivable)} sub={`${n(pos.receivableFrom)} ${t('people on the baki khata')}`} />
            <Position to="/suppliers" icon={Building2} tone="bg-destructive/10 text-destructive" label={t('You owe the companies')} value={money(pos.payable)} sub={`${n(pos.payableTo)} ${t('companies')}`} />
            <Position to="/stock" icon={Boxes} tone="bg-primary/10 text-primary" label={t('Stock on the shelf, at cost')} value={money(pos.stockValue)} sub={t('what you paid for what is there')} />
            <Position to="/accounts?tab=owner" icon={Landmark} tone="bg-slate-500/10 text-slate-600 dark:text-slate-300" label={t('In the bank')} value={money(pos.bank)} sub={t('deposits less withdrawals')} />
          </div>
          <div className="mt-3 flex items-baseline justify-between rounded-xl border border-dashed border-border px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{t('Worth on paper')}</span>
            <span className={`font-semibold tabular-nums ${worth >= 0 ? '' : 'text-destructive'}`}>{money(worth)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('Stock, the bank and what you are owed, less what you owe.')}</p>
        </div>
      </div>

      {/* ---- money in and out, as it crossed the counter ---- */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Flow
          icon={ArrowDownLeft}
          tone="text-emerald-600 dark:text-emerald-400"
          bar="bg-emerald-500"
          title={t('Money in')}
          total={money(c.in)}
          parts={[
            [t('Counter takings'), c.inParts.counter],
            [t('Baki collected'), c.inParts.khata],
            [t('Other income'), c.inParts.otherIncome],
            [t('Owner put in'), c.inParts.capital],
          ]}
          methods={c.inByMethod}
          money={money}
        />
        <Flow
          icon={ArrowUpRight}
          tone="text-destructive"
          bar="bg-destructive/70"
          title={t('Money out')}
          total={money(c.out)}
          parts={[
            [t('Paid to companies'), c.outParts.suppliers],
            [t('Shop expenses'), c.outParts.expenses],
            [t('Owner took out'), c.outParts.drawings],
            [t('Refunds to customers'), c.outParts.refunds],
          ]}
          methods={c.outByMethod}
          money={money}
        />
      </div>
      {(c.transfers.deposited > 0 || c.transfers.withdrawn > 0) && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {money(c.transfers.deposited)} {t('carried to the bank')} · {money(c.transfers.withdrawn)} {t('brought back')} —{' '}
          {t('money changing pockets, so neither in nor out.')}
        </p>
      )}
    </>
  );
}

function Row({ label, value, muted, strong, rule }: { label: string; value: string; muted?: boolean; strong?: boolean; rule?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-1.5 ${rule ? 'border-t border-border pt-2' : ''}`}>
      <dt className={muted ? 'text-muted-foreground' : strong ? 'font-semibold' : ''}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : muted ? 'text-muted-foreground' : ''}`}>{value}</dd>
    </div>
  );
}

function Position({
  to,
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  to: string;
  icon: typeof Users;
  tone: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/40">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{sub}</span>
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Flow({
  icon: Icon,
  tone,
  bar,
  title,
  total,
  parts,
  methods,
  money,
}: {
  icon: typeof Users;
  tone: string;
  bar: string;
  title: string;
  total: string;
  parts: [string, number][];
  methods: { method: string; amount: number }[];
  money: (v: number) => string;
}) {
  const t = useT();
  const sum = Math.max(1, parts.reduce((n, [, v]) => n + v, 0));
  return (
    <div className="card mb-0 min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="mb-0">
          <Icon className={`h-4 w-4 ${tone}`} /> {title}
        </h3>
        <span className={`text-xl font-semibold tabular-nums ${tone}`}>{total}</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {parts.map(([label, v]) => (
          <li key={label}>
            <div className="flex items-baseline justify-between text-sm">
              <span>{label}</span>
              <span className="font-semibold tabular-nums">{money(v)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={`motion-grow-x h-full rounded-full ${bar}`} style={{ width: `${(v / sum) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {methods.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {methods.map((m) => (
            <span key={m.method} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
              <span className={`h-2 w-2 rounded-full ${METHOD_DOT[m.method] ?? 'bg-muted-foreground'}`} />
              <span className="font-medium">{t(METHOD_LABEL[m.method] ?? m.method)}</span>
              <span className="tabular-nums text-muted-foreground">{money(m.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- cash book -- */

function CashBook({
  data,
  loading,
  n,
  money,
  onPage,
}: {
  data: ShopAccounts;
  loading: boolean;
  n: (v: number | string) => string;
  money: (v: number) => string;
  onPage: (p: number) => void;
}) {
  const t = useT();
  const groups = useMemo(() => {
    const out: { day: string; lines: BookLine[] }[] = [];
    for (const l of data.book.lines) {
      const last = out[out.length - 1];
      if (last && last.day === l.dayKey) last.lines.push(l);
      else out.push({ day: l.dayKey, lines: [l] });
    }
    return out;
  }, [data]);

  /* What a line is called: a category as a word, a name as itself. */
  const titleOf = (l: BookLine) =>
    l.kind === 'refund'
      ? `${t('Refund')} · ${l.title}`
      : l.kind === 'capital' || l.kind === 'drawing' || l.kind === 'bank_deposit' || l.kind === 'bank_withdrawal'
        ? t(CASH_MOVE_LABEL[l.kind])
        : l.kind === 'takings'
      ? t('Counter takings')
      : l.kind === 'expense'
        ? t(EXPENSE_CATEGORY_LABEL[l.title] ?? l.title)
        : l.kind === 'income'
          ? t(INCOME_CATEGORY_LABEL[l.title] ?? l.title)
          : l.title;
  const KIND_WORD: Record<BookLine['kind'], string> = {
    takings: 'Sales',
    khata: 'Baki collected',
    income: 'Other income',
    supplier: 'Paid to a company',
    expense: 'Expense',
    capital: 'Owner',
    drawing: 'Owner',
    refund: 'Return',
    bank_deposit: 'Bank',
    bank_withdrawal: 'Bank',
  };
  const kindOf = (l: BookLine) => KIND_WORD[l.kind];

  if (data.book.total === 0) {
    return (
      <div className="card mt-4">
        <div className="empty py-12">
          <ReceiptText className="h-6 w-6" />
          <p>{t('Nothing came in or went out in this stretch.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-4 flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-3 gap-3">
        <MiniTotal label={t('Money in')} value={money(data.cash.in)} tone="text-emerald-600 dark:text-emerald-400" />
        <MiniTotal label={t('Money out')} value={money(data.cash.out)} tone="text-destructive" />
        <MiniTotal
          label={t('Net cash')}
          value={`${data.cash.net >= 0 ? '+' : '−'} ${money(Math.abs(data.cash.net))}`}
          tone={data.cash.net >= 0 ? 'text-primary' : 'text-destructive'}
        />
      </div>

      {groups.map((g) => {
        const day = data.book.days[g.day] ?? { in: 0, out: 0 };
        return (
          <section key={g.day}>
            <h3 className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{n(fmtDay(g.day))}</span>
              <span className="h-px min-w-8 flex-1 bg-border" />
              <span className="normal-case tracking-normal text-emerald-600 dark:text-emerald-400">+ {money(day.in)}</span>
              <span className="normal-case tracking-normal text-destructive">− {money(day.out)}</span>
            </h3>
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-card">
              {g.lines.map((l) => {
                const look = BOOK_LOOK[l.kind];
                const incoming = l.direction === 'in';
                return (
                  <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${look.tone}`}>
                      <look.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="truncate font-semibold">{titleOf(l)}</span>
                        <span className="text-[11px] text-muted-foreground">{t(kindOf(l))}</span>
                        {l.method && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium">
                            <span className={`h-1.5 w-1.5 rounded-full ${METHOD_DOT[l.method] ?? 'bg-muted-foreground'}`} />
                            {t(METHOD_LABEL[l.method] ?? l.method)}
                          </span>
                        )}
                      </div>
                      {l.kind === 'takings' ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>
                            {n(l.bills ?? 0)} {t('bills')}
                          </span>
                          {(l.methods ?? []).map((m) => (
                            <span key={m.method} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                              <span className={`h-1.5 w-1.5 rounded-full ${METHOD_DOT[m.method] ?? 'bg-muted-foreground'}`} />
                              {t(METHOD_LABEL[m.method] ?? m.method)}
                              <span className="tabular-nums text-foreground">{money(m.amount)}</span>
                            </span>
                          ))}
                        </p>
                      ) : (
                        l.detail && <p className="truncate text-[11.5px] text-muted-foreground">{l.detail}</p>
                      )}
                    </div>
                    {l.direction === 'transfer' ? (
                      <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-muted-foreground" title={t('money changing pockets, so neither in nor out.')}>
                        <ArrowLeftRight className="h-3.5 w-3.5" /> {money(l.amount)}
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${
                          incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                        }`}
                      >
                        {incoming ? '+' : '−'} {money(l.amount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <Pager page={data.book.page} pageSize={data.book.limit} total={data.book.total} onPage={onPage} />
    </div>
  );
}

function MiniTotal({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 break-all text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

/* ----------------------------------------------------------- other income -- */

function IncomeView({
  from,
  to,
  n,
  money,
  onChanged,
}: {
  from: string;
  to: string;
  n: (v: number | string) => string;
  money: (v: number) => string;
  onChanged: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShopIncome[] | null>(null);
  const [editing, setEditing] = useState<ShopIncome | 'new' | null>(null);
  const [binning, setBinning] = useState<ShopIncome | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setRows((await shopApi.incomes({ from, to })).data);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the income.'), 'error');
      setRows([]);
    }
  }, [from, to, toast, t]);

  useEffect(() => {
    void load();
    setPage(1);
  }, [load]);

  const bin = async (reason: string) => {
    if (!binning) return;
    setBusy(true);
    try {
      await shopApi.binIt('income', binning._id, reason);
      toast(`${taka(binning.amount)} ${t('moved to the Recycle Bin')}.`);
      setBinning(null);
      await load();
      onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!rows) return <LoadingBlock />;

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const byCat = INCOME_CATEGORIES.map((c) => ({ c, amount: rows.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const PAGE = 15;
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="card mb-0 min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="mb-0">
            <HandCoins className="h-4 w-4" /> {t('Other income')}
          </h3>
          <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(total)}</span>
        </div>
        <p className="mb-4 text-[12.5px] text-muted-foreground">
          {t('Money in that is not a sale — it adds to the profit on the Overview and the Reports.')}
        </p>
        {byCat.length === 0 ? (
          <div className="empty">{t('Nothing recorded yet in this stretch.')}</div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {byCat.map(({ c, amount }) => {
              const look = incomeLook(c);
              return (
                <li key={c} className="flex items-center gap-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${look.tone}`}>
                    <look.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{t(INCOME_CATEGORY_LABEL[c])}</span>
                      <span className="font-semibold tabular-nums">{money(amount)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="motion-grow-x block h-full rounded-full bg-emerald-500" style={{ width: `${(amount / total) * 100}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="btn mt-4 h-9 w-full" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('Record income')}
        </button>
      </div>

      <div className="min-w-0">
        {rows.length === 0 ? (
          <div className="card mb-0">
            <div className="empty py-10">
              <HandCoins className="h-6 w-6" />
              <p>{t('Nothing recorded yet in this stretch.')}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
            <ul className="divide-y divide-border">
              {shown.map((r) => {
                const look = incomeLook(r.category);
                return (
                  <li key={r._id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${look.tone}`}>
                      <look.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{t(INCOME_CATEGORY_LABEL[r.category] ?? r.category)}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          + {money(r.amount)}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {n(fmtShort(r.dayKey))}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('Edit')} title={t('Edit')} onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t('Delete')} title={t('Delete')} onClick={() => setBinning(r)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} className="border-t border-border px-4 py-3" />
          </div>
        )}
      </div>

      {editing && (
        <IncomeForm
          current={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            onChanged();
          }}
        />
      )}
      <ConfirmWithReason
        open={binning !== null}
        title={t('Delete this income')}
        message={t('It goes to the Recycle Bin, not away — say why, and it is kept with it.')}
        confirmLabel={t('Move it to the Recycle Bin')}
        busy={busy}
        onConfirm={(why) => void bin(why)}
        onCancel={() => setBinning(null)}
      />
    </div>
  );
}

function IncomeForm({ current, onClose, onSaved }: { current: ShopIncome | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [amount, setAmount] = useState(current ? String(current.amount) : '');
  const [category, setCategory] = useState<IncomeCategory>(current?.category ?? 'service');
  const [date, setDate] = useState(current?.dayKey ?? dayOf(0));
  const [note, setNote] = useState(current?.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast(t('How much came in?'), 'error');
      return;
    }
    setBusy(true);
    try {
      if (current) {
        await shopApi.updateIncome(current._id, { amount: value, category, date, note });
        toast(t('Saved'));
      } else {
        await shopApi.createIncome({ amount: value, category, date, note });
        toast(t('Income recorded'));
      }
      onSaved();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
      <h2 className="mb-4 text-lg font-bold">{current ? t('Correct this income') : t('Record income')}</h2>
      <form className="grid gap-4" onSubmit={save}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('Amount')}</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">৳</span>
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
          <span className="mb-1.5 block text-sm font-medium">{t('From')}</span>
          <div className="grid grid-cols-3 gap-2">
            {INCOME_CATEGORIES.map((c) => {
              const look = incomeLook(c);
              const on = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(c)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center text-xs font-semibold transition-colors ${
                    on ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${look.tone}`}>
                    <look.icon className="h-4 w-4" />
                  </span>
                  {t(INCOME_CATEGORY_LABEL[c])}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('Date')}</span>
          <input type="date" className="input h-10" value={date} max={dayOf(0)} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('Note')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </span>
          <textarea
            className="input min-h-20"
            value={note}
            maxLength={2000}
            placeholder={t('Who paid it, and what for.')}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn h-10" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {current ? t('Save') : t('Record')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
  value: React.ReactNode;
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

/* ---------------------------------------------------------- owner & bank -- */

/**
 * The owner's own money and the bank.
 *
 * None of it is profit or cost: a drawing is the owner's share leaving the
 * drawer, capital is the owner's money coming in, and a deposit is the same
 * cash changing pockets. Kept here so the cash book can say where the drawer's
 * money went without any of it bending the profit.
 */
function OwnerBank({
  from,
  to,
  bank,
  n,
  money,
  onChanged,
}: {
  from: string;
  to: string;
  bank: number;
  n: (v: number | string) => string;
  money: (v: number) => string;
  onChanged: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [rows, setRows] = useState<CashMove[] | null>(null);
  const [editing, setEditing] = useState<CashMove | 'new' | null>(null);
  const [binning, setBinning] = useState<CashMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setRows((await shopApi.cashMoves({ from, to })).data);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load that.'), 'error');
      setRows([]);
    }
  }, [from, to, toast, t]);

  useEffect(() => {
    void load();
    setPage(1);
  }, [load]);

  const bin = async (reason: string) => {
    if (!binning) return;
    setBusy(true);
    try {
      await shopApi.binIt('cashmove', binning._id, reason);
      toast(`${taka(binning.amount)} ${t('moved to the Recycle Bin')}.`);
      setBinning(null);
      await load();
      onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!rows) return <LoadingBlock />;

  const sum = (k: CashMoveKind) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0);
  const PAGE = 15;
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={LogOut} tone={MOVE_LOOK.drawing.tone} label={t('Owner took out')} value={<CountUp value={sum('drawing')} format={money} />}>
          {t('the owner’s share — not an expense')}
        </Tile>
        <Tile icon={LogIn} tone={MOVE_LOOK.capital.tone} label={t('Owner put in')} value={<CountUp value={sum('capital')} format={money} />}>
          {t('money into the shop — not income')}
        </Tile>
        <Tile icon={ArrowLeftRight} tone={MOVE_LOOK.bank_deposit.tone} label={t('Into the bank')} value={<CountUp value={sum('bank_deposit')} format={money} />}>
          {money(sum('bank_withdrawal'))} {t('brought back')}
        </Tile>
        <Tile icon={Landmark} tone="bg-primary/10 text-primary" label={t('In the bank')} value={<CountUp value={bank} format={money} />}>
          {t('deposits less withdrawals, all time')}
        </Tile>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('Refunds are written by the POS when a return is taken, and are listed here to be seen, not changed.')}
        </p>
        <button type="button" className="btn h-9" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('Record')}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-3">
          <div className="empty py-10">
            <ArrowLeftRight className="h-6 w-6" />
            <p>{t('Nothing recorded yet in this stretch.')}</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-border bg-card">
          <ul className="divide-y divide-border">
            {shown.map((r) => {
              const look = MOVE_LOOK[r.kind];
              const incoming = r.kind === 'capital';
              const transfer = r.kind === 'bank_deposit' || r.kind === 'bank_withdrawal';
              return (
                <li key={r._id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${look.tone}`}>
                    <look.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {t(CASH_MOVE_LABEL[r.kind])}
                        {r.reference && <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">{r.reference}</span>}
                      </span>
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          transfer ? 'text-muted-foreground' : incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                        }`}
                      >
                        {r.kind === 'refund' && r.amount === 0 && (r.returnValue ?? 0) > 0 ? (
                          /* All of it came off the baki — no cash went over the counter. */
                          <span className="font-normal text-muted-foreground">
                            {money(r.returnValue ?? 0)} {t('off the baki')}
                          </span>
                        ) : (
                          <>
                            {transfer ? '⇄' : incoming ? '+' : '−'} {money(r.amount)}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {n(fmtShort(r.dayKey))}
                      {r.createdByName ? ` · ${r.createdByName}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                  </span>
                  {r.kind !== 'refund' && (
                    <span className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('Edit')} title={t('Edit')} onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t('Delete')} title={t('Delete')} onClick={() => setBinning(r)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} className="border-t border-border px-4 py-3" />
        </div>
      )}

      {editing && (
        <MoveForm
          current={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            onChanged();
          }}
        />
      )}
      <ConfirmWithReason
        open={binning !== null}
        title={t('Delete this line')}
        message={t('It goes to the Recycle Bin, not away — say why, and it is kept with it.')}
        confirmLabel={t('Move it to the Recycle Bin')}
        busy={busy}
        onConfirm={(why) => void bin(why)}
        onCancel={() => setBinning(null)}
      />
    </>
  );
}

function MoveForm({ current, onClose, onSaved }: { current: CashMove | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [kind, setKind] = useState<Exclude<CashMoveKind, 'refund'>>(
    current && current.kind !== 'refund' ? current.kind : 'drawing',
  );
  const [amount, setAmount] = useState(current ? String(current.amount) : '');
  const [date, setDate] = useState(current?.dayKey ?? dayOf(0));
  const [note, setNote] = useState(current?.note ?? '');
  const [reference, setReference] = useState(current?.reference ?? '');
  const [busy, setBusy] = useState(false);

  const HINT: Record<string, string> = {
    drawing: 'Cash the owner took home from the drawer.',
    capital: 'The owner’s own money, put into the shop.',
    bank_deposit: 'Cash carried from the drawer to the bank.',
    bank_withdrawal: 'Cash brought back from the bank to the drawer.',
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast(t('How much?'), 'error');
      return;
    }
    setBusy(true);
    try {
      if (current) await shopApi.updateCashMove(current._id, { amount: value, date, note, reference });
      else await shopApi.createCashMove({ kind, amount: value, date, note, reference });
      toast(t('Saved'));
      onSaved();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
      <h2 className="mb-4 text-lg font-bold">{current ? t('Correct this line') : t('Owner & bank')}</h2>
      <form className="grid gap-4" onSubmit={save}>
        {!current && (
          <div className="grid grid-cols-2 gap-2">
            {CASH_MOVE_KINDS.map((k) => {
              const look = MOVE_LOOK[k];
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k)}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                    on ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${look.tone}`}>
                    <look.icon className="h-4 w-4" />
                  </span>
                  {t(CASH_MOVE_LABEL[k])}
                </button>
              );
            })}
          </div>
        )}
        <p className="-mt-2 text-[11.5px] text-muted-foreground">{t(HINT[current?.kind ?? kind] ?? '')}</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t('Amount')}</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">৳</span>
            <input type="number" min={0} step="0.01" inputMode="decimal" className="input h-12 pl-8 text-lg font-semibold tabular-nums" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t('Date')}</span>
            <input type="date" className="input h-10" value={date} max={dayOf(0)} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              {t('Slip no.')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
            </span>
            <input className="input h-10 font-mono" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="DBBL-0412" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('Note')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </span>
          <textarea className="input min-h-16" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn h-10" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {current ? t('Save') : t('Record')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------- month close -- */

const monthName = (m: string, lang: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Closing a month, and the months already closed.
 *
 * Closing keeps the figures as they stood and locks the month's hand-entered
 * money. A closed month shows what was kept, not what the data says now — so
 * the number written in the notebook is the number on the screen a year later.
 */
function MonthClose({ n, money, onChanged }: { n: (v: number | string) => string; money: (v: number) => string; onChanged: () => void }) {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await shopApi.months());
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load that.'), 'error');
      setRows([]);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const reopen = async (reason: string) => {
    if (!reopening) return;
    setBusy(true);
    try {
      await shopApi.reopenMonth(reopening, reason);
      toast(`${monthName(reopening, lang)} ${t('reopened')}.`);
      setReopening(null);
      await load();
      onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not reopen that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!rows) return <LoadingBlock />;

  return (
    <div className="mt-4">
      <p className="mb-3 text-xs text-muted-foreground">
        {t('Closing a month keeps its figures as they stood and locks its money: its bills can no longer be changed or cancelled, and no delivery, company payment, expense, income or owner & bank line can be dated into it. The counter keeps selling — a return is taken on the day it comes back.')}
      </p>
      {/* Not one height for all: a closed month carries its kept figures, an
          open one only its button, and stretching the open ones to match left
          eleven cards mostly empty. */}
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((m) => {
          const snap = m.snapshot;
          return (
            <div
              key={m.month}
              className={`flex h-full flex-col rounded-[var(--radius)] border bg-card p-4 ${m.closed ? 'border-primary/30' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-semibold">{monthName(m.month, lang)}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {m.closed
                      ? `${t('Closed by')} ${m.closedByName} · ${n(new Date(m.closedAt!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }))}`
                      : m.reopenedAt
                        ? `${t('Reopened by')} ${m.reopenedByName} — ${m.reopenReason}`
                        : t('Its figures are live until it is closed.')}
                  </p>
                </div>
                <span className={`pill shrink-0 ${m.closed ? 'success' : 'neutral'}`}>
                  {m.closed ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  {t(m.closed ? 'Closed' : 'Open')}
                </span>
              </div>

              {snap ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Net profit')}</dt>
                    <dd className={`truncate text-sm font-semibold tabular-nums ${snap.profit.net >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {snap.profit.net < 0 ? '− ' : ''}
                      {money(Math.abs(snap.profit.net))}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Sold')}</dt>
                    <dd className="truncate text-sm font-semibold tabular-nums">{money(snap.profit.sales)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Money in')}</dt>
                    <dd className="truncate text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(snap.cash.in)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Money out')}</dt>
                    <dd className="truncate text-sm font-semibold tabular-nums text-destructive">{money(snap.cash.out)}</dd>
                  </div>
                </dl>
              ) : null}
              {m.closed && m.countedCash !== null && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t('Cash counted')}: <span className="font-semibold text-foreground">{money(m.countedCash)}</span>
                  {m.note ? ` · ${m.note}` : ''}
                </p>
              )}

              <div className="mt-auto pt-3">
                {m.closed ? (
                  <button type="button" className="btn btn-ghost h-9 w-full border border-border" onClick={() => setReopening(m.month)}>
                    <LockOpen className="h-4 w-4" /> {t('Reopen')}
                  </button>
                ) : m.month >= THIS_MONTH() ? (
                  /* The month still running cannot be closed: today's bills and
                     spending would have nowhere to go. */
                  <p className="flex h-9 items-center justify-center rounded-lg bg-muted/50 text-center text-[11px] text-muted-foreground">
                    {t('Can be closed once the month is over')}
                  </p>
                ) : (
                  <button type="button" className="btn h-9 w-full" onClick={() => setClosing(m.month)}>
                    <Lock className="h-4 w-4" /> {t('Close this month')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {closing && (
        <CloseForm
          month={closing}
          n={n}
          money={money}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            void load();
            onChanged();
          }}
        />
      )}
      <ConfirmWithReason
        open={reopening !== null}
        tone="normal"
        title={t('Reopen this month')}
        message={t('Its money can be changed again until it is closed once more. The reason is kept on the Activity page.')}
        confirmLabel={t('Reopen')}
        placeholder={t('e.g. a rent receipt was found late')}
        busy={busy}
        onConfirm={(why) => void reopen(why)}
        onCancel={() => setReopening(null)}
      />
    </div>
  );
}

/** The month's figures as they stand, a count of the drawer, and the button. */
function CloseForm({
  month,
  n,
  money,
  onClose,
  onDone,
}: {
  month: string;
  n: (v: number | string) => string;
  money: (v: number) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [data, setData] = useState<ShopAccounts | null>(null);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const last = toLocalDate(new Date(y, m, 0));
    const to = last < dayOf(0) ? last : dayOf(0);
    shopApi
      .accounts({ from: `${month}-01`, to, limit: 1 })
      .then(setData)
      .catch(() => setData(null));
  }, [month]);

  const close = async () => {
    setBusy(true);
    try {
      await shopApi.closeMonth(month, { countedCash: counted === '' ? null : Number(counted), note: note.trim() });
      toast(`${monthName(month, lang)} ${t('closed')}.`);
      onDone();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not close that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
      <h2 className="mb-1 text-lg font-bold">
        {t('Close')} {monthName(month, lang)}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">{t('These figures are kept as they are now.')}</p>
      {!data ? (
        <LoadingBlock />
      ) : (
        <dl className="text-sm">
          <Row label={t('Sold')} value={money(data.profit.sales)} />
          <Row label={t('Gross margin')} value={money(data.profit.margin)} />
          <Row label={t('Other income')} value={`+ ${money(data.profit.otherIncome)}`} muted />
          <Row label={t('Shop expenses')} value={`− ${money(data.profit.expenses)}`} muted />
          <Row label={t(data.profit.net >= 0 ? 'Net profit' : 'Net loss')} value={money(Math.abs(data.profit.net))} strong rule />
          <Row label={t('Money in')} value={money(data.cash.in)} muted />
          <Row label={t('Money out')} value={money(data.cash.out)} muted />
          <Row label={t('Bills')} value={n(data.profit.bills)} muted />
        </dl>
      )}
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('Cash counted in the drawer')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </span>
          <input type="number" min={0} step="0.01" inputMode="decimal" className="input h-10 tabular-nums" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            {t('Note')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </span>
          <input className="input h-10" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('Cancel')}
        </button>
        <button type="button" className="btn h-10" disabled={busy || !data} onClick={() => void close()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t('Close the month')}
        </button>
      </div>
    </Modal>
  );
}
