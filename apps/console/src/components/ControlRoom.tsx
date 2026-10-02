import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Building2, CreditCard, Headset, KeyRound, Store, UserPlus } from 'lucide-react';

/**
 * The console's sign-in scene: the control room.
 *
 * A different picture from the shop's on purpose — the shop's door shows one
 * shop from the inside; this one shows all of them from above. Pharmacies on
 * three slow orbits round the card, coloured by where they stand, a radar
 * sweep turning under them, and down the side the operators' own feed of the
 * day: a payment verified, a sign-up, a ticket answered. Illustrative names
 * and figures only — nothing about a real customer before sign-in.
 *
 * Wide screens get the whole room; a phone gets the feed above the card.
 * Reduced motion: the room stands still.
 */

const RINGS = [
  { r: 230, dur: 70, shops: [{ a: 20, s: 'active' }, { a: 140, s: 'trial' }, { a: 250, s: 'active' }] },
  { r: 330, dur: 110, shops: [{ a: 60, s: 'active' }, { a: 170, s: 'pending' }, { a: 300, s: 'active' }, { a: 220, s: 'trial' }] },
  { r: 440, dur: 160, shops: [{ a: 0, s: 'active' }, { a: 95, s: 'trial' }, { a: 190, s: 'active' }, { a: 275, s: 'suspended' }, { a: 330, s: 'active' }] },
] as const;

const DOT: Record<string, string> = {
  active: 'bg-emerald-400 shadow-[0_0_14px_rgb(52_211_153)]',
  trial: 'bg-sky-400 shadow-[0_0_14px_rgb(56_189_248)]',
  pending: 'bg-amber-400 shadow-[0_0_14px_rgb(251_191_36)]',
  suspended: 'bg-rose-400 shadow-[0_0_14px_rgb(251_113_133)]',
};

export const FEED = [
  { icon: BadgeCheck, text: 'Payment verified', who: 'Shifa Pharmacy · ৳3,000', tone: 'text-emerald-300' },
  { icon: UserPlus, text: 'New sign-up', who: 'Mirpur 10 · trial started', tone: 'text-sky-300' },
  { icon: Headset, text: 'Ticket answered', who: 'Printer width · 4 min', tone: 'text-violet-300' },
  { icon: Building2, text: 'Branch opened', who: 'Banani · +৳1,000/mo', tone: 'text-cyan-300' },
  { icon: CreditCard, text: 'Renewal paid', who: 'Al-Amin Drug House · 6 months', tone: 'text-emerald-300' },
  { icon: KeyRound, text: 'Two-factor turned on', who: 'An operator account', tone: 'text-amber-300' },
] as const;

export function useFeed(ms = 2600) {
  const still = useReducedMotion() ?? false;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [still, ms]);
  return { n, still };
}

/** The room behind the card. Wide screens only. */
export default function ControlRoom() {
  const { n, still } = useFeed();
  /* The newest four, newest first. */
  const rows = [0, 1, 2, 3].map((i) => ({ k: n - i, ...FEED[(((n - i) % FEED.length) + FEED.length) % FEED.length] }));

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      {/* ---- the orbits, centred on the card ---- */}
      <div className="absolute left-1/2 top-1/2 h-0 w-0">
        {/* the radar sweep */}
        {!still && (
          <motion.div
            className="absolute -left-[460px] -top-[460px] h-[920px] w-[920px] rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0 80%, rgb(99 102 241 / 0.12) 93%, rgb(34 211 238 / 0.22) 100%)',
              /* Faded toward its rim, so the sweep is light, not a wedge. */
              maskImage: 'radial-gradient(circle, black 20%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle, black 20%, transparent 70%)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
          />
        )}
        {RINGS.map((ring, ri) => (
          <div key={ri}>
            <motion.div
              className="absolute rounded-full border border-dashed border-indigo-300/15"
              style={{ left: -ring.r, top: -ring.r, width: ring.r * 2, height: ring.r * 2 }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.1, delay: 0.2 + ri * 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              className="absolute"
              style={{ left: 0, top: 0 }}
              animate={still ? undefined : { rotate: ri % 2 ? -360 : 360 }}
              transition={{ duration: ring.dur, repeat: Infinity, ease: 'linear' }}
            >
              {ring.shops.map((sh, si) => {
                const rad = (sh.a * Math.PI) / 180;
                return (
                  <motion.span
                    key={si}
                    className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#0b1433]/90"
                    style={{ left: Math.cos(rad) * ring.r, top: Math.sin(rad) * ring.r }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 + ri * 0.2 + si * 0.08 }}
                  >
                    <Store className="h-3.5 w-3.5 text-white/70" />
                    <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${DOT[sh.s]}`} />
                  </motion.span>
                );
              })}
            </motion.div>
          </div>
        ))}
      </div>

      {/* ---- the key to the colours ---- */}
      <div className="absolute bottom-7 left-8 flex gap-4 text-[11px] text-white/55">
        {[
          ['active', 'Paying'],
          ['trial', 'On trial'],
          ['pending', 'Waiting'],
          ['suspended', 'Suspended'],
        ].map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${DOT[k]}`} /> {l}
          </span>
        ))}
      </div>

      {/* ---- the operators' feed ---- */}
      <div className="absolute right-8 top-1/2 w-72 -translate-y-1/2">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          <span className="relative flex h-2 w-2">
            {!still && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live across every shop
        </p>
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.div
                key={r.k}
                layout
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1 - i * 0.2, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.96 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-3 backdrop-blur-md"
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.07] ${r.tone}`}>
                  <r.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[13px] font-semibold text-white">{r.text}</span>
                  <span className="block truncate text-[11px] text-white/55">{r.who}</span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
