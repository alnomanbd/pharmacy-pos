import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutGrid,
  Plus,
  Loader2,
  Snowflake,
  Boxes,
  Tags,
  Search,
  Pill,
  Building2,
  Hand,
  Pencil,
  Trash2,
  ClipboardCheck,
  PackageOpen,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { shopApi, type ShopRack, type RackRule } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import Modal from '../components/Modal';
import ConfirmWithReason from '../components/ConfirmWithReason';
import Pager from '../components/Pager';

/**
 * The shelves.
 *
 * No two pharmacies rack their stock the same way. Some sort by what the
 * medicine is — a shelf of syrups, a shelf of ointments, tablets in the drawers
 * behind. Some sort by company, because that is how the SR's order sheet is
 * arranged and how the delivery arrives. Some do neither and simply know that
 * Napa lives on R2.
 *
 * All three are correct, so a shelf here carries an optional rule and the rule
 * is only ever a suggestion: when an item is added the matching shelf is
 * offered, and whoever is holding the box decides. What has to be true is the
 * label at the counter — "R3-B" saves a minute per sale when somebody new is
 * serving.
 *
 * Every card is the same shape and the same height — name, rule, what it
 * matches, how full it is, and the four things you do with a shelf — so a wall
 * of them reads as a wall of shelves rather than a pile of notes.
 */

const RULE_LABEL: Record<RackRule, string> = {
  form: 'By type',
  company: 'By company',
  manual: 'Whatever you put there',
};

const RULE_HINT: Record<RackRule, string> = {
  form: 'Syrup, ointment, tablet, drops…',
  company: 'Square, Incepta, Beximco…',
  manual: 'No rule — you decide, item by item',
};

const RULE_ICON: Record<RackRule, typeof Pill> = {
  form: Pill,
  company: Building2,
  manual: Hand,
};

/* One hue per rule, so the wall can be read by colour before by word. */
const RULE_TONE: Record<RackRule, { bubble: string; band: string }> = {
  form: { bubble: 'bg-primary/10 text-primary', band: 'bg-primary' },
  company: { bubble: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', band: 'bg-violet-500' },
  manual: { bubble: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', band: 'bg-amber-500' },
};
const COLD_TONE = { bubble: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', band: 'bg-sky-500' };

type Filter = 'all' | RackRule | 'cold' | 'empty';

/** Cards per page: four rows of three on a laptop. */
const PAGE_SIZE = 12;
/** Match words shown on a card before the rest fold into "+n". */
const MATCH_SHOWN = 4;

export default function Racks() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<ShopRack[]>([]);
  const [loading, setLoading] = useState(true);
  /* The form, empty for a new shelf or holding the one being changed. */
  const [editing, setEditing] = useState<ShopRack | 'new' | null>(null);
  const [binning, setBinning] = useState<ShopRack | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const n = useCallback((v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);

  const load = useCallback(async () => {
    try {
      setRows(await shopApi.racks());
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load the shelves.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      racks: rows.length,
      placed: rows.reduce((sum, r) => sum + r.items, 0),
      empty: rows.filter((r) => r.items === 0).length,
      cold: rows.filter((r) => r.isCold).length,
    }),
    [rows],
  );
  /* The fullest shelf sets the scale for every bar, so they compare. */
  const most = Math.max(1, ...rows.map((r) => r.items));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'cold' && !r.isCold) return false;
      if (filter === 'empty' && r.items > 0) return false;
      if ((filter === 'form' || filter === 'company' || filter === 'manual') && r.rule !== filter)
        return false;
      if (!needle) return true;
      return [r.name, r.note, ...r.match].some((s) => s?.toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'form', label: 'By type', count: rows.filter((r) => r.rule === 'form').length },
    { key: 'company', label: 'By company', count: rows.filter((r) => r.rule === 'company').length },
    { key: 'manual', label: 'No rule', count: rows.filter((r) => r.rule === 'manual').length },
    { key: 'cold', label: 'Fridge', count: stats.cold },
    { key: 'empty', label: 'Empty', count: stats.empty },
  ];

  const bin = async (rack: ShopRack, reason: string) => {
    setBusy(true);
    try {
      await shopApi.binIt('rack', rack._id, reason);
      toast(`${rack.name} ${t('moved to the Recycle Bin')}.`);
      setBinning(null);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not delete that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" /> {t('Racks')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Where things are kept — and the rule you keep them by.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The shelf on the screen and the label on the shelf are the same
              job, so the way to the second one is on the first. */}
          <Link to="/labels" className="btn btn-ghost h-9">
            <Tags className="h-4 w-4" /> {t('Shelf labels')}
          </Link>
          <button type="button" className="btn h-9" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('Add a rack')}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty py-10">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <LayoutGrid className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('No shelves set up yet.')}</p>
            <p className="max-w-lg">
              {t('Make one for each rack in the shop. If you keep syrups together, give that shelf the rule')}{' '}
              <strong>{t('By type')}</strong> {t('and list the types; if you rack by company, use')}{' '}
              <strong>{t('By company')}</strong>
              {t('. New items then land on the right shelf by themselves — and you can always move one.')}
            </p>
            <button type="button" className="btn mt-2 h-9" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> {t('Add the first rack')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---- four tiles, one shape ---- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={LayoutGrid} tone="bg-primary/10 text-primary" value={n(stats.racks)} label={t('Racks')} />
            <Stat icon={Boxes} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" value={n(stats.placed)} label={t('Items placed')} />
            <Stat icon={PackageOpen} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400" value={n(stats.empty)} label={t('Empty racks')} />
            <Stat icon={Snowflake} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" value={n(stats.cold)} label={t('Fridge')} />
          </div>

          {/* ---- find and filter ---- */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setPage(1);
                  }}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === f.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(f.label)}
                  <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {n(f.count)}
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
                placeholder={t('Rack name, type or company…')}
                aria-label={t('Search')}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="card mt-4">
              <div className="empty py-10">
                <PackageOpen className="h-6 w-6" />
                <p>{t('Nothing matches that.')}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((r) => (
                <RackCard
                  key={r._id}
                  rack={r}
                  most={most}
                  n={n}
                  onEdit={() => setEditing(r)}
                  onBin={() => setBinning(r)}
                />
              ))}
            </div>
          )}

          <Pager
          page={current}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPage={setPage}
          className="mt-4"
        />
        </>
      )}

      {editing && (
        <RackForm
          rack={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmWithReason
        open={binning !== null}
        title={t('Delete this rack')}
        message={
          binning
            ? binning.items > 0
              ? `${binning.name} — ${binning.items} items are on it. They keep the label "${binning.name}" until you move them. It goes to the Recycle Bin, and can be brought back.`
              : `${binning.name} goes to the Recycle Bin, and can be brought back.`
            : ''
        }
        confirmLabel={t('Delete')}
        placeholder={t('Why — e.g. the shelf was taken down')}
        busy={busy}
        onCancel={() => setBinning(null)}
        onConfirm={(reason) => void (binning && bin(binning, reason))}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: typeof Pill;
  tone: string;
  value: string;
  label: string;
}) {
  return (
    <div className="stat flex h-full min-h-[104px] items-center gap-3">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="value stat-fit [--fit-max:26px]">{value}</div>
        <div className="label line-clamp-2 leading-tight">{label}</div>
      </div>
    </div>
  );
}

/**
 * One shelf. Fixed parts in fixed places, and `auto-rows-fr` on the grid, so a
 * shelf with a long note is no taller than one with none — the note is clamped
 * and the footer is pinned to the bottom.
 */
function RackCard({
  rack: r,
  most,
  n,
  onEdit,
  onBin,
}: {
  rack: ShopRack;
  most: number;
  n: (v: number) => string;
  onEdit: () => void;
  onBin: () => void;
}) {
  const t = useT();
  const tone = r.isCold ? COLD_TONE : RULE_TONE[r.rule];
  const Icon = r.isCold ? Snowflake : RULE_ICON[r.rule];
  const extra = r.match.length - MATCH_SHOWN;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card transition-shadow hover:shadow-md">
      <span className={`absolute inset-x-0 top-0 h-1 ${tone.band}`} aria-hidden="true" />

      <div className="flex flex-1 flex-col p-4 pt-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.bubble}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold" title={r.name}>
              {r.name}
            </h3>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {t(RULE_LABEL[r.rule])}
              {r.isCold && ` · ${t('Fridge')}`}
            </p>
          </div>
          {/* Quiet until the card is hovered; always there on a touch screen. */}
          <div className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`${t('Edit')} ${r.name}`}
              title={t('Edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onBin}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`${t('Delete')} ${r.name}`}
              title={t('Delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* What the rule matches, or a word saying there is no rule. One line
            tall either way, so the cards stay level. */}
        <div className="mt-3 flex h-6 flex-nowrap items-center gap-1 overflow-hidden">
          {r.match.length > 0 ? (
            <>
              {r.match.slice(0, MATCH_SHOWN).map((m) => (
                <span
                  key={m}
                  className="shrink-0 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] capitalize"
                >
                  {m}
                </span>
              ))}
              {extra > 0 && (
                <span className="shrink-0 text-[11px] text-muted-foreground">+{n(extra)}</span>
              )}
            </>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">
              {t(r.rule === 'manual' ? 'You place items by hand' : 'Nothing to match yet')}
            </span>
          )}
        </div>

        <p className="mt-2 line-clamp-2 min-h-[2.5em] text-xs leading-snug text-muted-foreground">
          {r.note || ' '}
        </p>

        {/* How full, against the fullest shelf in the shop. */}
        <div className="mt-auto pt-3">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{t('Items on it')}</span>
            <strong className="tabular-nums">{n(r.items)}</strong>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${r.items ? tone.band : ''}`}
              style={{ width: `${(r.items / most) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-border text-xs font-semibold">
        <Link
          to={`/stock?rack=${r._id}`}
          className="flex items-center justify-center gap-1.5 py-2.5 text-primary transition-colors hover:bg-primary/5"
        >
          <Boxes className="h-3.5 w-3.5" /> {t('What is on it')}
        </Link>
        <Link
          to={`/count?rack=${r._id}`}
          className="flex items-center justify-center gap-1.5 border-l border-border py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ClipboardCheck className="h-3.5 w-3.5" /> {t('Count it')}
        </Link>
      </div>
    </div>
  );
}

/** Adding a shelf and changing one are the same form; `rack` says which. */
function RackForm({
  rack,
  onClose,
  onSaved,
}: {
  rack: ShopRack | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: rack?.name ?? '',
    rule: (rack?.rule ?? 'manual') as RackRule,
    match: rack?.match.join(', ') ?? '',
    note: rack?.note ?? '',
    isCold: rack?.isCold ?? false,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      rule: form.rule,
      match:
        form.rule === 'manual'
          ? []
          : form.match
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean),
      note: form.note.trim(),
      isCold: form.isCold,
    };
    try {
      if (rack) {
        await shopApi.updateRack(rack._id, payload);
        toast(`${payload.name} ${t('saved')}.`);
      } else {
        await shopApi.createRack(payload);
        toast(`${payload.name} added.`);
      }
      onSaved();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not save that shelf.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-lg">
      <div className="mb-4">
        <h3 className="mb-0 text-base">{t(rack ? 'Edit the rack' : 'Add a rack')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('Name it the way it is named in the shop.')}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="rk-name">
            {t('Rack name')}
          </label>
          <input
            id="rk-name"
            className="input h-10"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="R2 · Syrup shelf · Fridge"
            autoFocus
          />
          {rack && rack.items > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('A new name reaches every item already on it.')}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t('How do you decide what goes on it?')}
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['form', 'company', 'manual'] as const).map((r) => {
              const Icon = RULE_ICON[r];
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={form.rule === r}
                  onClick={() => setForm({ ...form, rule: r })}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors sm:flex-col sm:gap-1.5 ${
                    form.rule === r
                      ? 'border-primary bg-primary/5 font-semibold ring-2 ring-primary/15'
                      : 'border-border hover:bg-secondary'
                  }`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${RULE_TONE[r].bubble}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    {t(RULE_LABEL[r])}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {t(RULE_HINT[r])}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {form.rule !== 'manual' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="rk-match">
              {t(form.rule === 'form' ? 'Which types?' : 'Which companies?')}
            </label>
            <input
              id="rk-match"
              className="input h-10"
              value={form.match}
              onChange={(e) => setForm({ ...form, match: e.target.value })}
              placeholder={form.rule === 'form' ? 'syrup, suspension, drops' : 'square, incepta'}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('Separate with commas. New items matching any of them are offered this shelf.')}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="rk-note">
            {t('Note')} <span className="font-normal">({t('optional')})</span>
          </label>
          <input
            id="rk-note"
            className="input h-10"
            value={form.note}
            maxLength={240}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={t('Behind the counter, left side')}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-muted/50">
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${COLD_TONE.bubble}`}>
            <Snowflake className="h-4 w-4" />
          </span>
          <span className="flex-1">{t('This one is the fridge')}</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.isCold}
            onChange={(e) => setForm({ ...form, isCold: e.target.checked })}
          />
        </label>

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || !form.name.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
            {t(rack ? 'Save changes' : 'Add the rack')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
