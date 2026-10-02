import { useEffect, useState } from 'react';
import { UserRoundSearch, Loader2 } from 'lucide-react';
import { platformApi, type AgentRow } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { errorMessage } from '../lib/ui';

/**
 * Which field agent brought this shop in — set by their sign-up link, or here
 * by hand when the shop signed up over the phone. The agent earns their share
 * of every payment accepted from now on.
 */
export default function ShopAgentCard({ shopId, current, onChanged }: { shopId: string; current: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platformApi
      .agents()
      .then(setAgents)
      .catch(() => undefined);
  }, []);
  useEffect(() => setValue(current), [current]);

  const save = async () => {
    setBusy(true);
    try {
      await platformApi.assignAgent(shopId, value || null);
      toast(value ? `Now under ${value}.` : 'No agent now.');
      onChanged();
    } catch (e) {
      toast(errorMessage(e, 'Could not change the agent.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const known = agents.find((a) => a.code === current);
  return (
    <div className="card">
      <h3 className="mb-1 flex items-center gap-2">
        <UserRoundSearch className="h-4 w-4" /> Agent
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">
        {current
          ? known
            ? `${known.name} (${known.code}) earns ${known.commissionPercent}% of every payment from this shop.`
            : `Signed up with the code ${current}, which no agent has.`
          : 'Nobody — this shop came in by itself.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Agent">
          <option value="">No agent</option>
          {agents.filter((a) => a.active || a.code === current).map((a) => (
            <option key={a._id} value={a.code}>
              {a.name} ({a.code}) — {a.commissionPercent}%
            </option>
          ))}
        </select>
        <button className="btn btn-sm" disabled={busy || value === current} onClick={() => void save()}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}
