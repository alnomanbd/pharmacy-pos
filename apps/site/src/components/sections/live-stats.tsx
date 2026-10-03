'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Pill, ReceiptText, Store } from 'lucide-react';
import { siteConfig, type Lang } from '@/lib/site';
import { CountUp } from '@/components/motion/primitives';

/**
 * Three totals across every shop on Dawai — shops, bills rung up, medicines in
 * the list — counted live from the API. Totals only, never one shop's figure,
 * and nothing at all while the console has it switched off (Website → Live
 * numbers) or there are fewer shops than it asked for.
 */
type Stats = { shops: number; bills: number; medicines: number };

export function LiveStats({ lang }: { lang: Lang }) {
  const [stats, setStats] = React.useState<Stats | null>(null);

  React.useEffect(() => {
    let live = true;
    fetch(`${siteConfig.apiUrl}/public/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Stats | null } | null) => live && j?.data && setStats(j.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!stats) return null;
  const bn = lang === 'bn';
  const items = [
    { icon: Store, value: stats.shops, label: bn ? 'দোকান Dawai ব্যবহার করছে' : 'pharmacies on Dawai' },
    { icon: ReceiptText, value: stats.bills, label: bn ? 'বিল কাটা হয়েছে' : 'bills rung up' },
    { icon: Pill, value: stats.medicines, label: bn ? 'ঔষধ তালিকায়' : 'medicines in the list' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-10 grid max-w-3xl grid-cols-3 divide-x divide-border/60 rounded-3xl border border-border/70 bg-card/70 py-4 shadow-glass backdrop-blur"
    >
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center gap-1 px-2 text-center">
          <span className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <it.icon className="size-4 text-primary" />
          </span>
          <span className="font-mono text-xl font-bold tabular-nums sm:text-2xl">
            <CountUp to={it.value} bangla={bn} />
            {it.value >= 1000 ? '+' : ''}
          </span>
          <span className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{it.label}</span>
        </div>
      ))}
    </motion.div>
  );
}
