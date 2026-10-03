import { useEffect, useState } from 'react';
import { Calculator, Globe, Loader2, MessageCircle, MonitorPlay, Radio, Save, Tag } from 'lucide-react';
import { platformApi, type SiteSettings } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { errorMessage, useAccess } from '../lib/ui';

/**
 * The public website's business settings, in one place.
 *
 * Everything here is read by the website (and the checkout) from the API, so
 * a change shows on the site within a minute — no rebuild, no deploy. Any
 * operator can see it; only the platform owner can change it.
 */
export default function Website() {
  const { toast } = useToast();
  const access = useAccess();
  const owner = !!access?.isOwner;
  const [saved, setSaved] = useState<SiteSettings | null>(null);
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platformApi
      .siteSettings()
      .then((s) => {
        setSaved(s);
        setForm(s);
      })
      .catch((e) => toast(errorMessage(e, 'Could not load the website settings.'), 'error'));
  }, [toast]);

  if (!form || !saved) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setForm({ ...form, [k]: v });
  const setCalc = (k: keyof SiteSettings['calculator'], v: number) => setForm({ ...form, calculator: { ...form.calculator, [k]: v } });

  const save = async () => {
    setBusy(true);
    try {
      const next = await platformApi.saveSiteSettings({
        ...form,
        whatsapp: form.whatsapp ? `+${form.whatsapp.replace(/\D/g, '')}` : '',
      });
      setSaved(next);
      setForm(next);
      toast('Saved. The website shows it within a minute.');
    } catch (e) {
      toast(errorMessage(e, 'Could not save.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const digits = form.whatsapp.replace(/\D/g, '');

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Website
          </h1>
          <p className="text-sm text-muted-foreground">
            What the public website shows. Changes appear there within a minute.
            {!owner && ' Only the platform owner can change them.'}
          </p>
        </div>
        {owner && (
          <button type="button" className="btn h-10" disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
          </button>
        )}
      </div>

      <fieldset disabled={!owner} className="grid gap-4 lg:grid-cols-2">
        {/* ---- contact ---- */}
        <section className="card !mb-0">
          <h3 className="mb-1 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            The number behind the “Ask us” bubble on every page. Empty: the bubble opens the contact page.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input h-10 w-64 font-mono"
              inputMode="tel"
              placeholder="+8801XXXXXXXXX"
              value={digits ? `+${digits}` : form.whatsapp}
              onChange={(e) => set('whatsapp', e.target.value)}
              aria-label="WhatsApp number"
            />
            {digits && (
              <a className="text-sm font-semibold text-primary hover:underline" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
                Test it →
              </a>
            )}
          </div>
        </section>

        {/* ---- the yearly offer ---- */}
        <section className="card !mb-0">
          <h3 className="mb-1 flex items-center gap-2">
            <Tag className="h-4 w-4" /> Pay for a year
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Months free for every twelve paid at once — on the website’s pricing, the shop’s Subscription page and the checkout. 0 turns it off.
          </p>
          <div className="flex items-center gap-2">
            <input
              className="input h-10 w-24 tabular-nums"
              type="number"
              min={0}
              max={6}
              value={form.yearlyFreeMonths}
              onChange={(e) => set('yearlyFreeMonths', Math.max(0, Math.min(6, num(e.target.value))))}
              aria-label="Free months per year"
            />
            <span className="text-sm text-muted-foreground">
              {form.yearlyFreeMonths > 0
                ? `months free — a year costs ${12 - form.yearlyFreeMonths} months`
                : 'no yearly offer'}
            </span>
          </div>
        </section>

        {/* ---- live numbers ---- */}
        <section className="card !mb-0">
          <h3 className="mb-1 flex items-center gap-2">
            <Radio className="h-4 w-4" /> Live numbers
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            A band on the home page: shops on Dawai, bills rung up today, medicines in the list. Totals only — never one shop’s figures.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.showLiveStats} onChange={(e) => set('showLiveStats', e.target.checked)} />
            Show it on the website
          </label>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            Hide it until there are at least
            <input
              className="input h-9 w-24 tabular-nums"
              type="number"
              min={0}
              value={form.liveStatsMinShops}
              onChange={(e) => set('liveStatsMinShops', Math.max(0, num(e.target.value)))}
              aria-label="Minimum shops"
            />
            shops
          </label>
        </section>

        {/* ---- the demo shop ---- */}
        <section className="card !mb-0">
          <h3 className="mb-1 flex items-center gap-2">
            <MonitorPlay className="h-4 w-4" /> Try the demo
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            A button on the website that opens a real shop, read-only, with no sign-up. Visitors can look at everything and change nothing.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.demo.enabled} onChange={(e) => set('demo', { ...form.demo, enabled: e.target.checked })} />
            Offer the demo on the website
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">The account it opens (its shop is what visitors see)</span>
            <input
              className="input h-10 w-full font-mono"
              type="email"
              value={form.demo.email}
              onChange={(e) => set('demo', { ...form.demo, email: e.target.value })}
              aria-label="Demo account email"
            />
          </label>
        </section>

        {/* ---- the calculator ---- */}
        <section className="card !mb-0 lg:col-span-2">
          <h3 className="mb-1 flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Savings calculator
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            The assumptions behind “how much would Dawai save my shop”. The website states them beside the answer, so keep them honest.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['expiryLossPercent', 'Stock lost to expiry, on paper', '% of stock'],
                ['expirySavedPercent', 'Of that, saved by expiry alerts', '%'],
                ['bakiLossPercent', 'Baki never collected, on paper', '% of sales'],
                ['closeMinutesPaper', 'Closing the day, on paper', 'minutes'],
                ['closeMinutesDawai', 'Closing the day, with Dawai', 'minutes'],
              ] as const
            ).map(([k, label, unit]) => (
              <label key={k} className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
                <span className="flex items-center gap-2">
                  <input
                    className="input h-10 w-24 tabular-nums"
                    type="number"
                    min={0}
                    step="0.5"
                    value={form.calculator[k]}
                    onChange={(e) => setCalc(k, Math.max(0, num(e.target.value)))}
                    aria-label={label}
                  />
                  <span className="text-xs text-muted-foreground">{unit}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      </fieldset>
    </div>
  );
}
