'use client';

import * as React from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Lang } from '@/lib/site';
import { translate } from '@/i18n/dictionary';

/*
 * A pill-shaped capsule for "back to top".
 *
 * It appears only once the visitor is a screen away from the top, so it is
 * never in the way of the hero — the one screen that already has a "start
 * free" button and does not need a second call to action floating over it. It
 * hides again the moment the page is back at the top, and it never covers the
 * footer either, because a link that hides the copyright line is worse than
 * no link.
 *
 * The capsule is also the progress bar: the line along its bottom edge fills
 * as the page is read, so the button tells you how much is left above you
 * before you press it. Pressing it hands the page to the browser's own smooth
 * scroll — the same ride every in-page anchor on this site already takes.
 *
 * Reduced motion is honoured: without the transition the jump is instant.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/*
 * The capsule has a shell and a cap, and it opens the way a real one does: the
 * cap swings out first and the label unfurls after it, and closing runs the
 * other way round so the label tucks away before the cap shuts. Reversing the
 * stagger is what stops it from looking like a plain fade.
 */
const shell: Variants = {
  closed: {
    opacity: 0,
    scale: 0.78,
    y: 22,
    transition: { staggerChildren: 0.05, staggerDirection: -1 },
  },
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

const cap: Variants = {
  closed: { rotate: -30, scale: 0.55 },
  open: { rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 22 } },
  // hovers like the pill it stands for
  hover: { rotate: -12, scale: 1.06 },
};

const label: Variants = {
  closed: { width: 0, opacity: 0, x: -10 },
  open: { width: 'auto', opacity: 1, x: 0, transition: { duration: 0.42, ease: EASE } },
};

export function GoToTop({ lang }: { lang: Lang }) {
  const [show, setShow] = React.useState(false);
  const [rising, setRising] = React.useState(false);

  // 0 at the top of the page, 1 at the bottom.
  const raw = useMotionValue(0);
  const progress = useSpring(raw, { stiffness: 140, damping: 30, mass: 0.4 });

  React.useEffect(() => {
    const read = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      raw.set(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
      const atBottom = y + window.innerHeight > doc.scrollHeight - 120;
      setShow(y > window.innerHeight * 0.9 && !atBottom && !rising);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, [raw, rising]);

  const toTop = () => {
    if (rising) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setRising(true);
    // The browser's own smooth scroll, which is the same easing every in-page
    // anchor on this site already uses. Driving it by hand from a rAF loop
    // fights that setting: each call starts a new smooth scroll and cancels
    // the one before it, so the page creeps a few hundred pixels and stops.
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    const done = () => {
      setRising(false);
      window.removeEventListener('scrollend', done);
    };
    if (reduced) setRising(false);
    else window.addEventListener('scrollend', done, { once: true });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={toTop}
          aria-label={translate(lang, 'nav.backToTop')}
          variants={shell}
          initial="closed"
          animate="open"
          exit="closed"
          whileHover="hover"
          className={cn(
            'group fixed bottom-6 end-6 z-40 inline-flex items-center overflow-hidden rounded-full',
            'border border-border bg-background/85 py-2.5 ps-2.5 pe-4 text-sm font-semibold',
            'text-foreground shadow-lift backdrop-blur-xl',
            'transition-colors duration-300 hover:border-primary/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            rising && 'pointer-events-none',
          )}
        >
          <motion.span
            variants={cap}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ramp text-primary-foreground"
          >
            {/* A capsule, split down the middle — the pill this whole site sells. */}
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
              <rect
                x="3.25"
                y="7.25"
                width="17.5"
                height="9.5"
                rx="4.75"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M12 7.25v9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </motion.span>

          <motion.span variants={label} className="overflow-hidden ps-2.5">
            <span className="block whitespace-nowrap">{translate(lang, 'nav.backToTop')}</span>
          </motion.span>

          {/* The progress line, riding the capsule's bottom edge. */}
          <motion.span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-ramp"
            style={{ scaleX: progress }}
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
