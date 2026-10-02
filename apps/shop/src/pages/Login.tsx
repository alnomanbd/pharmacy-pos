import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { taka } from '../api';
import { useT, useLangStore } from '../i18n/ui';
import { BRAND } from '../brand';

/**
 * The shop's own sign-in.
 *
 * One account, one password, for everybody who works in the shop. An
 * operator's console credential is refused here (see `App.tsx`), because the
 * console is its own door.
 *
 * A salesman signs in on their own machine with their own account, which is the
 * point: every sale carries who made it, and the cash is counted against a
 * name at the end of the day.
 */
const SITE_URL = BRAND.siteUrl;
const PLATFORM_ROLES = ['platformAdmin', 'platformStaff'];

/* The mark. A lenticular pill: the two halves of the shop's own packaging. */
function ShopMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" />
      <path d="M12 8.5a3.5 3.5 0 0 0 0 7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Illustration, deliberately not the shop's real numbers.
 *
 * This renders before anybody is authenticated, so it cannot show a real till —
 * and pretending otherwise would be a lie in the first thing a user sees. What
 * it does instead is *move like* one: takings tick up, a bill lands on the top
 * of the tape, the scanner walks the next pack. The counter is open in the
 * sense that it is the thing being signed into, drawn honestly.
 */
const TAPE = [
  ['Napa Extra 500mg', '×1 strip', 30],
  ['Seclo 20mg', '×2 strips', 60],
  ['Alatrol 10mg', '×1 strip', 20],
  ['Fexo 120mg', '×1 strip', 40],
  ['Pantonix 40mg', '×1 strip', 30],
  ['Monocept 10mg', '×1 strip', 45],
  ['Ace Plus', '×1 strip', 30],
] as const;

/* Hard bars of a pack code — drawn, not scraped off the web. */
const BARS = [2, 1, 3, 1, 1, 2, 2, 1, 4, 1, 1, 2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 1, 1, 4, 2, 1, 3, 1, 1, 2, 2, 1, 1, 3, 1, 2];
/* Each bar is followed by a 2-unit gap, so the code's span is bars + gaps. */
const BAR_SPAN = BARS.reduce((a, b) => a + b, 0) + (BARS.length - 1) * 2;

/** A plausible morning already behind the counter, before the visitor arrives. */
const TAKINGS_AT_OPEN = 84_120;
const BILLS_AT_OPEN = 214;

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The until close, on its own clock.
 *
 * Every beat lands a new bill: the top row of the tape turns over, the takings
 * rise by the amount of a sale, and the bill count goes with it — three things
 * moving together, the way one sale moves them on a real till. The numbers are
 * deterministic so the screen never stutters between renders.
 */
function useCounterTurn() {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTurn((t) => t + 1), 3_600);
    return () => clearInterval(id);
  }, []);
  return turn;
}

function TillBoard({ turn, clock }: { turn: number; clock: string }) {
  const takings = TAKINGS_AT_OPEN + turn * 11 + (turn % 7) * 3;
  const bills = BILLS_AT_OPEN + turn;
  const rows = [0, 1, 2, 3, 4].map((i) => TAPE[(turn + i) % TAPE.length]);

  return (
    <div className="shop-till">
      <div className="shop-till-bar">
        <b>C1</b>
        <span>POS</span>
        <span className="shop-till-clock">{clock}</span>
      </div>
      <div className="shop-till-now">
        <p>Today&apos;s takings</p>
        <span className="shop-till-takings">{taka(takings)}</span>
        <p className="shop-till-who">
          {bills} bills today · 41 on the khata
        </p>
      </div>
      <div className="shop-till-rows">
        {rows.map(([name, qty, amt], i) => (
          <div key={i === 0 ? `fresh-${turn}` : `row-${turn}-${i}`} className={`shop-till-row${i === 0 ? ' is-fresh' : ''}`}>
            <span className="shop-till-no">{String(48 + ((turn + i) % 60)).padStart(3, '0')}</span>
            <span className="shop-till-name">{name}</span>
            <span className="shop-till-qty">{qty}</span>
            <span className="shop-till-amt">{taka(amt)}</span>
          </div>
        ))}
      </div>
      <div className="shop-scan" aria-hidden="true">
        <svg viewBox={`0 0 ${BAR_SPAN} 30`} preserveAspectRatio="none">
          {BARS.map((w, i) => {
            const x = BARS.slice(0, i).reduce((a, b) => a + b + 2, 0);
            return <rect key={i} x={x} y="0" width={w} height="30" fill="currentColor" />;
          })}
        </svg>
        <span className="shop-scanline" />
      </div>
    </div>
  );
}

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
  const turn = useCounterTurn();
  const clock = useLiveClock();

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
    <div className="shop-shell">
      <aside className="shop-hero">
        <div className="shop-hero-inner">
          <div className="shop-brand">
            <span className="shop-brand-mark">
              <ShopMark />
            </span>
            <div>
              <div className="shop-brand-name">{BRAND.name}</div>
              <div className="shop-brand-sub">{t('Pharmacy')}</div>
            </div>

            {/* The way out. Most people on this page came from the website and a
                fair number want to go back to it before they commit. */}
            <a className="shop-exit" href={SITE_URL}>
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t('Back to the website')}</span>
            </a>
          </div>

          <div className="shop-hero-body">
            <span className="shop-eyebrow">
              <span className="shop-pulse-dot" />
              Counter 1 · POS live
            </span>

            <h2 className="shop-hero-title">
              The counter is <em>open for business</em>
            </h2>
            <p className="shop-hero-text">
              Takings, stock and the khata are where the last sale left them. Sign in and pick
              up the day from the bill you rang up yourself.
            </p>

            <TillBoard turn={turn} clock={clock} />

            <div className="shop-hero-foot">
              <span>
                <ShieldCheck className="h-3.5 w-3.5" /> Every sale under your name
              </span>
              {['Cash counted every day', 'Keeps selling without a line'].map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="shop-panel">
        <div className="shop-card">
          <h1 className="shop-title">Sign in</h1>
          <p className="shop-sub">Open today&apos;s counter — every bill you ring up carries your name.</p>

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
                  Email
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
                  aria-label={showPw ? 'Hide password' : 'Show password'}
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
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="shop-trust">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            The register keeps who rang what, from the first bill of the day to the count at
            close — and it keeps working when the line drops.
          </p>

        </div>
      </main>
    </div>
  );
}