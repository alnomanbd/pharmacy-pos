import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The few moving parts the back room uses — numbers that count up to their
 * value, bars that grow into place, cards that rise in — and nothing heavier.
 *
 * CSS and requestAnimationFrame rather than an animation library: this app
 * runs on the counter's own machine all day, and a second megabyte of
 * JavaScript is a slower POS. Everything here is skipped for a person whose
 * system asks for less motion, and settles on the exact figure at the end,
 * so a screenshot mid-count is never what gets read.
 */

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** True once the element has come on screen; stays true. */
export function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (reduced() || typeof IntersectionObserver === 'undefined') {
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
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);

  useEffect(() => {
    if (!seen) return;
    if (reduced()) {
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
