'use client';

import * as React from 'react';
import { useSiteSettings } from '@/lib/live';

/**
 * Google Analytics and the Facebook Pixel, loaded only when the console has an
 * id for them (Website → Analytics). With neither set, nothing is loaded and
 * nothing about a visit leaves the page.
 */
export function Analytics() {
  const { gaId, fbPixelId } = useSiteSettings().analytics;

  React.useEffect(() => {
    if (!gaId || document.getElementById('dw-ga')) return;
    const tag = document.createElement('script');
    tag.id = 'dw-ga';
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(tag);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer.push(args);
    };
    w.gtag('js', new Date());
    w.gtag('config', gaId);
  }, [gaId]);

  React.useEffect(() => {
    if (!fbPixelId || document.getElementById('dw-fb')) return;
    type Fbq = ((...a: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; loaded?: boolean; version?: string; push?: unknown };
    const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
    if (!w.fbq) {
      const q: Fbq = function fbq(...args: unknown[]) {
        if (q.callMethod) q.callMethod(...args);
        else q.queue!.push(args);
      };
      q.queue = [];
      q.loaded = true;
      q.version = '2.0';
      q.push = q;
      w.fbq = q;
      w._fbq = q;
    }
    const tag = document.createElement('script');
    tag.id = 'dw-fb';
    tag.async = true;
    tag.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(tag);
    w.fbq!('init', fbPixelId);
    w.fbq!('track', 'PageView');
  }, [fbPixelId]);

  return null;
}
