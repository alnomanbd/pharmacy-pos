import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCan } from '../access';
import {
  Users,
  Search,
  Loader2,
  Wallet,
  ReceiptText,
  Phone,
  ArrowDownRight,
  ArrowUpRight,
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  TriangleAlert,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';
import {
  tillApi,
  shopApi,
  settingsApi,
  taka,
  type CustomerStatement,
  type Sale,
  type ShopSettings,
  type BookRow,
} from '../api';
import ConfirmWithReason from '../components/ConfirmWithReason';
import CustomerForm from '../components/CustomerForm';
import BillDetail from '../components/BillDetail';
import Receipt from '../components/Receipt';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import Pager from '../components/Pager';
import { useLinkedSearch } from '../components/useLinkedSearch';
import Modal from '../components/Modal';
import ExportCsv from '../components/ExportCsv';

/**
 * The baki khata.
 *
 * Every pharmacy in this country keeps one in a notebook — the neighbour, the
 * tea stall, the garment worker who settles at the end of the month — and the
 * notebook is opened for two questions: how much does this person owe, and what
 * is that made of.
 *
 * So the list answers the first at a glance and is ordered by it, and opening a
 * name answers the second: every bill they have taken and every payment they
 * have made, each row carrying the balance as it stood afterwards. The running
 * total is computed from the rows rather than read off the customer, because
 * the argument at a counter is never about the total — it is about which
 * ৳500 went where.
 *
 * Taking a payment lives here too. Somebody comes to settle, and the person
 * taking the money should be looking at what it is for while they take it.
 *
 * And the book can be written by hand: a shop moving off its notebook has
 * regulars, and what they already owe, before the till has sold them anything.
 * Who somebody is can be corrected; what they owe cannot be typed over — it
 * moves only by bills and payments, so every figure stays explainable.
 */

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const ENTRY_WORDS: Record<string, string> = {
  opening: 'Brought forward',
  sale: 'Taken on account',
  payment: 'Paid',
  sale_return: 'Returned',
  adjustment: 'Corrected',
};

type Show = 'all' | 'owing' | 'clear' | 'over';
type Sort = 'owed' | 'name' | 'recent';

/** Names per page. The server pages them; this is what one page asks for. */
const PAGE_SIZE = 20;

const EMPTY_BOOK = { customers: 0, owing: 0, owed: 0, over: 0 };

/** Two letters for a person's badge: "Kabir Bhai (tea stall)" is KB. */
const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—';

/** "3 days ago", the way somebody at a counter would say it. */
const ago = (iso: string | undefined, n: (v: number | string) => string, t: (k: string) => string) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 30) return `${n(days)} ${t('days ago')}`;
  const months = Math.floor(days / 30);
  return `${n(months)} ${t(months === 1 ? 'month ago' : 'months ago')}`;
};

export default function Customers() {
  const canImport = useCan()('customers.manage');
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<BookRow[]>([]);
  const [total, setTotal] = useState(0);
  const [book, setBook] = useState(EMPTY_BOOK);
  const [q, setQ] = useState('');
  /* The top bar's search links here with a name. */
  useLinkedSearch(setQ);
  /* What the server is asked for — the box, a moment after the typing stops. */
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('owed');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chasing, setChasing] = useState(false);
  const [adding, setAdding] = useState(false);

  const n = useCallback(
    (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)),
    [lang],
  );
  const money = useCallback((v: number) => n(taka(v)), [n]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const res = await tillApi.customerBook({
        q: query || undefined,
        show: show === 'all' ? undefined : show,
        sort,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.data);
      setTotal(res.total);
      setBook(res.summary);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the customers.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [query, show, sort, page, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = (next: Show) => {
    setShow((cur) => (cur === next && next !== 'all' ? 'all' : next));
    setPage(1);
  };

  /* The largest balance on the page sets the scale for every bar. */
  const most = Math.max(1, ...rows.map((r) => r.balance));

  /*
   * Chasing the whole book at once.
   *
   * Everybody who owes anything, whatever page is showing — the server works
   * out who, and refuses anybody reminded in the last three days, saying so
   * per name. Those are reported rather than hidden, because "sent to 4 of
   * 11" with the reasons is the honest answer and silence looks like a
   * failure.
   */
  const chaseEveryone = async () => {
    if (book.owing === 0) return;
    setChasing(true);
    try {
      const res = await shopApi.remindEveryone(1);
      const held = res.skipped.length;
      toast(
        held > 0
          ? `Sent ${res.sent}. ${held} not sent — ${res.skipped[0].why}${held > 1 ? ' and others' : ''}.`
          : `Sent ${res.sent}.`,
      );
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not send those.', 'error');
    } finally {
      setChasing(false);
    }
  };

  const TABS: { key: Show; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: book.customers },
    { key: 'owing', label: 'Owing now', count: book.owing },
    { key: 'clear', label: 'Clear', count: Math.max(0, book.customers - book.owing) },
    { key: 'over', label: 'Over their limit', count: book.over },
  ];

  const filtering = !!(query || show !== 'all');

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {t('Customers')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('The baki khata — who owes what, and what it is made of.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsv what="customers" label="Export the khata" />
          {canImport && (
            <Link to="/import?what=customers" className="btn btn-ghost h-9">
              <FileSpreadsheet className="h-4 w-4" /> {t('Import')}
            </Link>
          )}
          <button
            type="button"
            className="btn btn-ghost h-9"
            disabled={chasing || book.owing === 0}
            onClick={() => void chaseEveryone()}
            title={t('One SMS each, and nobody twice in three days')}
          >
            {chasing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            {t('Remind them all')}
          </button>
          <button type="button" className="btn h-9" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> {t('Add a customer')}
          </button>
        </div>
      </div>

      {/* ---- four tiles, one shape; each one is also a filter ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Wallet}
          tone="bg-destructive/10 text-destructive"
          value={money(book.owed)}
          label={t('Out on the book')}
          sub={`${n(book.owing)} ${t(book.owing === 1 ? 'person owes' : 'people owe')}`}
          active={show === 'owing'}
          onClick={() => pick('owing')}
          bad={book.owed > 0}
        />
        <Tile
          icon={Users}
          tone="bg-primary/10 text-primary"
          value={n(book.customers)}
          label={t('On the book')}
          sub={t('everyone with an account')}
          active={show === 'all' && !query}
          onClick={() => pick('all')}
        />
        <Tile
          icon={CheckCircle2}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          value={n(Math.max(0, book.customers - book.owing))}
          label={t('Clear')}
          sub={t('owe nothing today')}
          active={show === 'clear'}
          onClick={() => pick('clear')}
        />
        <Tile
          icon={TriangleAlert}
          tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          value={n(book.over)}
          label={t('Over their limit')}
          sub={t('owe more than you allow')}
          active={show === 'over'}
          onClick={() => pick('over')}
          warn={book.over > 0}
        />
      </div>

      {/* ---- find, filter, order ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={show === x.key}
              onClick={() => {
                setShow(x.key);
                setPage(1);
              }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                show === x.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(x.label)}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  x.key === 'over' && x.count > 0
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    : 'bg-background/70 text-muted-foreground'
                }`}
              >
                {n(x.count)}
              </span>
            </button>
          ))}
        </div>
        <select
          className="input h-9 w-full sm:w-56"
          aria-label={t('Sort by')}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as Sort);
            setPage(1);
          }}
        >
          <option value="owed">{t('Sort: owes the most')}</option>
          <option value="recent">{t('Sort: seen most recently')}</option>
          <option value="name">{t('Sort: name')}</option>
        </select>
        <label className="relative block w-full sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-9 pl-9"
            placeholder={t('Name or phone…')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('Search')}
          />
        </label>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="card mt-4">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-7 w-7" />
            </span>
            {filtering ? (
              <p>{query ? t('Nobody by that name.') : t('Nothing matches that.')}</p>
            ) : (
              <>
                <p className="font-semibold">{t('Nobody on the book yet.')}</p>
                <p className="max-w-md">
                  {t(
                    'A customer is added at the counter the first time something goes on account — or add one here, with what they already owe from the old notebook.',
                  )}
                </p>
                <button type="button" className="btn mt-2 h-9" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> {t('Add a customer')}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => {
              const owes = c.balance > 0;
              const over = !!c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit;
              return (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(c._id)}
                    className="flex h-full w-full items-start gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-3.5 text-left transition-shadow hover:border-primary/40 hover:shadow-md"
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        over
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : owes
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      }`}
                      aria-hidden="true"
                    >
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.name}</span>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            owes ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {owes ? money(c.balance) : t('clear')}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        ) : (
                          <span>{t('No phone')}</span>
                        )}
                        {c.lastAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {ago(c.lastAt, n, t)}
                          </span>
                        )}
                        {(c.points ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                            ★ {n(Math.floor(c.points ?? 0))} {t('points')}
                          </span>
                        )}
                        {over && (
                          <span className="pill pending !px-1.5 !py-0 text-[10px]">
                            {t('over limit')} {money(c.creditLimit!)}
                          </span>
                        )}
                      </span>
                      {owes && (
                        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className={`motion-grow-x block h-full rounded-full ${over ? 'bg-amber-500' : 'bg-destructive/70'}`}
                            style={{ width: `${Math.max(4, (c.balance / most) * 100)}%` }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={setPage}
            className="mt-4"
          />
        </div>
      )}

      {openId && (
        <CustomerSheet
          id={openId}
          onClose={() => setOpenId(null)}
          onPaid={() => void load()}
          onGone={() => {
            setOpenId(null);
            void load();
          }}
        />
      )}

      {adding && (
        <CustomerForm
          customer={null}
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            void load();
            /* Straight into the account: the next thing anybody does with a
               name just added is look at it, or take money against it. */
            setOpenId(c._id);
          }}
        />
      )}
    </div>
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
  warn,
}: {
  icon: typeof Users;
  tone: string;
  value: string;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  bad?: boolean;
  warn?: boolean;
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
      <div
        className={`value mt-1 stat-fit [--fit-max:24px] ${
          bad ? 'text-destructive' : warn ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
      >
        {value}
      </div>
      <div className="mt-auto line-clamp-2 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        {sub}
      </div>
    </button>
  );
}

/**
 * One name, opened.
 *
 * The account and the bills side by side, because "koto due" and "kobe ki
 * nisilo" are the same question asked twice — a ledger row saying "taken on
 * account, ৳140" does not tell anybody what was in the bag.
 */
function CustomerSheet({
  id,
  onClose,
  onPaid,
  onGone,
}: {
  id: string;
  onClose: () => void;
  onPaid: () => void;
  /** Deleted — the list reloads and the sheet closes. */
  onGone: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  /* Deleting is the back room's (the bin is an admin route); correcting a
     phone number is anybody's who stands at the counter. */
  const can = useCan();
  const runsTheShop = can('customers.delete');
  const [editing, setEditing] = useState(false);
  const [binning, setBinning] = useState(false);
  const [binBusy, setBinBusy] = useState(false);
  const [data, setData] = useState<CustomerStatement | null>(null);
  const [tab, setTab] = useState<'account' | 'bills'>('account');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState(false);
  /* The bill opens here rather than sending anybody to another screen — they
     are in the middle of settling an account, and coming back is a click they
     should not have to spend. */
  const [bill, setBill] = useState<Sale | null>(null);
  /*
   * Printing from here is the same paper the counter hands over, not a second
   * format: somebody who comes back to settle a month's baki asks for "the
   * bills", and two shops' worth of documents for the same sale is how a
   * customer ends up holding one that does not match the shop's copy.
   *
   * The header is loaded once with the sheet rather than per print, because a
   * printer dialog that waits on a request is a printer dialog that opens with
   * an empty page behind it.
   */
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [printing, setPrinting] = useState<Sale | null>(null);
  const [openingBill, setOpeningBill] = useState(false);

  const openBill = async (id: string) => {
    setOpeningBill(true);
    try {
      setBill(await tillApi.sale(id));
    } catch {
      toast(t('Could not open that bill.'), 'error');
    } finally {
      setOpeningBill(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setData(await tillApi.customer(id));
    } catch {
      toast(t('Could not open that account.'), 'error');
      onClose();
    }
  }, [id, onClose, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The shop's own header, for the paper. A shop that has not set one up still
     prints — the receipt falls back to its own defaults — so a failure here is
     not worth a message. */
  useEffect(() => {
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const take = async () => {
    const n = Number(amount);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      await tillApi.payCustomer(id, { amount: n, method, note: note.trim() || undefined });
      toast(`${taka(n)} taken off the account.`);
      setAmount('');
      setNote('');
      await load();
      onPaid();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not record that payment.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const bin = async (reason: string) => {
    setBinBusy(true);
    try {
      await shopApi.binIt('customer', id, reason);
      toast(`${data?.customer.name ?? ''} ${t('moved to the Recycle Bin')}.`);
      onGone();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBinBusy(false);
    }
  };

  /* The reason a reminder did not go is the answer — the server says it in one
     line ("reminded in the last three days"), and it is shown as it came. */
  const remind = async () => {
    setReminding(true);
    try {
      await shopApi.remindCustomer(id);
      toast('Reminder sent.');
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not send that.', 'error');
    } finally {
      setReminding(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-3xl">
        {!data ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="mb-0 text-base">{data.customer.name}</h3>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  {data.customer.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {data.customer.phone}
                    </span>
                  )}
                  <span>
                    {data.bills.length} bill{data.bills.length === 1 ? '' : 's'}
                  </span>
                  <span>{taka(data.totals.bought)} bought in all</span>
                </p>
                {(data.customer.address || data.customer.note) && (
                  <p className="text-xs text-muted-foreground">
                    {[data.customer.address, data.customer.note].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label={t('Edit')}
                  title={t('Edit')}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {runsTheShop && (
                  <button
                    type="button"
                    onClick={() => setBinning(true)}
                    disabled={data.balance !== 0}
                    aria-label={t('Delete')}
                    title={
                      data.balance !== 0
                        ? t('Settle the account first — money owed is collected, not deleted')
                        : t('Delete')
                    }
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div
              className={`mb-4 rounded-lg border px-4 py-3 ${
                data.balance > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted'
              }`}
            >
              <div className="eyebrow">
                {t('What they owe now')}
              </div>
              <div
                className={`text-2xl font-semibold tabular-nums ${
                  data.balance > 0 ? 'text-destructive' : ''
                }`}
              >
                {taka(data.balance)}
              </div>
              {data.customer.creditLimit ? (
                <p className="text-[11px] text-muted-foreground">
                  Limit {taka(data.customer.creditLimit)}
                  {data.balance > data.customer.creditLimit ? ' — over it' : ''}
                </p>
              ) : null}
              {data.balance > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost mt-2 h-8"
                  disabled={reminding || !data.customer.phone}
                  onClick={() => void remind()}
                  title={
                    data.customer.phone
                      ? t('One SMS, and nobody twice in three days')
                      : t('No phone number against this name')
                  }
                >
                  {reminding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  {t('Send a reminder')}
                </button>
              )}
            </div>

            {/* ---- taking money ---- */}
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
              {/* A line of its own on a phone: squeezed beside the method and
                  the note, the amount box showed two digits. */}
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <label className="eyebrow mb-1 block">
                  {t('Money in')}
                </label>
                {/* What is owed, one tap away — and more than that is not
                    taken, so the box says so before the button is pressed. */}
                <div className="flex gap-1.5">
                  <input
                    className="input h-10 tabular-nums"
                    inputMode="decimal"
                    placeholder={data.balance > 0 ? taka(data.balance) : '0'}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {data.balance > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost h-10 shrink-0 border border-border px-2.5 text-xs"
                      onClick={() => setAmount(String(data.balance))}
                    >
                      {t('All')}
                    </button>
                  )}
                </div>
                {Number(amount) > Math.max(0, data.balance) + 0.009 && (
                  <p className="mt-1 text-[11px] font-medium text-destructive">
                    {data.balance > 0
                      ? `${t('Owes only')} ${taka(data.balance)}`
                      : t('Owes nothing')}
                  </p>
                )}
              </div>
              <select
                className="input h-10 w-auto"
                aria-label={t('How they paid')}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="cash">{t('Cash')}</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="bank">{t('Bank')}</option>
              </select>
              <input
                className="input h-10 flex-1"
                placeholder={t('Note — kept with the payment')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="btn h-10"
                disabled={busy || !(Number(amount) > 0) || Number(amount) > Math.max(0, data.balance) + 0.009}
                onClick={() => void take()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {t('Take it')}
              </button>
            </div>

            <div className="seg mb-3">
              {(['account', 'bills'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  className="seg-btn"
                >
                  {key === 'account' ? t('The account') : t('What they took')}
                </button>
              ))}
            </div>

            {tab === 'account' ? (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="hidden sm:table-cell">{t('When')}</th>
                      <th>{t('What')}</th>
                      <th className="text-right">{t('Amount')}</th>
                      <th className="hidden text-right sm:table-cell">{t('Owed after')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-muted-foreground">
                          {t('Nothing on this account yet.')}
                        </td>
                      </tr>
                    )}
                    {[...data.entries].reverse().map((e) => (
                      <tr key={e._id}>
                        {/* On a phone the date rides under the entry: four columns
                            across a dialog pushed the amount off the edge. */}
                        <td className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                          {when(e.at)}
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            {e.amount < 0 ? (
                              <ArrowDownRight className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                            )}
                            {t(ENTRY_WORDS[e.entry] ?? e.entry)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            <span className="sm:hidden">{when(e.at)} · </span>
                            {[
                              e.reference && `${t('bill')} ${e.reference}`,
                              e.method,
                              e.note,
                              e.actorName,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </td>
                        <td
                          className={`text-right tabular-nums ${
                            e.amount < 0 ? 'text-primary' : ''
                          }`}
                        >
                          {e.amount < 0 ? `−${taka(-e.amount)}` : taka(e.amount)}
                        </td>
                        <td className="hidden text-right font-semibold tabular-nums sm:table-cell">
                          {taka(e.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead>
                    <tr>
                      <th>{t('Bill')}</th>
                      <th className="hidden sm:table-cell">{t('Sold by')}</th>
                      <th className="text-right">{t('Total')}</th>
                      <th className="text-right">{t('Paid')}</th>
                      <th className="text-right">{t('On account')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bills.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-muted-foreground">
                          {t('No bills against this name.')}
                        </td>
                      </tr>
                    )}
                    {data.bills.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => void openBill(b._id)}
                            className="inline-flex items-center gap-1.5 font-semibold tabular-nums hover:underline"
                          >
                            <ReceiptText className="h-3.5 w-3.5" />
                            {b.billNo}
                          </button>
                          <span className="block text-[11px] text-muted-foreground">
                            {when(b.soldAt)} · {b.items} item{b.items === 1 ? '' : 's'}
                            {b.status === 'returned' ? ' · taken back' : ''}
                          </span>
                        </td>
                        <td className="hidden text-muted-foreground sm:table-cell">
                          {b.salesmanName}
                        </td>
                        <td className="text-right tabular-nums">{taka(b.total)}</td>
                        <td className="text-right tabular-nums text-muted-foreground">
                          {taka(b.paid)}
                        </td>
                        <td
                          className={`text-right tabular-nums ${
                            b.due > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {b.due > 0 ? taka(b.due) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      {openingBill && (
        <div className="blocking">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Stacked above the account, not instead of it: closing the bill puts
          somebody back where they were, mid-settle. */}
      {bill && (
        <div className="fixed inset-0 z-[60]">
          <BillDetail
            sale={bill}
            canSeeCost={false}
            onClose={() => setBill(null)}
            onPrint={settings ? () => setPrinting(bill) : undefined}
          />
        </div>
      )}

      {printing && settings && (
        <Receipt sale={printing} settings={settings} onDone={() => setPrinting(null)} />
      )}

      {editing && data && (
        <CustomerForm
          customer={data.customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
            onPaid();
          }}
        />
      )}

      <ConfirmWithReason
        open={binning}
        title={t('Delete this customer')}
        message={t(
          'It goes to the Recycle Bin, not away — their bills and their account stay as they were, and you can bring them back whenever you like.',
        )}
        confirmLabel={t('Move it to the Recycle Bin')}
        busy={binBusy}
        onConfirm={(why) => void bin(why)}
        onCancel={() => setBinning(false)}
      />
    </Modal>
  );
}
