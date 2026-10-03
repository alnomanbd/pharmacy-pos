import Link from 'next/link';
import { ArrowRight, CalendarClock, FileText, ReceiptText, ShieldCheck } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { siteConfig } from '@/lib/site';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';

/**
 * One legal document, in one of two languages.
 *
 * The three documents are the same shape — a header, a lede, and a numbered
 * list of clauses — so they share this component and the dictionary keeps the
 * words. The date is deliberately not in the dictionary: "last updated" is a
 * fact about a build, and the same date has to hold in every language.
 */

const UPDATED = '2026-10-03';
const ICON = { terms: FileText, privacy: ShieldCheck, refund: ReceiptText } as const;

export function LegalDoc({
  lang,
  doc,
}: {
  lang: Lang;
  doc: 'terms' | 'privacy' | 'refund';
}) {
  const t = (p: string) => translate(lang, p);
  const items = tItems<{ h: string; t: string }>(lang, `pages.legal.${doc}.items`);

  return (
    <>
      <PageHeader
        lang={lang}
        kicker={t('pages.legal.kicker')}
        title={t(`pages.legal.${doc}.title`)}
        lede={t(`pages.legal.${doc}.lede`)}
        icon={ICON[doc]}
      >
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-2xs font-medium text-muted-foreground backdrop-blur">
          <CalendarClock className="size-3.5 text-primary" />
          {t('pages.legal.updated')} — {UPDATED}
        </p>
      </PageHeader>

      <Section id="body" tone="light" orbs={1} className="py-10 sm:py-14">
        <div className="shell mx-auto max-w-3xl">
          <div className="flex flex-col gap-5">
            {items.map((item, i) => (
              <Reveal key={item.h} variant="up" delay={(i % 3) * 0.05}>
                <article className="panel p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <span className="font-mono text-2xs tabular-nums text-primary">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col gap-2.5">
                      <h2 className="h-card text-lg">{item.h}</h2>
                      <p className="text-sm leading-relaxed text-muted-foreground">{item.t}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal variant="fade" delay={0.1} className="mt-12">
            <div className="flex flex-col items-start gap-4 rounded-3xl border border-dashed border-primary/30 bg-primary/[0.04] p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t('pages.contact.lede')}
              </p>
              <div className="flex shrink-0 gap-3">
                <Button asChild variant="outline" size="sm" className="group">
                  <a href={`/${lang}/contact`}>
                    {t('pages.contact.kicker')}
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground sm:flex-row sm:gap-8">
              <Link href={`/${lang}/legal/terms`} className="font-medium text-primary underline-offset-4 hover:underline">
                {t('footer.terms')}
              </Link>
              <Link href={`/${lang}/legal/privacy`} className="font-medium text-primary underline-offset-4 hover:underline">
                {t('footer.privacy')}
              </Link>
              <Link href={`/${lang}/legal/refund`} className="font-medium text-primary underline-offset-4 hover:underline">
                {t('footer.refund')}
              </Link>
              <span className="sm:ms-auto">
                {siteConfig.contactEmail}
              </span>
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}