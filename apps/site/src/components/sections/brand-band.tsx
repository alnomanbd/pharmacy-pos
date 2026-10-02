'use client';

import type { Lang } from '@/i18n/dictionary';
import { MEDICINE_BRANDS } from '@/lib/data';
import { cn } from '@/lib/utils';
import { Marquee } from '@/components/marquee';
import { Reveal } from '@/components/motion/primitives';

/**
 * The brand strip.
 *
 * Placed directly under the hero's four figures, where it does a job no logo
 * wall can: a shop owner scanning for their own supplier's name finds it, and
 * concludes the catalogue is already built. Every name here is a real
 * Bangladesh manufacturer, and the row moves in one direction only — a second
 * row going the other way reads as a carousel, and a carousel under a hero reads
 * as a decoration.
 */

const ROWS = [
  MEDICINE_BRANDS.slice(0, 9),
  MEDICINE_BRANDS.slice(9, 18),
  MEDICINE_BRANDS.slice(18, 27),
];

export function BrandBand({ lang }: { lang: Lang }) {
  return (
    <section className="relative isolate overflow-hidden border-y border-border/50 bg-muted/25 py-7">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 -z-10 opacity-[0.55]" />
      <div className="shell flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        <Reveal variant="fade" className="shrink-0">
          <p className="text-2xs font-semibold uppercase leading-relaxed tracking-[0.18em] text-muted-foreground sm:max-w-[18ch]">
            {lang === 'bn' ? 'সব কোম্পানির ঔষধ, তালিকায় আগে থেকেই' : 'Every company’s medicines, already in the list'}
          </p>
        </Reveal>

        <div className="min-w-0 flex-1">
          {ROWS.map((row, i) => (
            <Marquee
              key={i}
              duration={58 + i * 9}
              className={cn(i > 0 && 'mt-2.5', i > 0 && 'opacity-55')}
            >
              {row.map((brand) => (
                <span
                  key={brand}
                  className="mx-2.5 whitespace-nowrap px-3 py-1.5 text-sm font-semibold tracking-tight text-foreground/65 transition-colors duration-300 hover:text-primary sm:mx-3"
                >
                  {brand}
                </span>
              ))}
            </Marquee>
          ))}
        </div>
      </div>
    </section>
  );
}
