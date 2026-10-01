'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Gift, ClipboardCheck, Thermometer } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { cn } from '@/lib/utils';
import { Section, SectionHead, FeatureGrid } from '@/components/section';
import { Reveal, Spotlight, StaggerItem } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { mockT, num } from '@/i18n/mock';

/*
 * The shelves.
 *
 * The band has one idea — FEFO, not FIFO — and one picture carries it: four
 * lots of the same tablet, the soonest to expire at the top, and a sale taking
 * the top one. Every shopkeeper in the country has been told "first in, first
 * out" by a distributor at some point, and every one of them knows it is how
 * you end up writing off a shelf. So the argument is made by the rack moving,
 * not by a sentence about it.
 *
 * The second half of the band is the physical count, because the count is the
 * screen where the software's number and the shop's number are supposed to
 * disagree, and the band is explicit that the shop wins.
 */

const LOTS = [
  { batch: 'A-2417', month: 2, year: 2027, days: 581, qty: 84 },
  { batch: 'B-2511', month: 10, year: 2026, days: 396, qty: 120 },
  { batch: 'C-2602', month: 8, year: 2026, days: 303, qty: 61 },
  { batch: 'D-2608', month: 6, year: 2026, days: 240, qty: 38 },
] as const;

export function StockSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const points = tItems<{ title: string; body: string }>(lang, 'stock.points');
  const icons = [
    <CalendarClock className="size-5" key="i1" />,
    <Gift className="size-5" key="i2" />,
    <ClipboardCheck className="size-5" key="i3" />,
    <Thermometer className="size-5" key="i4" />,
  ];

  return (
    <Section id="stock" tone="plain" orbs={1} className="py-20 sm:py-28">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <SectionHead
              eyebrow={t('stock.kicker')}
              title={t('stock.title')}
              lede={t('stock.lede')}
            />

            <FeatureGrid className="mt-10 sm:grid-cols-2 lg:grid-cols-2 auto-rows-fr" step={0.05}>
              {points.slice(0, 4).map((p, i) => (
                <Spotlight key={p.title} className="h-full rounded-3xl">
                  <StaggerItem variant="up" className="h-full">
                    <article className="glass panel-lift flex h-full flex-col gap-3 p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-500 group-hover/spot:bg-primary group-hover/spot:text-primary-foreground">
                          {icons[i]}
                        </span>
                        <h3 className="h-card text-base font-semibold leading-snug">{p.title}</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                    </article>
                  </StaggerItem>
                </Spotlight>
              ))}
            </FeatureGrid>
          </div>

          {/* ------------------------------------------------------- the rack */}
          <Reveal variant="fade" delay={0.1} className="lg:sticky lg:top-28 lg:self-start">
            <FefoRack lang={lang} />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

/**
 * Four lots of one product, and a sale that always takes the top one.
 *
 * The pointer is a real state machine rather than a CSS loop: it finds the
 * earliest-expiry lot that still has stock, sells from it, and moves to the
 * next when it runs out. That is the FEFO rule, written once, running — and it
 * is the same arithmetic the server does, so the picture cannot flatter the
 * product.
 */
function FefoRack({ lang }: { lang: Lang }) {
  const m = mockT(lang).stock;
  const [qty, setQty] = React.useState<number[]>(LOTS.map((l) => l.qty));
  const [cursor, setCursor] = React.useState(0);
  const [sold, setSold] = React.useState(0);
  const [lastBatch, setLastBatch] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setQty((q) => {
        const next = [...q];
        const from = next[cursor];
        if (from > 0) {
          next[cursor] = from - 1;
          setLastBatch(LOTS[cursor].batch);
          setSold((s) => s + 1);
        }
        if (next[cursor] === 0) setCursor((c) => Math.min(c + 1, LOTS.length - 1));
        return next;
      });
    }, 1500);
    return () => window.clearInterval(id);
  }, [cursor]);

  const total = qty.reduce((a, b) => a + b, 0);
  const expiringSoon = LOTS.reduce(
    (sum, l, i) => (l.days <= 303 ? sum + qty[i] : sum),
    0,
  );

  return (
    <div className="glass relative overflow-hidden p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {m.kicker}
          </p>
          <h3 className="mt-1.5 text-lg font-bold tracking-tight">Napa Extra 500 mg</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {m.maker}
          </p>
        </div>
        <Badge variant="soft" className="gap-1.5">
          <span className="size-1.5 animate-pulse-ring rounded-full bg-primary" />
          FEFO
        </Badge>
      </div>

      <ul className="mt-6 grid gap-2">
        {LOTS.map((l, i) => {
          const isNow = i === cursor && qty[i] > 0;
          const out = qty[i] === 0;
          const soon = l.days <= 303;
          return (
            <li
              key={l.batch}
              className={cn(
                'relative overflow-hidden rounded-2xl border px-4 py-3 transition-all duration-500',
                out && 'opacity-40',
                isNow
                  ? 'border-primary/45 bg-primary/[0.08] shadow-glow'
                  : soon
                    ? 'border-amber-500/30 bg-amber-500/[0.05]'
                    : 'border-border/70 bg-background/40',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
                  {l.batch}
                </span>
                <span
                  className={cn(
                    'text-2xs font-semibold uppercase tracking-wider',
                    soon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
                  {m.months[l.month]} {num(lang, l.year)}
                </span>
                {isNow && (
                  <motion.span
                    layoutId="fefo-tag"
                    className="hidden rounded-full bg-primary px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-primary-foreground min-[400px]:inline-flex"
                  >
                    {m.now}
                  </motion.span>
                )}
                {out && (
                  <span className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                    {m.finished}
                  </span>
                )}
                <span className="ml-auto font-mono text-sm font-bold tabular-nums">
                  {qty[i] > 0 ? num(lang, qty[i]) : '—'}
                  <span className="ml-1 text-2xs font-medium text-muted-foreground">{m.pcs}</span>
                </span>
              </div>

              {/* The fill bar is the lot's share of the shelf, so four bars that
                  only ever shrink read as a shelf emptying. */}
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={cn('h-full rounded-full', soon ? 'bg-amber-500' : 'bg-primary')}
                  animate={{ width: `${(qty[i] / LOTS[i].qty) * 100}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              </div>

            </li>
          );
        })}
      </ul>

      {/* The bill line the sale produced. It is here to close the loop: the rack
          moved, and this is the document that says why. */}
      <div className="mt-5 rounded-2xl border border-dashed border-border bg-background/40 p-4">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{m.sold}</span>
          <span className="font-mono text-sm font-bold tabular-nums">{num(lang, sold)}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{m.taken}</span>
          <span className="font-mono font-bold text-primary">{lastBatch ?? '—'}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border/70 pt-2.5 text-xs">
          <span className="text-muted-foreground">{m.left}</span>
          <span className="font-mono font-bold tabular-nums">
            {num(lang, total)} {m.pcs}
            <span className="ml-2 font-sans font-normal text-amber-600 dark:text-amber-400">
              {num(lang, expiringSoon)} {m.soon}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
