import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { translate, type Lang } from '@/i18n/dictionary';
import { isLang, DEFAULT_LANG } from '@/lib/site';
import { subpageMetadata } from '@/lib/subpage-meta';
import { PageHeader } from '@/components/page-header';
import { Activity } from 'lucide-react';
import { Section } from '@/components/section';
import { StatusBoard } from '@/components/status-board';

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'bn' }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return subpageMetadata(isLang(lang) ? lang : DEFAULT_LANG, 'status', 'status');
}

/** "Is it you or is it us?" — answered without a phone call. The board itself is live. */
export default async function StatusPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;
  const t = (p: string) => translate(l, p);
  return (
    <>
      <PageHeader lang={l} kicker={t('pages.status.kicker')} title={t('pages.status.title')} lede={t('pages.status.lede')} icon={Activity} />
      <Section id="status" tone="light" orbs={1} className="py-10 sm:py-14">
        <div className="shell mx-auto max-w-3xl">
          <StatusBoard lang={l} />
        </div>
      </Section>
    </>
  );
}
