import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Pencil, Loader2, Lock } from 'lucide-react';
import { branchesApi, type BranchesPage, type ShopBranch } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { useBranchStore } from '../branch';

/**
 * The shop's branches — the owner's page.
 *
 * One branch, the Main branch, is all most shops will ever have, and the page
 * says so plainly. Opening another says first what the plan allows and what
 * the month will then cost, so a second branch is never a surprise on the bill.
 */

const taka = (n: number) => `৳ ${n.toLocaleString('en-BD')}`;

export default function Branches() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [data, setData] = useState<BranchesPage | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; address: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const money = (v: number) => (lang === 'bn' ? bnNumerals(taka(v)) : taka(v));

  const load = useCallback(async () => {
    try {
      setData(await branchesApi.page());
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not load your branches.'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const payload = { name: editing.name.trim(), address: editing.address.trim(), phone: editing.phone.trim() };
      if (editing.id) await branchesApi.update(editing.id, payload);
      else await branchesApi.create(payload);
      toast(editing.id ? t('Branch saved.') : t('Branch opened.'));
      setEditing(null);
      await load();
      useBranchStore.getState().changed();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not save that branch.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (b: ShopBranch, active: boolean) => {
    if (!active && !window.confirm(t('Close this branch? Its history stays; it stops taking new bills.'))) return;
    try {
      await branchesApi.update(b._id, { active });
      await load();
      useBranchStore.getState().changed();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not change that branch.'), 'error');
    }
  };

  if (!data) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }

  const active = data.branches.filter((b) => b.active);
  const { plan } = data;
  const extraCosts = data.monthlyWithOneMore > data.monthlyNow;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> {t('Branches')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {active.length === 1
              ? t('Your shop has one branch. Open another when you open a second shop — each keeps its own stock, counters and takings.')
              : t('Each branch keeps its own stock, counters and takings. Customers’ baki and your suppliers are shared.')}
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={!data.canAdd}
          onClick={() => setEditing({ id: null, name: '', address: '', phone: '' })}
          title={data.canAdd ? undefined : t('Your plan has no room for another branch')}
        >
          <Plus className="h-4 w-4" /> {t('Open a branch')}
        </button>
      </div>

      {/* What the plan says, before anybody opens a branch they will be billed for. */}
      <div className="card text-sm">
        <div>
          {t('Plan')}: <strong>{plan.name}</strong> ·{' '}
          {plan.limit === null ? t('as many branches as you need') : `${t('up to')} ${n(plan.limit)} ${t(plan.limit === 1 ? 'branch' : 'branches')}`}
          {!plan.isTrial && (
            <>
              {' '}
              · {t('the price covers')} {n(plan.included)} {t(plan.included === 1 ? 'branch' : 'branches')}
            </>
          )}
        </div>
        {!plan.isTrial && data.canAdd && (
          <div className="mt-1 text-muted-foreground">
            {extraCosts
              ? `${t('Another branch adds')} ${money(plan.extraBranchPrice)} ${t('a month')} — ${money(data.monthlyNow)} → ${money(data.monthlyWithOneMore)}.`
              : t('Another branch costs nothing more on your plan.')}
          </div>
        )}
        {!data.canAdd && (
          <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> {t('Your plan has no room for another branch. Upgrade from Subscription, or ask us in Support.')}
          </div>
        )}
      </div>

      <div className="card">
        <div className="divide-y divide-border">
          {data.branches.map((b) => (
            <div key={b._id} className={`flex flex-wrap items-center gap-3 py-3 ${b.active ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{b.name}</strong>
                  {b.isMain && <span className="pill neutral">{t('Main')}</span>}
                  {!b.active && <span className="pill cancelled">{t('closed')}</span>}
                </div>
                {(b.address || b.phone) && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{[b.address, b.phone].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  aria-label={t('Edit')}
                  title={t('Edit')}
                  onClick={() => setEditing({ id: b._id, name: b.name, address: b.address, phone: b.phone })}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {!b.isMain &&
                  (b.active ? (
                    <button type="button" className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void setActive(b, false)}>
                      {t('Close')}
                    </button>
                  ) : (
                    <button type="button" className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted" onClick={() => void setActive(b, true)}>
                      {t('Reopen')}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} className="w-full max-w-md" label={editing.id ? t('Edit branch') : t('Open a branch')}>
          <h3 className="mb-3 text-base">{editing.id ? t('Edit branch') : t('Open a branch')}</h3>
          <div className="grid gap-3">
            <label className="text-sm font-medium">
              {t('Branch name')}
              <input className="input mt-1 h-10" maxLength={80} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('e.g. Mirpur 10')} />
            </label>
            <label className="text-sm font-medium">
              {t('Address on its receipts')}
              <input className="input mt-1 h-10" maxLength={240} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} placeholder={t('Empty: the shop’s own address')} />
            </label>
            <label className="text-sm font-medium">
              {t('Phone')}
              <input className="input mt-1 h-10" maxLength={60} inputMode="tel" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </label>
            {!editing.id && extraCosts && (
              <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                {t('From your next payment, a month will be')} <strong>{money(data.monthlyWithOneMore)}</strong>.
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted" onClick={() => setEditing(null)} disabled={busy}>
              {t('Cancel')}
            </button>
            <button type="button" className="btn" onClick={() => void save()} disabled={busy || !editing.name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
