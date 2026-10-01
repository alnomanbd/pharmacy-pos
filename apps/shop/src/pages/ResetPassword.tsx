import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { passwordProblem } from '@dawai/shared/lib/password';
import PasswordMeter from '@dawai/shared/components/PasswordMeter';
import { useT } from '../i18n/ui';
import AuthDoor from './AuthDoor';

/**
 * Setting a new password from the emailed link.
 *
 * The reset signs out every session on the server, so the only way on is to
 * sign in again with the new password — which is where this sends you.
 */
export default function ResetPassword() {
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError(t('The two passwords do not match.'));
    setBusy(true);
    setError('');
    try {
      await authApi.resetPassword(token, password);
      navigate('/login?reset=1', { replace: true });
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      setError(res?.data?.message || t('Could not reset the password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthDoor
      heroTitle={
        <>
          {t('New password,')} <em>{t('same counter')}</em>
        </>
      }
      heroText={t('Every other device is signed out at the same time, so only you hold the keys.')}
    >
      <h1 className="shop-title">{t('Set a new password')}</h1>

      {!token ? (
        <>
          <div className="shop-error" role="alert">
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>{t('This link is missing its reset token. Open the link from the email again, or ask for a new one.')}</span>
          </div>
          <p className="shop-alt">
            <Link to="/forgot-password" className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" /> {t('Ask for a new link')}
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="shop-sub">{t('You will sign in again on your other devices after this.')}</p>

          {error && (
            <div className="shop-error" role="alert">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="shop-form">
            <div>
              <div className="shop-field-head">
                <label className="shop-label" htmlFor="reset-pw">
                  {t('New password')}
                </label>
              </div>
              <div className="shop-input-wrap">
                <Lock className="shop-input-icon h-4 w-4" />
                <input
                  id="reset-pw"
                  type={show ? 'text' : 'password'}
                  required
                  autoFocus
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="shop-input has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? t('Hide password') : t('Show password')}
                  className="shop-eye"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordMeter value={password} />
            </div>

            <div>
              <div className="shop-field-head">
                <label className="shop-label" htmlFor="reset-confirm">
                  {t('Confirm new password')}
                </label>
              </div>
              <div className="shop-input-wrap">
                <Lock className="shop-input-icon h-4 w-4" />
                <input
                  id="reset-confirm"
                  type={show ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="shop-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" disabled={busy} className="shop-submit">
              {busy ? (
                <>
                  <Loader2 className="shop-spin h-4 w-4" />
                  {t('Saving…')}
                </>
              ) : (
                <>
                  {t('Save the new password')}
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
