import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { platformApi, PLAN_FEATURES, type PlanFeatureKey, type ShopPlanUsage } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { confirmAction } from '@dawai/shared/lib/confirm';
import { errorMessage } from '../lib/ui';

/**
 * What a shop has switched on beyond the counter — online orders, for one.
 *
 * Each feature comes with the shop's plan; here an operator can give it to
 * this one shop anyway (a deal, a pilot) or take it away, or put it back on
 * whatever the plan says. Changing plan in the Plans catalogue moves every
 * shop that follows it; this moves only this one.
 */
type Choice = 'plan' | 'on' | 'off';

export default function ShopFeaturesCard({
  shopId,
  usage,
  canEdit,
  onSaved,
}: {
  shopId: string;
  usage: ShopPlanUsage | null;
  canEdit: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<PlanFeatureKey | null>(null);
  const f = usage?.features;
  if (!f) return null;

  const choiceOf = (k: PlanFeatureKey): Choice => (f.overridden[k] ? (f.on[k] ? 'on' : 'off') : 'plan');

  const set = async (k: PlanFeatureKey, c: Choice) => {
    // The select is controlled, so on a no it still shows what is saved.
    const label = PLAN_FEATURES.find((p) => p.key === k)?.label ?? k;
    const planName = usage?.planName ?? 'its';
    if (
      !(await confirmAction({
        title:
          c === 'plan'
            ? `Put ${label} back to what the ${planName} plan says?`
            : `Turn ${label} ${c} for this shop?`,
        message:
          c === 'plan'
            ? `It goes ${f.plan[k] ? 'on' : 'off'} for this shop, and follows the plan from now on.`
            : `This shop ${c === 'on' ? 'gets' : 'loses'} it at once, whatever the ${planName} plan says.`,
        confirmLabel: c === 'plan' ? 'Follow the plan' : `Turn it ${c}`,
        tone: 'danger',
      }))
    )
      return;
    setBusy(k);
    try {
      await platformApi.updateFeatures(shopId, { [k]: c === 'plan' ? null : c === 'on' });
      toast('Saved.');
      await onSaved();
    } catch (e) {
      toast(errorMessage(e, 'Could not change that.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <h3 className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" /> Features
      </h3>
      <div className="divide-y divide-border rounded-lg border border-border">
        {PLAN_FEATURES.map(({ key, label, description }) => (
          <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3" data-testid={`feature-${key}`}>
            <div className="min-w-0 flex-1 basis-56">
              <strong className="flex items-center gap-2 text-sm">
                {label}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    f.on[key] ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {f.on[key] ? 'On' : 'Off'}
                </span>
              </strong>
              <span className="block text-xs text-muted-foreground">
                {description}.{' '}
                {f.overridden[key]
                  ? `Set for this shop — the ${usage?.planName ?? ''} plan ${f.plan[key] ? 'includes it' : 'does not include it'}.`
                  : `From the ${usage?.planName ?? ''} plan.`}
              </span>
            </div>
            <select
              className="input h-9 w-auto"
              aria-label={`${label} for this shop`}
              value={choiceOf(key)}
              disabled={!canEdit || busy === key}
              onChange={(e) => void set(key, e.target.value as Choice)}
            >
              <option value="plan">As the plan says ({f.plan[key] ? 'on' : 'off'})</option>
              <option value="on">On for this shop</option>
              <option value="off">Off for this shop</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
