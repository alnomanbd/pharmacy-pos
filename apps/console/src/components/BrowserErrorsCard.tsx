import { useCallback, useEffect, useState } from 'react';
import { Bug, ChevronDown, Trash2 } from 'lucide-react';
import { platformApi, type ClientErrorRow } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { BTN_OUTLINE, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';

/**
 * What has broken in browsers — the shop app's and this console's.
 *
 * Grouped by fault, newest first, with how many times and since when. Open a
 * row for the stack. Clearing one says "fixed, tell me if it comes back": the
 * next occurrence arrives as a new row with a count of one.
 */
export default function BrowserErrorsCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ClientErrorRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await platformApi.clientErrors()).rows);
    } catch (e) {
      toast(errorMessage(e, 'Could not load the browser errors.'), 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = async (id?: string) => {
    try {
      await platformApi.clearClientError(id);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not clear that.'), 'error');
    }
  };

  if (!rows) return null;
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="!mb-0 flex items-center gap-2">
          <Bug className="h-4 w-4" /> Browser errors
          <span className="text-xs font-normal text-muted-foreground">last 30 days</span>
        </h3>
        {rows.length > 0 && (
          <button className={BTN_OUTLINE} onClick={() => void clear()}>
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has broken in a shop’s or the console’s browser.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  aria-expanded={open === r.id}
                >
                  <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${open === r.id ? '' : '-rotate-90'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.message}</span>
                    <span className="block text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{r.app}</span> {r.path || '/'} · {r.count}× · last{' '}
                      {lastSeen(r.lastAt)} · first {lastSeen(r.firstAt)}
                      {r.release ? ` · ${r.release}` : ''}
                    </span>
                  </span>
                </button>
                <button type="button" title="Clear — it comes back as new if it happens again" onClick={() => void clear(r.id)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {open === r.id && (
                <div className="mt-2 pl-6">
                  <p className="mb-1 text-xs text-muted-foreground">{r.browser}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">{r.stack || 'No stack.'}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
