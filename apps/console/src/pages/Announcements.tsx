import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, Info, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { platformApi, type AnnouncementRow, type ShopPlan } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { BTN_ICON, BTN_SECONDARY, errorMessage } from '../lib/ui';

/**
 * Messages from the team across the top of every shop's app.
 *
 * Aimed at every shop or at chosen plans, live between a start and an end so a
 * Friday maintenance notice can be written on Tuesday and take itself down,
 * and in Bangla as well as English when somebody has written it. A shop can
 * close one unless it is marked as not closable.
 */

const TONES = [
  { key: 'info', label: 'Information', icon: Info, cls: 'bg-primary/10' },
  { key: 'warning', label: 'Warning', icon: AlertTriangle, cls: 'bg-amber-500/15' },
  { key: 'success', label: 'Good news', icon: CheckCircle2, cls: 'bg-emerald-500/15' },
] as const;

const STATE_CLS: Record<AnnouncementRow['state'], string> = {
  live: 'completed',
  scheduled: 'booked',
  ended: 'neutral',
  off: 'cancelled',
};

/** ISO → the value a datetime-local input wants, in local time. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

type Draft = {
  title: string;
  body: string;
  titleBn: string;
  bodyBn: string;
  tone: 'info' | 'warning' | 'success';
  plans: string[];
  linkLabel: string;
  linkUrl: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  dismissible: boolean;
};

const EMPTY: Draft = {
  title: '',
  body: '',
  titleBn: '',
  bodyBn: '',
  tone: 'info',
  plans: [],
  linkLabel: '',
  linkUrl: '',
  startsAt: '',
  endsAt: '',
  active: true,
  dismissible: true,
};

export default function Announcements() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [plans, setPlans] = useState<ShopPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await platformApi.announcements());
    } catch (e) {
      toast(errorMessage(e, 'Could not load the announcements.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    platformApi
      .plans()
      .then((p) => setPlans(p.filter((x) => x.isActive)))
      .catch(() => undefined);
  }, [load]);

  const openNew = () => setEditing({ id: null, draft: { ...EMPTY } });
  const openEdit = (a: AnnouncementRow) =>
    setEditing({
      id: a._id,
      draft: {
        title: a.title,
        body: a.body,
        titleBn: a.titleBn,
        bodyBn: a.bodyBn,
        tone: a.tone,
        plans: a.plans,
        linkLabel: a.linkLabel,
        linkUrl: a.linkUrl,
        startsAt: toLocalInput(a.startsAt),
        endsAt: toLocalInput(a.endsAt),
        active: a.active,
        dismissible: a.dismissible,
      },
    });

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    setBusy(true);
    try {
      const payload = {
        ...d,
        startsAt: fromLocalInput(d.startsAt),
        endsAt: fromLocalInput(d.endsAt),
      };
      if (editing.id) await platformApi.updateAnnouncement(editing.id, payload);
      else await platformApi.createAnnouncement(payload);
      toast(editing.id ? 'Announcement updated.' : 'Announcement saved.');
      setEditing(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (a: AnnouncementRow) => {
    try {
      await platformApi.updateAnnouncement(a._id, { active: !a.active });
      toast(a.active ? 'Taken down.' : 'Back on.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not change that.'), 'error');
    }
  };

  const remove = async (a: AnnouncementRow) => {
    if (!window.confirm(`Delete “${a.title}”? Shops stop seeing it at once.`)) return;
    try {
      await platformApi.deleteAnnouncement(a._id);
      toast('Deleted.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete that.'), 'error');
    }
  };

  const planName = (k: string) => plans.find((p) => p.key === k)?.name ?? k;
  const d = editing?.draft;
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const tone = TONES.find((t) => t.key === d?.tone) ?? TONES[0];

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Announcements
          </h1>
          <p className="text-sm text-muted-foreground">Shown across the top of the shop app — every screen, the till included.</p>
        </div>
        <button className="btn" onClick={openNew}>
          <Plus className="h-4 w-4" /> New announcement
        </button>
      </div>

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">Nothing yet. Shops see nothing until you write one.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((a) => {
              const T = TONES.find((t) => t.key === a.tone) ?? TONES[0];
              return (
                <div key={a._id} className="flex flex-wrap items-start gap-3 py-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${T.cls}`}>
                    <T.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{a.title}</strong>
                      <span className={`pill ${STATE_CLS[a.state]}`}>{a.state}</span>
                      {!a.dismissible && <span className="pill">can't be closed</span>}
                    </div>
                    {a.body && <div className="mt-0.5 text-sm text-muted-foreground">{a.body}</div>}
                    {a.titleBn && <div className="mt-0.5 text-sm text-muted-foreground">বাংলা: {a.titleBn}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      <span>{a.plans.length ? `For ${a.plans.map(planName).join(', ')}` : 'For every shop'}</span>
                      <span>From {when(a.startsAt)}</span>
                      {a.endsAt && <span>until {when(a.endsAt)}</span>}
                      {a.createdByName && <span>by {a.createdByName}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void toggle(a)}>
                      {a.active ? 'Take down' : 'Turn on'}
                    </button>
                    <button className={BTN_ICON} onClick={() => openEdit(a)} aria-label="Edit" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className={BTN_ICON} onClick={() => void remove(a)} aria-label="Delete" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && d && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit announcement' : 'New announcement'}
          width="max-w-2xl"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </button>
              <button className="btn" onClick={() => void save()} disabled={busy || !d.title.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">
              Title
              <input className="input mt-1" maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Maintenance tonight from 11 pm" />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea className="input mt-1" rows={2} maxLength={600} value={d.body} onChange={(e) => set({ body: e.target.value })} placeholder="The app may be slow for about 20 minutes. Bills already rung up are safe." />
            </label>
            <label className="text-sm font-medium">
              Title in Bangla <span className="font-normal text-muted-foreground">(optional)</span>
              <input className="input mt-1" maxLength={120} value={d.titleBn} onChange={(e) => set({ titleBn: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Message in Bangla
              <input className="input mt-1" maxLength={600} value={d.bodyBn} onChange={(e) => set({ bodyBn: e.target.value })} />
            </label>

            <div className="text-sm font-medium sm:col-span-2">
              Kind
              <div className="mt-1 flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set({ tone: t.key })}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${d.tone === t.key ? 'border-primary bg-secondary font-semibold' : 'border-border'}`}
                  >
                    <t.icon className="h-4 w-4" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-sm font-medium sm:col-span-2">
              Who sees it
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 font-normal">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="h-4 w-4 shrink-0" style={{ width: 16 }} checked={d.plans.length === 0} onChange={() => set({ plans: [] })} /> Every shop
                </label>
                {plans.map((p) => (
                  <label key={p.key} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      style={{ width: 16 }}
                      checked={d.plans.includes(p.key)}
                      onChange={(e) => set({ plans: e.target.checked ? [...d.plans, p.key] : d.plans.filter((k) => k !== p.key) })}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <label className="text-sm font-medium">
              Shows from <span className="font-normal text-muted-foreground">(empty: now)</span>
              <input type="datetime-local" className="input mt-1" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Until <span className="font-normal text-muted-foreground">(empty: until taken down)</span>
              <input type="datetime-local" className="input mt-1" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Button label <span className="font-normal text-muted-foreground">(optional)</span>
              <input className="input mt-1" maxLength={40} value={d.linkLabel} onChange={(e) => set({ linkLabel: e.target.value })} placeholder="Renew now" />
            </label>
            <label className="text-sm font-medium">
              Button link
              <input className="input mt-1" maxLength={300} value={d.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} placeholder="/subscription or https://…" />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 shrink-0" style={{ width: 16 }} checked={d.dismissible} onChange={(e) => set({ dismissible: e.target.checked })} /> Shops can close it
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 shrink-0" style={{ width: 16 }} checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> On
            </label>
          </div>

          {/* What a shop will see, in the shop app's own shape. */}
          <div className="mt-4 text-xs font-medium text-muted-foreground">Preview</div>
          <div className={`mt-1 flex items-start gap-2.5 rounded-md border border-border px-3 py-2 text-sm ${tone.cls}`}>
            <tone.icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <strong>{d.title || 'Your title'}</strong>
              {d.body && <span className="ml-1.5 opacity-80">{d.body}</span>}
              {d.linkUrl && <span className="ml-2 font-semibold text-primary">{d.linkLabel || 'Read more'} →</span>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
