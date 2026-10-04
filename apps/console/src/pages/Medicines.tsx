import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Pill,
  CheckCircle2,
  Factory,
  FlaskConical,
  Layers,
  Inbox,
  Power,
  Download,
  Upload,
  Loader2,
} from 'lucide-react';
import {
  platformApi,
  downloadBlob,
  type CatalogueMedicine,
  type CatalogueRef,
  type CatalogueStats,
  type MedicineInput,
  type RefKind,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import ConfirmDialog from '@dawai/shared/components/ConfirmDialog';
import MedicineForm from '../components/MedicineForm';
import MedicineImportDialog from '../components/MedicineImportDialog';
import RefPicker from '../components/RefPicker';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import {
  BTN_ICON,
  BTN_OUTLINE,
  BTN_SECONDARY,
  can,
  errorMessage,
  useAccess,
  useDebounced,
} from '../lib/ui';

/**
 * The shared medicine catalogue every shop picks its stock from.
 *
 * A wrong row here is wrong in every shop at once, so writes sit behind
 * `catalogue.manage`; a member with only `catalogue.view` gets the same pages
 * with the buttons taken away.
 */

const PAGE_SIZE = 25;
const REF_PAGE_SIZE = 50;

const TABS: { key: 'medicines' | RefKind; label: string }[] = [
  { key: 'medicines', label: 'Medicines' },
  { key: 'companies', label: 'Companies' },
  { key: 'generics', label: 'Generics' },
  { key: 'groups', label: 'Groups' },
];

const REF_WORDS: Record<RefKind, { one: string; many: string }> = {
  companies: { one: 'company', many: 'companies' },
  generics: { one: 'generic', many: 'generics' },
  groups: { one: 'group', many: 'groups' },
};

export const taka = (n: number | null | undefined) =>
  n == null ? '—' : `৳ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "Napa 500 mg Tablet" — the way a shop says it. */
export const medicineLabel = (m: { brandName: string; strength?: string; dosageForm?: string }) =>
  [m.brandName, m.strength, m.dosageForm].filter(Boolean).join(' ');

export default function Medicines() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'medicines') as 'medicines' | RefKind;
  const access = useAccess();
  const canManage = can(access, 'catalogue.manage');

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>Medicines</h1>
          <p className="text-sm text-muted-foreground">The catalogue every shop stocks from.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Catalogue">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${
              tab === t.key ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => setParams(t.key === 'medicines' ? {} : { tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'medicines' ? (
        <MedicinesTab canManage={canManage} />
      ) : (
        <RefsTab key={tab} kind={tab} canManage={canManage} />
      )}
    </div>
  );
}

/* ================================ medicines ================================ */

function MedicinesTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<CatalogueStats | null>(null);
  const [dosageForms, setDosageForms] = useState<string[]>([]);
  const [rows, setRows] = useState<CatalogueMedicine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [company, setCompany] = useState<CatalogueRef | null>(null);
  const [generic, setGeneric] = useState<CatalogueRef | null>(null);
  const [dosageForm, setDosageForm] = useState('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [editing, setEditing] = useState<CatalogueMedicine | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogueMedicine | null>(null);
  const [busyId, setBusyId] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dq = useDebounced(q.trim(), 300);

  /**
   * What the filters show, as a spreadsheet — an operator who filtered to one
   * company is asking for that company's list. Unfiltered, the whole catalogue.
   */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await platformApi.exportMedicines({
        q: dq || undefined,
        company: company?._id,
        generic: generic?._id,
        dosageForm: dosageForm || undefined,
        active: active || undefined,
      });
      const slug = (company?.name ?? generic?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      downloadBlob(blob, `${['medicines', slug, new Date().toISOString().slice(0, 10)].filter(Boolean).join('-')}.csv`);
    } catch (e) {
      toast(errorMessage(e, 'Could not export the catalogue.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformApi.catalogueMedicines({
        q: dq || undefined,
        company: company?._id,
        generic: generic?._id,
        dosageForm: dosageForm || undefined,
        active: active || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast(errorMessage(e, 'Could not load the catalogue.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [dq, company, generic, dosageForm, active, page, toast]);

  const loadStats = useCallback(
    () =>
      platformApi
        .catalogueStats()
        .then(setStats)
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
    platformApi
      .dosageForms()
      .then((list) => setDosageForms(list ?? []))
      .catch(() => setDosageForms([]));
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
  }, [dq, company, generic, dosageForm, active]);

  const refresh = () => Promise.all([load(), loadStats()]);

  const save = async (input: MedicineInput) => {
    if (editing === 'new') {
      const m = await platformApi.createMedicine(input);
      toast(`${medicineLabel(m)} added.`);
    } else if (editing) {
      const m = await platformApi.updateMedicine(editing._id, input);
      toast(`${medicineLabel(m)} saved.`);
    }
    setEditing(null);
    await refresh();
  };

  const toggleActive = async (m: CatalogueMedicine) => {
    setBusyId(m._id);
    try {
      await platformApi.updateMedicine(m._id, { isActive: !m.isActive });
      toast(m.isActive ? `${m.brandName} deactivated — shops can no longer find it.` : `${m.brandName} activated.`);
      await refresh();
    } catch (e) {
      toast(errorMessage(e, 'Could not update that medicine.'), 'error');
    } finally {
      setBusyId('');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget._id);
    try {
      await platformApi.deleteMedicine(deleteTarget._id);
      toast(`${deleteTarget.brandName} deleted.`);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete that medicine.'), 'error');
    } finally {
      setBusyId('');
    }
  };

  const cards = stats
    ? [
        { label: 'Medicines', value: stats.medicines, icon: Pill },
        { label: 'Active', value: stats.active, icon: CheckCircle2 },
        { label: 'Companies', value: stats.companies, icon: Factory },
        { label: 'Generics', value: stats.generics, icon: FlaskConical },
        { label: 'Groups', value: stats.groups, icon: Layers },
      ]
    : [];

  return (
    <>
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((s) => (
            <div className="card" key={s.label}>
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold tabular-nums">{s.value.toLocaleString()}</span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
          <Link
            to="/requests"
            className={`card block transition-colors hover:bg-muted ${stats.pendingRequests > 0 ? 'border-primary' : ''}`}
          >
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold tabular-nums">{stats.pendingRequests.toLocaleString()}</span>
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">Requests</div>
          </Link>
        </div>
      )}

      <div className="card">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9"
              style={{ paddingLeft: 36 }}
              data-latin
              placeholder="Brand, generic or DAR…"
              aria-label="Search medicines"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <RefPicker compact kind="companies" label="Company" placeholder="Any company" value={company} onChange={setCompany} />
          <RefPicker compact kind="generics" label="Generic" placeholder="Any generic" value={generic} onChange={setGeneric} />
          <select
            className="input"
            aria-label="Dosage form"
            value={dosageForm}
            onChange={(e) => setDosageForm(e.target.value)}
          >
            <option value="">Any form</option>
            {dosageForms.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            className="input lg:w-auto"
            aria-label="Status"
            value={active}
            onChange={(e) => setActive(e.target.value as '' | 'true' | 'false')}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mb-0 flex-1">
            {total.toLocaleString()} medicine{total === 1 ? '' : 's'}
          </h3>
          {canManage && (
            <>
              <button
                type="button"
                className={BTN_OUTLINE}
                onClick={() => void exportCsv()}
                disabled={exporting || total === 0}
                title="Download what the filters show, as a spreadsheet"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export
              </button>
              <button type="button" className={BTN_OUTLINE} onClick={() => setImporting(true)}>
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" /> Add medicine
              </button>
            </>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">Nothing matches.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Generic</th>
                  <th>Company</th>
                  <th className="text-right">Price</th>
                  <th>Pack</th>
                  <th>DAR</th>
                  <th className="text-right">Shops</th>
                  <th>Status</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m._id} className={m.isActive ? '' : 'opacity-70'}>
                    <td>
                      <span className="block font-semibold">{m.brandName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[m.strength, m.dosageForm].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </td>
                    <td className="text-sm">{m.genericName || m.generic?.name || '—'}</td>
                    <td className="text-sm">{m.company?.name ?? '—'}</td>
                    <td className="whitespace-nowrap text-right text-sm tabular-nums">{taka(m.price)}</td>
                    <td className="text-sm">{m.packSize || '—'}</td>
                    <td className="font-mono text-xs text-muted-foreground">{m.dar || '—'}</td>
                    <td className="text-right text-sm tabular-nums">{m.usedByShops.toLocaleString()}</td>
                    <td>
                      <span className={`pill ${m.isActive ? 'completed' : 'cancelled'}`}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className={BTN_ICON}
                            title="Edit"
                            aria-label={`Edit ${m.brandName}`}
                            onClick={() => setEditing(m)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={BTN_OUTLINE}
                            disabled={busyId === m._id}
                            onClick={() => void toggleActive(m)}
                          >
                            <Power className="h-3.5 w-3.5" /> {m.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className={`${BTN_ICON} text-destructive hover:bg-destructive/10 hover:text-destructive`}
                            disabled={m.usedByShops > 0 || busyId === m._id}
                            title={
                              m.usedByShops > 0
                                ? `${m.usedByShops} shop${m.usedByShops === 1 ? '' : 's'} stock this — deactivate it instead`
                                : 'Delete'
                            }
                            aria-label={`Delete ${m.brandName}`}
                            onClick={() => setDeleteTarget(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager page={page} total={total} limit={PAGE_SIZE} onPage={setPage} />
      </div>

      {importing && (
        <MedicineImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            void load();
            void platformApi.catalogueStats().then(setStats).catch(() => undefined);
          }}
        />
      )}

      {editing && (
        <MedicineForm
          title={editing === 'new' ? 'Add medicine' : `Edit ${editing.brandName}`}
          initial={editing === 'new' ? null : editing}
          dosageForms={dosageForms}
          submitLabel={editing === 'new' ? 'Add' : 'Save'}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this medicine?"
        message={
          deleteTarget
            ? `${medicineLabel(deleteTarget)} leaves the catalogue for good. No shop stocks it.`
            : ''
        }
        confirmLabel="Delete"
        loading={Boolean(deleteTarget && busyId === deleteTarget._id)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}

/* ====================== companies / generics / groups ====================== */

function RefsTab({ kind, canManage }: { kind: RefKind; canManage: boolean }) {
  const { toast } = useToast();
  const words = REF_WORDS[kind];
  const [rows, setRows] = useState<CatalogueRef[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  /** `null` closed, `'new'` adding, otherwise the row being renamed. */
  const [editing, setEditing] = useState<CatalogueRef | 'new' | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogueRef | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformApi.catalogueRefs(kind, { q: dq || undefined, page, limit: REF_PAGE_SIZE });
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast(errorMessage(e, `Could not load the ${words.many}.`), 'error');
    } finally {
      setLoading(false);
    }
  }, [kind, dq, page, toast, words.many]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [dq]);

  const open = (target: CatalogueRef | 'new') => {
    setEditing(target);
    setName(target === 'new' ? '' : target.name);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || !editing) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await platformApi.createRef(kind, trimmed);
        toast(`${trimmed} added.`);
      } else {
        await platformApi.renameRef(kind, editing._id, trimmed);
        toast(
          kind === 'generics'
            ? `Renamed to ${trimmed} — its medicines follow.`
            : `Renamed to ${trimmed}.`,
        );
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await platformApi.deleteRef(kind, deleteTarget._id);
      toast(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete that.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const title = words.one[0].toUpperCase() + words.one.slice(1);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            style={{ paddingLeft: 36 }}
            placeholder={`Search ${words.many}…`}
            aria-label={`Search ${words.many}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {canManage && (
          <button type="button" className="btn btn-sm" onClick={() => open('new')}>
            <Plus className="h-4 w-4" /> Add {words.one}
          </button>
        )}
      </div>

      <p className="mb-2 text-sm text-muted-foreground">
        {total.toLocaleString()} {total === 1 ? words.one : words.many}
      </p>

      {loading && rows.length === 0 ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="empty">Nothing matches.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-right">Medicines</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const used = r.count ?? 0;
                return (
                  <tr key={r._id}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-right tabular-nums">{used.toLocaleString()}</td>
                    {canManage && (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className={BTN_ICON}
                            title="Rename"
                            aria-label={`Rename ${r.name}`}
                            onClick={() => open(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={`${BTN_ICON} text-destructive hover:bg-destructive/10 hover:text-destructive`}
                            disabled={used > 0}
                            title={used > 0 ? `Used by ${used} medicine${used === 1 ? '' : 's'}` : 'Delete'}
                            aria-label={`Delete ${r.name}`}
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} total={total} limit={REF_PAGE_SIZE} onPage={setPage} />

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? `Add ${words.one}` : `Rename ${words.one}`}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={!name.trim() || saving || (editing !== 'new' && name.trim() === editing?.name)}
              onClick={() => void save()}
            >
              {editing === 'new' ? 'Add' : 'Save'}
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="label">
            {title} name
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          {kind === 'generics' && editing !== 'new' && (
            <p className="text-xs text-muted-foreground">Its medicines take the new name too.</p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete this ${words.one}?`}
        message={deleteTarget ? `${deleteTarget.name} is used by no medicine. It goes for good.` : ''}
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
