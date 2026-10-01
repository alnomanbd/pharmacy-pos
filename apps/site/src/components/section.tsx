'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Orb, Reveal, Stagger, StaggerItem } from '@/components/motion/primitives';

/*
 * The page's three repeated shapes.
 *
 * Every band on this site is one of these, in one of three tones, and that is
 * what makes twelve very different sections read as one page: the light
 * sections share an aurora and a heading block, the dark ones share the
 * inverted token set from globals.css, and the number of orbs per band is the
 * only thing that varies.
 */

type Tone = 'light' | 'dark' | 'plain';

export function Section({
  children,
  className,
  id,
  tone = 'light',
  orbs = 1,
  grain = true,
  dots = true,
  bordered = true,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  tone?: Tone;
  orbs?: 0 | 1 | 2 | 3;
  grain?: boolean;
  dots?: boolean;
  bordered?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative isolate overflow-hidden',
        tone === 'dark' && 'ink-band bg-background',
        bordered && 'border-t border-border/60',
        tone === 'dark' && 'border-white/[0.07]',
        grain && 'grain',
        className,
      )}
    >
      {/* Behind everything, so it can never sit over text or catch a click.
          -z-10 stays inside the section's own isolate, which is what keeps it
          from escaping behind the page. */}
      {dots && (
        <div
          aria-hidden
          className={cn(
            'dot-grid pointer-events-none absolute inset-0 -z-10',
            tone === 'dark' ? 'dot-grid-lift opacity-[0.12]' : 'opacity-[0.55]',
          )}
        />
      )}
      {orbs > 0 && (
        <div className="aurora-field">
          {orbs >= 1 && (
            <Orb
              className="-end-48 -top-40"
              color={tone === 'dark' ? 'rgb(16 185 129 / 0.3)' : 'rgb(16 185 129 / 0.22)'}
              size="44rem"
              duration={30}
            />
          )}
          {orbs >= 2 && (
            <Orb
              className="-start-40 top-1/4"
              color={tone === 'dark' ? 'rgb(34 211 238 / 0.2)' : 'rgb(6 182 212 / 0.16)'}
              size="36rem"
              duration={24}
              delay={5}
            />
          )}
          {orbs >= 3 && (
            <Orb
              className="start-1/3 -bottom-52"
              color={tone === 'dark' ? 'rgb(45 212 191 / 0.22)' : 'rgb(13 148 136 / 0.14)'}
              size="40rem"
              duration={34}
              delay={9}
            />
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A section's heading block: an eyebrow, an h2, and a lede at a fixed measure.
 *
 * The lede is capped at 62ch rather than the 68ch the body copy uses, because a
 * lede is skimmed and a 68ch line is a line nobody skims.
 */
export function SectionHead({
  eyebrow,
  title,
  lede,
  align = 'left',
  className,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        align === 'center' ? 'items-center text-center' : 'items-start',
        action && 'sm:flex-row sm:items-end sm:justify-between sm:gap-10',
        className,
      )}
    >
      <div className={cn('flex flex-col gap-4', align === 'center' ? 'max-w-3xl' : 'max-w-3xl')}>
        {eyebrow && (
          <Reveal variant="fade">
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-current" />
              {eyebrow}
            </span>
          </Reveal>
        )}
        <Reveal variant="up" delay={0.05}>
          <h2 className="h-section">{title}</h2>
        </Reveal>
        {lede && (
          <Reveal variant="up" delay={0.1}>
            <p className={cn('lede max-w-[62ch]', align === 'center' && 'mx-auto')}>{lede}</p>
          </Reveal>
        )}
      </div>
      {action && (
        <Reveal variant="fade" delay={0.15} className="shrink-0">
          {action}
        </Reveal>
      )}
    </div>
  );
}

/** A grid of features with a number in the corner, so the eye can count them. */
export function FeatureGrid({
  children,
  className,
  step = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
}) {
  return (
    <Stagger className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} step={step}>
      {children}
    </Stagger>
  );
}

export function FeatureCard({
  icon,
  title,
  body,
  className,
  index,
  footer,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  className?: string;
  index?: number;
  footer?: React.ReactNode;
}) {
  return (
    <StaggerItem className={cn('h-full', className)}>
      <article className="glass panel-lift group flex h-full flex-col gap-4 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          {icon && (
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition-all duration-500 ease-spring group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
              {icon}
            </span>
          )}
          {index !== undefined && (
            <span className="font-mono text-2xs tabular-nums text-muted-foreground/65">
              {String(index).padStart(2, '0')}
            </span>
          )}
        </div>
        <h3 className="h-card text-lg">{title}</h3>
        {body && <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>}
        {footer && <div className="mt-auto pt-2">{footer}</div>}
      </article>
    </StaggerItem>
  );
}

/** A stat, for the four figures the band under the hero claims. */
export function Stat({
  value,
  label,
  sub,
  className,
}: {
  value: React.ReactNode;
  label: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
        {value}
      </span>
      <span className="text-sm font-semibold">{label}</span>
      {sub && <span className="text-xs leading-relaxed text-muted-foreground">{sub}</span>}
    </div>
  );
}
