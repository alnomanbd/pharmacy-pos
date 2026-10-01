import { useCallback, useEffect, useState } from 'react';
import { Tags, Plus, Save, Archive, Users, Monitor, Store, X } from 'lucide-react';
import { platformApi, type ShopPlan as Plan } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';

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
  { key: 'outlets', label: 'Outlets', icon: Store },
] as const;

const EMPTY = {
  key: '',
  name: '',
  description: '',
  price: 0,
  sortOrder: 1,
  limits: {
    terminals: null as number | null,
    shopUsers: null as number | null,
    outlets: null as number | null,
  },
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
                      {LIMITS.map((l) => (
                        <th key={l.key}>{l.label}</th>
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
                              e.target.value !== p.name && save(p.id, { name: e.target.value })
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
                                save(p.id, { price: Number(e.target.value) })
                              }
                            />
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
                                  save(p.id, { limits: { [l.key]: next } });
                                }
                              }}
                            />
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
