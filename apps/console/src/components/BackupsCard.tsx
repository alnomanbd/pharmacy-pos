import { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Loader2, Play, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { platformApi, downloadBlob, type BackupState, type BackupFile } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import Modal from './Modal';
import { BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';

/**
 * The backups kept on this server, and the last run.
 *
 * The nightly one happens on its own; "Back up now" is for before something
 * risky — an upgrade, a bulk import. A download is every shop's books in one
 * file, so it asks for the two-step code each time. Putting a backup back is
 * not here on purpose: it rolls every shop back at once, and is done on the
 * server (docs/OPERATIONS.md).
 */

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** `2026-10-04_0200` → `4 Oct 2026, 2:00 AM`, in the server's time as the name was written. */
function when(stamp: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return stamp;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const hour = Number(h) % 12 || 12;
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${hour}:${mi} ${Number(h) < 12 ? 'AM' : 'PM'}`;
}

const OFFSITE: Record<string, string> = {
  ok: 'copied to Google Drive',
  failed: 'not copied off the server',
  off: 'kept on this server only',
  none: '',
};

export default function BackupsCard() {
  const { toast } = useToast();
  const perms = useAuthStore((s) => (s.user as { permissions?: string[] } | null)?.permissions ?? []);
  // No list is the owner, who holds everything.
  const canBackup = perms.length === 0 || perms.includes('system.backup');
  const [state, setState] = useState<BackupState | null>(null);
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState<BackupFile | null>(null);
  const [code, setCode] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await platformApi.backups());
    } catch {
      /* The System page still says what it can. */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While one is waiting or running, look again until it is done.
  const busy = state?.configured && (Boolean(state.pending) || state.last?.state === 'running');
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [busy, load]);

  const backupNow = async () => {
    setStarting(true);
    try {
      const r = await platformApi.backupNow();
      toast(r.alreadyQueued ? 'A backup is already on its way.' : 'Backup started. It takes a minute or two.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not start a backup.'), 'error');
    } finally {
      setStarting(false);
    }
  };

  const download = async () => {
    if (!asking) return;
    setDownloading(true);
    try {
      downloadBlob(await platformApi.downloadBackup(asking.name, code.trim()), asking.name);
      setAsking(null);
      setCode('');
    } catch (e) {
      toast(errorMessage(e, 'Could not download that backup.'), 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (!state) return null;

  const last = state.configured ? state.last : null;
  const LastIcon = !last || last.state === 'running' ? Loader2 : last.state === 'failed' ? XCircle : last.offsite === 'ok' ? CheckCircle2 : AlertTriangle;
  const lastCls =
    !last || last.state === 'running'
      ? 'animate-spin text-muted-foreground'
      : last.state === 'failed'
        ? 'text-destructive'
        : last.offsite === 'ok'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mb-0 flex flex-1 items-center gap-2">
          <Archive className="h-4 w-4" /> Backups
        </h3>
        {state.configured && canBackup && (
          <button className="btn btn-sm" onClick={() => void backupNow()} disabled={starting || Boolean(busy)}>
            {starting || busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {busy ? 'Backing up…' : 'Back up now'}
          </button>
        )}
      </div>

      {!state.configured ? (
        <p className="text-sm text-muted-foreground">
          Backups are not run by this server yet. Start the <code>backup</code> service in docker compose — see “Backups” in
          docs/OPERATIONS.md.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Every night on its own. This server keeps the last week; Google Drive keeps the month, encrypted.
          </p>

          {state.pending && last?.state !== 'running' && (
            <p className="mb-2 text-sm">Waiting to start — asked for by {state.pending.by || 'someone'} {lastSeen(state.pending.at)}.</p>
          )}

          {last && (
            <div className="mb-3 flex items-start gap-2 text-sm">
              <LastIcon className={`mt-0.5 h-4 w-4 shrink-0 ${lastCls}`} />
              <div className="min-w-0">
                {last.state === 'running' ? (
                  <span>Backing up now, started {lastSeen(last.startedAt)}.</span>
                ) : last.state === 'failed' ? (
                  <span>
                    The last backup failed {lastSeen(last.finishedAt)}: <span className="break-words">{last.error}</span>
                  </span>
                ) : (
                  <span>
                    Last backup {lastSeen(last.finishedAt)}
                    {last.reason === 'manual' && last.by ? `, asked for by ${last.by}` : ''}
                    {OFFSITE[last.offsite] ? ` — ${OFFSITE[last.offsite]}` : ''}.
                    {last.offsite === 'failed' && last.error && (
                      <span className="block break-words text-xs text-muted-foreground">{last.error}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {state.sets.length === 0 ? (
            <p className="text-sm text-muted-foreground">None kept on this server yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {state.sets.map((s) => (
                <div key={s.stamp} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <strong>{when(s.stamp)}</strong>{' '}
                    <span className="text-xs text-muted-foreground">
                      · database {s.database ? size(s.database.size) : 'missing'}
                      {s.uploads ? ` · files ${size(s.uploads.size)}` : ''}
                    </span>
                  </span>
                  {canBackup &&
                    [s.database, s.uploads].map(
                      (f) =>
                        f && (
                          <button key={f.name} className={BTN_OUTLINE} onClick={() => setAsking(f)}>
                            <Download className="h-3.5 w-3.5" /> {f.kind === 'database' ? 'Database' : 'Files'}
                          </button>
                        ),
                    )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {asking && (
        <Modal
          open
          onClose={() => {
            setAsking(null);
            setCode('');
          }}
          title="Download a backup"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setAsking(null)} disabled={downloading}>
                Cancel
              </button>
              <button className="btn" onClick={() => void download()} disabled={downloading || code.trim().length < 6}>
                {downloading && <Loader2 className="h-4 w-4 animate-spin" />} Download
              </button>
            </>
          }
        >
          <p className="mb-3 text-sm">
            <strong className="break-all">{asking.name}</strong> ({size(asking.size)}) holds{' '}
            {asking.kind === 'database' ? 'every shop’s books' : 'every shop’s logos and payment screenshots'}. Keep it somewhere
            only you can open, and delete it when you are done.
          </p>
          <label className="text-sm font-medium">
            The code from your authenticator app
            <input
              className="input mt-1"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={20}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim().length >= 6) void download();
              }}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
