import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { translate, type Lang } from '@/i18n/dictionary';
import { isLang, DEFAULT_LANG, LANGS } from '@/lib/site';
import { subpageMetadata } from '@/lib/subpage-meta';
import { LegalDoc } from '@/components/legal-doc';

const DOCS = ['terms', 'privacy', 'refund'] as const;
export type Doc = (typeof DOCS)[number];

export function generateStaticParams() {
  return LANGS.flatMap((lang) => DOCS.map((doc) => ({ lang, doc })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; doc: string }>;
}): Promise<Metadata> {
  const { lang, doc } = await params;
  const l = isLang(lang) ? lang : DEFAULT_LANG;
  const meta = subpageMetadata(l, 'legal', 'legal');
  return {
    ...meta,
    title: translate(l, `pages.legal.${doc}.title`),
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ lang: string; doc: string }>;
}) {
  const { lang, doc } = await params;
  if (!isLang(lang) || !(DOCS as readonly string[]).includes(doc)) notFound();
  const l = lang as Lang;
  const d = doc as Doc;

  return <LegalDoc lang={l} doc={d} />;
}