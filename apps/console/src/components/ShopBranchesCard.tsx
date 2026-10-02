import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { platformApi, type ShopBranchesInfo } from '../api';

/**
 * A shop's branches, and what its plan charges for them — the first thing
 * asked when a chain rings about its bill. Raising the number it may have is
 * in the Limits card, beside counters and staff logins.
 */
const taka = (n: number) => `৳ ${n.toLocaleString('en-BD')}`;

export default function ShopBranchesCard({ shopId }: { shopId: string }) {
  const [info, setInfo] = useState<ShopBranchesInfo | null>(null);

  useEffect(() => {
    platformApi
      .shopBranches(shopId)
      .then(setInfo)
      .catch(() => undefined);
  }, [shopId]);

  if (!info) return null;
  const active = info.branches.filter((b) => b.active);
  return (
    <div className="card">
      <h3 className="mb-1 flex items-center gap-2">
        <MapPin className="h-4 w-4" /> Branches
        <span className="pill">{active.length}</span>
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">
        {info.plan.limit === null ? 'No limit on' : `Up to ${info.plan.limit} on`} {info.plan.name}
        {!info.plan.isTrial && (
          <>
            {' '}
            · the price covers {info.plan.included}
            {info.plan.extraBranchPrice > 0 ? `, then ${taka(info.plan.extraBranchPrice)} a month each` : ''} · this shop pays{' '}
            <strong className="text-foreground">{taka(info.monthlyNow)}</strong> a month
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {info.branches.map((b) => (
          <span key={b._id} className={`pill ${b.active ? '' : 'cancelled'}`} title={[b.address, b.phone].filter(Boolean).join(' · ')}>
            {b.name}
            {b.isMain ? ' · main' : ''}
            {!b.active ? ' · closed' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
