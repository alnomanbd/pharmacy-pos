import { useCallback, useEffect, useState } from 'react';
import { NotebookPen, Pin, PinOff, Check, RotateCcw, Trash2, CalendarClock, Loader2 } from 'lucide-react';
import { platformApi, type ShopNote } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { BTN_ICON, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * The team's notes on one shop.
 *
 * "Called 2 Oct, wants a label printer, call back Sunday" — written where the
 * next operator will see it, with the date to call back. Pinned notes sit on
 * top; a follow-up shows in the bell once it is due and leaves when it is
 * ticked. Nothing here is ever shown to the shop.
 */

/** Today's date as yyyy-mm-dd, for the follow-up picker's minimum. */
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "today", "tomorrow", "Sun 5 Oct", or "3 days overdue". */
function followUpLabel(iso: string) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(d) - start(new Date())) / 86400000);
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} overdue`, cls: 'cancelled' };
  if (days === 0) return { text: 'today', cls: 'waiting' };
  if (days === 1) return { text: 'tomorrow', cls: 'booked' };
  return { text: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), cls: 'booked' };
}

export default function ShopNotesCard({ shopId, isOwner }: { shopId: string; isOwner: boolean }) {
  const { toast } = useToast();
  const me = useAuthStore((s) => s.user?.id);
  const [rows, setRows] = useState<ShopNote[]>([]);
  const [body, setBody] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await platformApi.shopNotes(shopId));
    } catch (e) {
      toast(errorMessage(e, 'Could not load the notes.'), 'error');
    }
  }, [shopId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!body.trim()) return;
    setBusy('add');
    try {
      await platformApi.addShopNote(shopId, {
        body: body.trim(),
        // Nine in the morning on the chosen day, so "Sunday" means Sunday's working day.
        followUpAt: followUp ? new Date(`${followUp}T09:00:00`).toISOString() : null,
      });
      setBody('');
      setFollowUp('');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not add that note.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const change = async (n: ShopNote, patch: { pinned?: boolean; done?: boolean }) => {
    setBusy(n._id);
    try {
      await platformApi.updateShopNote(shopId, n._id, patch);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not change that note.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async (n: ShopNote) => {
    if (
      !(await confirmAction({
        title: 'Delete this note?',
        message: 'It cannot be brought back.',
        confirmLabel: 'Delete',
        tone: 'danger',
        icon: 'delete',
      }))
    )
      return;
    setBusy(n._id);
    try {
      await platformApi.deleteShopNote(shopId, n._id);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete that note.'), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card">
      <h3 className="mb-1 flex items-center gap-2">
        <NotebookPen className="h-4 w-4" /> Notes
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">For the team only — the shop never sees these.</p>

      <div className="rounded-lg border border-border p-2">
        <textarea
          rows={2}
          className="input resize-y border-0 shadow-none focus:ring-0"
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void add();
          }}
          placeholder="What happened, what they want, what was promised…"
          aria-label="New note"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Follow up on
            <input
              type="date"
              className="input h-8 w-auto py-0 text-xs"
              min={todayInput()}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </label>
          <button className="btn btn-sm ml-auto" onClick={() => void add()} disabled={!body.trim() || busy === 'add'}>
            {busy === 'add' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add note
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty mt-3">No notes yet.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((n) => {
            const mine = n.author === me || isOwner;
            const due = n.followUpAt && !n.doneAt ? followUpLabel(n.followUpAt) : null;
            return (
              <div
                key={n._id}
                className={`rounded-lg border p-2.5 ${n.pinned ? 'border-primary/40 bg-secondary/40' : 'border-border'} ${
                  n.doneAt ? 'opacity-70' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-wrap break-words text-sm">{n.body}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {n.authorName || 'Someone'} · {lastSeen(n.createdAt)}
                      </span>
                      {due && <span className={`pill ${due.cls}`}>follow up {due.text}</span>}
                      {n.followUpAt && n.doneAt && <span className="pill completed">followed up</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    {n.followUpAt && (
                      <button
                        className={BTN_ICON}
                        disabled={busy === n._id}
                        onClick={() => void change(n, { done: !n.doneAt })}
                        title={n.doneAt ? 'Not done after all' : 'Mark the follow-up done'}
                        aria-label={n.doneAt ? 'Not done after all' : 'Mark the follow-up done'}
                      >
                        {n.doneAt ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      className={BTN_ICON}
                      disabled={busy === n._id}
                      onClick={() => void change(n, { pinned: !n.pinned })}
                      title={n.pinned ? 'Unpin' : 'Pin to the top'}
                      aria-label={n.pinned ? 'Unpin' : 'Pin to the top'}
                    >
                      {n.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    {mine && (
                      <button
                        className={BTN_ICON}
                        disabled={busy === n._id}
                        onClick={() => void remove(n)}
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
