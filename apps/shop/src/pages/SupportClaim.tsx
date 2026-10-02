import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import api, { getData } from '@dawai/shared/api/client';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import type { AuthUser } from '@dawai/shared/types';
import { useT } from '../i18n/ui';

interface ClaimedView {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
  viewing: { shop: { id: string; name: string; status: string }; operator: string };
}

/**
 * Where a support view arrives from the operator console.
 *
 * The console cannot put a token into this app — it is a different origin — so
 * it opens this page with a one-time code and the code is traded for the
 * session here. The code is spent the moment this runs, which is why the
 * exchange must happen exactly once even though React runs effects twice in
 * development. `main.tsx` skips the start-up refresh on this page, so the
 * cookie on this host cannot race the claim and win.
 */
export default function SupportClaim() {
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const claimed = useRef(false);

  useEffect(() => {
    const code = params.get('c');
    if (!code) {
      setError(t('That support link is incomplete.'));
      return;
    }
    if (claimed.current) return;
    claimed.current = true;

    (async () => {
      try {
        const view = await getData<ClaimedView>(api.post('/auth/impersonation/claim', { code }));
        useAuthStore.getState().startImpersonation({
          accessToken: view.accessToken,
          user: view.user,
          view: {
            shop: view.viewing.shop.name,
            userName: view.user.name,
            operator: view.viewing.operator,
            expiresAt: view.expiresAt,
          },
        });
        /*
         * To the sales book, not the till. The till opens on "Start the day",
         * which a read-only view cannot do, and on a phone it has no menu to
         * leave by; Sales has the shell, and every role may open it.
         * Replace, so the spent code is not left in the history entry behind us.
         */
        navigate('/sales', { replace: true });
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { message?: string } } }).response;
        setError(res?.data?.message || t('That support link is no longer valid.'));
      }
    })();
  }, [params, navigate, t]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      {error ? (
        <div
          role="alert"
          className="flex max-w-sm items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-px h-4 w-4 shrink-0" />
          <span>
            {error} {t('Open the shop again from the console — a support link lasts a minute and works once.')}
          </span>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Opening the support view…')}
        </p>
      )}
    </main>
  );
}
