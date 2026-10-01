'use client';

import { MessageCircleQuestion } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { Section, SectionHead } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * Every question, on the home page.
 *
 * The FAQ lives here because it is the objection list — every one of these is
 * a reason a demo goes un-booked, and a buyer who has to leave the page to
 * find an answer is a buyer who mostly does not come back. The band is the
 * whole list, in the order a shop actually asks them.
 */

export function FaqPreview({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const faq = tItems<{ q: string; a: string }>(lang, 'faq.items');

  return (
    <Section id="faq" tone="light" orbs={1} className="py-20 sm:py-28">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <SectionHead
              eyebrow={t('faq.kicker')}
              title={t('faq.title')}
            />
            <Reveal variant="fade" delay={0.15} className="mt-6">
              <a
                href={`/${lang}/demo`}
                className="group flex items-start gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] p-4 transition-colors hover:border-primary/50"
              >
                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {t('demo.title')}
                </span>
              </a>
            </Reveal>
          </div>

          <Reveal variant="up" delay={0.1}>
            <Accordion type="single" collapsible className="w-full">
              {faq.map((f, i) => (
                <AccordionItem key={f.q} value={`item-${i}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}