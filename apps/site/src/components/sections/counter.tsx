'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Search,
  UserRound,
  CreditCard,
  Layers,
  Hand,
  SplitSquareHorizontal,
  Sparkles,
  ShieldOff,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { Section, SectionHead, FeatureGrid } from '@/components/section';
import { Reveal, Spotlight, Tilt, StaggerItem } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Receipt } from '@/components/pos-screen';

/*
 * The counter.
 *
 * The band's one idea is in its heading: *a billing screen, not a web page with a form on
 * it*. Everything under it is evidence. The key grid on the right is not a
 * screenshot — it is wired to the same state the billing mock listens on, so
 * pressing F6 on a real keyboard anywhere on this site lights the same key.
 * A visitor who tries it has answered their own "is this actually faster"
 * question in two seconds, which no copy on this page could do.
 *
 * The key *labels* live in `counter.keymap` and the function keys themselves live
 * here, because the billing mock maps its own six lit keys to the same order and
 * the two have to stay in step.
 */

const KEYS = [
  { k: 'F2', icon: Search },
  { k: 'F4', icon: UserRound },
  { k: 'F5', icon: Layers },
  { k: 'F6', icon: Hand },
  { k: 'F7', icon: Layers },
  { k: 'F8', icon: CreditCard },
  { k: 'F9', icon: SplitSquareHorizontal },
  { k: 'F10', icon: CreditCard },
] as const;

export function CounterSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const [active, setActive] = React.useState<string>('F6');

  const words = tItems<{ what: string; body: string }>(lang, 'counter.keymap');
  const card = tItems<{ title: string; body: string }>(lang, 'counter.points');
  const activeIndex = Math.max(
    0,
    KEYS.findIndex((k) => k.k === active),
  );
  const activeKey = KEYS[activeIndex];
  const activeWords = words[activeIndex];

  return (
    <Section id="counter" tone="light" orbs={2} className="py-20 sm:py-28">
      <div className="shell">
        <SectionHead
          eyebrow={t('counter.kicker')}
          title={t('counter.title')}
          action={
            <Button asChild variant="outline" size="md" className="group">
              <Link href={`/${lang}/demo`}>
                {t('nav.demo')}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          }
        />

        {/* ---------------------------------------------- the interactive part */}
        <Reveal variant="up" delay={0.12} className="mt-14">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            {/* the key grid, wired to the real keyboard */}
            <div className="glass p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="h-card text-xl">{t('counter.keyCard.title')}</h3>
                </div>
                <Badge variant="soft" className="shrink-0">
                  {t('counter.keyCard.badge')}
                </Badge>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KEYS.map((key, i) => {
                  const on = key.k === active;
                  return (
                    <button
                      key={key.k}
                      type="button"
                      onClick={() => setActive(key.k)}
                      onMouseEnter={() => setActive(key.k)}
                      className={cn(
                        'group relative flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition-all duration-300 ease-spring',
                        on
                          ? 'border-primary/40 bg-primary/10 shadow-glow'
                          : 'border-border bg-card/50 hover:border-primary/25 hover:bg-card',
                      )}
                    >
                      <span
                        className={cn(
                          'font-mono text-sm font-bold transition-colors',
                          on ? 'text-primary' : 'text-foreground/70 group-hover:text-foreground',
                        )}
                      >
                        {key.k}
                      </span>
                      <span
                        className={cn(
                          'text-2xs font-semibold transition-colors',
                          on ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {words[i]?.what}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* The readout. Fixed height so the band does not jump when the
                  description changes length — on a page where the whole argument
                  is "this is calm", a jumping layout would give it away. */}
              <div className="mt-6 rounded-2xl border border-border/70 bg-background/50 p-5">
                <div className="flex min-h-[4.5rem] items-start gap-4">
                  <AnimateIcon id={active} icon={activeKey.icon} />
                  <div>
                    <p className="font-mono text-2xs font-bold uppercase tracking-[0.16em] text-primary">
                      {activeKey.k} · {activeWords?.what}
                    </p>
                    <motion.p
                      key={active}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="mt-1.5 text-sm leading-relaxed text-muted-foreground"
                    >
                      {activeWords?.body}
                    </motion.p>
                  </div>
                </div>
              </div>
            </div>

            {/* the paper */}
            <Tilt max={4} className="hidden lg:block">
              <div className="relative h-full">
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-[radial-gradient(28rem_18rem_at_70%_10%,rgb(16_185_129_/_0.16),transparent_65%)]"
                />
                <div className="flex h-full flex-col items-center justify-center gap-5 rounded-3xl border border-border/60 bg-gradient-to-b from-white to-muted/40 p-7 dark:from-white/[0.04] dark:to-transparent">
                  <div className="text-center">
                    <p className="text-2xs font-bold uppercase tracking-[0.2em] text-primary">
                      {t('counter.receipt.kicker')}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {t('counter.receipt.lede')}
                    </p>
                  </div>
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Receipt />
                  </motion.div>
                </div>
              </div>
            </Tilt>
          </div>
        </Reveal>

        {/* ------------------------------------------------------- the points */}
        <FeatureGrid className="mt-6" step={0.05}>
          {card.slice(1, 6).map((f, i) => (
            <Spotlight key={f.title} className="h-full rounded-3xl">
              <StaggerItem variant="up" className="h-full">
                <article className="glass panel-lift flex h-full flex-col gap-4 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors duration-500 group-hover/spot:bg-primary group-hover/spot:text-primary-foreground">
                      {[
                        <Layers className="size-5" key="a" />,
                        <Hand className="size-5" key="b" />,
                        <SplitSquareHorizontal className="size-5" key="c" />,
                        <Sparkles className="size-5" key="d" />,
                        <ShieldOff className="size-5" key="e" />,
                      ][i]}
                    </span>
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground/65">
                      {String(i + 2).padStart(2, '0')}
                    </span>
                  </div>
                  {/* The title says it; a sentence under it was the same thing again. */}
                  <h3 className="h-card text-base leading-snug">{f.title}</h3>
                </article>
              </StaggerItem>
            </Spotlight>
          ))}
        </FeatureGrid>
      </div>
    </Section>
  );
}

/** The icon for whichever key is selected, cross-fading between the two. */
function AnimateIcon({ id, icon: Icon }: { id: string; icon: typeof Search }) {
  return (
    <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
      <motion.span
        key={id}
        initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="grid place-items-center"
      >
        <Icon className="size-5" />
      </motion.span>
    </span>
  );
}
