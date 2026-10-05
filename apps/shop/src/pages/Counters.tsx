import { useCallback, useEffect, useState } from 'react';
import {
  Monitor,
  Plus,
  Loader2,
  Power,
  Pencil,
  Trash2,
  Radio,
  Banknote,
  ReceiptText,
  BarChart3,
  Clock,
  MapPin,
} from 'lucide-react';
import { shopApi, taka, type ShopCounter } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import ConfirmWithReason from '../components/ConfirmWithReason';
import { useT, useUiLang, bnNumerals, useNumerals } from '../i18n/ui';
import { fetchBranchSwitcher, useBranchStore, type BranchSwitcherInfo } from '../branch';
import { CountUp } from '../components/motion';
import Modal from '../components/Modal';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * Where people stand and sell.
 *
 * It used to be a word typed into the open-the-day box, which meant "Counter 1",
 * "counter1" and "C-1" were three different tills as far as the day's figures
 * went — and a shop with two counters could never be told which one was short.
 *
 * So the shop sets them up once, and this page doubles as the view of its own
 * floor: who is on which counter, since when, and what each has taken today.
 * That is the only question an owner opens it to ask.
 */

const since = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  /* A day left open over a weekend is days, not "290h". */
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins % 60}m`;
};

/** What somebody is called across a counter: "Md. Kamal Hossain" is Kamal. */
const calledBy = (name: string) =>
  name.split(/\s+/).find((w) => !/^(md|mohammad|mohammed|dr|mr|mrs|ms)\.?$/i.test(w)) ?? name;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—';

export default function Counters() {
  const t = useT();
  const { stop } = useNumerals();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShopCounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ShopCounter | 'new' | null>(null);
  /* Deleting asks why, and the answer is kept with it in the bin. */
  const [binning, setBinning] = useState<ShopCounter | null>(null);
  const [busy, setBusy] = useState(false);
  /* The shop's branches, when it has more than one: each counter says which it stands in. */
  const [branches, setBranches] = useState<BranchSwitcherInfo | null>(null);
  useEffect(() => {
    fetchBranchSwitcher()
      .then(setBranches)
      .catch(() => undefined);
  }, []);
  const branchName = (id?: string | null) =>
    branches && branches.count > 1 ? branches.branches.find((b) => b._id === id)?.name : undefined;

  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);
  const money = useCallback((v: number) => n(taka(v)), [n]);

  const load = useCallback(async () => {
    try {
      setRows(await shopApi.counters());
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the counters.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (c: ShopCounter) => {
    if (
      c.isActive !== false &&
      !(await confirmAction({
        title: t('Turn this counter off?'),
        message: `${c.name}: ${t('nobody can open the day or sell at it until it is turned on again.')}`,
        confirmLabel: t('Turn off'),
        tone: 'danger',
        icon: 'warning',
      }))
    )
      return;
    try {
      await shopApi.updateCounter(c._id, { isActive: c.isActive === false });
      toast(`${c.name} ${c.isActive === false ? t('turned on') : t('turned off')}${stop}`);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not change that counter.'), 'error');
    }
  };

  const bin = async (reason: string) => {
    if (!binning) return;
    setBusy(true);
    try {
      await shopApi.binIt('counter', binning._id, reason);
      toast(`${binning.name} ${t('moved to the Recycle Bin')}${stop}`);
      setBinning(null);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openNow = rows.filter((r) => r.openShift);
  const active = rows.filter((r) => r.isActive !== false).length;
  const takenToday = rows.reduce((sum, r) => sum + (r.today?.total ?? 0), 0);
  const billsToday = rows.reduce((sum, r) => sum + (r.today?.bills ?? 0), 0);
  const most = Math.max(1, ...rows.map((r) => r.today?.total ?? 0));
  /* The busiest first on the split, so the eye starts where the money is. */
  const split = [...rows].filter((r) => (r.today?.total ?? 0) > 0).sort((a, b) => (b.today?.total ?? 0) - (a.today?.total ?? 0));

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Monitor className="h-5 w-5" /> {t('Counters')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Where people stand and sell, and who is on each right now.')}
          </p>
        </div>
        <button type="button" className="btn h-9" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('Add a counter')}
        </button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Monitor className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('No counters set up yet.')}</p>
            <p className="max-w-lg">
              {t(
                'Add one for each place somebody sells from. Whoever opens the day picks one, and then every bill, every shift and every cash count hangs off the same name instead of whatever was typed that morning.',
              )}
            </p>
            <button type="button" className="btn mt-2 h-9" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> {t('Add a counter')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---- four tiles, one shape ---- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Monitor} tone="bg-primary/10 text-primary" label={t('Counters')} value={<CountUp value={rows.length} format={n} />}>
              {n(active)} {t('in use')}
              {rows.length - active > 0 ? ` · ${n(rows.length - active)} ${t('turned off')}` : ''}
            </Tile>
            <Tile icon={Radio} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label={t('Open now')} value={<CountUp value={openNow.length} format={n} />}>
              {openNow.length ? openNow.map((r) => calledBy(r.openShift!.userName)).join(', ') : t('nobody on a counter')}
            </Tile>
            <Tile icon={Banknote} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label={t('Taken today')} value={<CountUp value={takenToday} format={money} />}>
              {t('across every counter')}
            </Tile>
            <Tile icon={ReceiptText} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label={t('Bills today')} value={<CountUp value={billsToday} format={n} />}>
              {billsToday > 0 ? `${money(takenToday / billsToday)} ${t('a bill, on average')}` : t('none yet')}
            </Tile>
          </div>

          {/* ---- today, counter by counter ---- */}
          {split.length > 0 && (
            <div className="card mt-4">
              <h3>
                <BarChart3 className="h-4 w-4" /> {t('Today, counter by counter')}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {split.map((r) => (
                  <li key={r._id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {n(r.today?.bills ?? 0)} {t('bills')}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {money(r.today?.total ?? 0)}
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          {n(takenToday > 0 ? Math.round(((r.today?.total ?? 0) / takenToday) * 100) : 0)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="motion-grow-x h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, ((r.today?.total ?? 0) / most) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---- the counters ---- */}
          <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <CounterCard
                key={c._id}
                counter={c}
                branchName={branchName(c.branch)}
                n={n}
                money={money}
                onEdit={() => setEditing(c)}
                onToggle={() => void toggle(c)}
                onBin={() => setBinning(c)}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmWithReason
        open={binning !== null}
        title={t('Delete this counter')}
        message={t(
          'It goes to the Recycle Bin, not away — every bill and every shift that named it keeps saying so, and you can bring it back whenever you like.',
        )}
        confirmLabel={t('Move it to the Recycle Bin')}
        busy={busy}
        onConfirm={(why) => void bin(why)}
        onCancel={() => setBinning(null)}
      />

      {editing && (
        <CounterForm
          counter={editing === 'new' ? null : editing}
          branches={branches && branches.count > 1 ? branches.branches : []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
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
  icon: typeof Monitor;
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

/**
 * One counter. The same parts in the same places whatever state it is in, and
 * `auto-rows-fr` on the grid, so an open counter is no taller than an idle one.
 */
function CounterCard({
  counter: c,
  branchName,
  n,
  money,
  onEdit,
  onToggle,
  onBin,
}: {
  counter: ShopCounter;
  branchName?: string;
  n: (v: number | string) => string;
  money: (v: number) => string;
  onEdit: () => void;
  onToggle: () => void;
  onBin: () => void;
}) {
  const t = useT();
  const off = c.isActive === false;
  const open = !!c.openShift;
  const band = off ? 'bg-muted-foreground/30' : open ? 'bg-emerald-500' : 'bg-border';
  const last = c.lastClosed;

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border bg-card transition-shadow hover:shadow-md ${
        open ? 'border-emerald-500/40' : 'border-border'
      } ${off ? 'opacity-70' : ''}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${band}`} aria-hidden="true" />

      <div className="flex flex-1 flex-col p-4 pt-5">
        <div className="flex items-start gap-3">
          <span
            className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
              off ? 'bg-muted text-muted-foreground' : open ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'
            }`}
          >
            <Monitor className="h-5 w-5" />
            {open && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold" title={c.name}>
              {c.name}
            </h3>
            <p className="line-clamp-1 text-[11.5px] text-muted-foreground">
              {branchName && (
                <span className="mr-1 inline-flex items-center gap-0.5 font-semibold text-foreground/80">
                  <MapPin className="h-3 w-3" /> {branchName}
                  {c.note ? ' ·' : ''}
                </span>
              )}
              {c.note || (branchName ? '' : ' ')}
            </p>
          </div>
          <span className={`pill shrink-0 ${off ? 'danger' : open ? 'success' : 'neutral'}`}>
            {off ? t('Turned off') : open ? t('Open') : t('Idle')}
          </span>
        </div>

        {/* Who is on it now, or how it last closed. One block tall either way. */}
        <div className="mt-3 min-h-[4.25rem] rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          {open ? (
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                {initials(c.openShift!.userName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.openShift!.userName}</p>
                <p className="text-[11px] text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {t('Open for')} {n(since(c.openShift!.openedAt))} · {t('should hold')}{' '}
                  <strong className="font-semibold text-foreground">{money(c.openShift!.expectedCash)}</strong>
                </p>
              </div>
            </div>
          ) : last ? (
            <div className="text-[11.5px]">
              <p className="text-muted-foreground">
                {t('Last closed by')} <span className="font-semibold text-foreground">{last.userName}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                {n(when(last.closedAt))} · {money(last.salesTotal)}
                <span
                  className={`pill !py-0 text-[10.5px] tabular-nums ${
                    last.difference < 0 ? 'danger' : last.difference > 0 ? 'pending' : 'success'
                  }`}
                >
                  {last.difference < 0
                    ? `${money(-last.difference)} ${t('short')}`
                    : last.difference > 0
                      ? `${money(last.difference)} ${t('over')}`
                      : t('counted right')}
                </span>
              </p>
            </div>
          ) : (
            <p className="flex h-full items-center text-[11.5px] text-muted-foreground">
              {off ? t('Not in use — turn it on to open a day here.') : t('Nobody on it yet today.')}
            </p>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/40 px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Bills')}</dt>
            <dd className="text-sm font-semibold tabular-nums">{n(c.today?.bills ?? 0)}</dd>
          </div>
          <div className="rounded-lg bg-muted/40 px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Taken')}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums">{money(c.today?.total ?? 0)}</dd>
          </div>
          <div className="rounded-lg bg-muted/40 px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Float')}</dt>
            <dd className="truncate text-sm font-semibold tabular-nums">{money(c.openingFloat ?? 0)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-3 border-t border-border text-xs font-semibold">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center justify-center gap-1.5 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" /> {t('Edit')}
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={open}
          title={open ? t('Close the day on it first') : undefined}
          className="flex items-center justify-center gap-1.5 border-x border-border py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Power className="h-3.5 w-3.5" /> {off ? t('Turn on') : t('Turn off')}
        </button>
        <button
          type="button"
          onClick={onBin}
          className="flex items-center justify-center gap-1.5 py-2.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t('Delete')}
        </button>
      </div>
    </div>
  );
}

function CounterForm({
  counter,
  branches,
  onClose,
  onSaved,
}: {
  counter: ShopCounter | null;
  branches: BranchSwitcherInfo['branches'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { stop } = useNumerals();
  const { toast } = useToast();
  const [name, setName] = useState(counter?.name ?? '');
  const [note, setNote] = useState(counter?.note ?? '');
  const [float, setFloat] = useState(String(counter?.openingFloat ?? ''));
  const working = useBranchStore((st) => st.branch);
  /* Its own branch; a new one goes in the branch being worked in, or the first. */
  const [branchId, setBranchId] = useState(
    counter?.branch ?? (branches.some((b) => b._id === working) ? working : (branches[0]?._id ?? '')),
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        note: note.trim(),
        openingFloat: Number(float) || 0,
        ...(branches.length > 1 && branchId ? { branchId } : {}),
      };
      if (counter) await shopApi.updateCounter(counter._id, payload);
      else await shopApi.createCounter(payload);
      toast(counter ? t('Saved.') : `${payload.name} ${t('added')}${stop}`);
      onSaved();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that counter.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">
              {counter ? t('This counter') : t('Add a counter')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('Call it what the shop calls it out loud.')}
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-muted-foreground"
              htmlFor="c-name"
            >
              {t('Name')}
            </label>
            <input
              id="c-name"
              className="input h-10"
              placeholder={t('Counter 1')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-muted-foreground"
              htmlFor="c-note"
            >
              {t('Note')}
            </label>
            <input
              id="c-note"
              className="input h-10"
              placeholder={t('By the door · upstairs · the old one')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-muted-foreground"
              htmlFor="c-float"
            >
              {t('Cash it usually starts with')}
            </label>
            <input
              id="c-float"
              className="input h-10 tabular-nums"
              inputMode="decimal"
              placeholder="500"
              value={float}
              onChange={(e) => setFloat(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('Filled in for whoever opens the day, so nobody types it every morning.')}
            </p>
          </div>
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="c-branch">
                {t('Branch')}
              </label>
              <select id="c-branch" className="input h-10" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('It sells that branch’s stock, and its takings are that branch’s.')}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
          </button>
        </div>
    </Modal>
  );
}
