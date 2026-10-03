import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Languages,
  Lock,
  Mail,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useT, useLangStore } from '../i18n/ui';
import AuthScene from '../components/AuthScene';
import { BRAND } from '../brand';

/**
 * The shop's own sign-in, in the middle of the scene (components/AuthScene).
 *
 * One account, one password, for everybody who works in the shop. An
 * operator's console credential is refused here (see `App.tsx`), because the
 * console is its own door.
 *
 * A salesman signs in on their own machine with their own account, which is the
 * point: every sale carries who made it, and the cash is counted against a
 * name at the end of the day.
 */
const PLATFORM_ROLES = ['platformAdmin', 'platformStaff'];

/** The greeting a counter would give at this hour. */
const greetingFor = (hour: number) =>
  hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

export default function Login() {
  const t = useT();
  const [params] = useSearchParams();
  /* The marketing site's sign-in sends the address along, so it arrives filled. */
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  /* …and the language the visitor was reading the site in. */
  const setLang = useLangStore((st) => st.setLang);
  useEffect(() => {
    const lang = params.get('lang');
    if (lang === 'bn' || lang === 'en') setLang(lang);
  }, [params, setLang]);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const justReset = params.get('reset') === '1';
  const lang = useLangStore((st) => st.lang) === 'bn' ? 'bn' : 'en';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      if (PLATFORM_ROLES.includes(res.user.role)) {
        // Right credential, wrong door. Drop the session rather than keeping
        // one this app will refuse on the next screen anyway.
        logout();
        setError('That is an operator account. This door is for the shop.');
        return;
      }
      login(res.user, res.accessToken);
      /* The owner and the pharmacist start on the dashboard; a salesman on the POS. */
      navigate(res.user.role === 'salesman' ? '/' : '/dashboard');
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      setError(res?.data?.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScene
      below={
        <>
          {t('New to Dawai?')}{' '}
          <a href={`${BRAND.siteUrl}/${lang}/register/`} className="font-semibold text-emerald-300 underline-offset-4 hover:text-emerald-200 hover:underline">
            {t('Start a free trial')} →
          </a>
        </>
      }
    >

          <h1 className="shop-title">{t(greetingFor(new Date().getHours()))}</h1>
          <p className="shop-sub">{t('Sign in to open today’s counter.')}</p>

          {justReset && (
            <div className="shop-ok" role="status">
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
              <span>{t('Password changed. Sign in with the new one.')}</span>
            </div>
          )}

          {error && (
            <div className="shop-error" role="alert">
              <AlertCircle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="shop-form">
            <div>
              <div className="shop-field-head">
                <label className="shop-label" htmlFor="shop-email">
                  {t('Email')}
                </label>
              </div>
              <div className="shop-input-wrap">
                <Mail className="shop-input-icon h-4 w-4" />
                <input
                  id="shop-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@pharmacy.com"
                  className="shop-input"
                />
              </div>
            </div>

            <div>
              <div className="shop-field-head">
                <label className="shop-label" htmlFor="shop-password">
                  {t('Password')}
                </label>
                <Link to="/forgot-password" className="shop-forgot">
                  {t('Forgot password?')}
                </Link>
              </div>
              <div className="shop-input-wrap">
                <Lock className="shop-input-icon h-4 w-4" />
                <input
                  id="shop-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="shop-input has-toggle"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={t(showPw ? 'Hide password' : 'Show password')}
                  className="shop-eye"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="shop-submit">
              {loading ? (
                <>
                  <Loader2 className="shop-spin h-4 w-4" />
                  {t('Signing in…')}
                </>
              ) : (
                <>
                  {t('Sign in')}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Three things a shop worries about, said in three words each. */}
          <ul className="shop-badges">
            <li>
              <WifiOff className="h-3.5 w-3.5" /> {t('Works offline')}
            </li>
            <li>
              <ShieldCheck className="h-3.5 w-3.5" /> {t('Secure sign-in')}
            </li>
            <li>
              <Languages className="h-3.5 w-3.5" /> {t('বাংলা · English')}
            </li>
          </ul>

    </AuthScene>
  );
}