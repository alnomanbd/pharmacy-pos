import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Plus, Pencil, Trash2, Loader2, Sparkles } from 'lucide-react';
import { platformApi, type HelpRow } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { BTN_ICON, BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * The help articles shops read in their app, written here.
 *
 * Plain text: blank lines between paragraphs, and lines that start "1." become
 * numbered steps. English and Bangla side by side, because a step that is
 * wrong in one language is a support call in that language.
 */

const CATEGORIES = [
  ['getting-started', 'Getting started'],
  ['selling', 'Selling'],
  ['stock', 'Stock'],
  ['money', 'Money and baki'],
  ['account', 'Your account'],
] as const;

type Draft = { slug: string; category: string; title: string; titleBn: string; body: string; bodyBn: string; videoUrl: string; order: string; published: boolean };
const EMPTY: Draft = { slug: '', category: 'getting-started', title: '', titleBn: '', body: '', bodyBn: '', videoUrl: '', order: '100', published: true };

export default function HelpArticles() {
  const { toast } = useToast();
  const [rows, setRows] = useState<HelpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await platformApi.helpArticles());
    } catch (e) {
      toast(errorMessage(e, 'Could not load the articles.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    setBusy(true);
    try {
      const payload = {
        slug: d.slug.trim() || undefined,
        category: d.category,
        title: d.title.trim(),
        titleBn: d.titleBn.trim(),
        body: d.body.trim(),
        bodyBn: d.bodyBn.trim(),
        videoUrl: d.videoUrl.trim(),
        order: Number(d.order) || 100,
        published: d.published,
      };
      if (editing.id) await platformApi.updateHelpArticle(editing.id, payload);
      else await platformApi.createHelpArticle(payload);
      toast('Saved.');
      setEditing(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that article.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: HelpRow) => {
    if (
      !(await confirmAction({
        title: `Delete “${a.title}”?`,
        message: 'Shops stop seeing it at once.',
        confirmLabel: 'Delete',
        tone: 'danger',
        icon: 'delete',
      }))
    )
      return;
    try {
      await platformApi.deleteHelpArticle(a._id);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete that.'), 'error');
    }
  };

  const starters = async () => {
    setBusy(true);
    try {
      const r = await platformApi.addHelpStarters();
      toast(r.added ? `${r.added} starter article${r.added === 1 ? '' : 's'} added.` : 'They are all here already.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not add them.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const d = editing?.draft;
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5" /> Help articles
          </h1>
          <p className="text-sm text-muted-foreground">What shops read under Help in their app, in English and Bangla.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={BTN_OUTLINE} onClick={() => void starters()} disabled={busy}>
            <Sparkles className="h-3.5 w-3.5" /> Add starter articles
          </button>
          <button className="btn" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
            <Plus className="h-4 w-4" /> New article
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">No articles yet. “Add starter articles” puts in eight how-tos to start from.</div>
        ) : (
          CATEGORIES.map(([key, label]) => {
            const inCat = rows.filter((r) => r.category === key);
            if (!inCat.length) return null;
            return (
              <div key={key} className="mb-4 last:mb-0">
                <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{label}</h3>
                <div className="divide-y divide-border">
                  {inCat.map((a) => (
                    <div key={a._id} className="flex flex-wrap items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm">{a.title}</strong>
                          {!a.published && <span className="pill neutral">draft</span>}
                          {!a.titleBn && <span className="pill waiting">no Bangla</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          /help/{a.slug} · updated {lastSeen(a.updatedAt)}
                        </div>
                      </div>
                      <button
                        className={BTN_ICON}
                        aria-label="Edit"
                        title="Edit"
                        onClick={() =>
                          setEditing({
                            id: a._id,
                            draft: { slug: a.slug, category: a.category, title: a.title, titleBn: a.titleBn ?? '', body: a.body ?? '', bodyBn: a.bodyBn ?? '', videoUrl: a.videoUrl ?? '', order: String(a.order ?? 100), published: a.published },
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className={BTN_ICON} aria-label="Delete" title="Delete" onClick={() => void remove(a)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && d && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit article' : 'New article'}
          width="max-w-4xl"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={() => void save()} disabled={busy || d.title.trim().length < 2}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">
              Title
              <input className="input mt-1" maxLength={140} value={d.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Title in Bangla
              <input className="input mt-1" maxLength={140} value={d.titleBn} onChange={(e) => set({ titleBn: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Article
              <textarea className="input mt-1 font-mono text-[13px]" rows={12} maxLength={8000} value={d.body} onChange={(e) => set({ body: e.target.value })}
                placeholder={'A sentence or two first.\n1. The first step.\n2. The next one.'} />
            </label>
            <label className="text-sm font-medium">
              Article in Bangla
              <textarea className="input mt-1 text-[14px]" rows={12} maxLength={8000} value={d.bodyBn} onChange={(e) => set({ bodyBn: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Topic
              <select className="input mt-1" value={d.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Address <span className="font-normal text-muted-foreground">(empty: from the title)</span>
              <input className="input mt-1 font-mono" maxLength={80} value={d.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="add-medicines" />
            </label>
            <label className="text-sm font-medium">
              YouTube video <span className="font-normal text-muted-foreground">(optional)</span>
              <input className="input mt-1" maxLength={300} value={d.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://youtu.be/…" />
            </label>
            <div className="flex items-end justify-between gap-3">
              <label className="text-sm font-medium">
                Order
                <input className="input mt-1 w-24" inputMode="numeric" value={d.order} onChange={(e) => set({ order: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label className="inline-flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" className="h-4 w-4 shrink-0" style={{ width: 16 }} checked={d.published} onChange={(e) => set({ published: e.target.checked })} /> Published
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
