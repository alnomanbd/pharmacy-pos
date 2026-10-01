'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/*
 * The transition between pages.
 *
 * A template remounts on every navigation, so each new page rises into place
 * instead of cutting in. The very first paint is left alone: this is a static
 * export, and starting the server-rendered HTML at opacity 0 would hide the
 * page from a slow phone until the JavaScript arrived.
 */
let navigated = false;

export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const animate = navigated && !reduce;

  React.useEffect(() => {
    navigated = true;
  }, []);

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
