import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Plus,
  Loader2,
  Phone,
  CalendarDays,
  Search,
  Wallet,
  CheckCircle2,
  UserRound,
  Pencil,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { shopApi, taka, type Supplier, type SupplierKind } from '../api';
import SupplierStatement from '../components/SupplierStatement';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals, useNumerals } from '../i18n/ui';
import Modal from '../components/Modal';
import ExportCsv from '../components/ExportCsv';
import ConfirmWithReason from '../components/ConfirmWithReason';
import Pager from '../components/Pager';
import { useLinkedSearch } from '../components/useLinkedSearch';

/**
 * The companies a shop buys from.
 *
 * The page exists for one number: what is owed. A shopkeeper does not open this
 * to browse — they open it because a rep is standing at the counter, or because
 * it is the end of the month. So the balance is on the list itself rather than
 * one click in, and the statement beside it is in date order with a running
 * total, which is the shape of the book the rep is holding.
 *
 * Sign convention, said once and then never again in the interface: everything
 * here is "what the shop owes". A payment reduces it, a delivery increases it.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The four kinds, in the words a shopkeeper uses.
 *
 * A depot delivery arrives with an invoice number and bonus on it; a strip
 * bought from the shop next door has neither. Knowing which is which is what
 * makes the purchase form stop asking for things that do not exist.
 */
const KINDS: { key: SupplierKind; label: string; hint: string }[] = [
  { key: 'company', label: 'Company depot', hint: 'Square, Incepta — the SR comes round' },
  { key: 'distributor', label: 'Wholesaler', hint: 'Mitford, or your local wholesale market' },
  { key: 'shop', label: 'Another shop', hint: 'The bigger shop you borrow a strip from' },
  { key: 'other', label: 'Someone else', hint: '' },
];

const KIND_LABEL = (k?: SupplierKind) => KINDS.find((x) => x.key === k)?.label ?? 'Wholesaler';

type Filter = 'all' | 'owed' | 'settled' | 'today';
type Sort = 'owed' | 'name';

/** Companies per page. A shop buys from a dozen or two; this is for the one that buys from sixty. */
const PAGE_SIZE = 15;

/** Two letters for a company's badge: "Square Pharmaceuticals" is SP. */
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—';

/* One hue per kind, for the badge. */
const KIND_TONE: Record<SupplierKind, string> = {
  company: 'bg-primary/10 text-primary',
  distributor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  shop: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  other: 'bg-muted text-muted-foreground',
};

export default function Suppliers() {
  const t = useT();
  const { stop } = useNumerals();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  /* The top bar's search links here with a company's name. */
  useLinkedSearch(setQ);
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<SupplierKind | ''>('');
  const [sort, setSort] = useState<Sort>('owed');
  const [page, setPage] = useState(1);
  /* The form: empty for a new company, or holding the one being changed. */
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [binning, setBinning] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState('');
  /* Bumped whenever the company itself changes, so its statement reloads. */
  const [version, setVersion] = useState(0);
  const statementRef = useRef<HTMLDivElement>(null);

  const n = useCallback(
    (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)),
    [lang],
  );
  const money = useCallback((v: number) => n(taka(v)), [n]);

  /*
   * The whole list, once, and everything else done here.
   *
   * A shop's companies are a few dozen at most, and the tiles need all of
   * them — a total owed worked out from one page of a search is not a total.
   */
  const load = useCallback(async () => {
    try {
      setRows(await shopApi.suppliers());
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the companies.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = new Date().getDay();
  const stats = useMemo(() => {
    const owing = rows.filter((r) => (r.balance || 0) > 0);
    return {
      owed: owing.reduce((sum, r) => sum + r.balance, 0),
      owing: owing.length,
      settled: rows.length - owing.length,
      today: rows.filter((r) => r.repVisitDay === today).length,
      most: Math.max(1, ...owing.map((r) => r.balance)),
    };
  }, [rows, today]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === 'owed' && !((r.balance || 0) > 0)) return false;
      if (filter === 'settled' && (r.balance || 0) > 0) return false;
      if (filter === 'today' && r.repVisitDay !== today) return false;
      if (kind && (r.kind ?? 'distributor') !== kind) return false;
      if (!needle) return true;
      return [r.name, r.repName, r.contactPerson, r.phone, r.repPhone]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle));
    });
    return [...list].sort((a, b) =>
      sort === 'owed' ? (b.balance || 0) - (a.balance || 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
    );
  }, [rows, q, filter, kind, sort, today]);

  const openCompany = rows.find((r) => r._id === openId) ?? null;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const pick = (next: Filter) => {
    setFilter((cur) => (cur === next && next !== 'all' ? 'all' : next));
    setPage(1);
  };

  /* On a phone the account is drawn under the list, so choosing a company
     has to take you to it — otherwise the tap looks like it did nothing. */
  const choose = (id: string) => {
    setOpenId(id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() =>
        statementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  };

  const bin = async (s: Supplier, reason: string) => {
    setBusy(true);
    try {
      await shopApi.binIt('supplier', s._id, reason);
      toast(`${s.name} ${t('moved to the Recycle Bin')}${stop}`);
      setBinning(null);
      if (openId === s._id) setOpenId('');
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'owed', label: 'You owe', count: stats.owing },
    { key: 'settled', label: 'Settled', count: stats.settled },
    { key: 'today', label: 'Visiting today', count: stats.today },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> {t('Suppliers')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Who you buy from, and what you owe them.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsv what="suppliers" label="Export the accounts" />
          <button type="button" className="btn h-9" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('Add company')}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('No companies yet.')}</p>
            <p className="max-w-md">
              {t(
                'Add the ones you buy from — Square, Incepta, the wholesaler in the market — and every delivery and payment lands on their page.',
              )}
            </p>
            <button type="button" className="btn mt-2 h-9" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> {t('Add the first company')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---- four tiles, one shape; each one is also a filter ---- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              icon={Wallet}
              tone="bg-destructive/10 text-destructive"
              value={money(stats.owed)}
              label={t('You owe in total')}
              sub={`${t('across')} ${n(stats.owing)} ${t(stats.owing === 1 ? 'company' : 'companies')}`}
              active={filter === 'owed'}
              onClick={() => pick('owed')}
              bad={stats.owed > 0}
            />
            <Tile
              icon={Building2}
              tone="bg-primary/10 text-primary"
              value={n(rows.length)}
              label={t('Companies')}
              sub={t('everyone you buy from')}
              active={filter === 'all' && !kind && !q}
              onClick={() => pick('all')}
            />
            <Tile
              icon={CheckCircle2}
              tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              value={n(stats.settled)}
              label={t('Settled')}
              sub={t('nothing owed to them')}
              active={filter === 'settled'}
              onClick={() => pick('settled')}
            />
            <Tile
              icon={CalendarDays}
              tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              value={n(stats.today)}
              label={t('Visiting today')}
              sub={t(DAYS[today])}
              active={filter === 'today'}
              onClick={() => pick('today')}
            />
          </div>

          {/* ---- find, filter, order ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
              {FILTERS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === x.key}
                  onClick={() => {
                    setFilter(x.key);
                    setPage(1);
                  }}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === x.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(x.label)}
                  <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {n(x.count)}
                  </span>
                </button>
              ))}
            </div>
            <select
              className="input h-9 w-[calc(50%-0.375rem)] sm:w-44"
              aria-label={t('Kind')}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as SupplierKind | '');
                setPage(1);
              }}
            >
              <option value="">{t('Every kind')}</option>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {t(k.label)}
                </option>
              ))}
            </select>
            <select
              className="input h-9 w-[calc(50%-0.375rem)] sm:w-44"
              aria-label={t('Sort by')}
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="owed">{t('Sort: most owed')}</option>
              <option value="name">{t('Sort: name')}</option>
            </select>
            <label className="relative block w-full sm:ml-auto sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input h-9 pl-9"
                placeholder={t('Company, SR or phone…')}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                aria-label={t('Search')}
              />
            </label>
          </div>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="card min-w-0 p-0">
              {filtered.length === 0 ? (
                <div className="empty py-10">
                  <Building2 className="h-6 w-6" />
                  <p>{t('Nothing matches that.')}</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {shown.map((s) => {
                    const owes = (s.balance || 0) > 0;
                    const visiting = s.repVisitDay === today;
                    const k = s.kind ?? 'distributor';
                    return (
                      <li
                        key={s._id}
                        className={`relative transition-colors ${
                          openId === s._id ? 'bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        {openId === s._id && (
                          <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          onClick={() => choose(s._id)}
                          aria-current={openId === s._id ? 'true' : undefined}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left"
                        >
                          <span
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${KIND_TONE[k]}`}
                            aria-hidden="true"
                          >
                            {initials(s.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-semibold">{s.name}</span>
                              <Balance value={s.balance || 0} money={money} />
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="pill neutral !py-0">{t(KIND_LABEL(s.kind))}</span>
                              {(s.repName || s.contactPerson) && (
                                <span className="inline-flex items-center gap-1">
                                  <UserRound className="h-3 w-3" /> {s.repName || s.contactPerson}
                                </span>
                              )}
                              {(s.repPhone || s.phone) && (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Phone className="h-3 w-3" /> {s.repPhone || s.phone}
                                </span>
                              )}
                              {typeof s.repVisitDay === 'number' && (
                                <span
                                  className={`inline-flex items-center gap-1 ${
                                    visiting ? 'font-semibold text-sky-600 dark:text-sky-400' : ''
                                  }`}
                                >
                                  <CalendarDays className="h-3 w-3" />
                                  {visiting ? t('Today') : t(DAYS[s.repVisitDay])}
                                </span>
                              )}
                            </span>
                            {owes && (
                              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                                <span
                                  className="motion-grow-x block h-full rounded-full bg-destructive/70"
                                  style={{ width: `${Math.max(4, (s.balance / stats.most) * 100)}%` }}
                                />
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Pager
                page={current}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onPage={setPage}
                className="border-t border-border px-4 py-3"
              />
            </div>

            <div ref={statementRef} className="min-w-0 scroll-mt-4 lg:sticky lg:top-0">
              {openCompany && (
                /* What you do to the company itself, above its account: the
                   account is about money, and these are about the name. */
                <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
                  {(openCompany.repPhone || openCompany.phone) && (
                    <a
                      href={`tel:${openCompany.repPhone || openCompany.phone}`}
                      className="btn btn-ghost h-8 px-2.5 text-xs"
                    >
                      <Phone className="h-3.5 w-3.5" /> {t('Call')}
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost h-8 px-2.5 text-xs"
                    onClick={() => setEditing(openCompany)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> {t('Edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 px-2.5 text-xs text-destructive"
                    onClick={() => setBinning(openCompany)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('Delete')}
                  </button>
                </div>
              )}
              {openId ? (
                <SupplierStatement
                  key={`${openId}-${version}`}
                  id={openId}
                  onPaid={() => void load()}
                  onClose={() => setOpenId('')}
                />
              ) : (
                <div className="card hidden min-h-[16rem] place-items-center text-center lg:grid">
                  <div className="flex flex-col items-center gap-2">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                      <BookOpen className="h-6 w-6" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {t('Pick a company to see its account.')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && (
        <CompanyForm
          company={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setVersion((v) => v + 1);
            void load();
          }}
        />
      )}

      <ConfirmWithReason
        open={binning !== null}
        title={t('Delete this company')}
        message={
          binning
            ? (binning.balance || 0) > 0
              ? `${binning.name} — ${taka(binning.balance)} is still owed. Settle the account first; a company you owe money to cannot be filed away.`
              : `${binning.name} goes to the Recycle Bin, with its deliveries and payments kept. It can be brought back.`
            : ''
        }
        confirmLabel={t('Delete')}
        placeholder={t('Why — e.g. we stopped buying from them')}
        busy={busy}
        onCancel={() => setBinning(null)}
        onConfirm={(reason) => void (binning && bin(binning, reason))}
      />
    </div>
  );
}

/**
 * What is owed, said the right way round.
 *
 * Below zero is not a debt with a minus sign: it is money the company holds
 * for the shop — an overpayment, or goods sent back — and it reads as credit.
 */
function Balance({ value, money }: { value: number; money: (v: number) => string }) {
  const t = useT();
  if (value < 0) {
    return (
      <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
        {money(-value)}
        <span className="block text-[10px] font-medium uppercase tracking-wide">{t('credit')}</span>
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 text-sm font-semibold tabular-nums ${
        value > 0 ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {money(value)}
    </span>
  );
}

/** One tile: label and icon, figure, a line under it — the same on all four. */
function Tile({
  icon: Icon,
  tone,
  value,
  label,
  sub,
  active,
  onClick,
  bad,
}: {
  icon: typeof Building2;
  tone: string;
  value: string;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  bad?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stat flex h-full min-h-[132px] flex-col text-left hover:border-primary/45 ${
        active ? 'border-primary ring-2 ring-primary/20' : ''
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className={`value mt-1 stat-fit [--fit-max:24px] ${bad ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        {sub}
      </div>
    </button>
  );
}

/**
 * Adding a company, or changing one.
 *
 * What was already owed is asked only when it is new: on an existing company
 * the balance is the ledger's, and a field that rewrote it would be a way to
 * make a debt disappear without a line saying so.
 */
function CompanyForm({
  company,
  onClose,
  onSaved,
}: {
  company: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { stop } = useNumerals();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: company?.name ?? '',
    kind: (company?.kind ?? 'distributor') as SupplierKind,
    contactPerson: company?.contactPerson ?? '',
    phone: company?.phone ?? '',
    repName: company?.repName ?? '',
    repPhone: company?.repPhone ?? '',
    repVisitDay: typeof company?.repVisitDay === 'number' ? String(company.repVisitDay) : '',
    openingBalance: '',
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      repPhone: form.repPhone.trim() || undefined,
      contactPerson: form.contactPerson.trim() || undefined,
      phone: form.phone.trim() || undefined,
      repName: form.repName.trim() || undefined,
      repVisitDay: form.repVisitDay === '' ? null : Number(form.repVisitDay),
    };
    try {
      if (company) {
        await shopApi.updateSupplier(company._id, payload);
        toast(`${payload.name} ${t('saved')}${stop}`);
      } else {
        await shopApi.createSupplier({
          ...payload,
          openingBalance: form.openingBalance ? Number(form.openingBalance) : undefined,
        });
        toast(`${payload.name} ${t('added')}${stop}`);
      }
      onSaved();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that company.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-lg">
      <div className="mb-4">
        <h3 className="mb-0 text-base">{t(company ? 'Edit the company' : 'Add a company')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('Square, Incepta, or the wholesaler you actually ring.')}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t('Where do you buy from them?')}
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                aria-pressed={form.kind === k.key}
                onClick={() => setForm({ ...form, kind: k.key })}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  form.kind === k.key
                    ? 'border-primary bg-primary/5 font-semibold ring-2 ring-primary/15'
                    : 'border-border hover:bg-secondary'
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${KIND_TONE[k.key]}`}>
                  <Building2 className="h-4 w-4" />
                </span>
                <span>
                  {t(k.label)}
                  {k.hint && (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {t(k.hint)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sup-name">
            {t('Name')}
          </label>
          <input
            id="sup-name"
            className="input h-10"
            value={form.name}
            onChange={set('name')}
            required
            minLength={2}
            placeholder={t('Incepta Pharmaceuticals')}
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sup-person">
              {t('Who you ring')}
            </label>
            <input
              id="sup-person"
              className="input h-10"
              value={form.contactPerson}
              onChange={set('contactPerson')}
              placeholder={t('Jashim')}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sup-phone">
              {t('Phone')}
            </label>
            <input
              id="sup-phone"
              className="input h-10"
              inputMode="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="01711111111"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sup-rep">
              {t('SR — who comes round')}
            </label>
            <input
              id="sup-rep"
              className="input h-10"
              value={form.repName}
              onChange={set('repName')}
              placeholder={t('Jashim Uddin')}
            />
            <input
              className="input mt-2 h-10"
              inputMode="tel"
              value={form.repPhone}
              onChange={set('repPhone')}
              placeholder={t('His number')}
              aria-label={t('SR phone')}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sup-day">
              {t('Comes on')}
            </label>
            <select id="sup-day" className="input h-10" value={form.repVisitDay} onChange={set('repVisitDay')}>
              <option value="">{t('No fixed day')}</option>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {t(d)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('The order is placed when he turns up.')}
            </p>
          </div>
        </div>

        {!company && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sup-open">
              {t('Already owed to them')}
            </label>
            <input
              id="sup-open"
              className="input h-10"
              inputMode="decimal"
              value={form.openingBalance}
              onChange={set('openingBalance')}
              placeholder="0"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('What you owed before today. Leave it empty if you are square.')}
            </p>
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || form.name.trim().length < 2}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
            {t(company ? 'Save changes' : 'Add company')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
