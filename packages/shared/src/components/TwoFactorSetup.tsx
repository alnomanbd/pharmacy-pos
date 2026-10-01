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
 *
 * Where it is *required* (operators), there is no plain "turn off": the API
 * would send them straight back to setup. "Move to a new phone" turns it off
 * and starts setup again in one go, which is what anyone pressing it wants.
 *
 * `t` and `n` are the app's own words and digits, as in `SessionList`: the shop
 * hands in its Bangla; an app that passes nothing gets the English.
 */
type Say = (text: string) => string;
const same: Say = (text) => text;

export default function TwoFactorSetup({
  onEnabled,
  t = same,
  n = same,
}: { onEnabled?: () => void; t?: Say; n?: Say } = {}) {
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
      toast(e?.response?.data?.message || t('Could not start setup.'), 'error');
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
      toast(t('Two-factor authentication is on.'));
      /*
       * The operator console mounts this as a gate rather than as a settings
       * panel: until a second factor exists, the API refuses every other call.
       * This is how it learns it may let the operator through.
       */
      onEnabled?.();
    } catch (e: any) {
      toast(e?.response?.data?.message || t('That code is not right.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await twoFactorApi.disable(code);
      setCode('');
      if (status.required) {
        // Straight back into setup with a fresh secret, for the new phone.
        setStatus({ ...status, enabled: false });
        setSetup(await twoFactorApi.setup());
        toast(t('Scan the new code with your new phone.'));
        return;
      }
      load();
      toast(t('Two-factor authentication is off.'));
    } catch (e: any) {
      toast(e?.response?.data?.message || t('That code is not right.'), 'error');
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
        {t('Two-factor authentication')}
        {status.enabled && <span className="pill completed">{t('on')}</span>}
      </h3>

      {/* Shown once. They exist only as hashes from here on. */}
      {recoveryCodes && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-secondary p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> {t('Save these recovery codes now')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Each works once, if you lose your phone. They will not be shown again.')}
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
              toast(t('Recovery codes copied.'));
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {t('Copy all')}
          </button>
          <button
            className="btn btn-sm mt-3 w-full"
            onClick={() => setRecoveryCodes(null)}
          >
            {t('I have saved them')}
          </button>
        </div>
      )}

      {!status.enabled && !setup && !recoveryCodes && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.required
              ? t('This account can suspend shops, export their records and edit the shared catalogue. It needs a second factor.')
              : t('A code from your phone, in addition to your password.')}
          </p>
          <button className="btn mt-3" onClick={() => void begin()} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> {t('Turn on')}
          </button>
        </>
      )}

      {setup && (
        <div className="mt-3">
          <p className="text-sm">
            {t('Scan this with Google Authenticator, Authy or 1Password, then enter the code it shows.')}
          </p>
          <img
            src={setup.qrDataUrl}
            alt={t('Two-factor QR code')}
            className="mt-2 h-44 w-44 rounded-lg border border-border bg-white p-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t('Cannot scan? Enter this by hand:')}{' '}
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
              {t('Confirm')}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              onClick={() => setSetup(null)}
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      {status.enabled && !recoveryCodes && (
        <div className="mt-2">
          <p className="text-sm text-muted-foreground">
            {n(String(status.recoveryCodesLeft))}{' '}
            {t(status.recoveryCodesLeft === 1 ? 'recovery code left.' : 'recovery codes left.')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="input w-40 font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('Code from your app')}
              inputMode="numeric"
            />
            <button
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              onClick={() => void disable()}
              disabled={busy || !code.trim()}
            >
              <ShieldOff className="h-4 w-4" /> {status.required ? t('Move to a new phone') : t('Turn off')}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {status.required
              ? t('Enter a code from your current app, then scan a new QR code.')
              : t('Enter a code from your app to turn it off.')}
          </p>
          {/* Turning it off needs a code too — otherwise a stolen session removes
              the protection that session was secondary to. */}
        </div>
      )}
    </div>
  );
}
