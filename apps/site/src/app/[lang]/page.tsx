import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, LANGS, DEFAULT_LANG, siteConfig } from '@/lib/site';
import { translate } from '@/i18n/dictionary';
import { Hero } from '@/components/sections/hero';
import { BrandBand } from '@/components/sections/brand-band';
import { CounterSection } from '@/components/sections/counter';
import { StockSection } from '@/components/sections/stock';
import { OfflineSection } from '@/components/sections/offline';
import { CompareSection } from '@/components/sections/compare';
import { SavingsSection } from '@/components/sections/savings';
import { StoriesSection } from '@/components/sections/stories';
import { SecuritySection } from '@/components/sections/security';
import { HowSection } from '@/components/sections/how';
import { PricingPreview } from '@/components/sections/pricing-preview';
import { FaqPreview } from '@/components/sections/faq-preview';
import { CtaSection } from '@/components/sections/cta';
import { KhataSection, ReportsSection, BranchesSection } from '@/components/sections/visuals';

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

/**
 * The title and description are per language, not per route segment.
 *
 * A static export gives us exactly two HTML files for the home page, so this is
 * the only place a Bangla visitor can be told, in Bangla, that this is a
 * medicine-shop billing system — and `hreflang` has to point both ways or the
 * two versions end up competing with each other in the same market.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const l = isLang(lang) ? lang : DEFAULT_LANG;
  return {
    title: { absolute: translate(l, 'meta.title') },
    description: translate(l, 'meta.description'),
    keywords: translate(l, 'meta.keywords'),
    alternates: {
      canonical: `/${l}`,
      languages: {
        en: '/en',
        bn: '/bn',
        'x-default': '/en',
      },
    },
    openGraph: {
      title: translate(l, 'meta.title'),
      description: translate(l, 'meta.description'),
      siteName: siteConfig.name,
      locale: l === 'bn' ? 'bn_BD' : 'en_US',
      type: 'website',
      url: `/${l}`,
      images: [{ url: '/og.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: translate(l, 'meta.title'),
      description: translate(l, 'meta.description'),
    },
  };
}

/**
 * The home page, in the order the argument is made.
 *
 * Everything on it is something you can watch move rather than something you
 * read, because a shop owner has no patience for paragraphs:
 *
 *   1. the billing screen, running — nothing else matters until it looks real;
 *   2. the shelves, emptying first-expiry-first-out;
 *   4. the rest of the counter, one interactive screen at a time;
 *   5. offline, dark, because it is the failure every shop owner has seen;
 *   6. the notebook against the screen, the three steps to start, price,
 *      questions, and the two doors.
 */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <>
      <Hero lang={lang} />
      <BrandBand lang={lang} />
      <CounterSection lang={lang} />
      <StockSection lang={lang} />
      <KhataSection lang={lang} />
      <ReportsSection lang={lang} />
      <OfflineSection lang={lang} />
      <CompareSection lang={lang} />
      <SavingsSection lang={lang} />
      <StoriesSection lang={lang} />
      <BranchesSection lang={lang} />
      <HowSection lang={lang} />
      <SecuritySection lang={lang} />
      <PricingPreview lang={lang} />
      <FaqPreview lang={lang} />
      <CtaSection lang={lang} />
    </>
  );
}
