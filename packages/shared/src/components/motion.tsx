import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The few moving parts the back room uses — numbers that count up to their
 * value, bars that grow into place, cards that rise in — and nothing heavier.
 *
 * Shared by the shop app and the console. CSS and requestAnimationFrame rather
 * than an animation library: the shop app runs on the counter's own machine
 * all day, and a second megabyte of JavaScript is a slower POS. Everything here is skipped for a person whose
 * system asks for less motion, and settles on the exact figure at the end,
 * so a screenshot mid-count is never what gets read.
 */

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** No motion at all: asked for less, or a place with nothing to watch (a test, a printer). */
const still = () => reduced() || typeof IntersectionObserver === 'undefined';

/** True once the element has come on screen; stays true. */
export function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (still()) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/**
 * A figure that counts up from zero the first time it is on screen, and again
 * whenever its value changes (a new date range), from where it was.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const [shown, setShown] = useState(still() ? value : 0);
  const from = useRef(still() ? value : 0);

  useEffect(() => {
    if (!seen) return;
    if (still()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      const v = a + (value - a) * eased;
      setShown(p < 1 ? v : value);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);

  /* Whole numbers while counting, the real figure — paisa and all — at the end. */
  const done = shown === value;
  return (
    <span ref={ref} className={className}>
      {format(done ? value : Math.round(shown))}
    </span>
  );
}

/** A block that rises into place the first time it is on screen. `delay` in ms, for a stagger. */
export function Rise({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className={`${seen ? 'motion-rise' : 'opacity-0'} ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/**
 * One measure's shape over time, as a quiet line that draws itself in.
 *
 * Decoration with a meaning — the trend behind a headline figure — and so no
 * figures of its own; those are the headline's job. Positioned by the caller.
 */
export function Sparkline({ values, className = '', tone = 'text-primary' }: { values: number[]; className?: string; tone?: string }) {
  const [ref, seen] = useSeen<SVGSVGElement>();
  /* A flat zero is no shape at all; drawing it would only underline nothing. */
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const hi = Math.max(...values, 1);
  const lo = Math.min(...values, 0);
  const W = 400;
  const H = 100;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `spark-${values.length}-${Math.round(hi)}`;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none ${className}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={tone}>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} className={seen ? 'motion-rise' : 'opacity-0'} />
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1000}
          className={seen ? 'motion-draw' : 'opacity-0'}
        />
      </g>
    </svg>
  );
}

/**
 * A share as a ring that fills to its value — for one percentage that means
 * something on its own, like trial-to-paid. The figure is written in the
 * middle, so the ring is never the only way to read it.
 */
export function Ring({ value, size = 76, label }: { value: number | null; size?: number; label: string }) {
  const [ref, seen] = useSeen<SVGSVGElement>();
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const share = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="8" className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        className="stroke-primary"
        style={{
          strokeDasharray: c,
          strokeDashoffset: seen ? c * (1 - share) : c,
          transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
        }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-foreground text-sm font-bold">
        {value === null ? '—' : `${Math.round(value)}%`}
      </text>
    </svg>
  );
}
