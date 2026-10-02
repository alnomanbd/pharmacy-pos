import { motion, useReducedMotion } from 'framer-motion';

/**
 * Medicine, drifting behind a sign-in scene: capsules, tablets, a pharmacy
 * cross — drawn here as simple vectors, so the background says "pharmacy"
 * before a word is read, and costs nothing to load. Faint, slow and behind
 * everything; still for a person who asked for less motion.
 */

type Kind = 'capsule' | 'tablet' | 'cross' | 'strip';

function Shape({ kind, tint }: { kind: Kind; tint: string }) {
  if (kind === 'capsule')
    return (
      <svg viewBox="0 0 64 28" className="h-full w-full">
        <rect x="1" y="1" width="62" height="26" rx="13" fill="none" stroke={tint} strokeWidth="2" />
        <path d="M32 1h-19a13 13 0 0 0 0 26h19z" fill={tint} fillOpacity="0.55" />
      </svg>
    );
  if (kind === 'tablet')
    return (
      <svg viewBox="0 0 40 40" className="h-full w-full">
        <circle cx="20" cy="20" r="18" fill={tint} fillOpacity="0.25" stroke={tint} strokeWidth="2" />
        <path d="M8 20h24" stroke={tint} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (kind === 'cross')
    return (
      <svg viewBox="0 0 40 40" className="h-full w-full">
        <path d="M15 4h10v11h11v10H25v11H15V25H4V15h11z" fill={tint} fillOpacity="0.3" stroke={tint} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  /* A blister strip: four pockets in a row. */
  return (
    <svg viewBox="0 0 76 30" className="h-full w-full">
      <rect x="1" y="1" width="74" height="28" rx="6" fill="none" stroke={tint} strokeWidth="2" />
      {[14, 30, 46, 62].map((x) => (
        <ellipse key={x} cx={x} cy="15" rx="5.5" ry="7.5" fill={tint} fillOpacity="0.35" />
      ))}
    </svg>
  );
}

const ITEMS: { kind: Kind; x: string; y: string; w: number; rot: number; d: number }[] = [
  { kind: 'capsule', x: '6%', y: '12%', w: 70, rot: -25, d: 18 },
  { kind: 'tablet', x: '24%', y: '78%', w: 34, rot: 0, d: 22 },
  { kind: 'cross', x: '82%', y: '8%', w: 34, rot: 12, d: 26 },
  { kind: 'strip', x: '70%', y: '82%', w: 86, rot: 18, d: 20 },
  { kind: 'capsule', x: '90%', y: '46%', w: 56, rot: 40, d: 24 },
  { kind: 'tablet', x: '4%', y: '50%', w: 28, rot: 0, d: 19 },
  { kind: 'cross', x: '40%', y: '6%', w: 24, rot: -10, d: 28 },
  { kind: 'strip', x: '12%', y: '88%', w: 64, rot: -14, d: 23 },
];

export default function MedicineFloat({ tint = 'rgb(110 231 183)', opacity = 0.22 }: { tint?: string; opacity?: number }) {
  const still = useReducedMotion() ?? false;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity }}>
      {ITEMS.map((it, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: it.x, top: it.y, width: it.w, rotate: it.rot }}
          animate={still ? undefined : { y: [0, -18, 0], rotate: [it.rot, it.rot + 14, it.rot] }}
          transition={{ duration: it.d, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
        >
          <Shape kind={it.kind} tint={tint} />
        </motion.div>
      ))}
    </div>
  );
}
