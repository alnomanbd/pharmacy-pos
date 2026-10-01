import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { useT } from '../i18n/ui';
import AuthDoor from './AuthDoor';

/**
 * "I forgot my password", for the shop.
 *
 * The server answers the same whether or not the address is registered, so
 * this page does too — it never tells a stranger which emails have accounts.
 * The link comes by email (and by SMS when the account has a phone).
 */
export default function ForgotPassword() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      setError(res?.data?.message || t('Could not send the link. Try again in a minute.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthDoor
      heroTitle={
        <>
          {t('Locked out?')} <em>{t('Back in a minute')}</em>
        </>
      }
      heroText={t('We send a one-time link to the email on the account. Your bills, stock and khata are untouched.')}
    >
      <h1 className="shop-title">{t('Forgot password')}</h1>

      {sent ? (
        <>
          <div className="shop-ok" role="status">
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
            <span>
              {t('If that email has an account, a reset link is on its way. Check the inbox and the spam folder.')}
            </span>
          </div>
          <p className="shop-alt">
            <Link to="/login" className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {t('Back to sign in')}
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="shop-sub">{t('Enter the email you sign in with.')}</p>

          {error && (
            <div className="shop-error" role="alert">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="shop-form">
            <div>
              <div className="shop-field-head">
                <label className="shop-label" htmlFor="forgot-email">
                  {t('Email')}
                </label>
              </div>
              <div className="shop-input-wrap">
                <Mail className="shop-input-icon h-4 w-4" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@pharmacy.com"
                  className="shop-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" disabled={busy} className="shop-submit">
              {busy ? (
                <>
                  <Loader2 className="shop-spin h-4 w-4" />
                  {t('Sending…')}
                </>
              ) : (
                <>
                  {t('Send the link')}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="shop-alt">
            <Link to="/login" className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {t('Back to sign in')}
            </Link>
          </p>
        </>
      )}
    </AuthDoor>
  );
}
