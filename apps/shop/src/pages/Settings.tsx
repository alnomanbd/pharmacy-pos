import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings as SettingsIcon,
  Loader2,
  Printer,
  FileText,
  Store,
  ReceiptText,
  ScanLine,
  Percent,
  RotateCcw,
  Save,
  Check,
  Palette,
  Image as ImageIcon,
  StickyNote,
  Ruler,
  ShoppingBag,
  Smartphone,
  Star,
  BellRing,
  BarChart3,
} from 'lucide-react';
import { settingsApi, type ShopSettings, type Sale } from '../api';
import SheetPreview, { openAlignmentPage } from '../components/SheetPreview';
import LetterheadPicture from '../components/LetterheadPicture';
import OrderLinkCard from '../components/OrderLinkCard';
import WalletCard from '../components/WalletCard';
import LoyaltyCard from '../components/LoyaltyCard';
import PhoneAlertsCard from '../components/PhoneAlertsCard';
import DataSharingCard from '../components/DataSharingCard';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Receipt from '../components/Receipt';
import { confirmAction } from '@dawai/shared/lib/confirm';
import { useT, useUiLang } from '../i18n/ui';

/**
 * The shop's own paper.
 *
 * Everything here ends up on a piece of paper or at the counter: who the shop
 * is, how wide the roll is, what the POS does when a bill is saved, the A4
 * letterhead, and the VAT line. The preview beside the form is the actual
 * receipt component at the actual width, so the shop sees the thing itself
 * rather than a picture of it — and a header that overflows 58mm is visible
 * here rather than on the fiftieth bill of the evening.
 *
 * Nothing saves on its own. A bar rises when something has changed and stays
 * until it is saved or put back, because a setting that half-applied while
 * somebody was still typing the address is a bill printed with half an address.
 */

const SAMPLE: Sale = {
  _id: 'sample',
  billNo: '13-0042',
  soldAt: new Date().toISOString(),
  salesmanName: 'Rakib Hasan',
  customerName: '',
  lines: [
    { name: 'Napa 500mg', batchNo: 'B-7741', qtyPieces: 10, pricePerPiece: 1.2, discount: 0, lineTotal: 12 },
    { name: 'Seclo 20mg', batchNo: 'S-2210', qtyPieces: 14, pricePerPiece: 7, discount: 0, lineTotal: 98 },
  ],
  subTotal: 110,
  discount: 10,
  total: 100,
  payments: [{ method: 'cash', amount: 100 }],
  paid: 100,
  due: 0,
  status: 'completed',
};

const DEFAULT_INVOICE: NonNullable<ShopSettings['invoice']> = {
  paper: 'A4',
  accent: '#065f46',
  showLogo: true,
  showQr: true,
  showBatch: true,
  signatureLabel: 'For the shop',
  terms: '',
};

/* A few letterhead colours that print well on a laser and on an inkjet. */
const ACCENTS = ['#065f46', '#1e40af', '#6d28d9', '#9f1239', '#b45309', '#0f172a'];

const SECTIONS = [
  { id: 'shop', label: 'The shop', icon: Store },
  { id: 'paper', label: 'Receipt paper', icon: ReceiptText },
  { id: 'counter', label: 'At the counter', icon: ScanLine },
  { id: 'sheet', label: 'The A4 sheet', icon: FileText },
  { id: 'orders', label: 'Online orders', icon: ShoppingBag },
  { id: 'wallets', label: 'bKash & Nagad', icon: Smartphone },
  { id: 'loyalty', label: 'Loyalty points', icon: Star },
  { id: 'alerts', label: 'Phone & alerts', icon: BellRing },
  { id: 'figures', label: 'Medicine figures', icon: BarChart3 },
  { id: 'vat', label: 'VAT', icon: Percent },
] as const;

/** What is sent back. Everything the page edits, and nothing it only reads. */
const payloadOf = (f: ShopSettings) => ({
  shopName: f.shopName,
  shopNameBn: f.shopNameBn,
  address: f.address,
  phone: f.phone,
  drugLicenceNo: f.drugLicenceNo,
  footer: f.footer,
  footerBn: f.footerBn,
  paperSize: f.paperSize,
  paperWidthMm: f.paperWidthMm,
  autoPrint: f.autoPrint,
  copies: f.copies,
  showSavings: f.showSavings,
  printBangla: f.printBangla,
  confirmSale: f.confirmSale,
  invoice: f.invoice,
  /* These three were edited on this page and never sent — the VAT card
     looked like it saved and did not. */
  vatPercent: f.vatPercent,
  vatBin: f.vatBin,
  vatOnMedicine: f.vatOnMedicine,
});

export default function Settings() {
  const t = useT();
  const { toast } = useToast();
  const [form, setForm] = useState<ShopSettings | null>(null);
  /* What the server last said, to tell a change from a no-op and to put back. */
  const [saved, setSaved] = useState<ShopSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  /* Which paper the panel beside the form shows: it follows the card being edited. */
  const [view, setView] = useState<'receipt' | 'sheet'>('receipt');
  /* Which pictures are stored, and a count that redraws the sheet when one changes. */
  const [pics, setPics] = useState({ logo: false, header: false, footer: false });
  const [picVersion, setPicVersion] = useState(0);
  const picChanged = (slot: keyof typeof pics, present: boolean) => {
    setPics((p) => ({ ...p, [slot]: present }));
    setPicVersion((v) => v + 1);
  };
  const uiLang = useUiLang();
  const [aligning, setAligning] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await settingsApi.get();
      setForm(s);
      setSaved(s);
      setPics({ logo: !!s.logo, header: !!s.letterheadHeader, footer: !!s.letterheadFooter });
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not load your settings.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => !!form && !!saved && JSON.stringify(payloadOf(form)) !== JSON.stringify(payloadOf(saved)),
    [form, saved],
  );

  /* Leaving with the bar still up asks first — the browser's own question. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  /*
   * The A4 sheet's own settings, which arrive as a sub-object.
   *
   * Defaulted here rather than guarded at every field: a shop whose record
   * predates this screen has no `invoice` at all.
   */
  const invoice: NonNullable<ShopSettings['invoice']> = form?.invoice ?? DEFAULT_INVOICE;
  const setInvoice = <K extends keyof NonNullable<ShopSettings['invoice']>>(
    key: K,
    value: NonNullable<ShopSettings['invoice']>[K],
  ) => setForm((f) => (f ? { ...f, invoice: { ...invoice, [key]: value } } : f));

  /* On a phone the panel is below the form, so asking for it goes there too. */
  const showSheet = () => {
    setView('sheet');
    window.setTimeout(() => document.getElementById('paper-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const next = await settingsApi.save(payloadOf(form));
      setForm(next);
      setSaved(next);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      toast(t('Saved. The next bill prints like this.'));
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not save that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <LoadingBlock />;

  const go = (id: string) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page pb-24">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" /> {t('Settings')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('What is printed on your bills, the size of your paper, and how the counter behaves.')}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost h-9" onClick={() => setPrinting(true)}>
            <Printer className="h-4 w-4" /> {t('Test print')}
          </button>
          <button type="button" className="btn h-9" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : justSaved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {justSaved ? t('Saved') : t('Save')}
          </button>
        </div>
      </div>

      {/* On a narrower screen the sections are a row of chips above the form. */}
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 xl:hidden" aria-label={t('Sections')}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-card hover:text-foreground"
          >
            <s.icon className="h-3.5 w-3.5" /> {t(s.label)}
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <nav className="sticky top-0 hidden flex-col gap-0.5 xl:flex" aria-label={t('Sections')}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <s.icon className="h-4 w-4" /> {t(s.label)}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {/* ---- the shop ---- */}
          <Section
            id="shop"
            icon={Store}
            title={t('The shop')}
            sub={t('The top of every bill — who you are and where to find you.')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Shop name')} htmlFor="s-name">
                <input
                  id="s-name"
                  className="input h-10"
                  value={form.shopName}
                  onChange={(e) => set('shopName', e.target.value)}
                  placeholder="Bismillah Pharmacy"
                />
              </Field>
              <Field label={t('Shop name in Bangla')} htmlFor="s-name-bn">
                <input
                  id="s-name-bn"
                  className="input h-10"
                  value={form.shopNameBn ?? ''}
                  onChange={(e) => set('shopNameBn', e.target.value)}
                  placeholder="বিসমিল্লাহ ফার্মেসি"
                />
              </Field>
              <Field label={t('Address')} htmlFor="s-addr">
                <input
                  id="s-addr"
                  className="input h-10"
                  value={form.address ?? ''}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Mirpur 10, Dhaka"
                />
              </Field>
              <Field label={t('Phone')} htmlFor="s-phone">
                <input
                  id="s-phone"
                  className="input h-10"
                  inputMode="tel"
                  value={form.phone ?? ''}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
              <Field
                label={t('Drug licence no')}
                htmlFor="s-lic"
                hint={t('The one on your wall. Customers and inspectors both look for it.')}
              >
                <input
                  id="s-lic"
                  className="input h-10"
                  value={form.drugLicenceNo ?? ''}
                  onChange={(e) => set('drugLicenceNo', e.target.value)}
                  placeholder="DHA-1234"
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <Field label={t('Footer line')} htmlFor="s-foot" hint={t('The last line of the bill.')}>
                <input
                  id="s-foot"
                  className="input h-10"
                  value={form.footer ?? ''}
                  onChange={(e) => set('footer', e.target.value)}
                  placeholder="Thank you — get well soon"
                />
              </Field>
              <Field label={t('Footer in Bangla')} htmlFor="s-foot-bn">
                <input
                  id="s-foot-bn"
                  className="input h-10"
                  value={form.footerBn ?? ''}
                  onChange={(e) => set('footerBn', e.target.value)}
                  placeholder="আপনার সুস্থতা কামনা করি"
                />
              </Field>
            </div>
          </Section>

          {/* ---- the roll ---- */}
          <div className="contents" onFocusCapture={() => setView('receipt')} onPointerDownCapture={() => setView('receipt')}>
          <Section
            id="paper"
            icon={ReceiptText}
            title={t('Receipt paper')}
            sub={t('Thermal rolls come in two sizes. If a bill comes out with the right-hand column cut off, this is the setting that is wrong.')}
          >
            <div className="grid max-w-md grid-cols-3 gap-2">
              {(
                [
                  { key: '80', label: '80mm', hint: 'The usual counter printer', w: 80 },
                  { key: '58', label: '58mm', hint: 'The small one', w: 58 },
                  { key: 'custom', label: 'Something else', hint: 'Type the width', w: 70 },
                ] as const
              ).map((o) => {
                const on = form.paperSize === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      set('paperSize', o.key);
                      if (o.key === '80') set('paperWidthMm', 80);
                      if (o.key === '58') set('paperWidthMm', 58);
                    }}
                    /* Small and upright: the roll on top, the size under it, the
                       hint last — every part stacked inside the card, so a
                       narrow column wraps the words instead of pushing them out. */
                    className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                      on ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-secondary'
                    }`}
                  >
                    {on && (
                      <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    )}
                    {/* The roll, drawn to its width against the others. */}
                    <span className="flex h-7 w-10 items-end justify-center" aria-hidden="true">
                      <span
                        className={`flex h-7 flex-col justify-center gap-[3px] rounded-t-sm border border-b-0 px-1 ${
                          on ? 'border-primary bg-card' : 'border-border bg-card'
                        }`}
                        style={{ width: `${(o.w / 80) * 32}px` }}
                      >
                        <span className={`block h-px w-full ${on ? 'bg-primary/60' : 'bg-border'}`} />
                        <span className={`block h-px w-3/4 ${on ? 'bg-primary/60' : 'bg-border'}`} />
                        <span className={`block h-px w-full ${on ? 'bg-primary/60' : 'bg-border'}`} />
                      </span>
                    </span>
                    <span className={`block w-full break-words text-sm leading-tight ${on ? 'font-semibold' : 'font-medium'}`}>
                      {t(o.label)}
                    </span>
                    <span className="block w-full break-words text-[10.5px] leading-snug text-muted-foreground">
                      {t(o.hint)}
                    </span>
                  </button>
                );
              })}
            </div>

            {form.paperSize === 'custom' && (
              <div className="mt-3 max-w-40">
                <Field label={t('Width in mm')} htmlFor="s-width">
                  <input
                    id="s-width"
                    className="input h-10 tabular-nums"
                    inputMode="numeric"
                    value={form.paperWidthMm}
                    onChange={(e) => set('paperWidthMm', Number(e.target.value) || 80)}
                  />
                </Field>
              </div>
            )}

            <div className="mt-4 flex flex-col divide-y divide-border border-t border-border">
              <Toggle
                checked={form.showSavings}
                onChange={(v) => set('showSavings', v)}
                label={t('Print what the customer saved, when you give a discount')}
                hint={t('"You saved ৳10" under the total — people like seeing it.')}
              />
              <Toggle
                checked={!!form.printBangla}
                onChange={(v) => set('printBangla', v)}
                label={t('Print the receipt in Bangla')}
                hint={t('Every word and figure on the slip in Bangla, the amount in words too. Bill and batch numbers stay as printed on the pack.')}
              />
            </div>
          </Section>
          </div>

          {/* ---- the POS ---- */}
          <Section
            id="counter"
            icon={ScanLine}
            title={t('At the counter')}
            sub={t('What the POS does when a bill is saved.')}
          >
            <div className="flex flex-col divide-y divide-border">
              <Toggle
                checked={form.autoPrint}
                onChange={(v) => set('autoPrint', v)}
                label={t('Print the bill as soon as a sale is saved')}
                hint={t('The customer is still standing there; a bill printed later is a bill nobody takes.')}
              />
              <Toggle
                checked={form.confirmSale ?? false}
                onChange={(v) => set('confirmSale', v)}
                label={t('Ask before saving a bill')}
                hint={t('One more tap per sale, in exchange for never saving one by accident.')}
              />
            </div>
          </Section>

          {/*
            The other paper.

            A delivery sheet is filed, claimed against and sometimes stapled to
            a cheque, and the shop that has had a letterhead printed for twenty
            years has opinions about it. Everything has a default that produces
            a correct sheet, so this card can be ignored entirely.
          */}
          {/* Working on this card turns the panel beside it to the sheet. */}
          <div className="contents" onFocusCapture={() => setView('sheet')} onPointerDownCapture={() => setView('sheet')}>
          <Section
            id="sheet"
            icon={FileText}
            title={t('The A4 sheet')}
            sub={t(
              'Your letterhead for a delivery from a company — the header, the colour and the small print at the foot. The customer’s bill is unaffected: that still prints on the roll exactly as it does now.',
            )}
          >
            {/* ---- whose letterhead ---- */}
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t('Printed on')}</span>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(
                [
                  ['dawai', Palette, 'Our letterhead', 'Coloured band, your logo'],
                  ['image', ImageIcon, 'Your letterhead', 'Your header and footer pictures'],
                  ['pad', StickyNote, 'Your printed pad', 'Leaves the pad’s print blank'],
                ] as const
              ).map(([key, Icon, label, hint]) => {
                const on = (invoice.style ?? 'dawai') === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setInvoice('style', key)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-sm transition-colors ${
                      on ? 'border-primary bg-primary/5 font-semibold ring-2 ring-primary/15' : 'border-border hover:bg-secondary'
                    }`}
                  >
                    <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="leading-tight">{t(label)}</span>
                    {/* On a phone the chosen card's own section says the rest. */}
                    <span className="hidden text-[11px] font-normal leading-snug text-muted-foreground sm:block">{t(hint)}</span>
                  </button>
                );
              })}
            </div>

            {invoice.style === 'image' && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <LetterheadPicture
                  slot="header"
                  label={t('Header')}
                  hint={t('Scanned straight, full width')}
                  present={pics.header}
                  onChanged={(v) => picChanged('header', v)}
                />
                <LetterheadPicture
                  slot="footer"
                  label={t('Footer')}
                  hint={t('Optional')}
                  present={pics.footer}
                  onChanged={(v) => picChanged('footer', v)}
                />
              </div>
            )}

            {invoice.style === 'pad' && (
              <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
                <p className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {t('With a ruler, measure from the top edge of your pad to just below its printed header, and from the bottom edge to just above its footer. The sheet prints only in between.')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('Header space (mm)')} htmlFor="s-pad-top">
                    <input
                      id="s-pad-top"
                      className="input h-10 tabular-nums"
                      inputMode="numeric"
                      value={invoice.padTopMm ?? 45}
                      onChange={(e) => setInvoice('padTopMm', Math.min(120, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
                    />
                  </Field>
                  <Field label={t('Footer space (mm)')} htmlFor="s-pad-bottom">
                    <input
                      id="s-pad-bottom"
                      className="input h-10 tabular-nums"
                      inputMode="numeric"
                      value={invoice.padBottomMm ?? 20}
                      onChange={(e) => setInvoice('padBottomMm', Math.min(80, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost mt-3 h-9"
                  disabled={aligning}
                  onClick={async () => {
                    setAligning(true);
                    try {
                      await openAlignmentPage(
                        { shopName: form.shopName, address: form.address, phone: form.phone, drugLicenceNo: form.drugLicenceNo, vatBin: form.vatBin, printBangla: form.printBangla, invoice },
                        uiLang,
                      );
                    } catch {
                      toast(t('Could not draw the alignment page.'), 'error');
                    } finally {
                      setAligning(false);
                    }
                  }}
                >
                  {aligning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} {t('Print an alignment page')}
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('Print it on plain paper, hold it over your pad against the light, and change the numbers until the dashed box sits in the blank part.')}
                </p>
                <p className="mb-2 mt-4 text-[11px] text-muted-foreground">
                  <strong className="font-semibold text-foreground">{t('Photos of your pad')}</strong> · {t('optional — to line it up on screen, never printed')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <LetterheadPicture slot="header" label={t('Header')} present={pics.header} onChanged={(v) => picChanged('header', v)} />
                  <LetterheadPicture slot="footer" label={t('Footer')} present={pics.footer} onChanged={(v) => picChanged('footer', v)} />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Paper')} htmlFor="s-inv-paper">
                <select
                  id="s-inv-paper"
                  className="input h-10"
                  value={invoice.paper}
                  onChange={(e) => setInvoice('paper', e.target.value as 'A4' | 'A5')}
                >
                  <option value="A4">{t('A4 — the filing standard')}</option>
                  <option value="A5">{t('A5 — half a sheet')}</option>
                </select>
              </Field>
              <Field label={t('Colour')} htmlFor="s-inv-accent">
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setInvoice('accent', c)}
                      aria-label={c}
                      aria-pressed={invoice.accent.toLowerCase() === c}
                      className={`grid h-8 w-8 place-items-center rounded-full border-2 transition-transform hover:scale-110 ${
                        invoice.accent.toLowerCase() === c ? 'border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {invoice.accent.toLowerCase() === c && <Check className="h-4 w-4 text-white" />}
                    </button>
                  ))}
                  <input
                    id="s-inv-accent"
                    type="color"
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    value={invoice.accent}
                    onChange={(e) => setInvoice('accent', e.target.value)}
                    title={t('Any colour')}
                  />
                  <input
                    className="input h-8 w-24 font-mono text-xs"
                    value={invoice.accent}
                    onChange={(e) => setInvoice('accent', e.target.value)}
                    placeholder="#065f46"
                    maxLength={7}
                    aria-label={t('Colour code')}
                  />
                </div>
              </Field>
              <Field label={t('Signature line')} htmlFor="s-inv-sign">
                <input
                  id="s-inv-sign"
                  className="input h-10"
                  value={invoice.signatureLabel}
                  onChange={(e) => setInvoice('signatureLabel', e.target.value)}
                  placeholder="Checked and received by"
                />
              </Field>
              <Field label={t('Small print at the foot')} htmlFor="s-inv-terms">
                <input
                  id="s-inv-terms"
                  className="input h-10"
                  value={invoice.terms}
                  onChange={(e) => setInvoice('terms', e.target.value)}
                  placeholder="Claims for breakage within 48 hours"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-col divide-y divide-border border-t border-border">
              {(invoice.style ?? 'dawai') === 'dawai' && (
                <Toggle checked={invoice.showLogo} onChange={(v) => setInvoice('showLogo', v)} label={t('Put your logo in the header')} />
              )}
              <Toggle checked={invoice.showQr} onChange={(v) => setInvoice('showQr', v)} label={t('Print the QR square')} />
              <Toggle checked={invoice.showBatch} onChange={(v) => setInvoice('showBatch', v)} label={t('Show batch numbers')} />
            </div>
            {(invoice.style ?? 'dawai') === 'dawai' && invoice.showLogo && (
              <div className="mt-3 sm:w-1/2">
                <LetterheadPicture
                  slot="logo"
                  label={t('Logo')}
                  hint={t('Square works best. Printed small, in the band.')}
                  present={pics.logo}
                  onChanged={(v) => picChanged('logo', v)}
                />
              </div>
            )}

            {/* Made-up rows rather than the last delivery: the first thing a new
                shop does is open this screen, and it has no deliveries yet. */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-ghost h-9" onClick={showSheet}>
                <FileText className="h-4 w-4" /> {t('Preview the sheet')}
              </button>
              <span className="text-[11px] text-muted-foreground">{t('Changes show on it as you type — save to keep them.')}</span>
            </div>
          </Section>
          </div>

          {/*
            VAT.

            Off, and off is the right answer for most pharmacies here: medicine
            is VAT-exempt. The rate only bites on what the same counter sells
            beside it — baby food, cosmetics, soap, syringes — and which lines
            those are is already decided by whether the item was added as a
            medicine, so nobody has to tag two thousand products.
          */}
          {/* Orders from customers: the link, the QR, delivery. */}
          <OrderLinkCard />

          {/* bKash and Nagad at the counter. */}
          <WalletCard />

          {/* Points for regulars. */}
          <LoyaltyCard />

          {/* The shop on the owner's phone, and its alerts. */}
          <PhoneAlertsCard />

          {/* Whether the shop is counted in the anonymous medicine figures. */}
          <DataSharingCard />

          <Section
            id="vat"
            icon={Percent}
            title={t('VAT')}
            sub={t(
              'Medicine is VAT-exempt, so most shops leave this at zero. Set a rate only if you are registered, and it will be charged on everything that is not a medicine.',
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Rate')} htmlFor="s-vat">
                <div className="flex items-center gap-2">
                  <input
                    id="s-vat"
                    className="input h-10 w-24 tabular-nums"
                    inputMode="decimal"
                    value={form.vatPercent ?? 0}
                    onChange={(e) => set('vatPercent', Number(e.target.value) || 0)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <span className={`pill ${(form.vatPercent ?? 0) > 0 ? 'success' : 'neutral'}`}>
                    {(form.vatPercent ?? 0) > 0 ? t('Charging VAT') : t('Off')}
                  </span>
                </div>
              </Field>
              <Field label={t('BIN')} htmlFor="s-bin">
                <input
                  id="s-bin"
                  className="input h-10"
                  placeholder="0001234567890"
                  value={form.vatBin ?? ''}
                  onChange={(e) => set('vatBin', e.target.value)}
                />
              </Field>
            </div>

            {(form.vatPercent ?? 0) > 0 && (
              <div className="mt-4 border-t border-border">
                <Toggle
                  checked={form.vatOnMedicine ?? false}
                  onChange={(v) => set('vatOnMedicine', v)}
                  label={t('Charge it on medicine as well')}
                  hint={t('Only if your accountant says so — medicine is exempt, and this is your registration, not ours.')}
                />
              </div>
            )}
          </Section>

          {/* ---- the save bar, while anything is unsaved: in the form's own
              column, so it never sits on the preview beside it ---- */}
          {dirty && (
            <div className="sticky bottom-3 z-30">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3 shadow-xl">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                  <strong className="font-semibold">{t('You have unsaved changes')}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost h-9"
                  onClick={async () => {
                    if (
                      !(await confirmAction({
                        title: t('Discard your changes?'),
                        message: t('Everything changed since the last save goes back to how it was.'),
                        confirmLabel: t('Discard them'),
                        tone: 'danger',
                        icon: 'delete',
                      }))
                    )
                      return;
                    setForm(saved);
                  }}
                  disabled={busy}
                >
                  <RotateCcw className="h-4 w-4" /> {t('Discard')}
                </button>
                <button type="button" className="btn h-9" onClick={() => void save()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('Save')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* The real component at the real width — not a picture of one. */}
        <div id="paper-preview" className="card mb-0 h-fit min-w-0 scroll-mt-4 lg:sticky lg:top-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="mb-0">
              {view === 'sheet' ? <FileText className="h-4 w-4" /> : <ReceiptText className="h-4 w-4" />} {t('How it will look')}
            </h3>
            <span className="pill neutral !py-0 tabular-nums">{view === 'sheet' ? invoice.paper : `${form.paperWidthMm}mm`}</span>
          </div>
          {/* The two papers the shop prints: the roll at the counter, and the A4 sheet. */}
          <div role="tablist" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
            {(
              [
                ['receipt', 'Receipt paper', ReceiptText],
                ['sheet', 'The A4 sheet', FileText],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${
                  view === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" /> {t(label)}
              </button>
            ))}
          </div>
          {view === 'receipt' ? (
            <>
              <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-muted/40 p-3">
                <div className="mx-auto w-fit rounded-sm bg-white p-2 shadow-md">
                  <Receipt sale={SAMPLE} settings={form} auto={false} />
                </div>
              </div>
              <button type="button" className="btn btn-ghost mt-3 h-9 w-full" onClick={() => setPrinting(true)}>
                <Printer className="h-4 w-4" /> {t('Test print')}
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <SheetPreview
                version={picVersion}
                draft={{
                  shopName: form.shopName,
                  address: form.address,
                  phone: form.phone,
                  drugLicenceNo: form.drugLicenceNo,
                  vatBin: form.vatBin,
                  printBangla: form.printBangla,
                  invoice,
                }}
              />
            </div>
          )}
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            {t('Changes show here as you type — save to keep them.')}
          </p>
        </div>
      </div>

      {printing && <Receipt sale={SAMPLE} settings={form} onDone={() => setPrinting(false)} />}
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  sub,
  children,
}: {
  id: string;
  icon: typeof Store;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`set-${id}`} className="card mb-0 scroll-mt-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="mb-0 text-[15px]">{title}</h3>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** An on/off setting, as a switch — the whole row is the target. */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0 text-sm">
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
