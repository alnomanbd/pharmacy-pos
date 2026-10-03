import { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { settingsApi, type LoyaltySettings } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

const DEFAULTS: LoyaltySettings = { enabled: false, spendPerPoint: 100, pointValue: 1, minRedeem: 50, maxRedeemPercent: 50 };

/**
 * Loyalty points, in Settings.
 *
 * Four numbers and a switch, with the sentence they add up to written out
 * underneath — "৳1,000 spent earns 10 points, worth ৳10" — because a rate
 * typed as two fields is easy to get wrong by a factor of a hundred.
 */
export default function LoyaltyCard() {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number) => (lang === 'bn' ? bnNumerals(v.toLocaleString('en-IN')) : v.toLocaleString('en-IN'));
  const { toast } = useToast();
  const [form, setForm] = useState<LoyaltySettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((s) => setForm({ ...DEFAULTS, ...(s.loyalty ?? {}) }))
      .catch(() => undefined);
  }, []);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const s = await settingsApi.save({ loyalty: form });
      setForm({ ...DEFAULTS, ...(s.loyalty ?? {}) });
      toast(t('Saved.'));
    } catch (e: unknown) {
      toast((e as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!form) return null;
  const num = (k: keyof LoyaltySettings, label: string, hint: string, step = '1') => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t(label)}</span>
      <input
        className="input h-10 tabular-nums"
        type="number"
        min={0}
        step={step}
        value={String(form[k])}
        onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
      />
      <span className="mt-1 block text-[11px] text-muted-foreground">{t(hint)}</span>
    </label>
  );
  const example = 1000;
  const earned = form.spendPerPoint > 0 ? Math.floor(example / form.spendPerPoint) : 0;

  return (
    <section id="set-loyalty" className="card mb-0 scroll-mt-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
          <Star className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="mb-0">{t('Loyalty points')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Regulars earn points on what they pay and spend them as money off a later bill. A phone number at the till is all it takes.')}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {t('On')}
        </label>
      </div>

      {form.enabled && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {num('spendPerPoint', 'Taka for one point', 'What a customer pays to earn one point.')}
            {num('pointValue', 'One point is worth (৳)', 'Taka off the bill for each point spent.', '0.01')}
            {num('minRedeem', 'Fewest points to spend', 'Below this, points keep adding up.')}
            {num('maxRedeemPercent', 'Most of a bill points can pay (%)', 'So points never pay for a whole bill.')}
          </div>
          <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            ★ ৳{n(example)} {t('paid earns')} <strong>{n(earned)}</strong> {t('points, worth')} <strong>৳{n(Math.round(earned * form.pointValue * 100) / 100)}</strong>{' '}
            {t('on a later bill.')}
          </p>
        </>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn h-10" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
        </button>
      </div>
    </section>
  );
}
