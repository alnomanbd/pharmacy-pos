'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LANGS, langNames, type Lang } from '@/lib/site';
import { Globe } from 'lucide-react';

/**
 * The language switch.
 *
 * A toggle, not a dropdown: there are only two languages, so a menu with two
 * items makes the reader open a panel to perform the one action the control
 * exists for. The button shows where you are and hands you the other one.
 *
 * A flag would be wrong here — a flag is a country, and both products are read
 * by people in the same one.
 *
 * It swaps the first segment of the path and keeps everything else, so
 * `/en/pricing` becomes `/bn/pricing` and a reader who arrived deep on the FAQ
 * stays on the FAQ.
 */
export function LangSwitch({ lang, className }: { lang: Lang; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const index = LANGS.indexOf(lang);
  const next = LANGS[(index + 1) % LANGS.length];
  const from = langNames[lang];
  const to = langNames[next];

  const toggle = () => {
    const parts = (pathname ?? `/${lang}`).split('/');
    parts[1] = next;
    router.push(parts.join('/') || `/${next}`);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      // The label names the destination, not the current state: the button is
      // an action, so it has to say what pressing it will do.
      aria-label={`${from.label} → ${to.label}`}
      title={`${from.label} → ${to.label}`}
      className={cn(
        'group relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-full',
        'border border-border bg-card/60 px-3 text-2xs font-bold tracking-wide text-foreground backdrop-blur',
        'transition-all duration-300 hover:border-primary/40 hover:bg-card hover:shadow-glass',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      {/* Spins on press, so the swap reads as the same object turning over.
          Transform only, so it cannot move anything around it. */}
      <motion.span
        className="relative z-10 grid size-3.5 place-items-center"
        whileTap={{ rotate: 180 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      >
        <Globe className="size-3.5 text-muted-foreground" />
      </motion.span>

      {/* Fixed width, always. "EN" and "বাংলা" are different lengths, and a
          button that changes size drags every control beside it across the
          header — which reads as the page shaking. The slot is sized for the
          longer of the two and the text sits at the start of it. */}
      <span className="relative z-10 w-8 text-start">{from.self}</span>
    </button>
  );
}
