import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpenCheck,
  BriefcaseMedical,
  Cross,
  PackageCheck,
  Pill,
  ReceiptText,
  ScanLine,
  Tablets,
  TrendingUp,
  Syringe,
  type LucideIcon,
} from 'lucide-react';
import MedicineFloat from '@dawai/shared/components/MedicineFloat';
import { Link } from 'react-router-dom';
import { BRAND } from '../brand';
import { useT, useLangStore } from '../i18n/ui';

/**
 * The scene behind every door into the shop — sign in, forgot, reset, verify.
 *
 * Not a half-and-half page with a slogan on one side. The form is the hub of
 * the shop it opens: the counters, the branches, the shelf and the khata sit
 * on two slow orbits around it, each wired in, with the day's traffic running
 * along the wires to the card — a bill rung up, a payment on the khata, stock
 * crossing to a branch. It is an illustration and says so by never using a
 * real name or figure: before sign-in there is nobody's shop to show.
 *
 * Drawn in pixels, not percentages, so the orbits are true ellipses and the
 * pieces sit on them at any window size. On a phone the orbits go and the card
 * takes the screen, with a ring of light behind it and the day's events
 * passing above it one at a time. For a person who asked for less motion,
 * everything stands still and the form is unchanged.
 */

type Tone = 'emerald' | 'sky' | 'amber' | 'violet';
type Node = { key: string; icon: LucideIcon; angle: number; ring: 0 | 1; label: string; figure: string; tone: Tone };

const EVENTS = {
  en: [
    { icon: Pill, text: '+৳340 · Napa Extra ×1 strip', tone: 'emerald' },
    { icon: BookOpenCheck, text: 'Shilpi paid ৳500 on the khata', tone: 'sky' },
    { icon: PackageCheck, text: 'Seclo ×200 sent to Banani', tone: 'amber' },
    { icon: ScanLine, text: 'Counter 2 opened · ৳500 float', tone: 'emerald' },
    { icon: Syringe, text: 'Insulin back in stock · 40 pens', tone: 'violet' },
    { icon: ReceiptText, text: '+৳1,180 · 6 items · bKash', tone: 'emerald' },
  ],
  bn: [
    { icon: Pill, text: '+৳৩৪০ · নাপা এক্সট্রা ×১ পাতা', tone: 'emerald' },
    { icon: BookOpenCheck, text: 'শিল্পী বাকি খাতায় ৳৫০০ দিলেন', tone: 'sky' },
    { icon: PackageCheck, text: 'সেকলো ×২০০ বনানী শাখায় গেল', tone: 'amber' },
    { icon: ScanLine, text: 'কাউন্টার ২ খুলল · ৳৫০০ ক্যাশ', tone: 'emerald' },
    { icon: Syringe, text: 'ইনসুলিন আবার স্টকে · ৪০টি পেন', tone: 'violet' },
    { icon: ReceiptText, text: '+৳১,১৮০ · ৬টি আইটেম · বিকাশ', tone: 'emerald' },
  ],
} as const;

/* Angles in degrees, clockwise from three o'clock (screen y runs down). */
const NODES: Record<'en' | 'bn', Node[]> = {
  en: [
    { key: 'c1', icon: Pill, angle: 208, ring: 0, label: 'Counter 1', figure: '৳84,120', tone: 'emerald' },
    { key: 'c2', icon: Tablets, angle: 158, ring: 0, label: 'Counter 2', figure: '৳31,460', tone: 'emerald' },
    { key: 'stock', icon: BriefcaseMedical, angle: 118, ring: 1, label: 'Stock', figure: '2,418 pcs', tone: 'amber' },
    { key: 'branch', icon: Cross, angle: -28, ring: 0, label: 'Banani branch', figure: '৳48,600', tone: 'sky' },
    { key: 'khata', icon: BookOpenCheck, angle: 22, ring: 0, label: 'Baki khata', figure: '41 customers', tone: 'violet' },
    { key: 'reports', icon: TrendingUp, angle: 62, ring: 1, label: 'This month', figure: '▲ 12%', tone: 'emerald' },
  ],
  bn: [
    { key: 'c1', icon: Pill, angle: 208, ring: 0, label: 'কাউন্টার ১', figure: '৳৮৪,১২০', tone: 'emerald' },
    { key: 'c2', icon: Tablets, angle: 158, ring: 0, label: 'কাউন্টার ২', figure: '৳৩১,৪৬০', tone: 'emerald' },
    { key: 'stock', icon: BriefcaseMedical, angle: 118, ring: 1, label: 'স্টক', figure: '২,৪১৮ পিস', tone: 'amber' },
    { key: 'branch', icon: Cross, angle: -28, ring: 0, label: 'বনানী শাখা', figure: '৳৪৮,৬০০', tone: 'sky' },
    { key: 'khata', icon: BookOpenCheck, angle: 22, ring: 0, label: 'বাকি খাতা', figure: '৪১ জন কাস্টমার', tone: 'violet' },
    { key: 'reports', icon: TrendingUp, angle: 62, ring: 1, label: 'এই মাস', figure: '▲ ১২%', tone: 'emerald' },
  ],
};

const TONE: Record<string, string> = {
  emerald: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  sky: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  violet: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};
const ICON_TONE: Record<Tone, string> = {
  emerald: 'bg-emerald-400/15 text-emerald-300',
  sky: 'bg-sky-400/15 text-sky-300',
  amber: 'bg-amber-400/15 text-amber-300',
  violet: 'bg-violet-400/15 text-violet-300',
};
const WIRE: Record<Tone, string> = {
  emerald: 'rgb(52 211 153)',
  sky: 'rgb(56 189 248)',
  amber: 'rgb(251 191 36)',
  violet: 'rgb(167 139 250)',
};

function ShopMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" />
      <path d="M12 8.5a3.5 3.5 0 0 0 0 7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function useViewport() {
  const read = () => ({ w: typeof window === 'undefined' ? 1440 : window.innerWidth, h: typeof window === 'undefined' ? 900 : window.innerHeight });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/** The time on the card, ticking — a counter is a place with a clock on the wall. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;

export default function AuthScene({
  children,
  calm = false,
  backToSignIn = false,
  below,
}: {
  children: ReactNode;
  /** The smaller doors: slower traffic — somebody locked out wants the form, not a show. */
  calm?: boolean;
  /** The way back is to sign-in, not to the website. */
  backToSignIn?: boolean;
  /** A line under the card, on the dark — the way in for somebody new. */
  below?: ReactNode;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang) === 'bn' ? 'bn' : 'en';
  const setLang = useLangStore((s) => s.setLang);
  const still = useReducedMotion() ?? false;
  const nodes = NODES[lang];
  const events = EVENTS[lang];
  const [beat, setBeat] = useState(0);
  const { w, h } = useViewport();
  const now = useClock();

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setBeat((b) => b + 1), calm ? 3600 : 2400);
    return () => window.clearInterval(id);
  }, [still, calm]);

  /* The geometry: the card's middle, two orbits round it, and each piece on its orbit. */
  const geo = useMemo(() => {
    const cx = w / 2;
    const cy = h / 2 + 16;
    const rings = [
      { rx: Math.min(w * 0.4, 620), ry: Math.min(h * 0.39, 360) },
      { rx: Math.min(w * 0.3, 470), ry: Math.min(h * 0.43, 400) },
    ];
    /* On a short screen the bottom of the inner orbit is under the card and the
       line below it; those two pieces move out to the lower sides instead. */
    const short = h < 860;
    const placed = nodes.map((raw) => {
      const n = short && raw.ring === 1 ? { ...raw, ring: 0 as const, angle: raw.angle > 90 ? 132 : 48 } : raw;
      const r = rings[n.ring];
      const a = (n.angle * Math.PI) / 180;
      return {
        ...n,
        x: Math.max(120, Math.min(w - 120, cx + r.rx * Math.cos(a))),
        y: Math.max(120, Math.min(h - 56, cy + r.ry * Math.sin(a))),
      };
    });
    return { cx, cy, rings, placed };
  }, [w, h, nodes]);

  const event = events[beat % events.length];
  /* The event pops up beside the piece it came from. */
  const from = geo.placed[beat % geo.placed.length];
  const lc = lang === 'bn' ? 'bn-BD' : 'en-GB';
  const clock = now.toLocaleTimeString(lc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const day = now.toLocaleDateString(lc, { weekday: 'short', day: 'numeric', month: 'short' });

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
        <MedicineFloat />
        {/* A ring of light behind the card — the one thing a phone keeps of the orbits. */}
        <span className="auth-halo lg:hidden" />
      </div>

      {/* ---- the orbits, the wires and the traffic on them (wide screens) ---- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <radialGradient id="auth-hub" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgb(52 211 153 / 0.28)" />
              <stop offset="100%" stopColor="rgb(52 211 153 / 0)" />
            </radialGradient>
          </defs>
          <ellipse cx={geo.cx} cy={geo.cy} rx={geo.rings[1].rx * 0.85} ry={geo.rings[1].ry * 0.85} fill="url(#auth-hub)" />
          {geo.rings.map((r, i) => (
            <motion.ellipse
              key={i}
              cx={geo.cx}
              cy={geo.cy}
              rx={r.rx}
              ry={r.ry}
              fill="none"
              stroke={i === 0 ? 'rgb(255 255 255 / 0.10)' : 'rgb(52 211 153 / 0.16)'}
              strokeWidth="1"
              strokeDasharray={i === 0 ? '2 10' : '1 0'}
              className={still ? undefined : i === 0 ? 'auth-orbit' : undefined}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ transformOrigin: `${geo.cx}px ${geo.cy}px` }}
              transition={{ duration: 1.4, delay: 0.1 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
          {/* A light travelling each orbit. */}
          {!still &&
            geo.rings.map((r, i) => (
              <circle key={`comet-${i}`} r={i === 0 ? 2.6 : 2} fill={i === 0 ? 'rgb(167 243 208)' : 'rgb(103 232 249)'} className="auth-comet">
                <animateMotion dur={`${i === 0 ? 38 : 27}s`} repeatCount="indefinite" path={ellipsePath(geo.cx, geo.cy, r.rx, r.ry)} keyPoints={i === 0 ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear" />
              </circle>
            ))}
          {/* Each piece wired to the card on a gentle curve, with the day's traffic running in. */}
          {geo.placed.map((n, i) => {
            const mx = (n.x + geo.cx) / 2 + (n.y - geo.cy) * 0.12;
            const my = (n.y + geo.cy) / 2 - (n.x - geo.cx) * 0.12;
            const d = `M ${n.x} ${n.y} Q ${mx} ${my} ${geo.cx} ${geo.cy}`;
            return (
              <g key={n.key}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke={WIRE[n.tone]}
                  strokeOpacity="0.28"
                  strokeWidth="1"
                  strokeDasharray="3 7"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.2, delay: 0.4 + i * 0.12, ease: 'easeOut' }}
                />
                {!still && (
                  <circle r="2.6" fill={WIRE[n.tone]} style={{ filter: `drop-shadow(0 0 6px ${WIRE[n.tone]})` }}>
                    <animateMotion dur={`${2.8 + (i % 3) * 0.6}s`} begin={`${1.4 + i * 0.5}s`} repeatCount="indefinite" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />
                    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur={`${2.8 + (i % 3) * 0.6}s`} begin={`${1.4 + i * 0.5}s`} repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* ---- the parts of the shop ---- */}
        {geo.placed.map((n, i) => (
          <div key={n.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: n.x, top: n.y }}>
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.6 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                animate={still ? undefined : { y: [0, -6, 0] }}
                transition={{ duration: 5 + i * 0.7, repeat: Infinity, ease: 'easeInOut' }}
                className="auth-node flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
              >
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${ICON_TONE[n.tone]}`}>
                  <n.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="leading-tight">
                  <span className="block text-[11px] font-medium text-white/55">{n.label}</span>
                  <span className="block whitespace-nowrap text-[15px] font-bold tabular-nums tracking-tight text-white">{n.figure}</span>
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
              style={{ left: from.x, top: from.y + (from.y > geo.cy ? -76 : 36) }}
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
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-4 sm:px-6">
        {/* On a phone: the day's events, one at a time, above the card. */}
        <div className="mb-4 h-8 lg:hidden" aria-hidden>
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
          <div className="relative overflow-hidden rounded-[26px] bg-card px-7 pb-7 pt-8 sm:px-8 sm:pb-8">
            {/* The colours of the shop, along the top edge. */}
            <span aria-hidden className="auth-card-strip" />
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="auth-mark relative grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                  <ShopMark className="h-5 w-5" />
                </span>
                <span className="leading-tight">
                  <span className="block text-base font-bold">{BRAND.name}</span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('Pharmacy')}</span>
                </span>
              </div>
              <span className="flex flex-col items-end leading-tight" title={now.toLocaleString(lc)}>
                <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground">
                  <span className="auth-live" aria-hidden />
                  {clock}
                </span>
                <span className="text-[11px] text-muted-foreground">{day}</span>
              </span>
            </div>
            {children}
          </div>
        </motion.div>

        {below && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-5 text-center text-sm text-white/65"
          >
            {below}
          </motion.div>
        )}
      </main>
    </div>
  );
}
