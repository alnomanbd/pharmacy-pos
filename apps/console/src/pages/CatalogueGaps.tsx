import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpenText, Check, ClipboardCheck, PenLine, RefreshCw, Search, Store, X } from 'lucide-react';
import { platformApi, type CatalogueGaps as Gaps, type CatalogueSuggestion, type GapField } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { confirmAction } from '@dawai/shared/lib/confirm';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { num } from '../components/Stretch';
import { BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';

/**
 * What the catalogue is missing, and how to fill it.
 *
 * Suggestions come from what shops have already entered — the MRP on the
 * pack, pieces in a box — and from a brand's siblings under the same generic.
 * None is written until somebody here accepts it, busiest medicines first.
 * Generics with no write-up are listed by how much they cover, with an editor.
 */

const FIELD_WORDS: Record<GapField, string> = { price: 'Price', packSize: 'Pack size', group: 'Group' };

function usePerms() {
  const perms = useAuthStore((s) => (s.user as { permissions?: string[] } | null)?.permissions ?? []);
  return { canManage: perms.length === 0 || perms.includes('catalogue.manage') || perms.includes('formulary.manage') };
}

export default function CatalogueGaps() {
  const { toast } = useToast();
  const { canManage } = usePerms();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'writeups' ? 'writeups' : 'suggestions';
  const [gaps, setGaps] = useState<Gaps | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const loadGaps = useCallback(() => {
    platformApi
      .catalogueGaps()
      .then(setGaps)
      .catch((e) => toast(errorMessage(e, 'Could not load the gaps.'), 'error'));
  }, [toast]);
  useEffect(loadGaps, [loadGaps]);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const r = await platformApi.rebuildCatalogueSuggestions();
      toast(`${num(r.suggestions)} suggestions worked out again.`);
      loadGaps();
    } catch (e) {
      toast(errorMessage(e, 'Could not rebuild.'), 'error');
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Catalogue gaps
          </h1>
          <p className="text-sm text-muted-foreground">What the catalogue is missing, and what shops’ own entries say should fill it. Nothing changes until you accept it.</p>
        </div>
        {canManage && (
          <button className={BTN_OUTLINE} disabled={rebuilding} onClick={() => void rebuild()} title="Work the suggestions out again from what shops have entered">
            <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} /> Work out again
          </button>
        )}
      </div>

      {!gaps ? (
        <LoadingBlock />
      ) : (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(['price', 'packSize', 'group', 'dar'] as const).map((k) => (
            <div key={k} className="card mb-0">
              <div className="text-xs font-semibold text-muted-foreground">{k === 'dar' ? 'Registration no. (DAR)' : FIELD_WORDS[k]} missing</div>
              <div className="text-2xl font-bold tabular-nums">{num(gaps.missing[k].all)}</div>
              <div className="text-xs text-muted-foreground">
                {num(gaps.missing[k].stocked)} of them stocked by shops ·{' '}
                {Math.round((1 - gaps.missing[k].all / Math.max(1, gaps.medicines)) * 100)}% filled
              </div>
            </div>
          ))}
          <div className="card mb-0">
            <div className="text-xs font-semibold text-muted-foreground">Generics with no write-up</div>
            <div className="text-2xl font-bold tabular-nums">{num(gaps.generics.withoutWriteup)}</div>
            <div className="text-xs text-muted-foreground">What it is for, dose, side effects</div>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {[
          { key: 'suggestions', label: 'Suggestions', icon: Store },
          { key: 'writeups', label: 'Write-ups missing', icon: BookOpenText },
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'suggestions' ? {} : { tab: t.key })}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'suggestions' ? <Suggestions gaps={gaps} canManage={canManage} onChanged={loadGaps} /> : <Writeups canManage={canManage} onChanged={loadGaps} />}
    </div>
  );
}

/* ------------------------------------------------------------ suggestions -- */

function Suggestions({ gaps, canManage, onChanged }: { gaps: Gaps | null; canManage: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [field, setField] = useState<GapField | ''>('');
  const [confidence, setConfidence] = useState<'' | 'high' | 'low'>('');
  const [stockedOnly, setStockedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: CatalogueSuggestion[]; total: number; limit: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState<null | boolean>(null);

  const filter = useMemo(() => ({ ...(field ? { field } : {}), ...(confidence ? { confidence } : {}), ...(stockedOnly ? { stockedOnly } : {}) }), [field, confidence, stockedOnly]);

  const load = useCallback(() => {
    setData(null);
    setPicked(new Set());
    platformApi
      .catalogueSuggestions({ ...filter, page, limit: 50 })
      .then(setData)
      .catch((e) => toast(errorMessage(e, 'Could not load the suggestions.'), 'error'));
  }, [filter, page, toast]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [field, confidence, stockedOnly]);

  const decide = async (accept: boolean, all = false) => {
    // "All" has its own dialog below; a picked handful asks here.
    if (!all) {
      const n = picked.size;
      const these = n === 1 ? 'this suggestion' : `these ${num(n)} suggestions`;
      const ok = await confirmAction(
        accept
          ? {
              title: `Accept ${these}?`,
              message: 'They are written to the catalogue every shop searches, under your name in the audit trail.',
              confirmLabel: `Accept ${num(n)}`,
              tone: 'danger',
            }
          : {
              title: `Dismiss ${these}?`,
              message: 'They will not be offered again.',
              confirmLabel: `Dismiss ${num(n)}`,
              tone: 'danger',
              icon: 'close',
            },
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await platformApi.decideCatalogueSuggestions(all ? { filter, accept } : { ids: [...picked], accept });
      toast(
        accept
          ? `${num(r.applied)} written to the catalogue${r.skipped ? ` · ${num(r.skipped)} skipped, the catalogue had changed` : ''}.`
          : `${num(r.dismissed)} dismissed — they will not be offered again.`,
      );
      setConfirmAll(null);
      load();
      onChanged();
    } catch (e) {
      toast(errorMessage(e, 'Could not do that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openCount = (f?: GapField, c?: string) => (gaps?.open ?? []).filter((o) => (!f || o.field === f) && (!c || o.confidence === c)).reduce((a, o) => a + o.n, 0);
  const allPicked = !!data?.rows.length && data.rows.every((r) => picked.has(r._id));

  return (
    <div className="space-y-3">
      <div className="card mb-0 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sg-field">
            What
          </label>
          <select id="sg-field" className="input h-9" value={field} onChange={(e) => setField(e.target.value as GapField | '')}>
            <option value="">Everything ({num(openCount())})</option>
            {(Object.keys(FIELD_WORDS) as GapField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_WORDS[f]} ({num(openCount(f))})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="sg-conf">
            How sure
          </label>
          <select id="sg-conf" className="input h-9" value={confidence} onChange={(e) => setConfidence(e.target.value as '' | 'high' | 'low')}>
            <option value="">Any</option>
            <option value="high">Sure ({num(openCount(field || undefined, 'high'))})</option>
            <option value="low">Check first ({num(openCount(field || undefined, 'low'))})</option>
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 whitespace-nowrap text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 shrink-0" checked={stockedOnly} onChange={(e) => setStockedOnly(e.target.checked)} /> Only medicines shops stock
        </label>
        {canManage && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button className={BTN_OUTLINE} disabled={!picked.size || busy} onClick={() => void decide(false)}>
              <X className="h-3.5 w-3.5" /> Dismiss {picked.size || ''}
            </button>
            <button className="btn" disabled={!picked.size || busy} onClick={() => void decide(true)}>
              <Check className="h-4 w-4" /> Accept {picked.size || ''}
            </button>
            {confidence === 'high' && data && data.total > 0 && (
              <button className="btn" disabled={busy} onClick={() => setConfirmAll(true)}>
                Accept all {num(data.total)} sure ones
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        “Sure” is {gaps?.minShops ?? 3}+ shops agreeing and most of those that say anything (for a group: 80% of the generic’s other brands). Busiest medicines are listed first.
      </p>

      <div className="card mb-0 overflow-x-auto p-0">
        {!data ? (
          <LoadingBlock />
        ) : !data.rows.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing to suggest here.</p>
        ) : (
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                {canManage && (
                  <th className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Pick all on this page"
                      checked={allPicked}
                      onChange={(e) => setPicked(e.target.checked ? new Set(data.rows.map((r) => r._id)) : new Set())}
                    />
                  </th>
                )}
                <th>Medicine</th>
                <th>Suggestion</th>
                <th>Says so</th>
                <th className="num">Shops stock</th>
                <th className="num">Sold, 90 days</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r._id}>
                  {canManage && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label="Pick"
                        checked={picked.has(r._id)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(r._id);
                          else next.delete(r._id);
                          setPicked(next);
                        }}
                      />
                    </td>
                  )}
                  <td>
                    <b>{r.medicine?.brandName ?? '—'}</b> {r.medicine?.strength} <span className="text-muted-foreground">{r.medicine?.dosageForm}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.medicine?.genericName} · {r.medicine?.company?.name}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {FIELD_WORDS[r.field]} {r.kind === 'update' ? '(changed)' : ''}
                    </span>
                    <span className="block whitespace-nowrap font-semibold">{r.display}</span>
                  </td>
                  <td>
                    <span className={`pill ${r.confidence === 'high' ? 'success' : 'waiting'}`}>{r.confidence === 'high' ? 'Sure' : 'Check first'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.basis === 'shops' ? `${r.agree} of ${r.reporting} shop${r.reporting === 1 ? '' : 's'}` : `${r.agree} of ${r.reporting} sibling brands`}
                    </span>
                  </td>
                  <td className="num">{num(r.stocked)}</td>
                  <td className="num">{num(r.sold)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > data.limit && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />}

      <Modal
        open={confirmAll !== null}
        onClose={() => setConfirmAll(null)}
        title={`Accept all ${num(data?.total ?? 0)} sure suggestions?`}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmAll(null)}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void decide(true, true)}>
              Accept all
            </button>
          </>
        }
      >
        <p className="text-sm">
          Every “sure” suggestion{field ? ` for ${FIELD_WORDS[field].toLowerCase()}` : ''}
          {stockedOnly ? ' on medicines shops stock' : ''} is written to the catalogue that every shop searches. One the catalogue has changed since is skipped. It
          goes in the audit trail under your name.
        </p>
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------- write-ups -- */

const SECTIONS: { key: string; label: string; rows: number }[] = [
  { key: 'indications', label: 'What it is for', rows: 4 },
  { key: 'dosage', label: 'Dose', rows: 5 },
  { key: 'sideEffects', label: 'Side effects', rows: 3 },
  { key: 'contraindications', label: 'Who should not take it', rows: 3 },
  { key: 'interactions', label: 'With other medicines', rows: 3 },
  { key: 'pregnancy', label: 'Pregnancy and breastfeeding', rows: 2 },
  { key: 'precautions', label: 'Precautions', rows: 3 },
  { key: 'pediatric', label: 'Children', rows: 2 },
  { key: 'administration', label: 'How to take it', rows: 2 },
  { key: 'overdose', label: 'Overdose', rows: 2 },
  { key: 'storage', label: 'Storage', rows: 2 },
];

function Writeups({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: { id: string; name: string; drugClass: string; medicines: number; stocked: number }[]; total: number; limit: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    platformApi
      .genericsWithoutWriteup({ q: query || undefined, page, limit: 50 })
      .then(setData)
      .catch((e) => toast(errorMessage(e, 'Could not load the generics.'), 'error'));
  }, [query, page, toast]);
  useEffect(load, [load]);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q.trim());
        }}
      >
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="input h-9 w-full pl-9" placeholder="Find a generic" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a generic" />
        </label>
        <button className={BTN_OUTLINE}>Find</button>
      </form>
      <p className="text-xs text-muted-foreground">Generics with no write-up, the ones stocked most and with most brands first. Every brand of a generic shows its write-up in the shop app.</p>
      <div className="card mb-0 overflow-x-auto p-0">
        {!data ? (
          <LoadingBlock />
        ) : !data.rows.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Every generic here has a write-up.</p>
        ) : (
          <table className="table min-w-[560px]">
            <thead>
              <tr>
                <th>Generic</th>
                <th className="num">Brands</th>
                <th className="num">Stocked by shops</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <b>{g.name}</b>
                    {g.drugClass && <span className="block text-xs text-muted-foreground">{g.drugClass}</span>}
                  </td>
                  <td className="num">{num(g.medicines)}</td>
                  <td className="num">{num(g.stocked)}</td>
                  <td className="text-right">
                    {canManage && (
                      <button className={BTN_OUTLINE} onClick={() => setEditing(g.id)}>
                        <PenLine className="h-3.5 w-3.5" /> Write
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > data.limit && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      {editing && (
        <WriteupDialog
          id={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function WriteupDialog({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [g, setG] = useState<{ name: string; drugClass: string; monograph: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    platformApi
      .genericWriteup(id)
      .then((d) => setG({ name: d.name, drugClass: d.drugClass, monograph: { ...d.monograph } }))
      .catch((e) => toast(errorMessage(e, 'Could not load it.'), 'error'));
  }, [id, toast]);

  const save = async () => {
    if (!g) return;
    setBusy(true);
    try {
      const monograph = Object.fromEntries(SECTIONS.map((s) => [s.key, g.monograph[s.key] ?? '']));
      await platformApi.saveGenericWriteup(id, { drugClass: g.drugClass, monograph });
      toast('Saved. Every brand of it shows this in the shop app.');
      onSaved();
      onClose();
    } catch (e) {
      toast(errorMessage(e, 'Could not save it.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = 'mb-1 block text-xs font-semibold text-muted-foreground';
  return (
    <Modal
      open
      onClose={onClose}
      title={g ? g.name : 'Write-up'}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!g || busy || !(g.monograph.indications ?? '').trim()} onClick={() => void save()}>
            Save write-up
          </button>
        </>
      }
    >
      {!g ? (
        <LoadingBlock />
      ) : (
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            Plain text. Start a line with “• ” for a list. Write from the product’s approved leaflet or a reference you are allowed to use. “What it is for” is
            needed; the rest as you have them.
          </p>
          <div>
            <label className={label} htmlFor="wu-class">
              Drug class
            </label>
            <input id="wu-class" className="input h-10 w-full" value={g.drugClass} onChange={(e) => setG({ ...g, drugClass: e.target.value })} placeholder="e.g. Proton pump inhibitor" />
          </div>
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <label className={label} htmlFor={`wu-${s.key}`}>
                {s.label}
              </label>
              <textarea
                id={`wu-${s.key}`}
                className="input w-full"
                rows={s.rows}
                value={g.monograph[s.key] ?? ''}
                onChange={(e) => setG({ ...g, monograph: { ...g.monograph, [s.key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
