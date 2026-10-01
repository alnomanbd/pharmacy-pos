import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * The pharmacy site is the one place on this domain that wants to be found, so
 * unlike `pharmacy/index.html` — which is `noindex, nofollow` because a shop's
 * own counter is nobody's business — this is wide open. The one thing kept out
 * is the auth paths, which are not pages anybody searches for and which exist
 * only to be linked to from a form.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/*/login', '/*/register', '/api/'],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
