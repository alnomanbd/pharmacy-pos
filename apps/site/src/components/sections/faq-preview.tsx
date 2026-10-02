'use client';

import * as React from 'react';
import Link from 'next/link';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ArrowRight, Boxes, LayoutGrid, Mail, MessageCircleQuestion, Plus, Rocket, ScanBarcode, ShieldCheck } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { siteConfig } from '@/lib/site';
import { Section, SectionHead } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Every question, on the home page.
 *
 * The FAQ lives here because it is the objection list — every one of these is
 * a reason a demo goes un-booked, and a buyer who has to leave the page to
 * find an answer is a buyer who mostly does not come back.
 *
 * Twelve questions read as a wall when each is its own box, so they sit in
 * one card, numbered, with a hairline between them — and a row of topics
 * above it, because the owner asking about the printer is not the one asking
 * what happens to the data. The heading, the topics and the way to ask
 * something else stay in view on a wide screen while the list scrolls.
 */

type Topic = 'start' | 'counter' | 'stock' | 'trust';
type Item = { q: string; a: string; c: Topic };

const TOPICS: { key: 'all' | Topic; icon: typeof Rocket }[] = [
  { key: 'all', icon: LayoutGrid },
  { key: 'start', icon: Rocket },
  { key: 'counter', icon: ScanBarcode },
  { key: 'stock', icon: Boxes },
  { key: 'trust', icon: ShieldCheck },
];
const iconOf = (c: Topic) => TOPICS.find((x) => x.key === c)?.icon ?? LayoutGrid;

export function FaqPreview({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const faq = tItems<Item>(lang, 'faq.items');
  const [topic, setTopic] = React.useState<'all' | Topic>('all');
  const shown = faq.map((f, i) => ({ ...f, i })).filter((f) => topic === 'all' || f.c === topic);
  // The first question starts open, so the list shows what an answer looks like.
  const [open, setOpen] = React.useState<string>('q-0');

  const pick = (key: 'all' | Topic) => {
    setTopic(key);
    const first = faq.findIndex((f) => key === 'all' || f.c === key);
    setOpen(first >= 0 ? `q-${first}` : '');
  };

  const help = (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/70 p-6 shadow-glass backdrop-blur">
      <div aria-hidden className="absolute -end-16 -top-16 size-44 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative">
        <span className="grid size-11 place-items-center rounded-2xl bg-ramp text-white shadow-glow">
          <MessageCircleQuestion className="size-5" />
        </span>
        <h3 className="mt-4 text-lg font-bold tracking-[-0.01em]">{t('faq.helpTitle')}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('faq.helpText')}</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button asChild size="md">
            <Link href={`/${lang}/demo`}>
              {t('nav.demo')}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="md" variant="outline">
            <Link href={`/${lang}/contact`}>{t('nav.contact')}</Link>
          </Button>
        </div>
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="mt-4 inline-flex min-w-0 max-w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{siteConfig.contactEmail}</span>
        </a>
      </div>
    </div>
  );

  return (
    <Section id="faq" tone="light" orbs={1} className="py-20 sm:py-28">
      <div className="shell">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          {/* ---- the heading, the topics, and someone to ask ---- */}
          <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <SectionHead eyebrow={t('faq.kicker')} title={t('faq.title')} lede={t('faq.lede')} />

            <Reveal variant="fade" delay={0.1} className="mt-7">
              <div
                role="tablist"
                aria-label={t('faq.topicsLabel')}
                className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
              >
                {TOPICS.map(({ key, icon: Icon }) => {
                  const on = topic === key;
                  const count = key === 'all' ? faq.length : faq.filter((f) => f.c === key).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => pick(key)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-all duration-200',
                        on
                          ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                          : 'border-border/80 bg-card/60 text-muted-foreground backdrop-blur hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" />
                      {t(`faq.topics.${key}`)}
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-2xs font-bold tabular-nums',
                          on ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {lang === 'bn' ? count.toLocaleString('bn-BD') : count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Reveal>

            {/* Beside the list on a wide screen; under it on a phone, where it is the next thing to do. */}
            <Reveal variant="up" delay={0.15} className="mt-8 hidden lg:block">
              {help}
            </Reveal>
          </div>

          {/* ---- the questions ---- */}
          <div className="min-w-0">
            <Reveal variant="up" delay={0.1}>
              <AccordionPrimitive.Root
                type="single"
                collapsible
                value={open}
                onValueChange={setOpen}
                className="overflow-hidden rounded-3xl border border-border/70 bg-card/75 shadow-glass backdrop-blur"
              >
                {shown.map((f, n) => {
                  const Icon = iconOf(f.c);
                  return (
                    <AccordionPrimitive.Item
                      key={f.i}
                      value={`q-${f.i}`}
                      className={cn(
                        'group relative transition-colors duration-300 data-[state=open]:bg-primary/[0.045]',
                        n > 0 && 'border-t border-border/60',
                      )}
                    >
                      {/* The open question's edge, in the brand's colour. */}
                      <span
                        aria-hidden
                        className="absolute inset-y-3 start-0 w-1 origin-center scale-y-0 rounded-e-full bg-ramp transition-transform duration-300 group-data-[state=open]:scale-y-100"
                      />
                      <AccordionPrimitive.Header className="flex">
                        <AccordionPrimitive.Trigger className="flex flex-1 items-center gap-4 px-5 py-5 text-start sm:gap-5 sm:px-7 sm:py-6">
                          <span className="w-6 shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground/70 transition-colors group-hover:text-primary group-data-[state=open]:text-primary">
                            {lang === 'bn' ? (n + 1).toLocaleString('bn-BD').padStart(2, '০') : String(n + 1).padStart(2, '0')}
                          </span>
                          <span className="min-w-0 flex-1 text-[0.98rem] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover:text-primary sm:text-[1.05rem]">
                            {f.q}
                          </span>
                          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted/60 text-muted-foreground transition-all duration-300 ease-spring group-hover:border-primary/40 group-hover:text-primary group-data-[state=open]:rotate-45 group-data-[state=open]:border-primary group-data-[state=open]:bg-primary group-data-[state=open]:text-primary-foreground">
                            <Plus className="size-4" />
                          </span>
                        </AccordionPrimitive.Trigger>
                      </AccordionPrimitive.Header>
                      <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                        <div className="pb-6 pe-14 ps-[3.75rem] sm:pb-7 sm:pe-20 sm:ps-[4.5rem]">
                          <p className="measure text-[0.95rem] leading-relaxed text-muted-foreground">{f.a}</p>
                          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-semibold text-primary">
                            <Icon className="size-3.5" />
                            {t(`faq.topics.${f.c}`)}
                          </span>
                        </div>
                      </AccordionPrimitive.Content>
                    </AccordionPrimitive.Item>
                  );
                })}
              </AccordionPrimitive.Root>
            </Reveal>

            <Reveal variant="up" delay={0.1} className="mt-6 lg:hidden">
              {help}
            </Reveal>
          </div>
        </div>
      </div>
    </Section>
  );
}
