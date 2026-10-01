'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle, MessageSquare } from 'lucide-react';
import { translate, tItems, tList, type Lang } from '@/i18n/dictionary';
import { Section } from '@/components/section';
import { Reveal, Magnetic, Orb, Parallax } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';

/**
 * The last thing on the page.
 *
 * A closing band has one job, so it does not repeat the argument: it names the
 * two remaining doubts — *it costs nothing to find out* and *a person will
 * answer* — and puts the two doors side by side. Everything above it was for a
 * visitor who is still deciding; this is for one who has decided and is now
 * looking for the least embarrassing way to start.
 *
 * The parallax on the mark is the only motion here, and it is slow.
 */

export function CtaSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const points = tList(lang, 'cta.points');

  return (
    <Section tone="light" orbs={3} bordered={false} className="py-24 sm:py-32">

      <div className="shell relative">
        <div className="flex flex-col items-center gap-8 text-center">
          <Reveal variant="up">
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-current" />
              {t('cta.kicker')}
            </span>
          </Reveal>

          <Reveal variant="up" delay={0.06}>
            <h2 className="h-section mx-auto max-w-4xl text-balance">
              {t('cta.title')}
            </h2>
          </Reveal>

          <Reveal variant="up" delay={0.12}>
            <p className="measure mx-auto text-pretty leading-relaxed text-muted-foreground">
              {t('cta.lede')}
            </p>
          </Reveal>

          <Reveal variant="up" delay={0.18}>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
              {points.map((p) => (
                <li
                  key={p}
                  className="text-xs font-medium text-muted-foreground before:mr-2 before:text-primary before:content-['—']"
                >
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal variant="up" delay={0.24}>
            <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Magnetic strength={5}>
                <Button asChild size="lg" variant="primary" className="group w-full sm:w-auto">
                  <Link href={`/${lang}/register`}>
                    {t('cta.primary')}
                    <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
              </Magnetic>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Link href={`/${lang}/demo`}>
                  <PlayCircle className="size-5 text-primary" />
                  {t('cta.secondary')}
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal variant="fade" delay={0.3}>
            <a
              href={`/${lang}/contact`}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <MessageSquare className="size-3.5" />
              {t('cta.tertiary')}
            </a>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
