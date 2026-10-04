import { useCallback, useEffect, useState } from 'react';
import { Tags, Plus, Save, Archive, Users, Monitor, Store, X } from 'lucide-react';
import { platformApi, PLAN_FEATURES, type ShopPlan as Plan, type PlanFeatures } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * The plan catalogue.
 *
 * These used to be constants in the code, so changing a price was a deploy —
 * and pricing is what a young product changes most. Everything here takes effect
 * the moment it is saved: the limits a shop is held to, the prices its billing
 * page quotes, and what a new signup is offered.
 *
 * A blank limit means unlimited. `0` would mean none at all, so the two are kept
 * distinct rather than folded together.
 */

const LIMITS = [
  { key: 'terminals', label: 'Billing counters', icon: Monitor },
  { key: 'shopUsers', label: 'Staff logins', icon: Users },
  { key: 'outlets', label: 'Branches (max)', icon: Store },
] as const;

const taka = (n: number) => `৳ ${Math.round(n).toLocaleString('en-BD')}`;

const EMPTY = {
  key: '',
  name: '',
  description: '',
  price: 0,
  includedBranches: 1,
  extraBranchPrice: 0,
  sortOrder: 1,
  limits: {
    terminals: null as number | null,
    shopUsers: null as number | null,
    outlets: null as number | null,
  },
  features: { onlineOrders: false } as PlanFeatures,
};

export default function Plans() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlans(await platformApi.plans());
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load plans.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (id: string, patch: Record<string, unknown>) => {
    setBusy(id);
    try {
      await platformApi.updatePlan(id, patch);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not save.', 'error');
      await load();
    } finally {
      setBusy('');
    }
  };

  /**
   * The table's inputs save when they lose focus, and a saved change reaches
   * every shop on the plan at once — so ask, and on a no put back what is saved.
   */
  const change = async (input: HTMLInputElement, saved: string, p: Plan, patch: Record<string, unknown>, title: string, message: string) => {
    if (!(await confirmAction({ title, message, confirmLabel: 'Save the change', tone: 'danger' }))) {
      input.value = saved;
      return;
    }
    await save(p.id, patch);
  };

  const create = async () => {
    if (!draft.key.trim() || !draft.name.trim()) {
      toast('A key and a name are required.', 'error');
      return;
    }
    setBusy('new');
    try {
      await platformApi.createPlan(draft);
      toast(`${draft.name} created.`);
      setCreating(false);
      setDraft(EMPTY);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not create that plan.', 'error');
    } finally {
      setBusy('');
    }
  };

  const retire = async (p: Plan) => {
    if (
      !(await confirmAction({
        title: `Retire ${p.name}?`,
        message: 'It comes off the price list, so no shop can choose it again; shops already on it keep their limits.',
        confirmLabel: `Retire ${p.name}`,
        tone: 'danger',
        icon: 'warning',
      }))
    )
      return;
    setBusy(p.id);
    try {
      await platformApi.retirePlan(p.id);
      toast(`${p.name} retired — accounts already on it keep their limits.`);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not retire that plan.', 'error');
    } finally {
      setBusy('');
    }
  };

  /** Blank means unlimited; anything else is a number, including zero. */
  const limitValue = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const parseLimit = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)));

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>Plans</h1>
          <p className="text-sm text-muted-foreground">
            What you sell, what it costs, and what each one allows. Saved changes take effect at
            once.
          </p>
        </div>
        <button className="btn" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> New plan
        </button>
      </div>

      {creating && (
        <div className="card" style={{ borderColor: 'hsl(var(--primary) / 0.4)' }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="mb-0">New plan</h3>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              onClick={() => setCreating(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="label">
              Key
              <input
                className="input mt-1 font-mono"
                value={draft.key}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                placeholder="pharmacy-enterprise"
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Permanent — accounts are stored against it.
              </span>
            </label>
            <label className="label">
              Name
              <input
                className="input mt-1"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Enterprise"
              />
            </label>
            <label className="label sm:col-span-2">
              Description
              <input
                className="input mt-1"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What the customer gets, in their words"
              />
            </label>
            <label className="label">
              Price / month
              <input
                className="input mt-1"
                type="number"
                min="0"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              />
            </label>
            <label className="label">
              Branches included
              <input
                className="input mt-1"
                type="number"
                min="1"
                value={draft.includedBranches}
                onChange={(e) => setDraft({ ...draft, includedBranches: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <label className="label">
              Per extra branch / month
              <input
                className="input mt-1"
                type="number"
                min="0"
                value={draft.extraBranchPrice}
                onChange={(e) => setDraft({ ...draft, extraBranchPrice: Number(e.target.value) })}
              />
            </label>
            {LIMITS.map((l) => (
              <label className="label" key={l.key}>
                {l.label}
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  value={limitValue(draft.limits[l.key])}
                  placeholder="unlimited"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      limits: { ...draft.limits, [l.key]: parseLimit(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
          </div>
          {/* What the plan switches on, beyond the counter itself. */}
          <div className="mt-3 flex flex-wrap gap-4">
            {PLAN_FEATURES.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm" title={f.description}>
                <input
                  type="checkbox"
                  checked={draft.features[f.key]}
                  onChange={(e) => setDraft({ ...draft, features: { ...draft.features, [f.key]: e.target.checked } })}
                />
                {f.label}
              </label>
            ))}
          </div>
          <button className="btn mt-3" onClick={() => void create()} disabled={busy === 'new'}>
            <Save className="h-4 w-4" /> Create
          </button>
        </div>
      )}

      {loading ? (
        <div className="card">
          <LoadingBlock />
        </div>
      ) : (
        [plans].map((rows) => {
          if (rows.length === 0) return null;
          return (
            <div className="card" key="plans">
              <h3 className="mb-3 flex items-center gap-2">
                <Tags className="h-4 w-4 text-primary" />
                The price list
              </h3>

              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Price / month</th>
                      <th title="Branches the price covers, and each one beyond at the extra price">Branches incl. · per extra</th>
                      {LIMITS.map((l) => (
                        <th key={l.key}>{l.label}</th>
                      ))}
                      {PLAN_FEATURES.map((f) => (
                        <th key={f.key} title={f.description}>
                          {f.label}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className={p.isActive ? undefined : 'opacity-60'}>
                        <td>
                          <input
                            className="input"
                            style={{ width: 130 }}
                            defaultValue={p.name}
                            onBlur={(e) =>
                              e.target.value !== p.name &&
                              void change(e.target, p.name, p, { name: e.target.value }, `Rename ${p.name} to “${e.target.value}”?`, 'Every shop on this plan sees the new name.')
                            }
                          />
                          <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                            {p.key}
                            {p.isTrial && ' · trial'}
                            {!p.isActive && ' · retired'}
                          </span>
                        </td>
                        <td>
                          {p.isTrial ? (
                            <span className="text-sm text-muted-foreground">free</span>
                          ) : (
                            <input
                              className="input"
                              style={{ width: 100 }}
                              type="number"
                              min="0"
                              defaultValue={p.price}
                              onBlur={(e) =>
                                Number(e.target.value) !== p.price &&
                                void change(
                                  e.target,
                                  String(p.price),
                                  p,
                                  { price: Number(e.target.value) },
                                  `Change ${p.name} from ${taka(p.price)} to ${taka(Number(e.target.value))} a month?`,
                                  'Every shop on this plan is quoted the new price from their next payment.',
                                )
                              }
                            />
                          )}
                        </td>
                        {/* What a shop with more branches pays: the price covers this many, each extra is this much. */}
                        <td>
                          {p.isTrial ? (
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <input
                                className="input"
                                style={{ width: 56 }}
                                type="number"
                                min="1"
                                title="Branches included in the price"
                                defaultValue={p.includedBranches ?? 1}
                                disabled={busy === p.id}
                                onBlur={(e) => {
                                  const v = Math.max(1, Number(e.target.value) || 1);
                                  if (v !== (p.includedBranches ?? 1))
                                    void change(
                                      e.target,
                                      String(p.includedBranches ?? 1),
                                      p,
                                      { includedBranches: v },
                                      `Include ${v} branch${v === 1 ? '' : 'es'} in ${p.name}’s price?`,
                                      'Every shop on this plan is billed for its branches this way from their next payment.',
                                    );
                                }}
                              />
                              <span className="text-xs text-muted-foreground">·</span>
                              <input
                                className="input"
                                style={{ width: 84 }}
                                type="number"
                                min="0"
                                title="Price of each extra branch, per month"
                                defaultValue={p.extraBranchPrice ?? 0}
                                disabled={busy === p.id}
                                onBlur={(e) => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  if (v !== (p.extraBranchPrice ?? 0))
                                    void change(
                                      e.target,
                                      String(p.extraBranchPrice ?? 0),
                                      p,
                                      { extraBranchPrice: v },
                                      `Charge ${taka(v)} a month per extra branch on ${p.name}?`,
                                      'Every shop on this plan with more branches is billed the new amount from their next payment.',
                                    );
                                }}
                              />
                            </span>
                          )}
                        </td>
                        {LIMITS.map((l) => (
                          <td key={l.key}>
                            <input
                              className="input"
                              style={{ width: 88 }}
                              type="number"
                              min="0"
                              placeholder="∞"
                              defaultValue={limitValue(p.limits[l.key])}
                              disabled={busy === p.id}
                              onBlur={(e) => {
                                const next = parseLimit(e.target.value);
                                if (next !== (p.limits[l.key] ?? null)) {
                                  void change(
                                    e.target,
                                    limitValue(p.limits[l.key]),
                                    p,
                                    { limits: { [l.key]: next } },
                                    `Set ${l.label.toLowerCase()} on ${p.name} to ${next === null ? 'unlimited' : next}?`,
                                    'Every shop on this plan is held to it at once.',
                                  );
                                }
                              }}
                            />
                          </td>
                        ))}
                        {PLAN_FEATURES.map((f) => (
                          <td key={f.key}>
                            <label className="inline-flex items-center gap-1.5 text-sm">
                              <input
                                type="checkbox"
                                checked={!!p.features?.[f.key]}
                                disabled={busy === p.id}
                                onChange={async (e) => {
                                  // Controlled: until the answer is yes, the box stays as saved.
                                  const on = e.target.checked;
                                  if (
                                    await confirmAction({
                                      title: `${on ? 'Include' : 'Take'} ${f.label} ${on ? 'in' : 'out of'} ${p.name}?`,
                                      message: on
                                        ? 'Every shop on this plan gets it at once.'
                                        : 'Every shop on this plan loses it at once, unless it is switched on for that shop alone.',
                                      confirmLabel: on ? `Include ${f.label}` : `Take ${f.label} out`,
                                      tone: 'danger',
                                    })
                                  )
                                    await save(p.id, { features: { [f.key]: on } });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">{p.features?.[f.key] ? 'included' : 'not included'}</span>
                            </label>
                          </td>
                        ))}
                        <td>
                          {!p.isTrial && p.isActive && (
                            <button
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Retire — takes it off the shelf, accounts on it keep their limits"
                              disabled={busy === p.id}
                              onClick={() => void retire(p)}
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Blank means unlimited. <strong>0</strong> means none at all — the two are different,
                so a blank field is never saved as a zero.
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
