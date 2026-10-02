import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Headset, MessageSquare, Send, Plus, ArrowLeft, CheckCircle2, X } from 'lucide-react';
import { supportApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import type { SupportMessage, SupportThread } from '@dawai/shared/types';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Talking to the Dawai team.
 *
 * The alternative is a phone number, and a phone number means the answer lives
 * only in somebody's memory: the next person to pick up starts from nothing, and
 * nobody can check what was promised. A thread is the same conversation, kept.
 *
 * Reachable by every role and while the trial has lapsed, which is exactly when
 * it is most needed — see `shopSupport.routes.ts` on the API.
 *
 * There is no socket server, so an open conversation is re-read every few
 * seconds while the tab is visible, and the list a little less often.
 */

const THREAD_POLL_MS = 8_000;
const LIST_POLL_MS = 30_000;

/**
 * Appending one message, once.
 *
 * A poll can land between the send and its response, so the same message
 * arrives from both. Both writers go through here, and the id decides.
 */
const append = (prev: SupportMessage[], m: SupportMessage) =>
  prev.some((x) => x._id === m._id) ? prev : [...prev, m];

/** Only while somebody is looking: a background tab has nothing to show. */
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export default function Support() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [openId, setOpenId] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const [reply, setReply] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const n = useCallback((s: string) => (lang === 'bn' ? bnNumerals(s) : s), [lang]);

  /** "3:45 PM" today, "2 Oct, 3:45 PM" before that. */
  const when = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
      const today = new Date().toDateString() === d.toDateString();
      const out = today
        ? time
        : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
      return n(out);
    },
    [n],
  );

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await supportApi.threads());
    } catch (e: any) {
      toast(e?.response?.data?.message || t('Could not load your messages.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  const readThread = useCallback(
    async (id: string, quiet = false) => {
      try {
        const res = await supportApi.thread(id);
        setMessages(res.messages);
        // Reading clears this shop's unread count, not the support team's.
        setThreads((prev) => prev.map((x) => (x._id === id ? { ...x, ...res.thread, unreadForShop: 0 } : x)));
      } catch (e: any) {
        if (!quiet) toast(e?.response?.data?.message || t('Could not open that conversation.'), 'error');
      }
    },
    [toast, t],
  );

  const openThread = (id: string) => {
    setOpenId(id);
    setMessages([]);
    seen.current = 0;
    void readThread(id);
  };

  useEffect(() => {
    void loadThreads();
    const tick = window.setInterval(() => visible() && void loadThreads(), LIST_POLL_MS);
    return () => window.clearInterval(tick);
  }, [loadThreads]);

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

  const start = async () => {
    if (!draft.subject.trim() || !draft.body.trim()) {
      toast(t('A subject and a message, and we can help.'), 'error');
      return;
    }
    setSending(true);
    try {
      const res = await supportApi.open({ subject: draft.subject.trim(), body: draft.body.trim() });
      toast(t('Sent — we will reply here.'));
      setDraft({ subject: '', body: '' });
      setComposing(false);
      await loadThreads();
      openThread(res.thread._id);
    } catch (e: any) {
      toast(e?.response?.data?.message || t('Could not send that.'), 'error');
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (!reply.trim() || !openId) return;
    setSending(true);
    try {
      const message = await supportApi.reply(openId, reply.trim());
      setMessages((prev) => append(prev, message));
      setReply('');
      await loadThreads();
    } catch (e: any) {
      toast(e?.response?.data?.message || t('Could not send that.'), 'error');
    } finally {
      setSending(false);
    }
  };

  const current = threads.find((x) => x._id === openId);

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Headset className="h-5 w-5" /> {t('Support')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Ask the Dawai team anything about your shop or your account. We reply here.')}{' '}
            <Link to="/help" className="font-semibold text-primary hover:underline">
              {t('Or look it up in Help.')}
            </Link>
          </p>
        </div>
        {!composing && (
          <button type="button" className="btn" onClick={() => setComposing(true)}>
            <Plus className="h-4 w-4" /> {t('New message')}
          </button>
        )}
      </div>

      {composing && (
        <div className="card border-primary/40">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="mb-0">{t('What can we help with?')}</h3>
            <button
              type="button"
              onClick={() => setComposing(false)}
              aria-label={t('Cancel')}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            className="input h-10"
            value={draft.subject}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder={t('Subject — e.g. Payment not showing')}
            aria-label={t('Subject')}
          />
          <textarea
            rows={4}
            className="input mt-2"
            value={draft.body}
            maxLength={4000}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder={t('Tell us what is happening. The more detail, the fewer rounds.')}
            aria-label={t('Message')}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void start()} disabled={sending}>
              <Send className="h-4 w-4" /> {t('Send')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              onClick={() => setComposing(false)}
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* One pane on a phone: the list, or the conversation. Two side by side
          on a desktop, which is how a conversation list is actually read. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={`card mb-0 min-w-0 ${openId ? 'hidden lg:block' : ''}`}>
          <h3 className="mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> {t('Conversations')}
          </h3>
          {loading ? (
            <LoadingBlock />
          ) : threads.length === 0 ? (
            <div className="empty">{t('Nothing yet. Start one with New message.')}</div>
          ) : (
            <div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
              {threads.map((x) => (
                <button
                  type="button"
                  key={x._id}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    openId === x._id ? 'border-primary bg-secondary' : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => openThread(x._id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{x.subject}</span>
                    {x.unreadForShop > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                        {n(String(x.unreadForShop))}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {x.lastMessageFrom === 'platform' && <strong>{t('Support:')} </strong>}
                    {x.lastMessagePreview}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {when(x.lastMessageAt)}
                    {x.status === 'closed' && <span className="pill completed">{t('closed')}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`card mb-0 min-w-0 ${openId ? '' : 'hidden lg:block'}`}>
          {!current ? (
            <div className="empty">{t('Pick a conversation, or start a new one.')}</div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
                  onClick={() => setOpenId('')}
                  aria-label={t('Back')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h3 className="mb-0 min-w-0 flex-1 truncate">{current.subject}</h3>
                {current.status === 'closed' && (
                  <span className="pill completed inline-flex shrink-0 items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {t('closed')}
                  </span>
                )}
              </div>

              <div className="max-h-[55vh] min-h-[8rem] space-y-2 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m._id}
                    className={`max-w-[85%] rounded-lg p-2.5 text-sm ${
                      m.side === 'shop' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`mt-1 text-[11px] ${m.side === 'shop' ? 'opacity-80' : 'text-muted-foreground'}`}>
                      {m.side === 'shop' ? m.authorName || t('You') : t('Dawai support')} · {when(m.createdAt)}
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>

              {/* A closed thread still takes a reply — answering reopens it,
                  because a shop writing again has not finished. */}
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
                  placeholder={current.status === 'closed' ? t('Reply to reopen this…') : t('Write a reply…')}
                  aria-label={t('Reply')}
                />
                <button
                  type="button"
                  className="btn h-10 shrink-0"
                  onClick={() => void send()}
                  disabled={sending || !reply.trim()}
                  aria-label={t('Send')}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
