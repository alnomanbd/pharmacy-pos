import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useT } from '../i18n/ui';

/**
 * The back room's pages, kept from the counter.
 *
 * The rail already leaves them out for a salesman and the server refuses them
 * anyway — but an address typed in, or a link from an old bookmark, used to
 * open the page and let it ask the server for everything, which answered each
 * request with a red toast and left an empty page saying "add the first item".
 * This says plainly whose page it is instead.
 */
export default function BackRoom({ children }: { children: ReactNode }) {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'salesman') return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card flex flex-col items-center gap-3 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Lock className="h-6 w-6" />
        </span>
        <h2 className="text-base">{t('This page is for the owner and the pharmacist')}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t('It holds purchase prices and the shop’s own money. Ask the owner if you need something from it.')}
        </p>
        <div className="mt-2 flex gap-2">
          <Link to="/" className="btn h-9">
            {t('Go to the POS')}
          </Link>
          <Link to="/sales" className="btn btn-ghost h-9 border border-border">
            {t('Sales')}
          </Link>
        </div>
      </div>
    </div>
  );
}
