import { useEffect, useState } from 'react';
import { BarChart3, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import api, { getData } from '@dawai/shared/api/client';
import { useToast } from '@dawai/shared/components/Toast';
import DistrictSelect from '@dawai/shared/components/DistrictSelect';
import { useT, useUiLang } from '../i18n/ui';
import { BRAND } from '../brand';

/**
 * Settings → Medicine figures: whether this shop is counted in the anonymous
 * picture of which medicines sell where. Said plainly — what is counted, what
 * never leaves — with the switch the Terms promise — and the district the
 * shop is counted in, picked from the list.
 */
export default function DataSharingCard() {
  const t = useT();
  const bn = useUiLang() === 'bn';
  const { toast } = useToast();
  const [counted, setCounted] = useState<boolean | null>(null);
  const [district, setDistrict] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getData<{ counted: boolean; district: string }>(api.get('/shop/data-sharing'))
      .then((d) => {
        setCounted(d.counted);
        setDistrict(d.district ?? '');
      })
      .catch(() => undefined);
  }, []);

  const pickDistrict = async (v: string) => {
    const was = district;
    setDistrict(v);
    try {
      await getData(api.patch('/shop/data-sharing', { district: v }));
      toast(t('District saved.'));
    } catch {
      setDistrict(was);
      toast(t('Could not save that.'), 'error');
    }
  };

  const set = async (v: boolean) => {
    setBusy(true);
    try {
      await getData(api.patch('/shop/data-sharing', { counted: v }));
      setCounted(v);
      toast(v ? t('Your shop is counted in the medicine figures again.') : t('Your shop is no longer counted, from tonight.'));
    } catch {
      toast(t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (counted === null) return null;
  return (
    <section id="set-figures" className="card mb-0 scroll-mt-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="mb-0">{t('Medicine figures')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('How much of each medicine sells, by district and week, counted across many shops together — so companies and the country know what people need.')}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          <input type="checkbox" className="h-4 w-4" checked={counted} disabled={busy} onChange={(e) => void set(e.target.checked)} />
          {t('Count my shop')}
        </label>
      </div>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-semibold">{t('Your shop’s district')}</span>
        <DistrictSelect bn={bn} className="input h-9 w-full sm:w-64" value={district} onChange={(v) => void pickDistrict(v)} aria-label={t('Your shop’s district')} />
      </label>
      <ul className="mt-3 space-y-1.5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          {t('Never your shop’s name, your customers, your prices or your profit.')}
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          {t('Every figure is made from at least five shops, so no single shop can be picked out.')}
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          {t('Switch it off and your shop stops being counted from tonight.')}{' '}
          <a href={`${BRAND.siteUrl}/en/legal/privacy/`} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
            {t('Privacy policy')}
          </a>
        </li>
      </ul>
    </section>
  );
}
