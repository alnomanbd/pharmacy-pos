import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Building2,
  CheckCircle2,
  Ban,
  Clock,
  Users as UsersIcon,
  ReceiptText,
  Package,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Trash2,
  Plus,
  Pencil,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { platformApi, downloadBlob } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import NewAccountDialog from '../components/NewAccountDialog';
import type { OrgStatus, PlatformStats } from '@dawai/shared/types';
import type { Shop, ShopPlan } from '../api';
import { lastSeen } from '../lib/lastSeen';

/**
 * Every shop on the deployment, and what may be done about each one.
 *
 * The counts carry the weight here: a row reading "signed up in March, two
 * users, zero bills" is a shop that never started, and that is the single
 * most useful thing this page can say. Status and plan are the two things an
 * operator changes, so both are one click from the row.
 */

const PAGE_SIZE = 25;

const STATUS_META: Record<OrgStatus, { label: string; cls: string }> = {
  pending: { label: 'Awaiting approval', cls: 'waiting' },
  active: { label: 'Active', cls: 'completed' },
  suspended: { label: 'Suspended', cls: 'noShow' },
};

const dateOf = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

/** "in 9 days" / "3 days ago" — a trial date is only ever read as a distance. */
function relativeDays(value?: string | null) {
  if (!value) return null;
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86400000);
  if (days === 0) return 'today';
  return days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`;
}

export default function Shops() {
  const [opening, setOpening] = useState(false);
  const { toast } = useToast();
  const [rows, setRows] = useState<Shop[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OrgStatus | ''>('');
  const [plan, setPlan] = useState('');
  const [catalogue, setCatalogue] = useState<ShopPlan[]>([]);
  const [busyId, setBusyId] = useState('');
  const [suspendTarget, setSuspendTarget] = useState<Shop | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformApi.organizations({
        q: q.trim() || undefined,
        status: status || undefined,
        plan: plan || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.data);
      setTotal(res.total);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load the account list.', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, plan, page, toast]);

  /*
   * The plan catalogue, once.
   *
   * Both selects on this page are built from it: the filter across the top and
   * the one on every row. Retired plans are kept — a shop can still be *on*
   * one, and a select that cannot show a shop's current plan is worse than
   * one offering a plan nobody should pick.
   */
  useEffect(() => {
    platformApi
      .plans()
      .then((list) => setCatalogue(list ?? []))
      .catch(() => setCatalogue([]));
  }, []);

  /**
   * The options for one shop's row: the catalogue, plus whatever it is on now
   * if that is not among them — a select whose value matches no option renders
   * blank, and the operator cannot tell what the shop is on.
   */
  const optionsFor = (org: Shop) => {
    const options = catalogue.map((p) => ({
      key: p.key,
      label: `${p.name} · ${p.currency || 'BDT'} ${p.price}`,
    }));
    if (org.plan && !options.some((o) => o.key === org.plan)) {
      options.unshift({ key: org.plan, label: `${org.plan} (not in the catalogue)` });
    }
    return options;
  };

  const loadStats = useCallback(
    () => platformApi.stats().then(setStats).catch(() => undefined),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
  }, [q, status, plan]);

  const update = async (
    org: Shop,
    payload: Parameters<typeof platformApi.updateOrganization>[1],
    message: string,
  ) => {
    setBusyId(org._id);
    try {
      await platformApi.updateOrganization(org._id, payload);
      toast(message);
      await Promise.all([load(), loadStats()]);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not update that account.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const exportOne = async (org: Shop) => {
    setBusyId(org._id);
    try {
      const blob = await platformApi.exportOrganization(org._id);
      const slug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadBlob(blob, `${slug}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not export that account.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    try {
      const res = await platformApi.deleteOrganization(deleteTarget._id, deleteConfirm.trim());
      toast(`${res.name} deleted permanently.`);
      setDeleteTarget(null);
      setDeleteConfirm('');
      await Promise.all([load(), loadStats()]);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not delete that account.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>Shops</h1>
          <p className="text-sm text-muted-foreground">
            Every pharmacy on Dawai, and what it is doing.
          </p>
        </div>

        {/* The call this product is actually sold on: "bhai, open an account
            for me". */}
        <button type="button" className="btn ml-auto" onClick={() => setOpening(true)}>
          <Plus className="h-4 w-4" /> New shop
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Shops', value: stats.total, icon: Building2 },
            { label: 'Awaiting approval', value: stats.pending, icon: Clock },
            { label: 'Active', value: stats.byStatus.active ?? 0, icon: CheckCircle2 },
            { label: 'Signed up this week', value: stats.signupsThisWeek, icon: UsersIcon },
          ].map((s) => (
            <button
              key={s.label}
              className={`card text-left transition-colors ${
                s.label === 'Awaiting approval' && s.value > 0 ? 'border-primary' : ''
              }`}
              onClick={() => {
                if (s.label === 'Awaiting approval') setStatus(status === 'pending' ? '' : 'pending');
                if (s.label === 'Active') setStatus(status === 'active' ? '' : 'active');
              }}
            >
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold">{s.value}</span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder="Search by name, email or phone..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* The three filters carry names: they had none, so anything looking
              for one — a test, a screen reader — had to count boxes. */}
          <select
            className="input w-auto"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrgStatus | '')}
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_META) as OrgStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <select
            className="input w-auto"
            aria-label="Filter by plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="">All plans</option>
            {catalogue.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3">{total.toLocaleString()} shop{total === 1 ? '' : 's'}</h3>
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">Nothing matches these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Usage</th>
                  <th>Signed up</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o._id}>
                    <td>
                      <Link
                        className="font-semibold hover:underline"
                        to={`/shops/${o._id}`}
                      >
                        {o.name}
                      </Link>
                      {o.suspendedReason && (
                        <span className="block max-w-xs truncate text-xs text-destructive">
                          {o.suspendedReason}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">
                      {o.owner ? (
                        <>
                          <span className="block">{o.owner.name}</span>
                          <span className="block text-xs text-muted-foreground">{o.owner.email}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${STATUS_META[o.status].cls}`}>
                        {STATUS_META[o.status].label}
                      </span>
                      {/* A many-counter shop waiting is a bigger sale, and a different phone call. */}
                      {o.status === 'pending' && (o.signup?.counters ?? 0) > 1 && (
                        <span className="mt-0.5 block whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
                          {o.signup!.counters} counters
                        </span>
                      )}
                    </td>
                    <td className="text-sm">
                      <select
                        className="input"
                        style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                        value={o.plan}
                        disabled={busyId === o._id}
                        onChange={(e) =>
                          void update(o, { plan: e.target.value }, `${o.name} moved to ${e.target.value}.`)
                        }
                      >
                        {optionsFor(o).map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {/* The date it is trialled or paid up to; past it the shop is read-only. */}
                      {o.trialEndsAt && (
                        <span
                          className={`mt-0.5 block text-[11px] ${
                            new Date(o.trialEndsAt) < new Date()
                              ? 'font-semibold text-destructive'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {new Date(o.trialEndsAt) < new Date() ? 'lapsed ' : o.plan === 'trial' ? 'trial ends ' : 'paid until '}
                          {relativeDays(o.trialEndsAt)}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon className="h-3 w-3 text-muted-foreground" />
                        {o.counts?.users ?? 0}
                      </span>
                      <span className="ml-2 inline-flex items-center gap-1" title="Bills">
                        <ReceiptText className="h-3 w-3 text-muted-foreground" />
                        {o.counts?.bills ?? 0}
                      </span>
                      <span className="ml-2 inline-flex items-center gap-1" title="Products">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        {o.counts?.products ?? 0}
                      </span>
                      {/* Zero bills long after approval: a shop that never started. */}
                      {(o.counts?.bills ?? 0) === 0 && o.status === 'active' && (
                        <span className="ml-2 text-[11px] font-semibold text-orange-600">
                          never started
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {dateOf(o.createdAt)}
                      {o.lastActivityAt && (
                        <span className="block text-[11px]">
                          last seen {lastSeen(o.lastActivityAt)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {/* Details, suspend and delete all live on the shop's own page. */}
                        <Link
                          to={`/shops/${o._id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                          aria-label={`Edit ${o.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                        {o.status === 'pending' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                            disabled={busyId === o._id}
                            onClick={() =>
                              void update(o, { status: 'active' }, `${o.name} approved — 14-day trial started.`)
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </button>
                        )}
                        {o.status === 'active' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            disabled={busyId === o._id}
                            onClick={() => {
                              setSuspendTarget(o);
                              setSuspendReason('');
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" /> Suspend
                          </button>
                        )}
                        {o.status === 'suspended' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                            disabled={busyId === o._id}
                            onClick={() => void update(o, { status: 'active' }, `${o.name} reactivated.`)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
                          </button>
                        )}
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          disabled={busyId === o._id}
                          title="Download this account's data"
                          onClick={() => void exportOne(o)}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {/* Only for a shop already suspended: deletion is permanent
                            and destroys its books, so it is never one click away. */}
                        {o.status === 'suspended' && (
                          <button
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            disabled={busyId === o._id}
                            title="Delete permanently"
                            onClick={() => {
                              setDeleteTarget(o);
                              setDeleteConfirm('');
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {o.status === 'active' && (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                            disabled={busyId === o._id}
                            title="Give this shop 14 more days"
                            onClick={() => void update(o, { trialDays: 14 }, `${o.name} extended by 14 days.`)}
                          >
                            <Clock className="h-3.5 w-3.5" /> +14d
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <div className="flex gap-1">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Suspension asks for a reason, because the shop is shown it at the
          login screen — an unexplained lockout is a support call. */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSuspendTarget(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-popover p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">Suspend {suspendTarget.name}?</h3>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                onClick={() => setSuspendTarget(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Everyone on this account will be signed out and refused at login. They will be shown the
              reason you give here.
            </p>
            <input
              className="input"
              placeholder="e.g. Payment overdue since 12 August"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
                onClick={() => setSuspendTarget(null)}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
                disabled={!suspendReason.trim()}
                onClick={() => {
                  const target = suspendTarget;
                  setSuspendTarget(null);
                  void update(
                    target,
                    { status: 'suspended', suspendedReason: suspendReason.trim() },
                    `${target.name} suspended.`,
                  );
                }}
              >
                <Ban className="h-4 w-4" /> Suspend
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Typing the name back is the guard. There is no undo, and what is
          destroyed is a shop's stock, bills and khata. */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-popover p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-destructive">
              Delete {deleteTarget.name} permanently?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes {(deleteTarget.counts?.bills ?? 0).toLocaleString()} bills,{' '}
              {(deleteTarget.counts?.products ?? 0).toLocaleString()} products, the stock, the khata,
              the suppliers and every uploaded file. It cannot be undone.
            </p>
            <p className="mt-2 text-sm">
              Take an export first — the download button on their row.
            </p>
            <label className="label mt-3">
              Type <strong className="text-foreground">{deleteTarget.name}</strong> to confirm
              <input
                className="input mt-1"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoFocus
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
                disabled={deleteConfirm.trim() !== deleteTarget.name || busyId === deleteTarget._id}
                onClick={() => void remove()}
              >
                <Trash2 className="h-4 w-4" /> Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The phone call this product is actually sold on. */}
      <NewAccountDialog
        open={opening}
        onClose={() => setOpening(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
