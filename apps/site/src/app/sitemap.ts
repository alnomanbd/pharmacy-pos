import type { MetadataRoute } from 'next';
import { siteConfig, LANGS } from '@/lib/site';

/** Every page that is actually published, in both languages. */
const ROUTES = ['', '/demo', '/guides', '/contact', '/status', '/register', '/login'];

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  /* The auth pages carry no marketing copy and are near-duplicates of each
     other in a search index, so they are excluded rather than submitted and
     then ignored. */
  const excluded = new Set(['/register', '/login']);
  const priority: Record<string, number> = {
    '': 1,
    '/demo': 0.8,
    '/guides': 0.7,
    '/contact': 0.6,
    '/status': 0.3,
  };

  const entries: MetadataRoute.Sitemap = [];

  for (const lang of LANGS) {
    for (const route of ROUTES) {
      if (excluded.has(route)) continue;
      entries.push({
        url: `${siteConfig.url}/${lang}${route}`,
        lastModified: now,
        changeFrequency: route === '' ? 'weekly' : 'monthly',
        priority: priority[route] ?? 0.5,
        alternates: {
          languages: Object.fromEntries(
            LANGS.map((l) => [l, `${siteConfig.url}/${l}${route}`]),
          ),
        },
      });
    }
  }

  return entries;
}
