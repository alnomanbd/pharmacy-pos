import * as React from 'react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site';

/**
 * The mark: a scored capsule.
 *
 * A capsule with the seam across the middle is a tablet taken in half, which is
 * the one object every medicine shop in the country has on its shelves, and it
 * is also the shape `pharmacy/src/pages/Login.tsx` already signs in with — so
 * the logo on the marketing site and the logo on the counter's sign-in screen
 * are the same object at two sizes.
 *
 * It is drawn rather than uploaded: a mark that stays sharp from a 16px favicon
 * to a 512px social card, takes the site's gradient instead of a baked-in
 * colour, and costs no request.
 */
export function Mark({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full',
        'bg-ramp shadow-[0_6px_18px_-8px_rgba(13,148,136,0.9)]',
        className,
      )}
    >
      <span className="absolute inset-0 rounded-full bg-[linear-gradient(160deg,rgba(255,255,255,0.55),transparent_55%)]" />
      <svg viewBox="0 0 24 24" className="relative size-[62%]" aria-hidden>
        <rect
          x="1.5"
          y="7.5"
          width="21"
          height="9"
          rx="4.5"
          fill="none"
          stroke="white"
          strokeWidth="2.1"
        />
        <path d="M12 7.5a4.5 4.5 0 0 0 0 9" fill="white" />
      </svg>
      {animated && (
        <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-teal-400/40" />
      )}
    </span>
  );
}

/**
 * The wordmark. The product name and the word `Pharmacy` set apart, so the
 * name can change (it lives in `lib/site.ts`) without the mark saying less
 * about what the product is.
 */
export function Logo({
  className,
  wordmark = siteConfig.wordmark,
  product = siteConfig.product,
  markClassName,
}: {
  className?: string;
  wordmark?: string;
  product?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark className={cn('size-9', markClassName)} />
      <span className="flex flex-col leading-none">
        <span className="text-[0.95rem] font-extrabold tracking-[-0.03em]">{wordmark}</span>
        <span className="mt-0.5 text-2xs font-semibold uppercase tracking-[0.2em] text-primary">
          {product}
        </span>
      </span>
    </span>
  );
}

/** The favicon, in the same drawing, for `icon.svg` at the site root. */
export function Favicon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="0.52" stopColor="#0ea5a4" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#g)" />
      <rect x="4.5" y="11" width="23" height="10" rx="5" fill="none" stroke="#fff" strokeWidth="2.6" />
      <path d="M16 11a5 5 0 0 0 0 10" fill="#fff" />
    </svg>
  );
}
