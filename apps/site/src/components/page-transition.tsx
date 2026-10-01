'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { siteConfig } from '@/lib/site';
import { Mark } from '@/components/logo';

/**
 * A route-change curtain.
 *
 * Two jobs, both small. It covers the outgoing frame for 420ms so a new page
 * never assembles itself in front of the reader, and its wordmark is the first
 * thing painted on a cold cache — which on a 3G connection in Mirpur is the
 * difference between a page and a blank screen.
 */
export function PageTransition() {
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 420);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-background"
      initial={false}
      animate={{ opacity: visible ? 1 : 0, visibility: visible ? 'visible' : 'hidden' }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex flex-col items-center gap-3">
        <Mark className="size-11" animated />
        <span className="text-2xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {siteConfig.shortName}
        </span>
      </div>
    </motion.div>
  );
}
