'use client';

import Link from 'next/link';
import { ShieldQuestion } from 'lucide-react';
import { translate, type Lang } from '@/i18n/dictionary';
import { Section, SectionHead } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';
import { PlanCards } from '@/components/plan-cards';

/**
 * The price, on the home page.
 *
 * The whole price lives on this one page: a visitor who has read the billing
 * screen, the shelves and the offline band and then has to
 * go and find out what it costs is a visitor who has spent their attention, and
 * most of them do not come back. So the plans are rendered here in full, with
 * only the demo left as a second door.
 */

export function PricingPreview({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);

  return (
    <Section id="pricing" tone="light" orbs={1} className="py-20 sm:py-28">
      <div className="shell">
        <SectionHead
          eyebrow={t('pricing.kicker')}
          title={t('pricing.title')}
          lede={t('pricing.lede')}
          align="center"
        />

        <div className="mt-14">
          <PlanCards lang={lang} compact />
        </div>

        <Reveal variant="fade" delay={0.15} className="mt-10">
          <div className="flex flex-col items-center gap-5">
            <p className="max-w-[64ch] text-center text-xs leading-relaxed text-muted-foreground">
              {t('pricing.footnote')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${lang}/demo`}>
                  <ShieldQuestion className="size-4 text-primary" />
                  {t('nav.demo')}
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
