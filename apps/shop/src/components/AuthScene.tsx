import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, BookOpenCheck, Boxes, MapPin, Monitor, PackageCheck, ReceiptText, ScanLine, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BRAND } from '../brand';
import { useT, useLangStore } from '../i18n/ui';

/**
 * The scene behind every door into the shop — sign in, forgot, reset, verify.
 *
 * Not a half-and-half page with a slogan on one side. The form sits in the
 * middle of the shop it opens: the counters, the branches, the shelf and the
 * khata around it, each wired to the card, with the day's traffic running
 * along the wires into it — a bill rung up, a payment on the khata, stock
 * crossing to a branch. It is an illustration and says so by never using a
 * real name or figure: before sign-in there is nobody's shop to show.
 *
 * On a phone the wires go and the card takes the screen, with the day's
 * events passing above it one at a time. For a person who asked for less
 * motion, everything stands still and the form is unchanged.
 */

type Node = { key: string; icon: typeof Monitor; x: number; y: number; label: string; figure: string };

const EVENTS = {
  en: [
    { icon: ReceiptText, text: '+৳340 · Napa Extra ×1 strip', tone: 'emerald' },
    { icon: BookOpenCheck, text: 'Shilpi paid ৳500 on the khata', tone: 'sky' },
    { icon: PackageCheck, text: 'Seclo ×200 sent to Banani', tone: 'amber' },
    { icon: ScanLine, text: 'Counter 2 opened · ৳500 float', tone: 'emerald' },
    { icon: TrendingUp, text: 'Best day this week so far', tone: 'violet' },
    { icon: ReceiptText, text: '+৳1,180 · 6 items · bKash', tone: 'emerald' },
  ],
  bn: [
    { icon: ReceiptText, text: '+৳৩৪০ · নাপা এক্সট্রা ×১ পাতা', tone: 'emerald' },
    { icon: BookOpenCheck, text: 'শিল্পী বাকি খাতায় ৳৫০০ দিলেন', tone: 'sky' },
    { icon: PackageCheck, text: 'সেকলো ×২০০ বনানী শাখায় গেল', tone: 'amber' },
    { icon: ScanLine, text: 'কাউন্টার ২ খুলল · ৳৫০০ ক্যাশ', tone: 'emerald' },
    { icon: TrendingUp, text: 'এই সপ্তাহের সেরা দিন', tone: 'violet' },
    { icon: ReceiptText, text: '+৳১,১৮০ · ৬টি আইটেম · বিকাশ', tone: 'emerald' },
  ],
} as const;

const NODES: Record<'en' | 'bn', Node[]> = {
  en: [
    { key: 'c1', icon: Monitor, x: 11, y: 22, label: 'Counter 1', figure: '৳84,120' },
    { key: 'c2', icon: Monitor, x: 9, y: 70, label: 'Counter 2', figure: '৳31,460' },
    { key: 'stock', icon: Boxes, x: 30, y: 90, label: 'Stock', figure: '2,418 pcs' },
    { key: 'branch', icon: MapPin, x: 89, y: 20, label: 'Banani branch', figure: '৳48,600' },
    { key: 'khata', icon: BookOpenCheck, x: 91, y: 68, label: 'Baki khata', figure: '41 customers' },
    { key: 'reports', icon: TrendingUp, x: 70, y: 91, label: 'This month', figure: '▲ 12%' },
  ],
  bn: [
    { key: 'c1', icon: Monitor, x: 11, y: 22, label: 'কাউন্টার ১', figure: '৳৮৪,১২০' },
    { key: 'c2', icon: Monitor, x: 9, y: 70, label: 'কাউন্টার ২', figure: '৳৩১,৪৬০' },
    { key: 'stock', icon: Boxes, x: 30, y: 90, label: 'স্টক', figure: '২,৪১৮ পিস' },
    { key: 'branch', icon: MapPin, x: 89, y: 20, label: 'বনানী শাখা', figure: '৳৪৮,৬০০' },
    { key: 'khata', icon: BookOpenCheck, x: 91, y: 68, label: 'বাকি খাতা', figure: '৪১ জন কাস্টমার' },
    { key: 'reports', icon: TrendingUp, x: 70, y: 91, label: 'এই মাস', figure: '▲ ১২%' },
  ],
};

const TONE: Record<string, string> = {
  emerald: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  sky: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  violet: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};

/* Where the card is: the wires run to its middle. */
const HUB = { x: 50, y: 50 };

function ShopMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" />
      <path d="M12 8.5a3.5 3.5 0 0 0 0 7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function AuthScene({
  children,
  calm = false,
  backToSignIn = false,
}: {
  children: ReactNode;
  /** The smaller doors: slower traffic — somebody locked out wants the form, not a show. */
  calm?: boolean;
  /** The way back is to sign-in, not to the website. */
  backToSignIn?: boolean;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang) === 'bn' ? 'bn' : 'en';
  const setLang = useLangStore((s) => s.setLang);
  const still = useReducedMotion() ?? false;
  const nodes = NODES[lang];
  const events = EVENTS[lang];
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setBeat((b) => b + 1), calm ? 3600 : 2400);
    return () => window.clearInterval(id);
  }, [still, calm]);

  const event = events[beat % events.length];
  /* The event pops up beside the node it came from. */
  const from = nodes[beat % nodes.length];

  return (
    <div className="auth-scene">
      {/* ---- the light: three pools drifting out of phase ---- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[
          { c: 'rgb(16 185 129 / 0.35)', s: '46rem', x: '-12%', y: '-18%', d: 26 },
          { c: 'rgb(34 211 238 / 0.22)', s: '40rem', x: '62%', y: '48%', d: 32 },
          { c: 'rgb(45 212 191 / 0.18)', s: '34rem', x: '30%', y: '70%', d: 22 },
        ].map((o, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{ width: o.s, height: o.s, left: o.x, top: o.y, background: o.c }}
            animate={still ? undefined : { x: [0, 60, -30, 0], y: [0, -40, 30, 0], scale: [1, 1.08, 0.96, 1] }}
            transition={{ duration: o.d, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
        <div className="auth-grid absolute inset-0" />
      </div>

      {/* ---- the wires, and the traffic on them (wide screens) ---- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {nodes.map((n, i) => (
            <motion.line
              key={n.key}
              x1={n.x}
              y1={n.y}
              x2={HUB.x}
              y2={HUB.y}
              stroke="rgb(52 211 153 / 0.32)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 6"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.3 + i * 0.12, ease: 'easeOut' }}
            />
          ))}
        </svg>
        {!still &&
          nodes.map((n, i) => (
            <motion.span
              key={`pulse-${n.key}`}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgb(110_231_183)]"
              initial={{ left: `${n.x}%`, top: `${n.y}%`, opacity: 0 }}
              animate={{ left: [`${n.x}%`, `${HUB.x}%`], top: [`${n.y}%`, `${HUB.y}%`], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.6 + (i % 3) * 0.5, delay: 1.4 + i * 0.45, repeat: Infinity, repeatDelay: 1.2 + (i % 2), ease: 'easeInOut' }}
            />
          ))}

        {/* ---- the parts of the shop ---- */}
        {nodes.map((n, i) => (
          <div key={n.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.5 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                animate={still ? undefined : { y: [0, -6, 0] }}
                transition={{ duration: 5 + i * 0.7, repeat: Infinity, ease: 'easeInOut' }}
                className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 backdrop-blur-md"
              >
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                  <n.icon className="h-4 w-4" />
                </span>
                <span className="leading-tight">
                  <span className="block text-[11px] text-white/55">{n.label}</span>
                  <span className="block whitespace-nowrap font-mono text-sm font-bold tabular-nums text-white">{n.figure}</span>
                </span>
              </motion.div>
            </motion.div>
          </div>
        ))}

        {/* ---- the day's events, beside the part they came from ---- */}
        <AnimatePresence mode="popLayout">
          {!still && (
            <motion.div
              key={beat}
              className="absolute -translate-x-1/2"
              style={{ left: `${from.x}%`, top: `calc(${from.y}% + ${from.y > 50 ? -78 : 34}px)` }}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur ${TONE[event.tone]}`}>
                <event.icon className="h-3.5 w-3.5" />
                {event.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---- the top bar: the way back, and the language ---- */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        {backToSignIn ? (
          <Link to="/login" className="auth-back">
            <ArrowLeft className="h-3.5 w-3.5" /> {t('Back to sign in')}
          </Link>
        ) : (
          <a href={BRAND.siteUrl} className="auth-back">
            <ArrowLeft className="h-3.5 w-3.5" /> {t('Back to the website')}
          </a>
        )}
        <button
          type="button"
          onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
          className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/75 backdrop-blur transition-colors hover:text-white"
          aria-label={t('Switch language')}
        >
          {lang === 'bn' ? 'EN' : 'বাং'}
        </button>
      </header>

      {/* ---- the card ---- */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-6 sm:px-6">
        {/* On a phone: the day's events, one at a time, above the card. */}
        <div className="mb-5 h-8 lg:hidden" aria-hidden>
          <AnimatePresence mode="wait">
            <motion.span
              key={still ? 'still' : beat}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${TONE[event.tone]}`}
            >
              <event.icon className="h-3.5 w-3.5" />
              {event.text}
            </motion.span>
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="auth-card relative w-full max-w-[420px]"
        >
          {/* A slow ring of light round the card's edge — the hub the wires run to. */}
          <span aria-hidden className="auth-card-ring" />
          <div className="relative rounded-[26px] bg-card p-7 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary))]">
                <ShopMark className="h-5 w-5" />
              </span>
              <span className="leading-tight">
                <span className="block text-base font-bold">{BRAND.name}</span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('Pharmacy')}</span>
              </span>
            </div>
            {children}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
