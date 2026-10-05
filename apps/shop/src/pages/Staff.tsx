import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Loader2,
  KeyRound,
  CircleDot,
  Crown,
  Stethoscope,
  ShoppingCart,
  UserPlus,
  Radio,
  Banknote,
  ShieldCheck,
  Search,
  Info,
  Mail,
  Phone,
  LogIn,
  Pencil,
  Power,
} from 'lucide-react';
import { staffApi, rolesApi, taka, type StaffMember, type ShopRole } from '../api';
import ShopRoles from '../components/ShopRoles';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals, useNumerals } from '../i18n/ui';
import { fetchBranchSwitcher, type BranchSwitcherInfo } from '../branch';
import Modal from '../components/Modal';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * Who works here.
 *
 * A pharmacy hires and loses salesmen, and each one needs their own sign-in —
 * not for privacy but for money: every bill carries who made it, and the cash
 * is counted against a name at the end of the day. A shop where four people
 * share one login can still use this software; it simply cannot be told
 * anything it did not already know.
 *
 * Nobody is deleted, ever. A salesman who left still made three hundred of the
 * bills in the drawer, and removing the account would take his name off all of
 * them — which is the one thing this whole design exists to prevent. Switching
 * somebody off ends their sessions on the spot.
 */

const ROLE_LABEL: Record<StaffMember['role'], string> = {
  admin: 'Owner',
  pharmacist: 'Pharmacist',
  salesman: 'Salesman',
};

const ROLE_HINT: Record<StaffMember['role'], string> = {
  admin: 'Everything, including this page',
  pharmacist: 'Stock, purchases, prices and the counter',
  salesman: 'The counter only — no purchase price, no margin',
};

const ago = (iso: string | null | undefined, t: (s: string) => string) => {
  if (!iso) return t('never');
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('just now');
  if (mins < 60) return `${mins} ${t('min ago')}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${t('hours ago')}`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/* An icon and a hue per role, the same on the card, the filter and the form. */
const ROLE_LOOK: Record<StaffMember['role'], { icon: typeof Users; tone: string }> = {
  admin: { icon: Crown, tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  pharmacist: { icon: Stethoscope, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  salesman: { icon: ShoppingCart, tone: 'bg-primary/10 text-primary' },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => !/^(md|dr|mr|mrs|ms)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—';

type Show = 'all' | StaffMember['role'] | 'off';

export default function Staff() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [pwFor, setPwFor] = useState<StaffMember | null>(null);
  const [busyId, setBusyId] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [q, setQ] = useState('');
  /* People, or the roles they are given. */
  const [view, setView] = useState<'people' | 'roles'>('people');
  const [roles, setRoles] = useState<ShopRole[]>([]);
  const loadRoles = useCallback(() => {
    rolesApi
      .list()
      .then((r) => setRoles(r.roles))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const n = useCallback((v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)), [lang]);
  const money = useCallback((v: number) => n(taka(v)), [n]);

  const load = useCallback(async () => {
    try {
      setRows(await staffApi.list());
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the staff list.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (m: StaffMember) => {
    if (
      m.isActive &&
      !(await confirmAction({
        title: t('Switch this person off?'),
        message: `${m.name} ${t('can no longer sign in, on any device, until you switch them on again.')}`,
        confirmLabel: t('Switch off'),
        tone: 'danger',
        icon: 'warning',
      }))
    )
      return;
    setBusyId(m._id);
    try {
      await staffApi.update(m._id, { isActive: !m.isActive });
      toast(`${m.name} ${m.isActive ? t('can no longer sign in.') : t('can sign in again.')}`);
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not change that.'), 'error');
    } finally {
      setBusyId('');
    }
  };

  const atCounter = rows.filter((r) => r.openShift);
  const active = rows.filter((r) => r.isActive).length;
  const soldToday = rows.reduce((sum, r) => sum + r.today.total, 0);
  const off = rows.length - active;
  const mostMonth = Math.max(1, ...rows.map((r) => r.month?.total ?? 0));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (show === 'off' ? r.isActive : show !== 'all' && (r.role !== show || !r.isActive)) return false;
      if (!needle) return true;
      return [r.name, r.email, r.phone].filter(Boolean).some((s) => String(s).toLowerCase().includes(needle));
    });
  }, [rows, show, q]);

  const TABS: { key: Show; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'admin', label: 'Owner', count: rows.filter((r) => r.role === 'admin' && r.isActive).length },
    { key: 'pharmacist', label: 'Pharmacist', count: rows.filter((r) => r.role === 'pharmacist' && r.isActive).length },
    { key: 'salesman', label: 'Salesman', count: rows.filter((r) => r.role === 'salesman' && r.isActive).length },
    { key: 'off', label: 'Switched off', count: off },
  ];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {t('Staff')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Who works here — each with their own sign-in, so every bill carries a name.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-muted p-1" role="tablist">
            {(
              [
                ['people', 'People', Users],
                ['roles', 'Roles', ShieldCheck],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                onClick={() => setView(k)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${view === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {t(label)}
              </button>
            ))}
          </div>
          {view === 'people' && (
            <button type="button" className="btn h-9" onClick={() => setAdding(true)}>
              <UserPlus className="h-4 w-4" /> {t('Add someone')}
            </button>
          )}
        </div>
      </div>

      {view === 'roles' ? (
        <ShopRoles
          onChanged={() => {
            loadRoles();
            void load();
          }}
        />
      ) : loading ? (
        <LoadingBlock />
      ) : (
        <>
          {/* ---- four tiles, one shape ---- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Users} tone="bg-primary/10 text-primary" label={t('People')} value={n(active)}>
              {t('can sign in')}
              {off > 0 ? ` · ${n(off)} ${t('switched off')}` : ''}
            </Tile>
            <Tile icon={Radio} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" label={t('At a counter now')} value={n(atCounter.length)}>
              {atCounter.length
                ? atCounter.map((r) => r.openShift?.terminal || t('a counter')).join(', ')
                : t('nobody on a counter')}
            </Tile>
            <Tile icon={Banknote} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400" label={t('Sold today')} value={money(soldToday)}>
              {n(rows.reduce((sum, r) => sum + r.today.count, 0))} {t('bills')}
            </Tile>
            <Tile icon={ShieldCheck} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400" label={t('Signed in today')} value={n(rows.filter((r) => r.lastLoginAt && Date.now() - new Date(r.lastLoginAt).getTime() < 86_400_000).length)}>
              {t('in the last 24 hours')}
            </Tile>
          </div>

          {/* ---- find and filter ---- */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist">
              {TABS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="tab"
                  aria-selected={show === x.key}
                  onClick={() => setShow(x.key)}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    show === x.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(x.label)}
                  <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {n(x.count)}
                  </span>
                </button>
              ))}
            </div>
            <label className="relative block w-full sm:ml-auto sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input h-9 pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Name, email or phone…')}
                aria-label={t('Search')}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="card mt-4">
              <div className="empty py-10">
                <Users className="h-6 w-6" />
                <p>{t('Nothing matches that.')}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((m) => (
                <StaffCard
                  key={m._id}
                  member={m}
                  n={n}
                  money={money}
                  mostMonth={mostMonth}
                  busy={busyId === m._id}
                  onEdit={() => setEditing(m)}
                  onPassword={() => setPwFor(m)}
                  onToggle={() => void toggle(m)}
                />
              ))}
            </div>
          )}

          <p className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t(
              'Nobody is deleted. Somebody who leaves is switched off — their bills keep their name on them, which is the point of them having an account at all.',
            )}
          </p>
        </>
      )}

      {adding && (
        <AddStaff
          roles={roles}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
      {editing && (
        <EditStaff
          member={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {pwFor && <SetPassword member={pwFor} onClose={() => setPwFor(null)} />}
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
  icon: typeof Users;
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

/**
 * One person. The same parts in the same places whoever they are, and
 * `auto-rows-fr` on the grid, so the owner's card is no taller than a new
 * salesman's.
 */
function StaffCard({
  member: m,
  n,
  money,
  mostMonth,
  busy,
  onEdit,
  onPassword,
  onToggle,
}: {
  member: StaffMember;
  n: (v: number | string) => string;
  money: (v: number) => string;
  mostMonth: number;
  busy: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const look = ROLE_LOOK[m.role];
  const owner = m.role === 'admin';
  const month = m.month ?? { total: 0, count: 0 };

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[var(--radius)] border bg-card transition-shadow hover:shadow-md ${
        m.openShift ? 'border-emerald-500/40' : 'border-border'
      } ${m.isActive ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold ${look.tone}`}>
            {initials(m.name)}
            {m.openShift && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold" title={m.name}>
              {m.name}
            </h3>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${look.tone}`}>
                <look.icon className="h-3 w-3" /> {t(m.roleName || ROLE_LABEL[m.role])}
              </span>
              {!m.isActive && <span className="pill danger !py-0 text-[10.5px]">{t('Switched off')}</span>}
            </span>
          </div>
        </div>

        <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">{m.roleId && !['owner', 'pharmacist', 'salesman'].includes(m.roleId) ? t('A role of this shop’s own') : t(ROLE_HINT[m.role])}</p>

        <div className="mt-3 space-y-1 text-[11.5px] text-muted-foreground">
          <p className="flex items-center gap-1.5 truncate">
            <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{m.email}</span>
          </p>
          <p className="flex items-center gap-1.5 tabular-nums">
            <Phone className="h-3.5 w-3.5 shrink-0" /> {m.phone || '—'}
          </p>
          <p className="flex items-center gap-1.5">
            {m.openShift ? (
              <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <CircleDot className="h-3.5 w-3.5" /> {t('Working at')} {m.openShift.terminal || t('a counter')}
              </span>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5 shrink-0" /> {t('Signed in')} {n(ago(m.lastLoginAt, t))}
              </>
            )}
          </p>
        </div>

        <div className="mt-auto pt-3">
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Today')}</dt>
              <dd className="truncate text-sm font-semibold tabular-nums">{money(m.today.total)}</dd>
              <dd className="text-[10.5px] text-muted-foreground">
                {n(m.today.count)} {t('bills')}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/40 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Last 30 days')}</dt>
              <dd className="truncate text-sm font-semibold tabular-nums">{money(month.total)}</dd>
              <dd className="text-[10.5px] text-muted-foreground">
                {n(month.count)} {t('bills')}
              </dd>
            </div>
          </dl>
          {/* Against whoever sold most this month, so the cards compare. */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="motion-grow-x h-full rounded-full bg-primary" style={{ width: `${(month.total / mostMonth) * 100}%` }} />
          </div>
        </div>
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
          onClick={onPassword}
          title={t('Set a new password and read it out')}
          className="flex items-center justify-center gap-1.5 border-x border-border py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <KeyRound className="h-3.5 w-3.5" /> {t('Password')}
        </button>
        {owner ? (
          <span className="flex items-center justify-center gap-1.5 py-2.5 text-muted-foreground/60" title={t('The owner is never switched off')}>
            <Crown className="h-3.5 w-3.5" /> {t('Owner')}
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onToggle}
            className={`flex items-center justify-center gap-1.5 py-2.5 transition-colors disabled:opacity-50 ${
              m.isActive
                ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                : 'text-primary hover:bg-primary/5'
            }`}
          >
            <Power className="h-3.5 w-3.5" /> {m.isActive ? t('Switch off') : t('Switch on')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Correcting who somebody is: their name, their number, what they may do.
 *
 * Not their email — it is their sign-in name, and changing it under them is
 * locking them out. The owner's own role is not offered, because the server
 * refuses it anyway and a control that always fails is worse than none.
 */
function EditStaff({
  member,
  roles,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  roles: ShopRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { stop } = useNumerals();
  const { toast } = useToast();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [role, setRole] = useState(member.roleId ?? member.role);
  const [busy, setBusy] = useState(false);
  /* Which branches they work in — asked only of a shop with more than one. None ticked: all. */
  const [branches, setBranches] = useState<BranchSwitcherInfo['branches']>([]);
  const [worksIn, setWorksIn] = useState<string[]>(member.branches ?? []);
  useEffect(() => {
    fetchBranchSwitcher()
      .then((d) => setBranches(d.count > 1 ? d.branches : []))
      .catch(() => undefined);
  }, []);
  const askBranches = branches.length > 1 && member.role !== 'admin';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await staffApi.update(member._id, {
        name: name.trim(),
        phone: phone.trim(),
        ...(member.role !== 'admin' && role !== (member.roleId ?? member.role) ? { roleId: role } : {}),
        ...(askBranches ? { branchIds: worksIn.filter((id) => branches.some((b) => b._id === id)) } : {}),
      });
      toast(`${name.trim()} ${t('saved')}${stop}`);
      onSaved();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-lg">
      <div className="mb-4">
        <h3 className="mb-0 text-base">{t('Edit')} — {member.name}</h3>
        <p className="text-xs text-muted-foreground">
          {t('Signs in as')} <span className="font-mono">{member.email}</span>
        </p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-3">
        {member.role !== 'admin' && (
          <div>
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('What can they do?')}</span>
            <RolePicker roles={roles} value={role} onChange={setRole} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('Name')}</span>
            <input className="input h-10" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('Phone')}</span>
            <input className="input h-10" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        {askBranches && (
          <fieldset>
            <legend className="mb-1 block text-xs font-semibold text-muted-foreground">{t('Works in')}</legend>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => {
                const on = worksIn.includes(b._id);
                return (
                  <label
                    key={b._id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setWorksIn(on ? worksIn.filter((x) => x !== b._id) : [...worksIn, b._id])}
                    />
                    {b.name}
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {worksIn.length === 0 ? t('None ticked: every branch.') : t('They see and sell only in the branches ticked.')}
            </p>
          </fieldset>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || name.trim().length < 2}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save changes')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The roles a person can be given — the two built in and the shop's own — as cards rather than a dropdown. */
function RolePicker({ roles, value, onChange }: { roles: ShopRole[]; value: string; onChange: (r: string) => void }) {
  const t = useT();
  const options = roles.length
    ? roles.filter((r) => r.id !== 'owner')
    : (['salesman', 'pharmacist'] as const).map((k) => ({ id: k, name: ROLE_LABEL[k], description: ROLE_HINT[k], builtIn: true }) as ShopRole);
  return (
    <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
      {options.map((r) => {
        const look = r.id === 'pharmacist' || r.id === 'salesman' ? ROLE_LOOK[r.id] : { icon: ShieldCheck, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' };
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={value === r.id}
            onClick={() => onChange(r.id)}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
              value === r.id ? 'border-primary bg-primary/5 font-semibold ring-2 ring-primary/15' : 'border-border hover:bg-secondary'
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${look.tone}`}>
              <look.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              {t(r.name)}
              <span className="block line-clamp-2 text-[11px] font-normal text-muted-foreground">
                {r.id === 'pharmacist' || r.id === 'salesman' ? t(ROLE_HINT[r.id]) : r.description || `${r.permissions.length} ${t('permissions')}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AddStaff({ roles, onClose, onAdded }: { roles: ShopRole[]; onClose: () => void; onAdded: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'salesman',
    password: '',
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await staffApi.create({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        roleId: form.role,
        password: form.password,
      });
      toast(`${form.name.trim()} ${t('can sign in now. Tell them the password.')}`);
      onAdded();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not create that account.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 text-base">{t('Add someone')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('They sign in on their own machine, and every bill they make carries their name.')}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t('What can they do?')}
            </label>
            <RolePicker roles={roles} value={form.role} onChange={(role) => setForm({ ...form, role })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="st-name">
                {t('Name')}
              </label>
              <input
                id="st-name"
                className="input h-10"
                value={form.name}
                onChange={set('name')}
                required
                placeholder={t('Rakib Hasan')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="st-phone">
                {t('Phone')}
              </label>
              <input
                id="st-phone"
                className="input h-10"
                value={form.phone}
                onChange={set('phone')}
                required
                placeholder="01XXXXXXXXX"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="st-email">
                {t('Email — this is their sign-in name')}
              </label>
              <input
                id="st-email"
                type="email"
                className="input h-10"
                value={form.email}
                onChange={set('email')}
                required
                placeholder="rakib@yourshop.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="st-pw">
                {t('Password')}
              </label>
              <input
                id="st-pw"
                className="input h-10"
                value={form.password}
                onChange={set('password')}
                required
                minLength={8}
                placeholder={t('At least 8 characters')}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('Read it out to them — they can change it once they are in.')}
              </p>
            </div>
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Create the account')}
            </button>
          </div>
        </form>
    </Modal>
  );
}

/** Forgotten passwords are a counter conversation, not an email. */
function SetPassword({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await staffApi.setPassword(member._id, password);
      toast(`${member.name}${t("'s password is set. Tell them what it is.")}`);
      onClose();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not set that password.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
        <h3 className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> {t('New password for')} {member.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('Every machine they are signed in on is signed out when you do this.')}
        </p>
        <input
          className="input mt-3 h-11"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          placeholder={t('At least 8 characters')}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || password.length < 8}
            onClick={() => void save()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Set it')}
          </button>
        </div>
    </Modal>
  );
}
