import { useEffect, useMemo, useState } from 'react';
import { Loader2, Banknote } from 'lucide-react';
import { platformApi, type ShopPlan } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import Modal from './Modal';
import { BTN_SECONDARY, errorMessage } from '../lib/ui';

/**
 * Taking a payment by hand.
 *
 * Operators could only accept payments a shop had reported in the app. An
 * owner who pays cash at the office, or rings to say "I sent the bKash", had
 * no way in — so the subscription ran out while the money sat in our account.
 * This records it and accepts it in one step: the person typing it in is the
 * one who checked the money.
 */

const METHODS = [
  ['bkash', 'bKash'],
  ['nagad', 'Nagad'],
  ['rocket', 'Rocket'],
  ['upay', 'Upay'],
  ['bank', 'Bank transfer'],
  ['cash', 'Cash'],
  ['card', 'Card'],
] as const;

const taka = (n: number) => `৳ ${n.toLocaleString('en-BD')}`;

/** The new end date, by the same rule the API uses: from the later of today and the current end. */
function newEnd(currentEnd: string | null | undefined, months: number) {
  const now = new Date();
  const end = currentEnd ? new Date(currentEnd) : null;
  const from = end && end > now ? end : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  return until;
}

export default function RecordPaymentDialog({
  open,
  onClose,
  shop,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  shop: { _id: string; name: string; plan?: string; trialEndsAt?: string | null };
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<ShopPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    plan: '',
    months: 1,
    amount: '',
    method: 'cash' as (typeof METHODS)[number][0],
    trxId: '',
    senderNumber: '',
    note: '',
    couponCode: '',
  });

  useEffect(() => {
    if (!open) return;
    platformApi
      .plans()
      .then((all) => {
        const paid = all.filter((p) => p.isActive && !p.isTrial);
        setPlans(paid);
        // The shop's own plan if it is a paid one, else the cheapest.
        const start = paid.find((p) => p.key === shop.plan) ?? paid[0];
        if (start) setForm((f) => ({ ...f, plan: start.key, amount: String(start.price * f.months) }));
      })
      .catch((e) => toast(errorMessage(e, 'Could not load the plans.'), 'error'));
  }, [open, shop.plan, toast]);

  const plan = plans.find((p) => p.key === form.plan);
  const expected = plan ? plan.price * form.months : 0;
  const amount = Number(form.amount) || 0;
  const until = useMemo(() => newEnd(shop.trialEndsAt, form.months), [shop.trialEndsAt, form.months]);
  const needsRef = form.method !== 'cash';

  const setPlanOrMonths = (next: { plan?: string; months?: number }) =>
    setForm((f) => {
      const merged = { ...f, ...next };
      const p = plans.find((x) => x.key === merged.plan);
      return { ...merged, amount: p ? String(p.price * merged.months) : merged.amount };
    });

  const submit = async () => {
    if (!plan || amount <= 0) return;
    setBusy(true);
    try {
      const res = await platformApi.recordPayment(shop._id, {
        plan: form.plan,
        months: form.months,
        amount,
        method: form.method,
        trxId: form.trxId.trim() || undefined,
        senderNumber: form.senderNumber.trim() || undefined,
        note: form.note.trim() || undefined,
        couponCode: form.couponCode.trim() || undefined,
      });
      const end = res.payment.coversUntil ? new Date(res.payment.coversUntil).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '';
      toast(`${taka(amount)} recorded — ${shop.name} is paid until ${end}.`);
      onRecorded();
      onClose();
    } catch (e) {
      toast(errorMessage(e, 'Could not record that payment.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Banknote className="h-4 w-4" /> Record a payment — {shop.name}
        </span>
      }
      width="max-w-lg"
      footer={
        <>
          <button className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={() => void submit()} disabled={busy || !plan || amount <= 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record and extend
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Plan
          <select className="input mt-1" value={form.plan} onChange={(e) => setPlanOrMonths({ plan: e.target.value })}>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} — {taka(p.price)}/month
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Months
          <select className="input mt-1" value={form.months} onChange={(e) => setPlanOrMonths({ months: Number(e.target.value) })}>
            {[1, 2, 3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} month{m === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Amount received (৳)
          <input
            className="input mt-1"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })}
          />
        </label>
        <label className="text-sm font-medium">
          Paid by
          <select
            className="input mt-1"
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value as typeof form.method })}
          >
            {METHODS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {needsRef && (
          <>
            <label className="text-sm font-medium">
              Transaction id
              <input className="input mt-1 font-mono" value={form.trxId} onChange={(e) => setForm({ ...form, trxId: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Sent from (number or account)
              <input className="input mt-1" value={form.senderNumber} onChange={(e) => setForm({ ...form, senderNumber: e.target.value })} />
            </label>
          </>
        )}
        <label className="text-sm font-medium">
          Discount code <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            className="input mt-1 font-mono uppercase"
            maxLength={24}
            value={form.couponCode}
            onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })}
            placeholder="Checked when you record — type the amount after the discount"
          />
        </label>
        <label className="text-sm font-medium">
          Note
          <input
            className="input mt-1"
            value={form.note}
            placeholder="e.g. paid cash at the office, receipt no. 112"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
      </div>

      <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
        <div>
          Paid until <strong>{until.toLocaleDateString('en-GB', { dateStyle: 'medium' })}</strong>
          {plan && <> on {plan.name}</>}.
        </div>
        {plan && amount > 0 && amount !== expected && (
          <div className={amount < expected ? 'mt-1 font-medium text-destructive' : 'mt-1 text-muted-foreground'}>
            {amount < expected
              ? `${taka(expected - amount)} short of ${taka(expected)} for ${form.months} month${form.months === 1 ? '' : 's'} — the full time is still given.`
              : `${taka(amount - expected)} over the plan price.`}
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          Accepted the moment you record it. The owner is emailed a receipt, and it goes in the audit trail under your name.
        </div>
      </div>
    </Modal>
  );
}
