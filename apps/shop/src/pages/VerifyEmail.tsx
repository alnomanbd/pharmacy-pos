import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { useT } from '../i18n/ui';
import AuthDoor from './AuthDoor';

/**
 * Confirming the shop owner's email from the link we sent.
 *
 * Runs once on arrival — a token is single-use, and React's double effect in
 * development would otherwise spend it and then report the second call as a
 * failure.
 */
export default function VerifyEmail() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch((err: unknown) => {
        const res = (err as { response?: { data?: { message?: string } } }).response;
        setMessage(res?.data?.message || '');
        setState('failed');
      });
  }, [token]);

  return (
    <AuthDoor
      heroTitle={
        <>
          {t('One address,')} <em>{t('proved once')}</em>
        </>
      }
      heroText={t('Approvals, payment receipts and password resets all go to this email.')}
    >
      <h1 className="shop-title">{t('Confirm your email')}</h1>

      {state === 'working' && (
        <p className="shop-sub inline-flex items-center gap-2">
          <Loader2 className="shop-spin h-4 w-4" /> {t('Checking the link…')}
        </p>
      )}

      {state === 'done' && (
        <div className="shop-ok" role="status">
          <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
          <span>{t('Your email is confirmed. Nothing else to do.')}</span>
        </div>
      )}

      {state === 'failed' && (
        <div className="shop-error" role="alert">
          <AlertCircle className="mt-px h-4 w-4 shrink-0" />
          <span>
            {message || t('That confirmation link is invalid or has expired. Sign in and ask for a new one from your profile.')}
          </span>
        </div>
      )}

      {state !== 'working' && (
        <Link to="/login" className="shop-submit mt-6">
          {t('Go to sign in')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </AuthDoor>
  );
}
