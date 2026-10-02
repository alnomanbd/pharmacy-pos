import { useState } from 'react';
import { Gauge, Pencil, Save } from 'lucide-react';
import { platformApi, type SeatUsage, type ShopPlanUsage, type ShopSignup } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { Spinner } from '@dawai/shared/components/Spinner';
import Modal from './Modal';
import { BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';

/**
 * What a shop is allowed: counters and staff logins against their limits, and
 * whether each limit is its plan's or its own. A shop that signed up with ten
 * counters is given ten for its trial; this is where an operator sees that,
 * and changes it.
 */

const seat = (s?: SeatUsage) => (s ? `${s.used} / ${s.limit ?? '∞'}` : '—');
const limitText = (n: number | null | undefined) => (n === null || n === undefined ? 'unlimited' : String(n));

/** "Asked for 10 counters · 2 branches · Licence DL-1234" — only what they gave. */
export function signupSummary(s?: ShopSignup | null): string {
  if (!s) return '';
  const parts: string[] = [];
  if (s.counters) parts.push(`Asked for ${s.counters} ${s.counters === 1 ? 'counter' : 'counters'}`);
  if (s.outlets) parts.push(`${s.outlets} ${s.outlets === 1 ? 'branch' : 'branches'}`);
  if (s.licence?.trim()) parts.push(`Licence ${s.licence.trim()}`);
  return parts.join(' · ');
}

/** The two axes a shop can be given its own ceiling on, and how far (the API's bounds). */
const LIMIT_AXES = [
  { key: 'outlets', label: 'Branches', max: 200 },
  { key: 'terminals', label: 'Counters', max: 500 },
  { key: 'shopUsers', label: 'Staff logins', max: 1000 },
] as const;
type LimitAxis = (typeof LIMIT_AXES)[number]['key'];

/** Each axis in the edit dialog: "use the plan", or a number typed in. */
type LimitDraft = Record<LimitAxis, { usePlan: boolean; value: string }>;

const axisBad = (d: { usePlan: boolean; value: string }, max: number) => {
  if (d.usePlan) return false;
  const n = Number(d.value);
  return d.value.trim() === '' || !Number.isInteger(n) || n < 1 || n > max;
};

export default function ShopLimitsCard({
  shopId,
  usage,
  canEdit,
  onSaved,
}: {
  shopId: string;
  usage: ShopPlanUsage | null;
  /** `shops.plan` — a sixth counter on a Plus shop is something we sell. */
  canEdit: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LimitDraft>({
    outlets: { usePlan: true, value: '' },
    terminals: { usePlan: true, value: '' },
    shopUsers: { usePlan: true, value: '' },
  });

  const invalid = LIMIT_AXES.some(({ key, max }) => axisBad(draft[key], max));

  const openEdit = () => {
    if (!usage) return;
    const from = (s: SeatUsage) => ({
      usePlan: !s.overridden,
      value: s.overridden && s.limit !== null ? String(s.limit) : '',
    });
    setDraft({
      outlets: usage.outlets ? from(usage.outlets) : { usePlan: true, value: '' },
      terminals: from(usage.terminals),
      shopUsers: from(usage.shopUsers),
    });
    setOpen(true);
  };

  const save = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      await platformApi.updateLimits(shopId, {
        outlets: draft.outlets.usePlan ? null : Number(draft.outlets.value),
        terminals: draft.terminals.usePlan ? null : Number(draft.terminals.value),
        shopUsers: draft.shopUsers.usePlan ? null : Number(draft.shopUsers.value),
      });
      toast('Limits saved.');
      setOpen(false);
      await onSaved();
    } catch (e) {
      toast(errorMessage(e, 'Could not save those limits.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mb-0 flex flex-1 items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" /> Limits
        </h3>
        {canEdit && usage && (
          <button type="button" className={BTN_OUTLINE} onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit limits
          </button>
        )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {LIMIT_AXES.map(({ key, label }) => {
          const s = usage?.[key];
          return (
            <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3" data-testid={`limit-${key}`}>
              <div className="min-w-0 flex-1 basis-40">
                <strong className="block text-sm">{label}</strong>
                <span className="block text-xs text-muted-foreground">
                  {s?.overridden
                    ? `Set for this shop · the plan allows ${limitText(s.planLimit)}`
                    : `From the ${usage?.planName ?? ''} plan`}
                </span>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${s?.full ? 'text-destructive' : ''}`}>
                {seat(s)}
              </span>
              <span className={`pill ${s?.overridden ? 'called' : 'cancelled'}`}>
                {s?.overridden ? 'custom' : 'plan'}
              </span>
            </div>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit limits"
        width="max-w-md"
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={invalid || busy} onClick={() => void save()}>
              {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {LIMIT_AXES.map(({ key, label, max }) => {
            const d = draft[key];
            const s = usage?.[key];
            const bad = axisBad(d, max);
            return (
              <fieldset key={key} className="min-w-0">
                <legend className="label mb-1">{label}</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.usePlan}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [key]: {
                          usePlan: e.target.checked,
                          value: d.value || String(s?.limit ?? s?.planLimit ?? 1),
                        },
                      })
                    }
                  />
                  Use plan default ({limitText(s?.planLimit)})
                </label>
                <input
                  className="input mt-2"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  aria-label={`${label} for this shop`}
                  aria-invalid={bad}
                  disabled={d.usePlan}
                  value={d.usePlan ? '' : d.value}
                  placeholder={d.usePlan ? limitText(s?.planLimit) : ''}
                  onChange={(e) => setDraft({ ...draft, [key]: { usePlan: false, value: e.target.value } })}
                />
                {bad && (
                  <span className="mt-0.5 block text-[11px] text-destructive">A whole number from 1 to {max}.</span>
                )}
              </fieldset>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Lowering a limit switches nothing off. The shop just cannot add more until it is under it.
          </p>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
    </div>
  );
}
