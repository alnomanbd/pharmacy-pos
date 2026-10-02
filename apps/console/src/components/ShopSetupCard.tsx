import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { platformApi, type ShopSetup } from '../api';

/**
 * Where a shop is in getting started — the same six steps it sees in its own
 * app, so an operator on the phone can say "next, add your suppliers".
 */
export default function ShopSetupCard({ shopId }: { shopId: string }) {
  const [setup, setSetup] = useState<ShopSetup | null>(null);

  useEffect(() => {
    platformApi
      .shopSetup(shopId)
      .then(setSetup)
      .catch(() => undefined);
  }, [shopId]);

  if (!setup) return null;
  const complete = setup.done >= setup.total;

  return (
    <div className="card">
      <h3 className="mb-1 flex items-center gap-2">
        <ListChecks className="h-4 w-4" /> Getting started
        <span className={`pill ${complete ? 'completed' : 'waiting'}`}>
          {setup.done}/{setup.total}
        </span>
        {setup.dismissed && !complete && <span className="pill neutral">hidden by the shop</span>}
      </h3>
      <ol className="mt-2 grid gap-1 sm:grid-cols-2">
        {setup.steps.map((s) => (
          <li key={s.key} className={`flex items-start gap-2 text-sm ${s.done ? 'text-muted-foreground' : ''}`}>
            {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
