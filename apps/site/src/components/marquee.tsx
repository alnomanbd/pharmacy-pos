'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * An infinite horizontal row.
 *
 * The children are rendered twice and the whole thing is translated by exactly
 * -50%, so the second copy lands where the first began with no seam and no
 * measurement in JavaScript. `pausedOnHover` is on by default because a row of
 * the shop's own brand names that stops when the cursor is over it gives the
 * visitor a second to read them — which is the only reason the row is there.
 */
export function Marquee({
  children,
  className,
  duration = 44,
  reverse = false,
  pauseOnHover = true,
  fade = true,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
  fade?: boolean;
}) {
  return (
    <div
      className={cn('group/marquee relative overflow-hidden', fade && 'mask-fade-x', className)}
      style={{ ['--marquee-duration' as string]: `${duration}s` }}
    >
      <div
        className={cn(
          'flex w-max animate-marquee items-stretch',
          reverse && '[animation-direction:reverse]',
          pauseOnHover && 'group-hover/marquee:[animation-play-state:paused]',
        )}
      >
        <div className="flex shrink-0 items-stretch" aria-hidden={false}>
          {children}
        </div>
        {/* The copy a screen reader must not read twice, and the seam. */}
        <div className="flex shrink-0 items-stretch" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
