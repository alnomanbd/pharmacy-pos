import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileJson,
  Globe,
  Gift,
  Copy,
  Share2,
  Tag,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { downloadBlob } from '@dawai/shared/api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { billingApi, type Subscription as Sub, type SubscriptionPayment } from '../api';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { BRAND } from '../brand';

/**
 * The shop's subscription, and how it pays for it.
 *
 * Payment is manual — bKash, Nagad, Upay, Rocket, a bank or cash — and this
 * page is where the shop tells us it paid. So it answers three questions
 * without anybody ringing us: how long is left, where do I send it, and did you
 * get it? It stays usable when the subscription has lapsed: everything else
 * goes read-only then, and locking this too would leave a shop that wants to
 * pay unable to.
 */

const METHODS: { v: string; label: string; icon: typeof Smartphone }[] = [
  { v: 'bkash', label: 'bKash', icon: Smartphone },
  { v: 'nagad', label: 'Nagad', icon: Smartphone },
  { v: 'upay', label: 'Upay', icon: Smartphone },
  { v: 'rocket', label: 'Rocket', icon: Smartphone },
  { v: 'bank', label: 'Bank transfer', icon: Building2 },
  { v: 'cash', label: 'Cash', icon: Banknote },
];

const MONTH_OPTIONS = [1, 3, 6, 12];

/*
 * Months free for a year paid at once — set in the console, read from the
 * same public settings the website uses, so the page, the site and the
 * checkout all charge the same. Twelve or more months earn them per full year.
 */
let yearlyFree = 0;
const yearlyReady = fetch('/api/public/site')
  .then((r) => (r.ok ? r.json() : null))
  .then((j: { data?: { yearlyFreeMonths?: number } } | null) => {
    yearlyFree = j?.data?.yearlyFreeMonths ?? 0;
  })
  .catch(() => undefined);
const charged = (months: number) => (months < 12 || yearlyFree <= 0 ? months : Math.max(1, months - Math.floor(months / 12) * yearlyFree));

const STATUS_PILL: Record<SubscriptionPayment['status'], string> = {
  pending: 'pill neutral',
  verified: 'pill info',
  rejected: 'pill neutral !text-destructive',
};

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function Subscription() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  /* Figures in Bangla numerals when the screen is in Bangla; ids stay Latin. */
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  /** What one month of this plan costs *this* shop — its extra branches included. */
const monthOf = (p: { price: number; monthly?: { total: number } }) => p.monthly?.total ?? p.price;

const taka = (v: number) => `৳ ${n(v.toLocaleString('en-IN'))}`;
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const [sub, setSub] = useState<Sub | null>(null);
  const [history, setHistory] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    plan: '',
    months: 1,
    method: 'bkash',
    amount: '',
    senderNumber: '',
    trxId: '',
    note: '',
  });
  const [receipt, setReceipt] = useState<File | null>(null);
  /* A discount code: what was typed, and what it took off once applied. */
  const [codeInput, setCodeInput] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number; total: number; description: string } | null>(null);
  const [codeError, setCodeError] = useState('');
  const [applying, setApplying] = useState(false);
  const [referral, setReferral] = useState<{ code: string; signedUp: number; paying: number } | null>(null);
  const [goingOnline, setGoingOnline] = useState(false);
  const [params, setParams] = useSearchParams();

  /* Back from SSLCommerz: say how it went, once, and take it out of the address. */
  useEffect(() => {
    const result = params.get('online');
    if (!result) return;
    const said: Record<string, [string, 'success' | 'error' | undefined]> = {
      paid: ['Paid — your subscription is renewed.', undefined],
      pending: ['We are confirming your payment with the bank. It shows here in a minute or two.', undefined],
      failed: ['The online payment did not go through. Nothing was taken — try again, or pay by hand below.', 'error'],
      cancelled: ['You cancelled the online payment. Nothing was taken.', 'error'],
    };
    const [text, kind] = said[result] ?? said.pending;
    toast(t(text), kind);
    params.delete('online');
    setParams(params, { replace: true });
  }, [params, setParams, toast, t]);
  const [invoiceBusy, setInvoiceBusy] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /* The yearly offer first, so the first total shown is already right. */
      const [s, h] = await Promise.all([billingApi.subscription(), billingApi.payments(), yearlyReady]);
      setSub(s);
      setHistory(h);
      // What they said they came for, else what they are on, else the cheapest.
      setForm((f) => {
        const chosen =
          s.plans.find((p) => p.key === f.plan) ??
          s.plans.find((p) => p.key === s.intendedPlan) ??
          s.plans.find((p) => p.key === s.plan) ??
          s.plans[0];
        return chosen ? { ...f, plan: chosen.key, amount: String(monthOf(chosen) * charged(f.months)) } : f;
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not load your subscription.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
    billingApi
      .referral()
      .then(setReferral)
      .catch(() => undefined);
  }, [load]);

  const getInvoice = async (id: string, download = true) => {
    setInvoiceBusy(id);
    try {
      const blob = await billingApi.invoice(id);
      if (download) downloadBlob(blob, `dawai-invoice-${id}.pdf`);
      else setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast(t('Could not produce that invoice.'), 'error');
    } finally {
      setInvoiceBusy('');
    }
  };

  const selected = sub?.plans.find((p) => p.key === form.plan) ?? null;
  const base = selected ? monthOf(selected) * charged(form.months) : 0;
  const price = applied ? applied.total : base;

  /** Prices a code for this plan and these months; asked again whenever either changes. */
  const applyCode = async (code: string, plan: string, months: number) => {
    if (!code.trim()) return;
    setApplying(true);
    setCodeError('');
    try {
      const q = await billingApi.coupon(code.trim(), plan, months);
      if (q.ok) {
        setApplied({ code: q.code, discount: q.discount, total: q.total, description: q.description });
        setForm((f) => ({ ...f, amount: String(q.total) }));
      } else {
        setApplied(null);
        // One reason carries a number, so it cannot be a fixed key.
        const needed = /at least (\d+) months/.exec(q.reason)?.[1];
        setCodeError(
          needed && lang === 'bn'
            ? `এই কোডের জন্য একসাথে অন্তত ${bnNumerals(needed)} মাসের পেমেন্ট লাগবে।`
            : t(q.reason),
        );
        const p = sub?.plans.find((x) => x.key === plan);
        setForm((f) => ({ ...f, amount: String((p ? monthOf(p) : 0) * charged(months)) }));
      }
    } catch {
      setCodeError(t('Could not check that code.'));
    } finally {
      setApplying(false);
    }
  };
  /** To SSLCommerz with the price worked out by the server; back here when done. */
  const payOnline = async () => {
    setGoingOnline(true);
    try {
      const r = await billingApi.checkout({ plan: form.plan, months: form.months, couponCode: applied?.code });
      window.location.assign(r.url);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not start the online payment.'), 'error');
      setGoingOnline(false);
    }
  };

  const removeCode = () => {
    setApplied(null);
    setCodeInput('');
    setCodeError('');
    setForm((f) => ({ ...f, amount: String(base) }));
  };

  const pickPlan = (key: string) => {
    const p = sub?.plans.find((x) => x.key === key);
    setForm((f) => ({ ...f, plan: key, amount: String((p ? monthOf(p) : 0) * charged(f.months)) }));
    if (applied) void applyCode(applied.code, key, form.months);
  };
  const pickMonths = (months: number) => {
    setForm((f) => {
      const p = sub?.plans.find((x) => x.key === f.plan);
      return { ...f, months, amount: String((p ? monthOf(p) : 0) * charged(months)) };
    });
    if (applied) void applyCode(applied.code, form.plan, months);
  };

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast(t('Enter the amount you sent.'), 'error');
      return;
    }
    if (form.method !== 'cash' && !form.trxId.trim()) {
      toast(t('Enter the transaction id — it is how we find your payment.'), 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await billingApi.submit({
        plan: form.plan,
        months: form.months,
        amount: Number(form.amount),
        method: form.method,
        senderNumber: form.senderNumber.trim() || undefined,
        trxId: form.trxId.trim() || undefined,
        note: form.note.trim() || undefined,
        couponCode: applied?.code,
      });
      // The screenshot goes second, so a failed upload does not lose the claim.
      if (receipt) {
        try {
          await billingApi.attachReceipt(res.payment._id, receipt);
        } catch {
          toast(t('Payment recorded, but the screenshot did not upload.'), 'error');
        }
      }
      toast(
        res.shortfall > 0
          ? `${t('Recorded — but it is short by')} ${taka(res.shortfall)}.`
          : t('Payment submitted — we will confirm it shortly.'),
      );
      setReceipt(null);
      setForm((f) => ({ ...f, trxId: '', note: '' }));
      setApplied(null);
      setCodeInput('');
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not submit that payment.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }

  const payTo = sub?.payTo[form.method as keyof Sub['payTo']];
  const isTrial = sub?.plan === 'trial';

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>{t('Subscription')}</h1>
          <p className="text-sm text-muted-foreground">{t('Your plan, and how to pay for it.')}</p>
        </div>
      </div>

      {/* Where the shop stands — the first thing anyone opens this page to see. */}
      {sub && (
        <div className="card">
          <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end sm:gap-8">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t('Plan')}</p>
              <p className="text-xl font-bold">{sub.planName || sub.plan}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {isTrial ? t('Trial ends') : t('Paid until')}
              </p>
              <p className="text-base font-semibold">{sub.endsAt ? date(sub.endsAt) : '—'}</p>
            </div>
            {sub.daysLeft !== null && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">{t('Days left')}</p>
                <p
                  className={`text-base font-semibold tabular-nums ${
                    sub.daysLeft < 0 ? 'text-destructive' : sub.daysLeft <= 7 ? 'text-orange-600' : ''
                  }`}
                >
                  {sub.daysLeft < 0 ? `${n(-sub.daysLeft)} ${t('days overdue')}` : n(sub.daysLeft)}
                </p>
              </div>
            )}
            {sub.pendingPayments > 0 && (
              <span className="pill neutral col-span-2 inline-flex w-fit items-center gap-1 sm:ml-auto">
                <Clock className="h-3 w-3" /> {n(sub.pendingPayments)} {t('payment(s) being checked')}
              </span>
            )}
          </div>

          {sub.expired && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t(
                  'Your subscription has ended. Everything is still here and you can read it all — billing, purchases and stock changes start again as soon as a payment is confirmed.',
                )}
              </span>
            </div>
          )}
          {sub.status === 'suspended' && sub.suspendedReason && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {t('Suspended')}: {sub.suspendedReason}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---------------- pay ---------------- */}
        <div className="card">
          <h3 className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> {t('Pay')}
          </h3>

          {/* Plans as cards, not a dropdown: the difference between them is the point. */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {sub?.plans.map((p) => {
              const on = p.key === form.plan;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => pickPlan(p.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="font-mono text-sm font-bold tabular-nums">{taka(monthOf(p))}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t(p.description)}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {p.limits.terminals !== null && `${n(p.limits.terminals)} ${t('counter(s)')}`}
                    {p.limits.shopUsers !== null && ` · ${n(p.limits.shopUsers)} ${t('staff')}`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{t('For')}</p>
            <div className="flex flex-wrap gap-1.5">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMonths(m)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.months === m
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  {n(m)} {m > 1 ? t('months') : t('month')}
                  {/* The year's offer, on its own button. */}
                  {m >= 12 && yearlyFree > 0 && (
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${form.months === m ? 'bg-white/20' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>
                      {n(yearlyFree)} {t('free')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* A discount code, applied to whatever plan and months are chosen. */}
          <div className="mt-3">
            {applied ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-sm">
                <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-mono font-semibold">{applied.code}</span>
                <span>
                  −{taka(applied.discount)}
                  {applied.description && <span className="text-muted-foreground"> · {applied.description}</span>}
                </span>
                <button type="button" className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={removeCode}>
                  {t('Remove')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input h-10 font-mono uppercase"
                  value={codeInput}
                  maxLength={24}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    setCodeError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void applyCode(codeInput, form.plan, form.months);
                  }}
                  placeholder={t('Discount code (if you have one)')}
                  aria-label={t('Discount code')}
                />
                <button
                  type="button"
                  className="btn btn-ghost h-10 shrink-0 border border-border"
                  disabled={!codeInput.trim() || applying}
                  onClick={() => void applyCode(codeInput, form.plan, form.months)}
                >
                  {t('Apply')}
                </button>
              </div>
            )}
            {codeError && <p className="mt-1 text-xs text-destructive">{codeError}</p>}
          </div>

          <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
            {t('Total to send')}:{' '}
            {applied && applied.discount > 0 && (
              <span className="mr-1.5 font-mono text-muted-foreground line-through tabular-nums">{taka(base)}</span>
            )}
            <strong className="font-mono text-base tabular-nums">{taka(price)}</strong>
            {/* With branches, say what the month is made of — the plan, and the branches beyond it. */}
            {selected?.monthly && selected.monthly.extraBranches > 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {taka(selected.monthly.base)} {t('plan')} + {n(selected.monthly.extraBranches)} {t(selected.monthly.extraBranches === 1 ? 'extra branch' : 'extra branches')} ×{' '}
                {taka(selected.monthly.extraBranchPrice)} {t('a month')}
              </span>
            )}
          </p>

          {/* Online first, when it is set up: it renews at once, with nothing to type. */}
          {sub?.onlinePayment && (
            <div className="mt-3">
              <button type="button" className="btn h-11 w-full" onClick={() => void payOnline()} disabled={goingOnline || !selected}>
                <Globe className="h-4 w-4" /> {goingOnline ? t('Opening the payment page…') : `${t('Pay online')} ${taka(price)}`}
              </button>
              <p className="mt-1 text-center text-xs text-muted-foreground">{t('bKash, Nagad, Rocket, card or internet banking — renewed the moment it goes through.')}</p>
              <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> {t('or send it yourself and tell us')} <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{t('Paid with')}</p>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.v}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.method === m.v
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                  onClick={() => setForm({ ...form, method: m.v })}
                >
                  <m.icon className="h-3.5 w-3.5" /> {t(m.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Where the money goes. Without it the page is a form with no instructions. */}
          {payTo ? (
            <p className="mt-3 rounded-lg border border-border p-3 text-sm">
              {t('Send to')} <strong className="font-mono">{payTo}</strong>
              {form.method !== 'cash' && form.method !== 'bank' && (
                <span className="text-muted-foreground"> ({t('send money, not payment')})</span>
              )}
            </p>
          ) : (
            form.method !== 'cash' && (
              <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                {t('This number is not set up yet — please contact us before sending.')}
              </p>
            )
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`${t('Amount sent')} (৳)`} htmlFor="pay-amount">
              <input
                id="pay-amount"
                className="input h-10"
                type="number"
                inputMode="numeric"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label={t('Sent from (number)')} htmlFor="pay-from">
              <input
                id="pay-from"
                className="input h-10"
                inputMode="tel"
                value={form.senderNumber}
                onChange={(e) => setForm({ ...form, senderNumber: e.target.value })}
                placeholder="01XXXXXXXXX"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('Transaction ID')} htmlFor="pay-trx">
                <input
                  id="pay-trx"
                  className="input h-10 font-mono"
                  value={form.trxId}
                  onChange={(e) => setForm({ ...form, trxId: e.target.value })}
                  placeholder={form.method === 'cash' ? t('Not needed for cash') : '8N7A6B5C4D'}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t('Screenshot (optional, helps us find it faster)')} htmlFor="pay-shot">
                <input
                  id="pay-shot"
                  className="input h-10 py-1.5"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t('Note')} htmlFor="pay-note">
                <input
                  id="pay-note"
                  className="input h-10"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={t('Anything we should know')}
                />
              </Field>
            </div>
          </div>

          <button type="button" className="btn mt-4 h-11 w-full" onClick={() => void submit()} disabled={saving}>
            <Upload className="h-4 w-4" /> {saving ? t('Submitting…') : t('I have sent the payment')}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t('We check it against the receiving account and confirm — usually the same day.')}
          </p>
        </div>

        {/* ---------------- history ---------------- */}
        <div className="card">
          <h3 className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> {t('Payment history')}
          </h3>
          {history.length === 0 ? (
            <div className="empty">{t('No payments yet.')}</div>
          ) : (
            <div className="mt-2 space-y-2">
              {history.map((p) => (
                <div className="rounded-lg border border-border p-3" key={p._id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono tabular-nums">{taka(p.amount)}</strong>
                    <span className="text-xs uppercase text-muted-foreground">{p.method}</span>
                    <span className={STATUS_PILL[p.status]}>{t(p.status)}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{date(p.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.plan} · {n(p.months)} {p.months > 1 ? t('months') : t('month')}
                    {p.trxId && <> · <span className="font-mono">{p.trxId}</span></>}
                  </div>
                  {p.status === 'verified' && p.coversUntil && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-primary">
                      <CheckCircle2 className="h-3 w-3" /> {t('Paid up to')} {date(p.coversUntil)}
                    </div>
                  )}
                  {/* Only confirmed money has a receipt; a pending claim is not one. */}
                  {p.status === 'verified' && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="btn btn-ghost h-8 text-xs"
                        onClick={() => void getInvoice(p._id, false)}
                        disabled={invoiceBusy === p._id}
                      >
                        <Eye className="h-3.5 w-3.5" /> {t('View')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost h-8 text-xs"
                        onClick={() => void getInvoice(p._id)}
                        disabled={invoiceBusy === p._id}
                      >
                        <Download className="h-3.5 w-3.5" /> {t('Download')}
                        {p.invoiceNo && <span className="font-mono font-normal text-muted-foreground">{p.invoiceNo}</span>}
                      </button>
                    </div>
                  )}
                  {p.status === 'rejected' && p.rejectionReason && (
                    <div className="mt-1 text-xs text-destructive">{p.rejectionReason}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The shop's data is the shop's. Saying so next to the page that asks for
          money is the answer to the question every owner asks before signing up. */}
      <div className="card">
        <h3 className="flex items-center gap-2">
          <Download className="h-4 w-4" /> {t('Your data')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Everything here belongs to you. Take a full copy whenever you like — nothing is held back if you stop paying.')}
        </p>
        <button
          type="button"
          className="btn btn-ghost mt-3 h-10"
          onClick={() =>
            void billingApi
              .exportAll()
              .then((b) =>
                downloadBlob(b, `${BRAND.name.toLowerCase()}-export-${new Date().toISOString().slice(0, 10)}.json`),
              )
              .catch(() => toast(t('Could not export your data.'), 'error'))
          }
        >
          <FileJson className="h-4 w-4" /> {t('Everything (full backup)')}
        </button>
      </div>

      {/* ---------------- why not renewed ---------------- */}
      <LeavingCard />

      {/* ---------------- refer ---------------- */}
      {referral && <ReferCard referral={referral} lang={lang} />}

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }}
        >
          <div
            className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-sm font-semibold">{t('Invoice')}</span>
              <button
                type="button"
                aria-label={t('Close')}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe src={previewUrl} className="flex-1 rounded-b-lg" title={t('Invoice')} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bringing in another pharmacy.
 *
 * Owners in one bazaar know each other, and the shop next door saying "we use
 * this" is worth more than any advert. The link carries this shop's code, so
 * the team can see who brought whom and thank them.
 */
function ReferCard({ referral, lang }: { referral: { code: string; signedUp: number; paying: number }; lang: string }) {
  const t = useT();
  const { toast } = useToast();
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const link = `${BRAND.siteUrl.replace(/\/$/, '')}/${lang === 'bn' ? 'bn' : 'en'}/register?ref=${referral.code}`;
  const message = `${t('We run our pharmacy on Dawai — billing, stock and baki in one place. Try it free:')} ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('Link copied.'));
    } catch {
      toast(link);
    }
  };

  return (
    <div className="card">
      <h3 className="flex items-center gap-2">
        <Gift className="h-4 w-4" /> {t('Refer another pharmacy')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('Know a shop that still keeps its books on paper? Send them your link. When they sign up through it, we will know it was you — and we will thank you.')}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 basis-full truncate rounded-md sm:basis-0 sm:flex-1 border border-border bg-muted px-3 py-2 text-xs">{link}</code>
        <button type="button" className="btn btn-ghost h-9 border border-border" onClick={() => void copy()}>
          <Copy className="h-4 w-4" /> {t('Copy')}
        </button>
        <a className="btn h-9" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          <Share2 className="h-4 w-4" /> WhatsApp
        </a>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('Your code')}: <strong className="font-mono">{referral.code}</strong> · {n(referral.signedUp)} {t('signed up')} · {n(referral.paying)} {t('paying')}
      </p>
    </div>
  );
}

const LEAVING: { key: string; label: string }[] = [
  { key: 'will_renew', label: 'I will renew — I just have not yet' },
  { key: 'too_expensive', label: 'It costs too much' },
  { key: 'back_to_paper', label: 'We went back to the notebook' },
  { key: 'other_software', label: 'We use other software now' },
  { key: 'hard_to_use', label: 'It was hard to use' },
  { key: 'missing_feature', label: 'Something we need is missing' },
  { key: 'shop_closed', label: 'The shop closed or was sold' },
  { key: 'other', label: 'Something else' },
];

/**
 * One question, once, while the shop is read-only: why it did not renew.
 * One tap answers it; a note is optional. Nothing else on the page changes.
 */
function LeavingCard() {
  const t = useT();
  const { toast } = useToast();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    billingApi
      .leaving()
      .then((r) => setAsk(r.ask))
      .catch(() => undefined);
  }, []);

  if (!ask) return null;
  if (done) {
    return (
      <div className="card text-sm">
        <strong>{t('Thank you for telling us.')}</strong> {t('If there is anything we can fix, we will be in touch.')}
      </div>
    );
  }

  const send = async () => {
    setBusy(true);
    try {
      await billingApi.tellLeaving(reason, note.trim() || undefined);
      setDone(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not send that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>{t('Why have you not renewed?')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('One tap. It tells us what to fix — nothing else changes.')}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {LEAVING.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setReason(r.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              reason === r.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'
            }`}
          >
            {t(r.label)}
          </button>
        ))}
      </div>
      {reason && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="input h-10"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === 'missing_feature' ? t('What do you need?') : t('Anything else? (optional)')}
          />
          <button type="button" className="btn h-10 shrink-0" onClick={() => void send()} disabled={busy}>
            {t('Send')}
          </button>
        </div>
      )}
    </div>
  );
}
