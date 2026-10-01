'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, LayoutGrid, Receipt, Package, Truck, Users, BookOpen, BarChart3 } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { cn } from '@/lib/utils';
import { Section, SectionHead } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';
import { mockT, num } from '@/i18n/mock';

/*
 * The screens.
 *
 * Six real product screens as a switchable list rather than a grid of
 * screenshots, for two reasons that are both practical: the app is six
 * screenshots at 1200×800, which is about nine megabytes on a connection that
 * drops at seven most evenings, and a grid of six identical rectangles is a
 * gallery nobody reads. Here the list is the index and the panel beside it is
 * one drawn screen, so the band costs nothing to load and still shows the
 * actual shape of every page.
 *
 * The switcher is keyboard-navigable, because a list of tabs that only respond
 * to a mouse is a list of tabs that half the visitors cannot use.
 */

const SCREENS = ['billing', 'stock', 'purchases', 'suppliers', 'khata', 'reports'] as const;
type Kind = (typeof SCREENS)[number];

export function ScreensSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const items = tItems<{ name: string; note: string }>(lang, 'screens.items');
  const [open, setOpen] = React.useState(0);

  return (
    <Section id="screens" tone="light" orbs={1} className="py-20 sm:py-28">
      <div className="shell">
        <SectionHead
          eyebrow={t('screens.kicker')}
          title={t('screens.title')}
          action={
            <Button asChild variant="outline" size="md" className="group">
              <Link href={`/${lang}/demo`}>
                {t('nav.demo')}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          }
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          {/* --------------------------------------------------------- the index */}
          <ul className="flex flex-col">
            {items.map((item, i) => {
              const on = i === open;
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="group flex w-full items-start gap-4 border-b border-border/60 py-4 text-left transition-colors"
                    aria-expanded={on}
                  >
                    <span
                      className={cn(
                        'mt-0.5 font-mono text-2xs tabular-nums transition-colors',
                        on ? 'text-primary' : 'text-muted-foreground/65',
                      )}
                    >
                      {num(lang, String(i + 1).padStart(2, '0'))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm font-bold tracking-tight transition-colors',
                          on ? 'text-primary' : 'group-hover:text-foreground',
                        )}
                      >
                        {item.name}
                      </span>
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.span
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-1.5 block text-xs leading-relaxed text-muted-foreground"
                          >
                            {item.note}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                    <span
                      className={cn(
                        'mt-1 size-1.5 shrink-0 rounded-full transition-all duration-300',
                        on ? 'scale-125 bg-primary' : 'bg-border',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* --------------------------------------------------------- the panel */}
          <Reveal variant="fade" delay={0.1}>
            <div className="relative">
              <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-[radial-gradient(24rem_18rem_at_60%_20%,rgb(16_185_129_/_0.14),transparent_70%)]"
              />
              <AnimatePresence mode="wait">
                <motion.div
                  key={open}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ScreenMock kind={SCREENS[open]} index={open} label={items[open]?.name ?? ''} lang={lang} />
                </motion.div>
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

/**
 * A drawn screen: a title bar, the app's rail, three figures and the rows the
 * page actually lists.
 *
 * Real labels and plausible figures rather than grey bars — a skeleton reads
 * as "coming soon", and a shop owner comparing two vendors decides on exactly
 * this panel. The figures are illustrative; the shapes are the app's own.
 */
const RAIL = [Receipt, Package, Truck, Users, BookOpen, BarChart3] as const;

function ScreenMock({ kind, index, label, lang }: { kind: Kind; index: number; label: string; lang: Lang }) {
  const sc = mockT(lang).screens;
  const data = sc[kind];
  const chart = kind === 'reports' ? sc.reports : null;
  const Icon = RAIL[index] ?? LayoutGrid;

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-primary/15 to-transparent p-4">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight">{label}</p>
          <p className="truncate text-2xs text-muted-foreground">{sc.sub}</p>
        </div>
        <div className="ml-auto flex shrink-0 gap-1.5">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-primary/60" />
        </div>
      </div>

      <div className="flex">
        {/* the rail — the same six pages, with this one lit */}
        <div className="hidden flex-col items-center gap-2 border-r border-border/60 p-2.5 sm:flex">
          {RAIL.map((R, i) => (
            <span
              key={i}
              className={cn(
                'grid size-8 place-items-center rounded-lg transition-colors',
                i === index ? 'bg-primary/15 text-primary' : 'text-muted-foreground/60',
              )}
            >
              <R className="size-4" />
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 p-4">
          <div className="grid grid-cols-3 gap-2">
            {data.stats.map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-xl border border-border/70 bg-background/60 p-2.5">
                <p className="truncate text-[0.62rem] font-medium text-muted-foreground">{k}</p>
                <p className="mt-1 truncate font-mono text-[0.8rem] font-bold tabular-nums tracking-tight sm:text-sm">
                  {v}
                </p>
              </div>
            ))}
          </div>

          {chart && <WeekChart days={chart.days} label={chart.chartLabel} />}

          <div className="mt-3 divide-y divide-border/50">
            {data.rows.map(([title, sub, value, flag], i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.06 + i * 0.05 }}
                className="flex items-center gap-3 py-2"
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    flag === 'warn' ? 'bg-amber-500' : 'bg-primary/55',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{title}</span>
                  <span className="block truncate text-[0.65rem] text-muted-foreground">{sub}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 font-mono text-xs font-bold tabular-nums',
                    flag === 'warn' && 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {value}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Seven bars, for the reports page. Heights are a plausible week, Friday the quiet day. */
const WEEK = [72, 48, 80, 86, 78, 91, 100];

function WeekChart({ days, label }: { days: readonly string[]; label: string }) {
  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/60 p-3">
      <p className="text-[0.62rem] font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex h-20 items-end gap-1.5">
        {WEEK.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <motion.span
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.6, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              className={cn('w-full rounded-t-md', i === WEEK.length - 1 ? 'bg-primary' : 'bg-primary/30')}
            />
            <span className="text-[0.55rem] text-muted-foreground">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
