import { useEffect, useState } from 'react';
import { Loader2, Smartphone, Zap } from 'lucide-react';
import { walletApi, type WalletSettings } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';

/**
 * bKash and Nagad at the counter, in Settings.
 *
 * The shop's numbers, which the POS shows with a QR for the customer to send
 * money to — and, for a shop with a bKash merchant account, the merchant API
 * keys that let the POS take the payment itself and see it arrive. The two
 * secrets are stored encrypted and never shown again; leave them empty to
 * keep what is saved.
 */
export default function WalletCard() {
  const t = useT();
  const { toast } = useToast();
  const [s, setS] = useState<WalletSettings | null>(null);
  const [form, setForm] = useState({ bkashNumber: '', nagadNumber: '', enabled: false, sandbox: false, appKey: '', username: '', appSecret: '', password: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    walletApi
      .get()
      .then((w) => {
        setS(w);
        setForm({ bkashNumber: w.bkashNumber, nagadNumber: w.nagadNumber, enabled: w.bkashApi.enabled, sandbox: w.bkashApi.sandbox, appKey: w.bkashApi.appKey, username: w.bkashApi.username, appSecret: '', password: '' });
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const w = await walletApi.save({
        bkashNumber: form.bkashNumber,
        nagadNumber: form.nagadNumber,
        bkashApi: {
          enabled: form.enabled,
          sandbox: form.sandbox,
          appKey: form.appKey,
          username: form.username,
          ...(form.appSecret ? { appSecret: form.appSecret } : {}),
          ...(form.password ? { password: form.password } : {}),
        },
      });
      setS(w);
      setForm((f) => ({ ...f, appSecret: '', password: '' }));
      toast(t('Saved.'));
    } catch {
      toast(t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!s) return null;
  return (
    <section id="set-wallets" className="card mb-0 scroll-mt-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pink-500/10 text-pink-600">
          <Smartphone className="h-5 w-5" />
        </span>
        <div>
          <h3 className="mb-0">{t('bKash & Nagad')}</h3>
          <p className="text-sm text-muted-foreground">{t('The POS shows these with a QR and the amount, for the customer to send money to.')}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('bKash number')}</span>
          <input className="input h-10 font-mono" inputMode="tel" placeholder="01XXXXXXXXX" value={form.bkashNumber} onChange={(e) => setForm({ ...form, bkashNumber: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('Nagad number')}</span>
          <input className="input h-10 font-mono" inputMode="tel" placeholder="01XXXXXXXXX" value={form.nagadNumber} onChange={(e) => setForm({ ...form, nagadNumber: e.target.value })} />
        </label>
      </div>

      {/* ---- the merchant account ---- */}
      <div className="mt-4 rounded-xl border border-border p-3">
        <label className="flex items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          <Zap className="h-4 w-4 text-pink-600" /> {t('Automatic bKash (merchant account)')}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('With your bKash merchant API keys, the customer pays by scanning the POS screen and the bill fills itself in — no transaction id to type.')}
        </p>
        {form.enabled && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['appKey', 'App key', false],
                ['appSecret', 'App secret', true],
                ['username', 'Username', false],
                ['password', 'Password', true],
              ] as const
            ).map(([k, label, secret]) => (
              <label key={k} className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t(label)}</span>
                <input
                  className="input h-10 font-mono"
                  type={secret ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder={secret && (k === 'appSecret' ? s.bkashApi.hasSecret : s.bkashApi.hasPassword) ? t('Saved — leave empty to keep') : ''}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={form.sandbox} onChange={(e) => setForm({ ...form, sandbox: e.target.checked })} />
              {t('Sandbox (bKash’s test system — no real money)')}
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn h-10" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
        </button>
      </div>
    </section>
  );
}
