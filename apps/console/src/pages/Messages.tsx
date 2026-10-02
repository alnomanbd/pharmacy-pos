import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, MessageSquareText, Search, Send, AlertTriangle } from 'lucide-react';
import { platformApi, type MessageLogRow } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Pager from '../components/Pager';
import { errorMessage, useDebounced } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';

/**
 * Every email and SMS the platform tried to send, and whether it went.
 *
 * The call this answers is "I never got the reset email". Search the address,
 * and the row says when it went, what it was, and what the provider said — or
 * that it failed, or that nothing is configured and it was only written to the
 * log. Email bodies are never kept (a reset link is a live credential), and SMS
 * text is kept with codes and links masked.
 */

const LIMIT = 50;

/** `passwordReset` → "Password reset", `remind.renewal` → "Remind renewal". */
const kindLabel = (k: string) => {
  if (!k) return '';
  const spaced = k.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export default function Messages() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q, 300);
  const [channel, setChannel] = useState(params.get('channel') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<MessageLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [failed24h, setFailed24h] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await platformApi.messages({ q: query || undefined, channel: channel || undefined, status: status || undefined, page, limit: LIMIT });
      setRows(res.data);
      setTotal(res.total);
      setFailed24h(res.failed24h);
    } catch (e) {
      toast(errorMessage(e, 'Could not load the message log.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [query, channel, status, page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // The filters live in the address too, so a link from a shop's page lands filtered.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (channel) next.set('channel', channel);
    if (status) next.set('status', status);
    setParams(next, { replace: true });
    setPage(1);
  }, [query, channel, status, setParams]);

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Send className="h-5 w-5" /> Messages
          </h1>
          <p className="text-sm text-muted-foreground">
            Every email and SMS sent to shops, and whether it went. Kept for 180 days.
          </p>
        </div>
        {failed24h > 0 && (
          <button className="pill cancelled inline-flex items-center gap-1" onClick={() => setStatus('failed')}>
            <AlertTriangle className="h-3.5 w-3.5" /> {failed24h} failed in the last day
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Email address, phone or subject"
            aria-label="Search"
          />
        </div>
        <select className="input w-auto" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
          <option value="">Email and SMS</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any result</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="logged">Only logged (not configured)</option>
        </select>
      </div>

      <div className="card mt-4">
        <h3 className="mb-3">
          {total.toLocaleString()} message{total === 1 ? '' : 's'}
        </h3>
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">Nothing matches.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((m) => {
              const shop = typeof m.organization === 'object' && m.organization ? m.organization : null;
              const logged = m.provider === 'log';
              return (
                <div key={m._id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground" title={m.channel}>
                    {m.channel === 'sms' ? <MessageSquareText className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-medium">{m.to}</span>
                      <span className={`pill ${m.status === 'failed' ? 'cancelled' : logged ? 'neutral' : 'completed'}`}>
                        {m.status === 'failed' ? 'failed' : logged ? 'logged only' : 'sent'}
                      </span>
                      {m.kind && <span className="pill">{kindLabel(m.kind)}</span>}
                    </div>
                    <div className="mt-0.5 break-words text-sm text-muted-foreground">{m.subject || m.body}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      <span>{lastSeen(m.createdAt)}</span>
                      {shop && (
                        <Link to={`/shops/${shop._id}`} className="hover:underline">
                          {shop.name}
                        </Link>
                      )}
                      <span>via {m.provider || 'unknown'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Pager page={page} total={total} limit={LIMIT} onPage={setPage} />
      </div>
    </div>
  );
}
