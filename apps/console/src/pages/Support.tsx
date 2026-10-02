import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Headset, MessageSquare, Send, ArrowLeft, CheckCircle2, RotateCcw, Building2, Phone } from 'lucide-react';
import { platformApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import type { PlatformAccess, SupportMessage, SupportThread } from '@dawai/shared/types';
import { errorMessage } from '../lib/ui';

/**
 * The support inbox.
 *
 * Open threads first, because the inbox is a list of what is left to do — a
 * view that also shows finished conversations stops being a to-do list and
 * starts being an archive nobody reads.
 *
 * Every thread carries the shop it came from, linked to that shop's page: the
 * first question an operator asks about a complaint is always "who is this,
 * and what plan are they on".
 *
 * There is no socket server, so the open conversation is re-read every few
 * seconds while the tab is visible, and the inbox a little less often.
 */

const THREAD_POLL_MS = 8_000;
const LIST_POLL_MS = 20_000;

/** "3:45 PM" today, "2 Oct, 3:45 PM" before that. */
const when = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  return new Date().toDateString() === d.toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};

/** Populated by the API, but a lean document can still hand back a bare id. */
const orgOf = (t: SupportThread) => (typeof t.organization === 'object' && t.organization ? t.organization : null);
const openerOf = (t: SupportThread) => (typeof t.openedBy === 'object' && t.openedBy ? t.openedBy : null);

/**
 * Appending one message, once.
 *
 * A poll can land between the send and its response, so the same message
 * arrives from both. Both writers go through here, and the id decides.
 */
const append = (prev: SupportMessage[], m: SupportMessage) =>
  prev.some((x) => x._id === m._id) ? prev : [...prev, m];

const visible = () => document.visibilityState === 'visible';

export default function PlatformSupport() {
  const { toast } = useToast();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open');
  const [waiting, setWaiting] = useState(0);
  const [openId, setOpenId] = useState('');
  const [opened, setOpened] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState('');
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const canReply = !access || access.permissions.includes('support.reply');

  const load = useCallback(async () => {
    try {
      const res = await platformApi.support({ status, limit: 100 });
      setThreads(res.data);
      setWaiting(res.waiting);
    } catch (e) {
      toast(errorMessage(e, 'Could not load the inbox.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [status, toast]);

  const readThread = useCallback(
    async (id: string, quiet = false) => {
      try {
        const res = await platformApi.supportThread(id);
        setOpened(res.thread);
        setMessages(res.messages);
        // Reading clears the platform's count only; the shop's stays.
        setThreads((prev) => prev.map((t) => (t._id === id ? { ...t, unreadForPlatform: 0 } : t)));
      } catch (e) {
        if (!quiet) toast(errorMessage(e, 'Could not open that conversation.'), 'error');
      }
    },
    [toast],
  );

  const openThread = (id: string) => {
    setOpenId(id);
    setOpened(null);
    setMessages([]);
    seen.current = 0;
    void readThread(id).then(() => void load());
  };

  useEffect(() => {
    platformApi
      .access()
      .then(setAccess)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    const tick = window.setInterval(() => visible() && void load(), LIST_POLL_MS);
    return () => window.clearInterval(tick);
  }, [load]);

  useEffect(() => {
    if (!openId) return;
    const tick = window.setInterval(() => visible() && void readThread(openId, true), THREAD_POLL_MS);
    return () => window.clearInterval(tick);
  }, [openId, readThread]);

  // Down to the newest only when there is something new, not on every poll.
  useEffect(() => {
    if (messages.length > seen.current) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    seen.current = messages.length;
  }, [messages]);

  const send = async () => {
    if (!reply.trim() || !openId) return;
    setSending(true);
    try {
      const message = await platformApi.supportReply(openId, reply.trim());
      setMessages((prev) => append(prev, message));
      setReply('');
      await Promise.all([load(), readThread(openId, true)]);
    } catch (e) {
      toast(errorMessage(e, 'Could not send that.'), 'error');
    } finally {
      setSending(false);
    }
  };

  const setStatusOf = async (next: 'open' | 'closed') => {
    if (!openId) return;
    try {
      await platformApi.supportStatus(openId, next);
      toast(next === 'closed' ? 'Closed.' : 'Reopened.');
      await Promise.all([load(), readThread(openId, true)]);
    } catch (e) {
      toast(errorMessage(e, 'Could not change that.'), 'error');
    }
  };

  // The open thread from its own read, so it stays on screen after it leaves
  // the current filter — closing one from the Open list must not blank the pane.
  const current = opened ?? threads.find((t) => t._id === openId) ?? null;
  const currentOrg = current ? orgOf(current) : null;
  const opener = current ? openerOf(current) : null;

  return (
    <div className="page">
      <div className="topbar flex-wrap">
        <div>
          <h1 className="flex items-center gap-2">
            <Headset className="h-5 w-5" /> Support
          </h1>
          <p className="text-sm text-muted-foreground">
            {waiting > 0
              ? `${waiting} conversation${waiting === 1 ? '' : 's'} waiting on a reply.`
              : 'Nothing waiting on a reply.'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(['open', 'closed', 'all'] as const).map((s) => (
            <button
              key={s}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${
                status === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                setStatus(s);
                setOpenId('');
                setOpened(null);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className={`card min-w-0 ${openId ? 'hidden lg:block' : ''}`}>
          <h3 className="mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Inbox
          </h3>
          {loading ? (
            <LoadingBlock />
          ) : threads.length === 0 ? (
            <div className="empty">Nothing here.</div>
          ) : (
            <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
              {threads.map((t) => {
                const org = orgOf(t);
                return (
                  <button
                    key={t._id}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      openId === t._id ? 'border-primary bg-secondary' : 'border-border hover:bg-muted'
                    }`}
                    onClick={() => openThread(t._id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {org?.name || 'A shop'}
                      </span>
                      {t.unreadForPlatform > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                          {t.unreadForPlatform}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs font-medium">{t.subject}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t.lastMessageFrom === 'platform' && <strong>You: </strong>}
                      {t.lastMessagePreview}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {when(t.lastMessageAt)}
                      {org?.plan && <span className="pill">{org.plan}</span>}
                      {t.status === 'closed' && <span className="pill completed">closed</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={`card min-w-0 ${openId ? '' : 'hidden lg:block'}`}>
          {!current ? (
            <div className="empty">Pick a conversation.</div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border pb-2">
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
                  onClick={() => {
                    setOpenId('');
                    setOpened(null);
                  }}
                  aria-label="Back to the inbox"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-0 truncate">{current.subject}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    {currentOrg && (
                      <Link to={`/shops/${currentOrg._id}`} className="inline-flex items-center gap-1 hover:underline">
                        <Building2 className="h-3 w-3" /> {currentOrg.name}
                      </Link>
                    )}
                    {opener && (
                      <span className="inline-flex items-center gap-1">
                        {opener.name}
                        {opener.phone && (
                          <a href={`tel:${opener.phone}`} className="inline-flex items-center gap-1 hover:underline">
                            <Phone className="h-3 w-3" /> {opener.phone}
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {canReply &&
                  (current.status === 'open' ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      onClick={() => void setStatusOf('closed')}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Close
                    </button>
                  ) : (
                    <button
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      onClick={() => void setStatusOf('open')}
                    >
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </button>
                  ))}
              </div>

              <div className="max-h-[55vh] min-h-[8rem] space-y-2 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m._id}
                    className={`max-w-[85%] rounded-lg p-2.5 text-sm ${
                      m.side === 'platform' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`mt-1 text-[11px] ${m.side === 'platform' ? 'opacity-80' : 'text-muted-foreground'}`}>
                      {m.authorName || (m.side === 'platform' ? 'Support' : 'Shop')} · {when(m.createdAt)}
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>

              {canReply ? (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <textarea
                    rows={1}
                    className="input min-h-10 resize-none"
                    value={reply}
                    maxLength={4000}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={current.status === 'closed' ? 'Reply to reopen this…' : 'Write a reply…'}
                    aria-label="Reply"
                  />
                  <button
                    className="btn h-10 shrink-0"
                    onClick={() => void send()}
                    disabled={sending || !reply.trim()}
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                  You can read these, but replying needs the “support.reply” permission.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
