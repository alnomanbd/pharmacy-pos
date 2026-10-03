'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, Quote } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { useSiteSettings } from '@/lib/live';
import { Section } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';

/**
 * Real shops, in their own words — added in the console (Website → Customer
 * stories) with their permission. Nothing is shown until there is one: the
 * site does not invent customers. One story at a time, turning on its own,
 * with the others a dot away.
 */
export function StoriesSection({ lang }: { lang: Lang }) {
  const stories = useSiteSettings().stories;
  const still = useReducedMotion() ?? false;
  const [i, setI] = React.useState(0);

  React.useEffect(() => {
    if (still || stories.length < 2) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % stories.length), 7000);
    return () => window.clearInterval(id);
  }, [still, stories.length]);

  if (stories.length === 0) return null;
  const st = stories[i % stories.length];
  const quote = lang === 'bn' && st.quoteBn ? st.quoteBn : st.quote;
  const initials = st.name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Section id="stories" tone="dark" orbs={2} className="py-20 sm:py-28">
      <div className="shell">
        <Reveal variant="fade" className="flex justify-center">
          <span className="eyebrow">
            <span className="size-1.5 rounded-full bg-current" />
            {lang === 'bn' ? 'দোকানের মুখে' : 'From the counter'}
          </span>
        </Reveal>

        <div className="relative mx-auto mt-10 max-w-3xl text-center">
          <Quote aria-hidden className="mx-auto size-10 text-primary/60" />
          <AnimatePresence mode="wait">
            <motion.figure
              key={i}
              initial={{ opacity: 0, y: 18, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <blockquote className="mt-6 text-balance text-2xl font-semibold leading-snug text-white sm:text-3xl">“{quote}”</blockquote>
              <figcaption className="mt-8 flex items-center justify-center gap-3">
                <span className="grid size-12 place-items-center rounded-full bg-ramp text-sm font-bold text-white shadow-glow">{initials}</span>
                <span className="text-start leading-tight">
                  <span className="block font-semibold text-white">{st.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm text-white/60">
                    {st.shop}
                    {st.area && (
                      <>
                        {' · '}
                        <MapPin className="size-3.5" /> {st.area}
                      </>
                    )}
                  </span>
                </span>
              </figcaption>
            </motion.figure>
          </AnimatePresence>

          {stories.length > 1 && (
            <div className="mt-10 flex items-center justify-center gap-3">
              <button type="button" aria-label="Previous" onClick={() => setI((x) => (x - 1 + stories.length) % stories.length)} className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 hover:text-white">
                <ChevronLeft className="size-4" />
              </button>
              {stories.map((_, k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`Story ${k + 1}`}
                  onClick={() => setI(k)}
                  className={`h-2 rounded-full transition-all ${k === i % stories.length ? 'w-6 bg-primary' : 'w-2 bg-white/25'}`}
                />
              ))}
              <button type="button" aria-label="Next" onClick={() => setI((x) => (x + 1) % stories.length)} className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 hover:text-white">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
