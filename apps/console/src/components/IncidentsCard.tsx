import { useCallback, useEffect, useState } from 'react';
import { Radio, Plus, Loader2, ExternalLink } from 'lucide-react';
import { platformApi, type IncidentRow } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import Modal from './Modal';
import { BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import { BRAND } from '../brand';

/**
 * What the public status page says. Written here when something goes wrong,
 * moved along as it is fixed, and resolved — so every shop can see "we know,
 * we are on it" instead of ringing to ask.
 */

const PARTS = [
  ['app', 'Shop app'],
  ['payments', 'Online payments'],
  ['messages', 'Email and SMS'],
  ['website', 'Website and sign-up'],
] as const;
const IMPACT = [
  ['degraded', 'Slow or partly working'],
  ['outage', 'Down'],
  ['maintenance', 'Planned maintenance'],
] as const;
const STATES = [
  ['investigating', 'Looking into it'],
  ['identified', 'Found the cause'],
  ['monitoring', 'Fixed, watching'],
  ['resolved', 'Resolved'],
] as const;

type Draft = { title: string; titleBn: string; body: string; bodyBn: string; components: string[]; impact: string; state: string };
const EMPTY: Draft = { title: '', titleBn: '', body: '', bodyBn: '', components: ['app'], impact: 'degraded', state: 'investigating' };

export default function IncidentsCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await platformApi.incidents());
    } catch {
      /* The System page still says what it can. */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const d = editing.draft;
      const payload = { ...d, title: d.title.trim(), titleBn: d.titleBn.trim(), body: d.body.trim(), bodyBn: d.bodyBn.trim() };
      if (editing.id) await platformApi.updateIncident(editing.id, payload);
      else await platformApi.createIncident(payload);
      toast(d.state === 'resolved' ? 'Resolved on the status page.' : 'The status page now says so.');
      setEditing(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const open = rows.filter((r) => r.state !== 'resolved');
  const d = editing?.draft;
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const stateLabel = (s: string) => STATES.find(([k]) => k === s)?.[1] ?? s;

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mb-0 flex flex-1 items-center gap-2">
          <Radio className="h-4 w-4" /> Status page incidents
        </h3>
        <a className={BTN_OUTLINE} href={`${BRAND.siteUrl.replace(/\/$/, '')}/en/status`} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" /> Open the page
        </a>
        <button className="btn btn-sm" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
          <Plus className="h-3.5 w-3.5" /> Report an incident
        </button>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {open.length ? `${open.length} open — shops see it now.` : 'Nothing open. The status page says everything is working.'}
      </p>
      {rows.length > 0 && (
        <div className="divide-y divide-border">
          {rows.slice(0, 8).map((r) => (
            <div key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <strong>{r.title}</strong>{' '}
                <span className="text-xs text-muted-foreground">
                  · {r.components.join(', ')} · started {lastSeen(r.startedAt)}
                </span>
              </span>
              <span className={`pill ${r.state === 'resolved' ? 'completed' : 'waiting'}`}>{stateLabel(r.state)}</span>
              <button
                className={BTN_OUTLINE}
                onClick={() =>
                  setEditing({
                    id: r._id,
                    draft: { title: r.title, titleBn: r.titleBn ?? '', body: r.body ?? '', bodyBn: r.bodyBn ?? '', components: r.components, impact: r.impact, state: r.state },
                  })
                }
              >
                Update
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && d && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Update the incident' : 'Report an incident'}
          width="max-w-2xl"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={() => void save()} disabled={busy || d.title.trim().length < 3 || !d.components.length}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {d.state === 'resolved' ? 'Resolve' : 'Post'}
              </button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              What is wrong
              <input className="input mt-1" maxLength={140} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Bills are slow to save" />
            </label>
            <label className="text-sm font-medium">
              In Bangla
              <input className="input mt-1" maxLength={140} value={d.titleBn} onChange={(e) => set({ titleBn: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              The latest word <span className="font-normal text-muted-foreground">(what to do meanwhile)</span>
              <textarea className="input mt-1" rows={3} maxLength={1500} value={d.body} onChange={(e) => set({ body: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              In Bangla
              <textarea className="input mt-1" rows={3} maxLength={1500} value={d.bodyBn} onChange={(e) => set({ bodyBn: e.target.value })} />
            </label>
            <div className="text-sm font-medium sm:col-span-2">
              Affects
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 font-normal">
                {PARTS.map(([k, l]) => (
                  <label key={k} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      style={{ width: 16 }}
                      checked={d.components.includes(k)}
                      onChange={(e) => set({ components: e.target.checked ? [...d.components, k] : d.components.filter((x) => x !== k) })}
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <label className="text-sm font-medium">
              How bad
              <select className="input mt-1" value={d.impact} onChange={(e) => set({ impact: e.target.value })}>
                {IMPACT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Where it is
              <select className="input mt-1" value={d.state} onChange={(e) => set({ state: e.target.value })}>
                {STATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
