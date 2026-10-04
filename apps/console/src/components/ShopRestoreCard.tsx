import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RotateCcw, Undo2, X } from 'lucide-react';
import { platformApi, type BackupState, type ShopRestoreState } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import Modal from './Modal';
import { BTN_DANGER, BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import { stampLabel, stampOf } from '../lib/backups';

/**
 * Putting this shop back as it was in a nightly backup.
 *
 * Three steps, each one visible: load a backup aside (the backup service does
 * it, a minute or two), see what would change for this shop, then restore with
 * the shop's name and a two-step code. Logins and the subscription are never
 * touched. The shop as it was just before is kept for a week, and "Undo" puts
 * that back the same way.
 */

type Confirming = { kind: 'restore' } | { kind: 'undo'; snapshot: string; at: string };

const dateTime = (v: string) =>
  new Date(v)
    .toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s(am|pm)$/i, (m) => m.toUpperCase());

export default function ShopRestoreCard({ shopId, onRestored }: { shopId: string; onRestored: () => void }) {
  const { toast } = useToast();
  const [state, setState] = useState<ShopRestoreState | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([platformApi.shopRestore(shopId), platformApi.backups() as Promise<BackupState>]);
      setState(s);
      const names = b.configured ? b.sets.map((x) => x.database?.name).filter((n): n is string => Boolean(n)) : [];
      setBackups(names);
      setChosen((c) => c || names[0] || '');
    } catch {
      setState(null);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = state?.stage?.state === 'queued' || state?.stage?.state === 'running';
  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [loading, load]);

  const run = async (what: () => Promise<unknown>, done: string, failed: string) => {
    setBusy(true);
    try {
      await what();
      toast(done);
      await load();
      return true;
    } catch (e) {
      toast(errorMessage(e, failed), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const closeConfirm = () => {
    setConfirming(null);
    setTyped('');
    setCode('');
  };

  const confirm = async () => {
    if (!confirming) return;
    const ok =
      confirming.kind === 'restore'
        ? await run(() => platformApi.restoreShop(shopId, typed, code.trim()), 'Shop restored from the backup.', 'Could not restore the shop.')
        : await run(
            () => platformApi.undoShopRestore(shopId, confirming.snapshot, typed, code.trim()),
            'Shop put back as it was.',
            'Could not put the shop back.',
          );
    if (ok) {
      closeConfirm();
      onRestored();
    }
  };

  // Not set up on this server, or not allowed: nothing to show.
  if (!state?.configured) return null;

  const stage = state.stage;
  const changed = (state.rows ?? []).filter((r) => r.now !== r.backup);
  const loadedLabel = stage ? stampLabel(stampOf(stage.archive)) : '';

  return (
    <div className="card">
      <h3 className="mb-1 flex items-center gap-2">
        <History className="h-4 w-4" /> Restore from a backup
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Puts this shop’s stock, bills, khata and accounts back as they were on a night. Staff logins and the subscription are not
        changed, and other shops are not touched.
      </p>

      {/* 1. Load a backup aside. */}
      {(!stage || stage.state === 'failed') && (
        <>
          {stage?.state === 'failed' && <p className="mb-2 break-words text-sm text-destructive">Loading failed: {stage.error}</p>}
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups on this server yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-auto min-w-0 flex-1 basis-48" value={chosen} onChange={(e) => setChosen(e.target.value)}>
                {backups.map((n) => (
                  <option key={n} value={n}>
                    {stampLabel(stampOf(n))}
                  </option>
                ))}
              </select>
              <button
                className={BTN_OUTLINE}
                disabled={busy || !chosen}
                onClick={() => void run(() => platformApi.loadBackupForRestore(chosen), 'Loading the backup…', 'Could not load that backup.')}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Load this backup
              </button>
            </div>
          )}
        </>
      )}

      {loading && stage && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the backup of {loadedLabel}
          {stage.by ? `, for ${stage.by}` : ''} — a minute or two.
        </p>
      )}

      {/* 2. What would change, and 3. restore. */}
      {stage?.state === 'ready' && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              Loaded: <strong>{loadedLabel}</strong>
              {state.lastBillInBackup && (
                <span className="block text-xs text-muted-foreground">Last bill in it {dateTime(state.lastBillInBackup)}</span>
              )}
            </span>
            <button
              className={BTN_OUTLINE}
              disabled={busy}
              onClick={() => void run(() => platformApi.clearLoadedBackup(), 'Cleared.', 'Could not clear it.')}
              title="Another night, or done here"
            >
              <X className="h-3.5 w-3.5" /> Choose another
            </button>
          </div>
          {changed.length === 0 ? (
            <p className="text-sm text-muted-foreground">This shop has nothing different from that backup.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">What</th>
                      <th className="py-1 pr-2 text-right font-medium">Now</th>
                      <th className="py-1 text-right font-medium">After restore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {changed.map((r) => (
                      <tr key={r.key}>
                        <td className="py-1.5 pr-2">{r.label}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{r.now.toLocaleString()}</td>
                        <td className={`py-1.5 text-right font-semibold tabular-nums ${r.backup < r.now ? 'text-destructive' : ''}`}>
                          {r.backup.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <button className={BTN_DANGER} disabled={busy} onClick={() => setConfirming({ kind: 'restore' })}>
                  <RotateCcw className="h-4 w-4" /> Restore this shop
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* The way back. */}
      {(state.snapshots ?? []).length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="label">Before each restore</div>
          <div className="divide-y divide-border">
            {state.snapshots!.slice(0, 5).map((s) => (
              <div key={s.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  As it was {dateTime(s.at)} <span className="text-xs text-muted-foreground">· {lastSeen(s.at)}</span>
                </span>
                <button className={BTN_OUTLINE} disabled={busy} onClick={() => setConfirming({ kind: 'undo', snapshot: s.name, at: s.at })}>
                  <Undo2 className="h-3.5 w-3.5" /> Put this back
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirming && (
        <Modal
          open
          onClose={closeConfirm}
          title={confirming.kind === 'restore' ? 'Restore this shop' : 'Put the shop back'}
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={closeConfirm} disabled={busy}>
                Cancel
              </button>
              <button
                className={BTN_DANGER}
                onClick={() => void confirm()}
                disabled={busy || typed.trim() !== state.shop || code.trim().length < 6}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirming.kind === 'restore' ? 'Restore' : 'Put it back'}
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            {confirming.kind === 'restore' ? (
              <p>
                Everything <strong>{state.shop}</strong> did after the backup of <strong>{loadedLabel}</strong> — bills, stock, khata,
                expenses — is replaced by what the backup holds.
              </p>
            ) : (
              <p>
                <strong>{state.shop}</strong> goes back to how it was at <strong>{dateTime(confirming.at)}</strong>, just before that
                restore. Anything done since is replaced.
              </p>
            )}
            <p className="rounded-md bg-muted p-2 text-xs">
              Ask the shop to stop billing until this is done — it takes under a minute. The shop as it is now is kept for a week, so
              this can be undone.
            </p>
            <label className="block font-medium">
              Type the shop’s name: <span className="select-all font-semibold">{state.shop}</span>
              <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
            <label className="block font-medium">
              The code from your authenticator app
              <input
                className="input mt-1"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={20}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
