import { useEffect, useState } from 'react';
import { BarChart3, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import api, { getData } from '@dawai/shared/api/client';
import { useToast } from '@dawai/shared/components/Toast';
import AddressFields, { type Address } from '@dawai/shared/components/AddressFields';
import { useT, useUiLang } from '../i18n/ui';
import { BRAND } from '../brand';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * Settings → Medicine figures: whether this shop is counted in the anonymous
 * picture of which medicines sell where. Said plainly — what is counted, what
 * never leaves — with the switch the Terms promise — and the district the
 * shop is counted in — the shop's address, division to street, from the lists.
 */
export default function DataSharingCard() {
  const t = useT();
  const bn = useUiLang() === 'bn';
  const { toast } = useToast();
  const [counted, setCounted] = useState<boolean | null>(null);
  const [address, setAddress] = useState<Address>({});
  const [saved, setSaved] = useState<Address>({});
  const [savingAddress, setSavingAddress] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getData<{ counted: boolean; address: Address }>(api.get('/shop/data-sharing'))
      .then((d) => {
        setCounted(d.counted);
        setAddress(d.address ?? {});
        setSaved(d.address ?? {});
      })
      .catch(() => undefined);
  }, []);

  const KEYS = ['district', 'upazila', 'street', 'area', 'postalCode'] as const;
  const dirty = KEYS.some((k) => (address[k] ?? '') !== (saved[k] ?? ''));

  const saveAddress = async () => {
    setSavingAddress(true);
    try {
      const body = Object.fromEntries(KEYS.map((k) => [k, (address[k] ?? '').trim()]));
      await getData(api.patch('/shop/data-sharing', { address: body }));
      setSaved({ ...address, ...body });
      setAddress({ ...address, ...body });
      toast(t('Address saved.'));
    } catch (err) {
      const msg = (err as { response?: { data?: { errors?: { fieldErrors?: Record<string, string[]> } } } }).response?.data?.errors?.fieldErrors?.address?.[0];
      toast(msg ? t(msg) : t('Could not save that.'), 'error');
    } finally {
      setSavingAddress(false);
    }
  };

  const set = async (v: boolean) => {
    if (
      !(await confirmAction(
        v
          ? {
              title: t('Count your shop in the medicine figures?'),
              message: t('From tonight, how much of each medicine your shop sells is added to the district figures — never your name, customers, prices or profit.'),
              confirmLabel: t('Count my shop'),
              icon: 'question',
            }
          : {
              title: t('Stop counting your shop?'),
              message: t('Switch it off and your shop stops being counted from tonight.'),
              confirmLabel: t('Stop counting it'),
              icon: 'question',
            },
      ))
    )
      return;
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
      <fieldset className="mt-4 border-t border-border pt-3">
        <legend className="flex items-center gap-1.5 pr-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t('Where your shop is')}
        </legend>
        <p className="mb-3 text-xs text-muted-foreground">{t('Counted by district. Not printed on bills — the receipt has its own address line.')}</p>
        <AddressFields bn={bn} idPrefix="set-addr" value={address} onChange={setAddress} />
        <div className="mt-3 flex justify-end">
          <button type="button" className="btn" disabled={!dirty || savingAddress} onClick={() => void saveAddress()}>
            {savingAddress && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('Save address')}
          </button>
        </div>
      </fieldset>
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
