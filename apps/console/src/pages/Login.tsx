import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { authApi } from '@dawai/shared/api';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import type { Role } from '@dawai/shared/types';
import { BRAND } from '../brand';

/**
 * The console's own sign-in.
 *
 * Deliberately not the shop app's login page with a different redirect. Two
 * things follow from it being separate, and both are the point:
 *
 * - The customer-facing sign-in form no longer accepts an operator account, so
 *   there is no path from the page every customer can reach to the account that
 *   can suspend every customer.
 * - This page refuses a customer credential even when it is correct. A shop
 *   owner who finds this host cannot sign in to it, and is told plainly where to go.
 *
 * There is no registration and no self-service reset: an operator account is
 * created by another operator.
 *
 * ## Why it looks like this
 *
 * It used to open with a headline — "the control plane for every account on the
 * platform" — over a glow, a faded grid and three icon bullets. That is the
 * shape of a landing page, and this is not one: nobody arrives here to be
 * persuaded, and there is nothing to sell to the handful of people who can sign
 * in. Worse, a page that sells makes the one thing that matters here read as
 * marketing too, and those three lines are not claims — they are the terms
 * somebody accepts by signing in.
 *
 * So the left half is a plate rather than a pitch: which host this is, which
 * deployment, where customers go instead, and the three conditions of entry as
 * a numbered list in the same mono the rest of the console uses for facts.
 * Everything on it is checkable, and none of it is an adjective.
 */
const PLATFORM_ROLES: Role[] = ['platformAdmin', 'platformStaff'];

const APP_URL = BRAND.shopUrl;

/**
 * The conditions of entry.
 *
 * Said here so nobody meets one of them for the first time as a refusal: the
 * second factor is a gate on the very next screen, and an address outside the
 * allowed range never reaches this page at all.
 */
const TERMS: { no: string; head: string; body: string }[] = [
  {
    no: '01',
    head: 'Recorded',
    body: 'Every action carries your name, the time and your address. The trail cannot be edited — not from here and not from anywhere else.',
  },
  {
    no: '02',
    head: 'Second factor',
    body: 'Required, not offered. An operator account without one reaches the enrolment screen and nothing else.',
  },
  {
    no: '03',
    head: 'Restricted',
    body: 'The operations team, from an allowed address. A customer credential is refused here even when it is correct.',
  },
];

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

  /* The host as served, so the plate says where you actually are rather than
     where a build-time constant thought you would be. */
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host);

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
    <main className="grid min-h-screen grid-cols-1 bg-card lg:grid-cols-[1fr_minmax(420px,0.8fr)]">
      {/* ------------------------------- the plate --------------------------- */}
      {/* Second on a phone: somebody opening this on a handset came to sign in,
          and the terms are worth reading but not worth scrolling past first. */}
      <section className="relative order-2 flex flex-col bg-[hsl(258_32%_9%)] px-6 py-8 text-white sm:px-10 lg:order-none lg:px-14 lg:py-12">
        {/* One hairline down the join. No glow and no grid: this is a door. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block"
        />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <strong className="block text-[15px] font-semibold">{BRAND.name}</strong>
              <small className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
                Operator Console
              </small>
            </div>
          </div>

          {/* Which deployment this is. A staging console that looks exactly like
              production is how somebody suspends a real customer by accident. */}
          <span
            className={`rounded-full px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] ring-1 ${
              isLocal
                ? 'bg-amber-400/10 text-amber-200/90 ring-amber-300/25'
                : 'bg-emerald-400/10 text-emerald-200/90 ring-emerald-300/25'
            }`}
          >
            {isLocal ? 'Local' : 'Production'}
          </span>
        </div>

        <div className="mt-12 max-w-xl lg:mt-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
            Conditions of entry
          </p>

          <ul className="mt-5 flex flex-col">
            {TERMS.map((t) => (
              <li
                key={t.no}
                className="flex gap-5 border-t border-white/10 py-4 first:border-t-0 first:pt-0"
              >
                <span className="w-7 shrink-0 pt-0.5 font-mono text-[12px] tabular-nums text-white/35">
                  {t.no}
                </span>
                <div className="min-w-0">
                  <strong className="block text-[14.5px] font-semibold text-white/90">
                    {t.head}
                  </strong>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">{t.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* The plate's foot: where you are, and where everybody else goes. */}
        <dl className="mt-12 grid gap-x-10 gap-y-3 font-mono text-[11.5px] sm:mt-auto sm:grid-cols-2 sm:pt-12">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="uppercase tracking-[0.14em] text-white/35">This host</dt>
            <dd className="truncate text-white/70">{host || BRAND.consoleHost}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="uppercase tracking-[0.14em] text-white/35">Customers sign in at</dt>
            <dd className="truncate">
              <a
                href={APP_URL}
                className="text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                {APP_URL.replace(/^https?:\/\//, '')}
              </a>
            </dd>
          </div>
        </dl>
      </section>

      {/* -------------------------------- the form --------------------------- */}
      <section className="order-1 flex items-center justify-center px-5 py-12 sm:px-8 lg:order-none">
        <div className="w-full max-w-[400px]">
          {/* The mark, on the half a phone sees first. */}
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <strong className="block text-sm font-semibold">{BRAND.name}</strong>
              <small className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                Operator Console
              </small>
            </div>
          </div>

          <h2 className="text-[24px] font-semibold tracking-tight">Operator sign-in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {needsCode
              ? 'Your password was accepted. One code to go.'
              : 'Your own account — not a customer’s.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4 border-t border-border pt-6">
            <div>
              <label
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
                htmlFor="operator-email"
              >
                Email
              </label>
              <input
                id="operator-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                placeholder="you@dawai.com.bd"
                className="input h-11 w-full"
              />
            </div>

            <div>
              <label
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
                htmlFor="operator-password"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="operator-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="input h-11 w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {needsCode && (
              <div>
                <label
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
                  htmlFor="operator-2fa"
                >
                  Authenticator code
                </label>
                <input
                  id="operator-2fa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  placeholder="000000"
                  className="input h-12 w-full text-center font-mono text-lg tracking-[0.45em]"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The six digits from the app you enrolled with.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn mt-2 h-11 w-full justify-center text-[15px]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {needsCode ? 'Verify and sign in' : 'Sign in'}
            </button>
          </form>

          <p className="mt-7 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            Operator accounts are made by another operator — there is no sign-up here and no reset
            link. If you have lost access, ask the platform owner.
          </p>
        </div>
      </section>
    </main>
  );
}
