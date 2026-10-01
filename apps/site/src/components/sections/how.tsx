'use client';

import Link from 'next/link';
import { ArrowRight, Store, Wrench, ReceiptText } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { num } from '@/i18n/mock';
import { Section, SectionHead } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';

/*
 * How it works — three steps, the target of the header's first link.
 *
 * A buyer's last question before the price is "how much work is this for me",
 * and the honest answer is short, so the band is short: three cards, one line
 * each, and the trial button. The middle step is the one we do, and it is the
 * one that sells the trial.
 */

const ICONS = [Store, Wrench, ReceiptText] as const;

export function HowSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const steps = tItems<{ tag: string; title: string; body: string }>(lang, 'how.steps');

  return (
    <Section id="how" tone="plain" className="py-20 sm:py-28">
      <div className="shell">
        <SectionHead eyebrow={t('how.kicker')} title={t('how.title')} lede={t('how.lede')} align="center" />

        <ol className="relative mt-12 grid gap-4 sm:mt-14 md:grid-cols-3 md:gap-5">
          {/* the thread between the three, on wide screens only */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-[16%] top-[2.65rem] hidden h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent md:block"
          />
          {steps.map((s, i) => {
            const Icon = ICONS[i] ?? Store;
            return (
              <Reveal key={s.title} variant="up" delay={0.06 * i} className="h-full">
                <li className="glass panel-lift relative flex h-full flex-col gap-3 p-6">
                  <div className="flex items-center justify-between">
                    <span className="relative grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
                      <Icon className="size-5" />
                    </span>
                    <span className="rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-2xs font-semibold text-primary">
                      {s.tag}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-2xs font-bold text-muted-foreground">
                    {num(lang, String(i + 1).padStart(2, '0'))}
                  </p>
                  <h3 className="-mt-1 text-lg font-bold tracking-tight">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              </Reveal>
            );
          })}
        </ol>

        <Reveal variant="fade" delay={0.2} className="mt-10 flex justify-center">
          <Button asChild size="lg" className="group w-full sm:w-auto">
            <Link href={`/${lang}/register`}>
              {t('how.cta')}
              <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}
