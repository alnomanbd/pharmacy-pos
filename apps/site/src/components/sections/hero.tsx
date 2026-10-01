'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, PlayCircle, Check, ChevronDown, Zap, WifiOff, ScanBarcode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { translate, tList, tItems, type Lang } from '@/i18n/dictionary';
import { Button } from '@/components/ui/button';
import { Magnetic, Orb, CountUp, Reveal } from '@/components/motion/primitives';
import { PosScreen } from '@/components/pos-screen';

/**
 * The first screen.
 *
 * Every decision here is a conversion decision, and the structure is the
 * argument: the headline names the two things a pharmacy owner actually loses
 * money on (what you sold, what you are owed), the proof is the product
 * running, and the two buttons split the two kinds of visitor — the one who
 * has decided and the one who is still watching.
 *
 * The `hero` band's own copy comes from the dictionary, so the Bangla version
 * is a real translation and not a transliteration, and the Bangla headline
 * breaks differently because the measure is set by the language and not by the
 * container.
 */

/* Icons and placement are code, because they cannot be translated. The words
   beside them come from `hero.orbit`, and these three are the questions a shop
   owner asks in the first ten minutes, in the order they ask them. */
const ORBIT_SLOTS = [
  {
    icon: Zap,
    stat: { en: '৳1,12,400', bn: '৳১,১২,৪০০' },
    tone: 'from-emerald-500/25 to-emerald-500/0',
    ring: 'border-emerald-500/30',
  },
  {
    icon: WifiOff,
    stat: { en: '17 bills', bn: '১৭টি বিল' },
    tone: 'from-amber-500/25 to-amber-500/0',
    ring: 'border-amber-500/30',
  },
  {
    icon: ScanBarcode,
    stat: { en: '2,418 pcs', bn: '২,৪১৮ পিস' },
    tone: 'from-cyan-500/25 to-cyan-500/0',
    ring: 'border-cyan-500/30',
  },
] as const;

/* The animated part of each figure. The wording is `hero.stats`. */
const STAT_TARGETS = [2418, 14, 0, 2] as const;

export function Hero({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const proof = tList(lang, 'hero.proof');
  const orbit = tItems<{ label: string; note: string }>(lang, 'hero.orbit');
  const stats = tItems<{ suffix: string; label: string }>(lang, 'hero.stats');
  const ref = React.useRef<HTMLDivElement>(null);

  /* The billing screen recedes as the page scrolls past it — 90px over the first screen.
     Any more and the mock detaches from the copy that is describing it. */
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const mockY = useTransform(scrollYProgress, [0, 1], [0, 92]);
  const mockScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const fade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <div ref={ref} className="relative isolate overflow-hidden">
      {/* The aurora. Three pools, drifting out of phase, blurred — the light in
          this site is emitted, not printed, and it is the one thing on the
          screen that is not a box. */}
      <div className="aurora-field -z-10">
        <Orb className="-start-40 -top-56" color="rgb(16 185 129 / 0.5)" size="52rem" duration={28} />
        <Orb className="end-[-14rem] top-[-6rem]" color="rgb(6 182 212 / 0.42)" size="44rem" duration={22} delay={4} />
        <Orb className="start-1/4 top-[34rem]" color="rgb(45 212 191 / 0.3)" size="40rem" duration={32} delay={8} />
      </div>
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.55]" />

      <div className="shell-wide pt-36 sm:pt-40 lg:pt-44">
        {/* ---------------------------------------------------------- copy */}
        <motion.div style={{ y: copyY, opacity: fade }} className="relative z-10">
          <div className="grid items-center gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-10">
            <div className="flex flex-col items-start gap-7">
              <motion.span
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="eyebrow"
              >
                <span className="relative grid size-1.5 place-items-center">
                  <span className="absolute size-1.5 animate-pulse-ring rounded-full bg-current" />
                  <span className="size-1.5 rounded-full bg-current" />
                </span>
                {t('hero.eyebrow')}
              </motion.span>

              <h1 className="h-display">
                <motion.span
                  className="block"
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.75, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t('hero.titleA')}
                </motion.span>
                <motion.span
                  className="text-ramp block"
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.75, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t('hero.titleEm')}
                </motion.span>
                <motion.span
                  className="block"
                  initial={{ opacity: 0, y: 26 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.75, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {t('hero.titleB')}
                </motion.span>
              </h1>

              <motion.p
                className="measure text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('hero.lede')}
              </motion.p>

              {/* The two buttons, split by intent: a trial for the visitor who
                  has decided, a call for the visitor who has not. The second is
                  deliberately not styled as a primary — a shop owner who is
                  unsure does not want the loud button, and putting the demo
                  second is what gets it clicked. */}
              <motion.div
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.75, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <Magnetic strength={5}>
                  <Button asChild size="lg" className="group w-full sm:w-auto">
                    <Link href={`/${lang}/register`}>
                      {t('hero.ctaPrimary')}
                      <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </Magnetic>

                <Magnetic strength={4}>
                  <Button asChild size="lg" variant="outline" className="group w-full sm:w-auto">
                    <Link href={`/${lang}/demo`}>
                      <PlayCircle className="size-5 text-primary" />
                      {t('hero.ctaSecondary')}
                    </Link>
                  </Button>
                </Magnetic>
              </motion.div>

              <motion.div
                className="flex flex-col gap-2.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                <p className="text-xs text-muted-foreground">{t('hero.ctaNote')}</p>
                <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {proof.map((p) => (
                    <li key={p} className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <Check className="size-3.5 text-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>

            {/* ---------------------------------------------------- the proof */}
            <div className="perspective relative mx-auto w-full max-w-3xl xl:max-w-none">
              <motion.div style={{ y: mockY, scale: mockScale }} className="relative">
                <motion.div
                  initial={{ opacity: 0, y: 44, rotateX: 12 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ duration: 1.05, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <PosScreen className="w-full" lang={lang} />
                </motion.div>

                {/* The three facts, floating. They enter on a long stagger so
                    they arrive as the eye has already settled on the billing screen —
                    late enough to be a detail, early enough to be noticed. */}
                {/* One fact, hung off the screen's top edge rather than laid
                    over it — the billing screen is the proof and nothing may
                    cover a line of it. The stock and offline facts are on the
                    screen's own foot and in their own sections. */}
                {ORBIT_SLOTS.map((o, i) =>
                  i !== 0 ? null : (
                    <motion.div
                      key={o.stat.en}
                      initial={{ opacity: 0, y: 22, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.8,
                        delay: 0.75 + i * 0.16,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className={cn(
                        'glass absolute z-20 w-[12.5rem] animate-float p-3.5 shadow-lift',
                        'bottom-full -mb-5 end-[34%]',
                        'max-xl:hidden',
                      )}
                      style={{ animationDuration: '7s' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('grid size-7 place-items-center rounded-lg border bg-gradient-to-br', o.ring, o.tone)}>
                          <o.icon className="size-3.5 text-foreground" />
                        </span>
                        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {orbit[i]?.label}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-lg font-bold tabular-nums tracking-tight">
                        {o.stat[lang]}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] leading-tight text-muted-foreground">
                        {orbit[i]?.note}
                      </p>
                    </motion.div>
                  ),
                )}
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* -------------------------------------------------- the four stats */}
        <Reveal
          variant="up"
          delay={0.15}
          className="mt-24 border-t border-border/60 pt-10 sm:mt-28"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-9 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className="flex flex-col gap-1">
                <span className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                  {STAT_TARGETS[i] === 0 ? (lang === 'bn' ? '৳০' : '৳0') : <CountUp to={STAT_TARGETS[i]} bangla={lang === 'bn'} />}
                  <span className="text-primary">{s.suffix}</span>
                </span>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* The way further down. A one-line invitation that stops being on screen
          the moment the visitor takes it. */}
      <div className="relative mt-16 flex justify-center pb-6 sm:mt-20">
        <a
          href="#counter"
          className="group inline-flex flex-col items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary"
        >
          {t('hero.scroll')}
          <ChevronDown className="size-4 transition-transform duration-500 group-hover:translate-y-1" />
        </a>
      </div>
    </div>
  );
}

