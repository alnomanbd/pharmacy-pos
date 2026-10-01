'use client';

import * as React from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import { cn } from '@/lib/utils';

/*
 * The motion vocabulary.
 *
 * Every animation on this site comes from this file. That is the point: a page
 * whose motion is assembled from eight named primitives reads as one designed
 * object, and a page where each section hand-rolls its own `whileInView` reads
 * as six templates stacked on top of each other.
 *
 * Two rules hold throughout, and they come from the counter rather than from a
 * motion guide:
 *
 * 1. **Nothing moves twice.** Each element enters once and stays. A shop owner
 *    scrolls a pricing page expecting a number, not a second animation when
 *    they scroll back up.
 * 2. **Nothing moves that is being read.** Copy fades and lifts a little. It
 *    never slides in from a direction far enough to make the eye hunt, and a
 *    number never changes while it is being read off.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export const revealVariants: Record<string, Variants> = {
  up: {
    hidden: { opacity: 0, y: 26, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.7, ease: EASE },
    },
  },
  fade: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.9, ease: EASE } },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.94, filter: 'blur(8px)' },
    show: {
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.75, ease: EASE },
    },
  },
  left: {
    hidden: { opacity: 0, x: -30, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      x: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.7, ease: EASE },
    },
  },
  right: {
    hidden: { opacity: 0, x: 30, filter: 'blur(6px)' },
    show: {
      opacity: 1,
      x: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.7, ease: EASE },
    },
  },
  /** The counter's own entrance: the row turns over into place. */
  tape: {
    hidden: { opacity: 0, y: -14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  },
};

export type RevealVariant = keyof typeof revealVariants;

/**
 * A scroll reveal. `once` is not configurable on purpose — see rule 1 above.
 *
 * The negative bottom margin means an element already inside the viewport at
 * page load reveals immediately instead of waiting for a scroll that may never
 * come, which is what makes the hero feel late on a slow phone.
 */
export function Reveal({
  children,
  className,
  variant = 'up',
  delay = 0,
  amount = 0.12,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  variant?: RevealVariant;
  delay?: number;
  amount?: number;
  as?: 'div' | 'section' | 'li' | 'span' | 'header' | 'footer';
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      variants={revealVariants[variant]}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount, margin: '0px 0px -8% 0px' }}
      transition={{ delay }}
    >
      {children}
    </Comp>
  );
}

/**
 * A group whose children enter in sequence.
 *
 * The step shrinks as the group grows, so a row of eight cards takes about the
 * same time as a row of three instead of the last one arriving a second and a
 * half behind the first — which is how a list stops reading as a list and
 * starts reading as a parade.
 */
export function Stagger({
  children,
  className,
  step = 0.07,
  delay = 0,
  amount = 0.2,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
  delay?: number;
  amount?: number;
  as?: 'div' | 'ul' | 'section';
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: step, delayChildren: delay } } }}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({
  children,
  className,
  variant = 'up',
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  variant?: RevealVariant;
  as?: 'div' | 'li';
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp className={className} variants={revealVariants[variant]}>
      {children}
    </Comp>
  );
}

/**
 * A number that counts itself up when it arrives.
 *
 * Tabular figures, always — a figure that changes width as it counts makes the
 * number beside it jump, and a price column that jumps is a price column
 * somebody misreads.
 */
export function CountUp({
  to,
  from = 0,
  duration = 1.8,
  decimals = 0,
  prefix = '',
  suffix = '',
  bangla = false,
  className,
}: {
  bangla?: boolean;
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [value, setValue] = React.useState(from);

  React.useEffect(() => {
    if (!inView) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(to);
      return;
    }
    const id = window.setInterval(() => {
      setValue((v) => {
        const next = v + (to - v) * 0.12;
        return Math.abs(to - next) < (to - from) / 500 ? to : next;
      });
    }, 16);
    const stop = window.setTimeout(() => {
      window.clearInterval(id);
      setValue(to);
    }, duration * 1000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [inView, to, from, duration]);

  return (
    <span ref={ref} className={cn('tnum', className)}>
      {prefix}
      {(() => {
        const text = value.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
        return bangla ? text.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]) : text;
      })()}
      {suffix}
    </span>
  );
}

/**
 * A button that leans towards the cursor.
 *
 * Capped hard at 6px. A magnetic button that follows the pointer properly is
 * impressive once and unusable for a click, because the target moves out from
 * under the finger that is arriving at it.
 */
export function Magnetic({
  children,
  className,
  strength = 6,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 22, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 22, mass: 0.4 });

  return (
    <motion.div
      className={cn('inline-block', className)}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(((e.clientX - r.left) / r.width - 0.5) * 2 * strength);
        y.set(((e.clientY - r.top) / r.height - 0.5) * 2 * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A panel that lights up under the cursor.
 *
 * The light is a fixed radial gradient that follows the pointer and a second
 * one that fades — two properties on one element, composited, so it never
 * costs a layout pass. Disabled on touch, where there is no pointer and the
 * highlight would just sit in the middle of the card for no reason.
 */
export function Spotlight({
  children,
  className,
  radius = 380,
}: {
  children: React.ReactNode;
  className?: string;
  radius?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: -9999, y: -9999 });
  const [on, setOn] = React.useState(false);

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch') return;
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        if (!on) setOn(true);
      }}
      onPointerLeave={() => setOn(false)}
      className={cn('group/spot relative overflow-hidden', className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: on ? 1 : 0,
          background: `radial-gradient(${radius}px circle at ${pos.x}px ${pos.y}px, rgb(16 185 129 / 0.13), transparent 62%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/** A card that tips towards the pointer, for the two or three places it earns its keep. */
export function Tilt({
  children,
  className,
  max = 7,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 24 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 24 });

  return (
    <motion.div
      className={cn('preserve-3d', className)}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch') return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ry.set(px * max * 2);
        rx.set(-py * max * 2);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A drifting pool of light.
 *
 * Three of these with different delays behind the hero, each on its own
 * compositor layer and each moving under 3% of the viewport, so the aurora
 * costs a GPU rather than a layout.
 */
export function Orb({
  className,
  color = 'rgb(16 185 129 / 0.5)',
  delay = 0,
  duration = 26,
  size = '46rem',
}: {
  className?: string;
  color?: string;
  delay?: number;
  duration?: number;
  size?: string;
}) {
  return (
    <motion.div
      aria-hidden
      className={cn('absolute rounded-full blur-3xl', className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}, transparent 68%)`,
      }}
      animate={{ x: ['-6%', '7%', '-4%', '-6%'], y: ['-3%', '6%', '2%', '-3%'], scale: [1, 1.12, 0.94, 1] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

/** Scroll-linked drift. Kept small — past about 60px it stops reading as depth and starts reading as a mistake. */
export function Parallax({
  children,
  className,
  distance = 44,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  return (
    <motion.div className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/**
 * The ring that turns slowly behind whatever number is counting up.
 *
 * `progress` is a shortcut for a child that *is* the number; pass `children`
 * instead when the ring wraps something with structure of its own, which is
 * why neither is required.
 */
export function CountRing({
  progress,
  className,
  children,
}: {
  progress?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('relative grid place-items-center', className)}>
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full ring-conic opacity-45 blur-[2px]"
        initial={{ '--ring-angle': '0deg' } as never}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
      <div className="relative grid place-items-center">{children ?? progress}</div>
    </div>
  );
}
