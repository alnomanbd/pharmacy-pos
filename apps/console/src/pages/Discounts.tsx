import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TicketPercent, Plus, Pencil, Gift, Loader2, CheckCircle2 } from 'lucide-react';
import { platformApi, type CouponRow, type ReferralRow, type ShopPlan } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { BTN_ICON, BTN_OUTLINE, BTN_SECONDARY, can, errorMessage, useAccess } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';

/**
 * Discount codes, and shops that brought in other shops.
 *
 * A code is typed by the owner when paying, and counted only when the payment
 * is accepted. A referral is recorded when a shop signs up through another's
 * link; the reward is given by hand — an extra month, a call — and marked here
 * so nobody is thanked twice or forgotten.
 */

const taka = (n: number) => `৳ ${n.toLocaleString('en-BD')}`;
const off = (c: CouponRow) => (c.kind === 'percent' ? `${c.value}% off` : `${taka(c.value)} off`);

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type Draft = {
  code: string;
  description: string;
  kind: 'percent' | 'amount';
  value: string;
  plans: string[];
  minMonths: number;
  firstPaymentOnly: boolean;
  oncePerShop: boolean;
  maxRedemptions: string;
  expiresAt: string;
  active: boolean;
};

const EMPTY: Draft = {
  code: '',
  description: '',
  kind: 'percent',
  value: '',
  plans: [],
  minMonths: 1,
  firstPaymentOnly: false,
  oncePerShop: true,
  maxRedemptions: '',
  expiresAt: '',
  active: true,
};

const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label className="inline-flex items-center gap-2 text-sm">
    <input type="checkbox" className="h-4 w-4 shrink-0" style={{ width: 16 }} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {children}
  </label>
);

export default function Discounts() {
  const { toast } = useToast();
  const access = useAccess();
  const canCodes = can(access, 'coupons.manage');
  const canReward = canCodes || can(access, 'payments.verify');
  const [tab, setTab] = useState<'codes' | 'referrals'>('codes');
  const [codes, setCodes] = useState<CouponRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [plans, setPlans] = useState<ShopPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [rewarding, setRewarding] = useState<ReferralRow | null>(null);
  const [rewardNote, setRewardNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([
        canCodes ? platformApi.coupons() : Promise.resolve([] as CouponRow[]),
        platformApi.referrals(),
      ]);
      setCodes(c);
      setReferrals(r);
    } catch (e) {
      toast(errorMessage(e, 'Could not load discounts.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [canCodes, toast]);

  useEffect(() => {
    if (!access) return;
    if (!canCodes) setTab('referrals');
    void load();
    platformApi
      .plans()
      .then((p) => setPlans(p.filter((x) => x.isActive && !x.isTrial)))
      .catch(() => undefined);
  }, [access, canCodes, load]);

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    setBusy(true);
    try {
      const payload = {
        description: d.description.trim() || undefined,
        kind: d.kind,
        value: Number(d.value),
        plans: d.plans,
        minMonths: d.minMonths,
        firstPaymentOnly: d.firstPaymentOnly,
        oncePerShop: d.oncePerShop,
        maxRedemptions: d.maxRedemptions ? Number(d.maxRedemptions) : null,
        expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59`).toISOString() : null,
        active: d.active,
      };
      if (editing.id) await platformApi.updateCoupon(editing.id, payload);
      else await platformApi.createCoupon({ ...payload, code: d.code });
      toast(editing.id ? 'Code updated.' : 'Code created.');
      setEditing(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that code.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: CouponRow) => {
    try {
      await platformApi.updateCoupon(c._id, { active: !c.active });
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not change that.'), 'error');
    }
  };

  const reward = async () => {
    if (!rewarding) return;
    setBusy(true);
    try {
      await platformApi.markReferralRewarded(rewarding._id, rewardNote.trim());
      toast('Marked as rewarded.');
      setRewarding(null);
      setRewardNote('');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not mark that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const d = editing?.draft;
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const owed = referrals.filter((r) => r.firstPaidAt && !r.rewarded).length;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <TicketPercent className="h-5 w-5" /> Discounts
          </h1>
          <p className="text-sm text-muted-foreground">Codes shops type in when they pay, and shops that brought in other shops.</p>
        </div>
        {tab === 'codes' && canCodes && (
          <button className="btn" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
            <Plus className="h-4 w-4" /> New code
          </button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1" role="tablist">
        {canCodes && (
          <button role="tab" aria-selected={tab === 'codes'} onClick={() => setTab('codes')}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === 'codes' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
            Codes <span className="ml-1 text-xs tabular-nums">{codes.length}</span>
          </button>
        )}
        <button role="tab" aria-selected={tab === 'referrals'} onClick={() => setTab('referrals')}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === 'referrals' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
          Referrals <span className="ml-1 text-xs tabular-nums">{referrals.length}</span>
          {owed > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{owed} owed</span>}
        </button>
      </div>

      <div className="card mt-4">
        {loading ? (
          <LoadingBlock />
        ) : tab === 'codes' ? (
          codes.length === 0 ? (
            <div className="empty">No codes yet. A first-month offer is a good one to start with.</div>
          ) : (
            <div className="divide-y divide-border">
              {codes.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const usedUp = c.maxRedemptions != null && c.redemptions >= c.maxRedemptions;
                return (
                  <div key={c._id} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-bold">{c.code}</span>
                        <span className="pill booked">{off(c)}</span>
                        {!c.active ? <span className="pill cancelled">off</span> : expired ? <span className="pill neutral">expired</span> : usedUp ? <span className="pill neutral">used up</span> : <span className="pill completed">live</span>}
                      </div>
                      {c.description && <div className="mt-0.5 text-sm text-muted-foreground">{c.description}</div>}
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span>Used {c.redemptions}{c.maxRedemptions != null ? ` of ${c.maxRedemptions}` : ''}</span>
                        <span>{c.plans.length ? c.plans.join(', ') : 'Any paid plan'}</span>
                        {c.minMonths > 1 && <span>{c.minMonths}+ months</span>}
                        {c.firstPaymentOnly && <span>first payment only</span>}
                        {c.oncePerShop && <span>once per shop</span>}
                        {c.expiresAt && <span>until {new Date(c.expiresAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button className={BTN_OUTLINE} onClick={() => void toggle(c)}>{c.active ? 'Turn off' : 'Turn on'}</button>
                      <button
                        className={BTN_ICON}
                        aria-label="Edit"
                        title="Edit"
                        onClick={() =>
                          setEditing({
                            id: c._id,
                            draft: {
                              code: c.code,
                              description: c.description,
                              kind: c.kind,
                              value: String(c.value),
                              plans: c.plans,
                              minMonths: c.minMonths,
                              firstPaymentOnly: c.firstPaymentOnly,
                              oncePerShop: c.oncePerShop,
                              maxRedemptions: c.maxRedemptions != null ? String(c.maxRedemptions) : '',
                              expiresAt: toLocalInput(c.expiresAt),
                              active: c.active,
                            },
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : referrals.length === 0 ? (
          <div className="empty">
            <Gift className="mx-auto mb-2 h-5 w-5 opacity-60" />
            No shop has signed up through another's link yet. Each owner finds their link on their Subscription page.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {referrals.map((r) => {
              const by = typeof r.referredBy === 'object' && r.referredBy ? r.referredBy : null;
              return (
                <div key={r._id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      {by ? (
                        <Link to={`/shops/${by._id}`} className="font-semibold hover:underline">{by.name}</Link>
                      ) : (
                        <span className="font-semibold">A shop</span>
                      )}
                      <span className="text-muted-foreground">brought in</span>
                      <Link to={`/shops/${r._id}`} className="font-semibold hover:underline">{r.name}</Link>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      <span>Signed up {lastSeen(r.createdAt)}</span>
                      {r.firstPaidAt ? <span className="font-medium text-foreground/80">First paid {lastSeen(r.firstPaidAt)}</span> : <span>Not paying yet</span>}
                      {r.referralReward?.at && <span>Rewarded {lastSeen(r.referralReward.at)}{r.referralReward.note ? ` — ${r.referralReward.note}` : ''}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {r.rewarded ? (
                      <span className="pill completed inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> rewarded</span>
                    ) : canReward ? (
                      <button className={BTN_OUTLINE} onClick={() => setRewarding(r)}>
                        <Gift className="h-3.5 w-3.5" /> Mark rewarded
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && d && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${d.code}` : 'New discount code'}
          width="max-w-xl"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={() => void save()} disabled={busy || !d.code.trim() || !(Number(d.value) > 0)}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Code
              <input className="input mt-1 font-mono uppercase" maxLength={24} disabled={!!editing.id} value={d.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} placeholder="FIRST50" />
            </label>
            <label className="text-sm font-medium">
              Takes off
              <div className="mt-1 flex gap-2">
                <input className="input" inputMode="decimal" value={d.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d.]/g, '') })} placeholder={d.kind === 'percent' ? '50' : '500'} />
                <select className="input w-auto" value={d.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}>
                  <option value="percent">%</option>
                  <option value="amount">৳</option>
                </select>
              </div>
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Description <span className="font-normal text-muted-foreground">(shown to the shop)</span>
              <input className="input mt-1" maxLength={200} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Half off your first month" />
            </label>
            <div className="text-sm font-medium sm:col-span-2">
              Works on
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 font-normal">
                <Check checked={d.plans.length === 0} onChange={() => set({ plans: [] })}>Any paid plan</Check>
                {plans.map((p) => (
                  <Check key={p.key} checked={d.plans.includes(p.key)} onChange={(v) => set({ plans: v ? [...d.plans, p.key] : d.plans.filter((k) => k !== p.key) })}>
                    {p.name}
                  </Check>
                ))}
              </div>
            </div>
            <label className="text-sm font-medium">
              At least
              <select className="input mt-1" value={d.minMonths} onChange={(e) => set({ minMonths: Number(e.target.value) })}>
                {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'} at once</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Used by at most <span className="font-normal text-muted-foreground">(empty: no limit)</span>
              <input className="input mt-1" inputMode="numeric" value={d.maxRedemptions} onChange={(e) => set({ maxRedemptions: e.target.value.replace(/\D/g, '') })} placeholder="50" />
            </label>
            <label className="text-sm font-medium">
              Works until <span className="font-normal text-muted-foreground">(empty: no end)</span>
              <input type="date" className="input mt-1" value={d.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
            </label>
            <div className="flex flex-col justify-end gap-1.5">
              <Check checked={d.firstPaymentOnly} onChange={(v) => set({ firstPaymentOnly: v })}>First payment only</Check>
              <Check checked={d.oncePerShop} onChange={(v) => set({ oncePerShop: v })}>Once per shop</Check>
              <Check checked={d.active} onChange={(v) => set({ active: v })}>On</Check>
            </div>
          </div>
        </Modal>
      )}

      {rewarding && (
        <Modal
          open
          onClose={() => setRewarding(null)}
          title="Mark the reward as given"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setRewarding(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={() => void reward()} disabled={busy || rewardNote.trim().length < 3}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Mark rewarded
              </button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            For bringing in <strong>{rewarding.name}</strong>. Give the reward first — extra days on their subscription from their shop’s page, a
            discount code, a thank-you call — then note here what was given. It can only be marked once.
          </p>
          <input className="input mt-3" maxLength={300} value={rewardNote} onChange={(e) => setRewardNote(e.target.value)} placeholder="e.g. one month free, added 2 Oct" />
        </Modal>
      )}
    </div>
  );
}
