'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { num } from '@/i18n/mock';
import { cn } from '@/lib/utils';
import { Section, SectionHead } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';

/*
 * From the counter.
 *
 * This band is deliberately built to be honest about what it is. The four
 * entries are written as *scenarios* the product is designed to produce — the
 * walk-through rack, the salesman who cannot see the trade price, the seven
 * o'clock dropout — and the page labels them as such in a line under the
 * quotes, because a shop owner can tell the difference between a scenario and a
 * customer and a fake testimonial costs the whole site its credibility.
 *
 * They are written to be replaced: as the trial list grows, each one swaps for a
 * real quote from a real shop with that shop's permission to be named, and the
 * note goes with them.
 */

const INTERVAL = 9_000;

export function VoicesSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const items = tItems<{ quote: string; name: string; where: string }>(lang, 'voices.items');
  const [open, setOpen] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setOpen((i) => (i + 1) % items.length), INTERVAL);
    return () => window.clearInterval(id);
  }, [paused, items.length]);

  const item = items[open];
  if (!item) return null;

  return (
    <Section id="voices" tone="light" orbs={2} className="py-20 sm:py-28">
      <div className="shell">
        <SectionHead
          eyebrow={t('voices.kicker')}
          title={t('voices.title')}
          align="center"
        />

        <Reveal variant="up" delay={0.1} className="mx-auto mt-12 max-w-3xl">
          <figure
            className="glass panel-lift relative overflow-hidden rounded-3xl p-7 sm:p-10"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div
              aria-hidden
              className="absolute -end-16 -top-16 size-56 rounded-full bg-primary/[0.08] blur-3xl"
            />
            <Quote
              aria-hidden
              className="size-8 text-primary/25"
            />

            <div className="relative mt-5 min-h-[9rem] sm:min-h-[8rem]">
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={open}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="text-balance text-lg font-medium leading-relaxed tracking-tight sm:text-xl"
                >
                  &ldquo;{item.quote}&rdquo;
                </motion.blockquote>
              </AnimatePresence>
            </div>

            <figcaption className="relative mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-5">
              <span className="text-sm font-bold">{item.name}</span>
              <span className="text-xs text-muted-foreground">{item.where}</span>

              <span className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpen((i) => (i - 1 + items.length) % items.length)}
                  aria-label="Previous"
                  className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-95"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                  {num(lang, String(open + 1).padStart(2, '0'))} / {num(lang, String(items.length).padStart(2, '0'))}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen((i) => (i + 1) % items.length)}
                  aria-label="Next"
                  className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary active:scale-95"
                >
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </figcaption>
          </figure>

          {/* The dots, and the honesty. The line is small on purpose — it is a
              footnote, not a confession, but it is on the page. */}
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setOpen(i)}
                  aria-label={`Scenario ${i + 1}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === open ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-primary/40',
                  )}
                />
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-center text-2xs text-muted-foreground">
              <Info className="size-3 shrink-0" />
              {t('voices.note')}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
