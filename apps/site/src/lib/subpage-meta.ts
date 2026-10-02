import type { Metadata } from 'next';
import { siteConfig, type Lang } from '@/lib/site';
import { translate } from '@/i18n/dictionary';

/**
 * Metadata for every page under the language segment, so the eight subpages
 * share the same shape as the home page without each one re-typing the base
 * url and the language alternates.
 */

export type SubpageKey =
  | 'features'
  | 'pricing'
  | 'faq'
  | 'demo'
  | 'login'
  | 'register'
  | 'contact'
  | 'status'
  | 'legal';

export function subpageMetadata(lang: Lang, key: SubpageKey, path: string): Metadata {
  const title = translate(lang, `pages.meta.${key}.title`);
  const description = translate(lang, `pages.meta.${key}.description`);
  const url = `${siteConfig.url}/${lang}/${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: `${siteConfig.url}/en/${path}`,
        bn: `${siteConfig.url}/bn/${path}`,
      },
    },
    openGraph: { title, description, url, type: 'website' },
  };
}