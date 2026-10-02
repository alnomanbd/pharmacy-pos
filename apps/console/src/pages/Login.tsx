import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import type { Role } from '@dawai/shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import { BRAND } from '../brand';
import ControlRoom, { FEED, useFeed } from '../components/ControlRoom';

/**
 * The console's own sign-in.
 *
 * Deliberately not the shop app's login page with a different redirect:
 *
 * - The shop sign-in does not accept an operator account, so there is no path
 *   from the page every customer can reach to the account that can suspend
 *   every customer.
 * - This page refuses a shop credential even when it is correct, and says
 *   plainly where that person should go instead.
 *
 * There is no registration and no self-service reset: an operator account is
 * created by another operator.
 *
 * ## How it looks
 *
 * The same family as the marketing site and the shop app: Dawai's deep teal,
 * the capsule mark, one soft glow. The left panel carries the three conditions
 * of entry as three short lines rather than paragraphs, so they are read in a
 * glance, and the deployment badge, because a staging console that looks
 * exactly like production is how somebody suspends a real customer by
 * accident. On a phone the panel shrinks to a header strip and the conditions
 * move under the form.
 */
const PLATFORM_ROLES: Role[] = ['platformAdmin', 'platformStaff'];

const APP_URL = BRAND.shopUrl;

const TERMS = [
  { icon: History, head: 'Every action is recorded', body: 'Your name, the time and your address, on a trail nobody can edit.' },
  { icon: KeyRound, head: 'Two-factor', body: 'An authenticator code keeps this account yours.' },
  { icon: Lock, head: 'Team only', body: 'Shop logins are refused here, even correct ones.' },
] as const;

/** The capsule, split down the middle: the same mark as the site and the shop app. */
function Mark({ className = 'h-11 w-11' }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 text-white shadow-[0_8px_24px_-6px_rgb(20_184_166/0.55)] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" aria-hidden="true" fill="none">
        <rect x="3.25" y="7.25" width="17.5" height="9.5" rx="4.75" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.25a4.75 4.75 0 0 0 0 9.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

function EnvBadge({ local }: { local: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ring-1 ${
        local
          ? 'bg-amber-400/10 text-amber-200 ring-amber-300/25'
          : 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/25'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${local ? 'bg-amber-300' : 'bg-emerald-300'}`} />
      {local ? 'Local' : 'Production'}
    </span>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  /* The host as served, so the badge says where you actually are rather than
     where a build-time constant thought you would be. */
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host);
  const shopHost = APP_URL.replace(/^https?:\/\//, '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password, needsCode ? code : undefined);
      if (!PLATFORM_ROLES.includes(res.user.role)) {
        // The credential was right; it is simply not for this app. Drop the
        // session rather than keeping one this console will refuse anyway.
        logout();
        setError(`This sign-in is for operators. Shop accounts sign in at ${APP_URL}`);
        return;
      }
      login(res.user, res.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { code?: string; message?: string } } }).response;
      if (res?.data?.code === 'TWO_FACTOR_REQUIRED') {
        setNeedsCode(true);
        setError('');
        return;
      }
      setError(res?.data?.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden lg:h-[100dvh] lg:min-h-[600px] bg-[radial-gradient(120%_90%_at_50%_0%,#18225a_0%,#0a1030_45%,#04071a_100%)] text-white">
      {/* The light: two slow pools, indigo and cyan, behind a fading dot grid. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="dw-glow absolute -left-[15%] -top-[25%] h-[75%] w-[75%] rounded-full bg-indigo-500/25 blur-[120px]" />
        <div className="dw-glow-slow absolute -bottom-[30%] -right-[10%] h-[70%] w-[70%] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]" />
      </div>

      {/* Every pharmacy, from above — see components/ControlRoom. */}
      <ControlRoom />

      {/* ---- the top bar ---- */}
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex items-center gap-3">
          <Mark className="h-10 w-10" />
          <div className="leading-tight">
            <strong className="block text-[16px] font-bold tracking-tight">{BRAND.name}</strong>
            <small className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200/80">{BRAND.console}</small>
          </div>
        </div>
        <EnvBadge local={isLocal} />
      </header>

      {/* Short laptop screens (720px and under) get a tighter card rather than a scrollbar. */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8 lg:py-4 [@media(max-height:780px)]:lg:py-2">
        {/* On a phone the room is too small to draw; the feed passes above the card instead. */}
        <PhoneFeed />

        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="console-card relative w-full max-w-[420px] rounded-[28px] p-[1.5px] text-foreground"
        >
        <div className="relative w-full rounded-[26px] bg-card p-6 sm:p-9 [@media(max-height:780px)]:sm:p-7">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            Operators only
          </div>
          <h2 className="mt-3 text-[26px] font-bold tracking-tight text-foreground">
            {needsCode ? 'Enter your code' : 'Sign in'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsCode
              ? 'Password accepted. Now the six digits from your authenticator app.'
              : 'Welcome back. Use your own operator account.'}
          </p>

          {/* Two steps, shown as two steps, so the code screen is expected. */}
          <div className="mt-6 flex items-center gap-2 [@media(max-height:780px)]:mt-4" aria-hidden="true">
            <span className="h-1.5 flex-1 rounded-full bg-primary" />
            <span className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${needsCode ? 'bg-primary' : 'bg-muted'}`} />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4 [@media(max-height:780px)]:mt-4 [@media(max-height:780px)]:gap-3">
            {!needsCode && (
              <>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-foreground" htmlFor="operator-email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="operator-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      autoFocus
                      placeholder="you@dawai.com.bd"
                      className="input h-12 w-full rounded-xl pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-foreground" htmlFor="operator-password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="operator-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••••"
                      className="input h-12 w-full rounded-xl pl-10 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {needsCode && (
              <div className="dw-rise">
                <label className="mb-1.5 block text-[13px] font-semibold text-foreground" htmlFor="operator-2fa">
                  Authenticator code
                </label>
                <input
                  id="operator-2fa"
                  autoComplete="one-time-code"
                  autoFocus
                  /* Six digits, or a recovery code (`A1B2C-D3E4F`), so letters
                     and the dash are allowed and the spacing tightens for it. */
                  maxLength={11}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-F-]/g, ''))}
                  required
                  placeholder="000000"
                  className={`input h-14 w-full rounded-xl text-center font-mono text-2xl ${
                    code.length > 6 ? 'tracking-[0.12em]' : 'tracking-[0.5em]'
                  }`}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Lost your phone? Use one of your recovery codes instead.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsCode(false);
                    setCode('');
                    setError('');
                  }}
                  className="mt-3 text-xs font-semibold text-primary hover:underline"
                >
                  ← Use a different account
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(13_148_136/0.8)] transition-all hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {needsCode ? 'Verify and sign in' : 'Continue'}
              {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground [@media(max-height:780px)]:mt-4">
            No account? Another operator creates it. There is no sign-up or reset link here.
          </p>
        </div>

        </motion.div>

        {/* The three conditions of entry, as three small marks under the card. */}
        <div className="mt-6 flex max-w-[420px] flex-wrap justify-center gap-2 [@media(max-height:780px)]:mt-3">
          {TERMS.map(({ icon: Icon, head }, i) => (
            <motion.span
              key={head}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12px] text-white/70 backdrop-blur"
            >
              <Icon className="h-3.5 w-3.5 text-indigo-200" /> {head}
            </motion.span>
          ))}
        </div>
        <a
          href={APP_URL}
          className="group mt-5 inline-flex items-center gap-1 text-[13px] text-white/50 transition-colors hover:text-white [@media(max-height:780px)]:mt-2"
        >
          Shop owners sign in at <span className="font-semibold text-white/75 group-hover:text-white">{shopHost}</span>
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </a>
      </section>
    </main>
  );
}

/** The operators' feed, one line at a time, for a screen too small for the room. */
function PhoneFeed() {
  const { n } = useFeed(2800);
  const f = FEED[n % FEED.length];
  return (
    <div className="mb-5 h-8 lg:hidden" aria-hidden="true">
      <AnimatePresence mode="wait">
        <motion.span
          key={n}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/85"
        >
          <f.icon className={`h-3.5 w-3.5 ${f.tone}`} />
          {f.text} · <span className="font-normal text-white/60">{f.who}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
