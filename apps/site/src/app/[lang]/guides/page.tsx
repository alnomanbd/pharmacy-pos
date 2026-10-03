import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { isLang, siteConfig, type Lang } from '@/lib/site';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { GuidesBoard } from '@/components/guides-board';

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'bn' }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const bn = lang === 'bn';
  const title = bn ? 'গাইড — কীভাবে করবেন' : 'Guides — how to';
  const description = bn
    ? 'ঔষধের দোকানের বিলিং, স্টক, মেয়াদ আর বাকি খাতা — ধাপে ধাপে, বাংলায় ও ইংরেজিতে।'
    : 'Billing, stock, expiry and the baki khata for a pharmacy — step by step, in English and Bangla.';
  return {
    title,
    description,
    alternates: {
      canonical: `${siteConfig.url}/${lang}/guides`,
      languages: { en: `${siteConfig.url}/en/guides`, bn: `${siteConfig.url}/bn/guides` },
    },
    openGraph: { title, description, url: `${siteConfig.url}/${lang}/guides`, type: 'website', images: [{ url: '/og.png', width: 1200, height: 630 }] },
  };
}

/** The help articles the shops read, on the website — written in the console (Help articles). */
export default async function GuidesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const bn = l === 'bn';
  return (
    <>
      <PageHeader
        lang={l}
        kicker={bn ? 'গাইড' : 'Guides'}
        title={bn ? 'কীভাবে করবেন' : 'How to do it in Dawai'}
        lede={bn ? 'ছোট ছোট ধাপে — বিল, স্টক, মেয়াদ, বাকি খাতা আর আরও অনেক কিছু।' : 'Short, step-by-step answers — billing, stock, expiry, the baki khata and more.'}
        icon={BookOpen}
      />
      <Section id="guides" tone="light" orbs={1} className="py-10 sm:py-14">
        <div className="shell mx-auto max-w-4xl">
          <Suspense>
            <GuidesBoard lang={l} />
          </Suspense>
        </div>
      </Section>
    </>
  );
}
