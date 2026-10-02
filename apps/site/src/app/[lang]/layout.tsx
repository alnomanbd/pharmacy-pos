import { notFound } from 'next/navigation';
import { isLang, LANGS, type Lang } from '@/lib/site';
import { translate } from '@/i18n/dictionary';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { GoToTop } from '@/components/go-to-top';
import { ChatButton } from '@/components/chat-button';

/**
 * Every page lives under a language segment, and the language is on `<html>`
 * rather than on a wrapper.
 *
 * That is the one thing about this that is not for us: `:lang(bn)` in
 * globals.css sets the leading, the font fallback chain picks Hind Siliguri,
 * and both of those need the attribute on the root element. A `<div lang="bn">`
 * around the content would leave the browser's own font selection and hyphenation
 * running on the Latin defaults, and the Bangla line height would be the Latin
 * one — which on this site is the difference between a heading and a smear.
 */
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <div lang={lang as Lang} data-lang={lang}>
      <SiteHeader lang={lang as Lang} />
      <main id="main">{children}</main>
      <SiteFooter lang={lang as Lang} />
      <GoToTop lang={lang as Lang} />
      <ChatButton lang={lang as Lang} />
    </div>
  );
}
