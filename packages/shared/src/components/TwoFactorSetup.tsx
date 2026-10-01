import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Copy, AlertTriangle } from 'lucide-react';
import { twoFactorApi } from '../api';
import { useToast } from './Toast';

/**
 * Turning on a second factor for your own account.
 *
 * Setup is two steps on purpose: a secret is issued, and it is only switched on
 * once a code generated from it has been read back. Enabling at the first step
 * is how somebody locks themselves out with a QR code they never actually
 * scanned.
 *
 * The recovery codes are shown exactly once, because only their hashes are kept.
 */
export default function TwoFactorSetup({ onEnabled }: { onEnabled?: () => void } = {}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    enabled: boolean;
    recoveryCodesLeft: number;
    required: boolean;
  } | null>(null);
  const [setup, setSetup] = useState<{ qrDataUrl: string; manualEntry: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const load = useCallback(() => {
    twoFactorApi
      .status()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!status) return null;

  const begin = async () => {
    setBusy(true);
    try {
      setSetup(await twoFactorApi.setup());
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not start setup.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await twoFactorApi.confirm(code);
      setRecoveryCodes(res.recoveryCodes);
      setSetup(null);
      setCode('');
      load();
      toast('Two-factor authentication is on.');
      /*
       * The operator console mounts this as a gate rather than as a settings
       * panel: until a second factor exists, the API refuses every other call.
       * This is how it learns it may let the operator through.
       */
      onEnabled?.();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'That code is not right.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await twoFactorApi.disable(code);
      setCode('');
      load();
      toast('Two-factor authentication is off.');
    } catch (e: any) {
      toast(e?.response?.data?.message || 'That code is not right.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 className="flex items-center gap-2">
        {status.enabled ? (
          <ShieldCheck className="h-4 w-4 text-primary" />
        ) : (
          <ShieldOff className="h-4 w-4 text-muted-foreground" />
        )}
        Two-factor authentication
        {status.enabled && <span className="pill completed">on</span>}
      </h3>

      {/* Shown once. They exist only as hashes from here on. */}
      {recoveryCodes && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-secondary p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> Save these recovery codes now
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each works once, if you lose your phone. They will not be shown again.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            onClick={() => {
              void navigator.clipboard?.writeText(recoveryCodes.join('\n'));
              toast('Recovery codes copied.');
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy all
          </button>
          <button
            className="btn btn-sm mt-3 w-full"
            onClick={() => setRecoveryCodes(null)}
          >
            I have saved them
          </button>
        </div>
      )}

      {!status.enabled && !setup && !recoveryCodes && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.required
              ? 'This account can suspend shops, export their records and edit the shared catalogue. It is worth a second factor.'
              : 'A code from your phone, in addition to your password.'}
          </p>
          <button className="btn mt-3" onClick={() => void begin()} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> Turn on
          </button>
        </>
      )}

      {setup && (
        <div className="mt-3">
          <p className="text-sm">
            Scan this with Google Authenticator, Authy or 1Password, then enter the code it shows.
          </p>
          <img
            src={setup.qrDataUrl}
            alt="Two-factor QR code"
            className="mt-2 h-44 w-44 rounded-lg border border-border bg-white p-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Cannot scan? Enter this by hand:{' '}
            <code className="font-mono text-foreground">{setup.manualEntry}</code>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="input w-40 font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoFocus
            />
            <button className="btn" onClick={() => void confirm()} disabled={busy || !code.trim()}>
              Confirm
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              onClick={() => setSetup(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status.enabled && !recoveryCodes && (
        <div className="mt-2">
          <p className="text-sm text-muted-foreground">
            {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? '' : 's'} left.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="input w-40 font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code to turn off"
              inputMode="numeric"
            />
            <button
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              onClick={() => void disable()}
              disabled={busy || !code.trim()}
            >
              <ShieldOff className="h-4 w-4" /> Turn off
            </button>
          </div>
          {/* Turning it off needs a code too — otherwise a stolen session removes
              the protection that session was secondary to. */}
        </div>
      )}
    </div>
  );
}
