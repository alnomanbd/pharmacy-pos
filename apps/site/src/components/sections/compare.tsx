'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Clock, NotebookPen, X } from 'lucide-react';
import type { Lang } from '@/i18n/dictionary';
import { Section } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';
import { Mark } from '@/components/logo';

/**
 * The notebook against the screen.
 *
 * In place of quotes from customers we do not have yet: the same six jobs a
 * pharmacy does every day, as they are done on paper and as they are done
 * here, side by side, one row lighting up after another — and above them the
 * one number every owner feels, how long it takes to close the day. Nothing
 * on it is a claim about somebody else's shop; it is what the screen does.
 */

const COPY = {
  en: {
    eyebrow: 'Before and after',
    title: 'The notebook, and the screen',
    close: 'Closing the day',
    paperTime: '≈ 45 min',
    dawaiTime: '≈ 2 min',
    paperClose: 'Adding up slips and the cash box by hand',
    dawaiClose: 'Already added — count the cash, press close',
    paper: 'Paper & notebook',
    dawai: 'Dawai',
    rows: [
      ['Today’s sales: added up at night', 'Today’s sales: on screen, as they happen'],
      ['Baki: a notebook that loses pages', 'Baki: every taka, and a reminder SMS'],
      ['Expiry: found on the shelf, too late', 'Expiry: flagged 90 days ahead'],
      ['Stock: noticed when the box is empty', 'Stock: a reorder list, ready for the rep'],
      ['Salesman: can see what you paid', 'Salesman: sees the sale, never the margin'],
      ['Two shops: two notebooks, two answers', 'Two branches: one phone, both shops'],
    ],
    cta: 'Start free',
  },
  bn: {
    eyebrow: 'আগে আর পরে',
    title: 'খাতা, আর স্ক্রিন',
    close: 'দিন শেষের হিসাব',
    paperTime: '≈ ৪৫ মিনিট',
    dawaiTime: '≈ ২ মিনিট',
    paperClose: 'স্লিপ আর ক্যাশবাক্স হাতে যোগ করা',
    dawaiClose: 'যোগ করাই আছে — ক্যাশ গুনে বন্ধ করুন',
    paper: 'কাগজ আর খাতা',
    dawai: 'Dawai',
    rows: [
      ['আজকের বিক্রি: রাতে বসে যোগ', 'আজকের বিক্রি: সাথে সাথে স্ক্রিনে'],
      ['বাকি: যে খাতার পাতা হারায়', 'বাকি: প্রতিটি টাকা, সাথে রিমাইন্ডার SMS'],
      ['মেয়াদ: তাকে পেয়ে, অনেক দেরিতে', 'মেয়াদ: ৯০ দিন আগেই সতর্কতা'],
      ['স্টক: বাক্স খালি হলে টের পাওয়া', 'স্টক: রিপ্রেজেন্টেটিভের জন্য অর্ডার লিস্ট তৈরি'],
      ['সেলসম্যান: কেনা দাম দেখে ফেলে', 'সেলসম্যান: বিক্রি দেখে, লাভ কখনো না'],
      ['দুই দোকান: দুই খাতা, দুই হিসাব', 'দুই শাখা: এক ফোনে দুই দোকান'],
    ],
    cta: 'ফ্রি শুরু করুন',
  },
} as const;

export function CompareSection({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const ref = React.useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-15% 0px' });
  const still = useReducedMotion() ?? false;
  const on = seen || still;

  return (
    <Section id="compare" tone="light" orbs={2} className="py-20 sm:py-28">
      <div className="shell">
        <div className="flex flex-col items-center gap-4 text-center">
          <Reveal variant="fade">
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-current" />
              {c.eyebrow}
            </span>
          </Reveal>
          <Reveal variant="up" delay={0.05}>
            <h2 className="h-section">{c.title}</h2>
          </Reveal>
        </div>

        <div ref={ref} className="mx-auto mt-12 max-w-5xl">
          {/* ---- closing the day: one bar that shrinks to almost nothing ---- */}
          <Reveal variant="up" className="glass p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Clock className="size-4 text-primary" /> {c.close}
            </p>
            <div className="mt-4 grid gap-3">
              <div>
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span>{c.paperClose}</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{c.paperTime}</span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500"
                    initial={{ width: 0 }}
                    animate={{ width: on ? '100%' : 0 }}
                    transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span>{c.dawaiClose}</span>
                  <span className="font-mono font-bold text-primary">{c.dawaiTime}</span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-ramp"
                    initial={{ width: 0 }}
                    animate={{ width: on ? '5%' : 0 }}
                    transition={{ duration: 0.8, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            </div>
          </Reveal>

          {/* ---- six jobs, side by side ---- */}
          <div className="relative mt-5 grid gap-4 md:grid-cols-2">
            {/* the "vs" between the columns */}
            <span className="absolute left-1/2 top-1/2 z-10 hidden size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-xs font-bold shadow-lift md:grid">
              vs
            </span>

            {(['paper', 'dawai'] as const).map((side, s) => (
              <Reveal key={side} variant="up" delay={s * 0.1}>
                <div
                  className={
                    side === 'dawai'
                      ? 'relative h-full overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/[0.1] via-card to-card p-5 shadow-glow sm:p-6'
                      : 'h-full rounded-3xl border border-border/70 bg-card/60 p-5 backdrop-blur sm:p-6'
                  }
                >
                  <p className="flex items-center gap-2.5 text-base font-bold">
                    {side === 'dawai' ? (
                      <Mark className="size-7" />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
                        <NotebookPen className="size-4" />
                      </span>
                    )}
                    {side === 'dawai' ? c.dawai : c.paper}
                  </p>
                  <ul className="mt-5 grid gap-2.5">
                    {c.rows.map((row, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: side === 'dawai' ? 18 : -18 }}
                        animate={on ? { opacity: 1, x: 0 } : {}}
                        transition={{ duration: 0.5, delay: 0.3 + i * 0.12 + (side === 'dawai' ? 0.06 : 0), ease: [0.22, 1, 0.36, 1] }}
                        className={
                          side === 'dawai'
                            ? 'flex items-start gap-3 rounded-2xl bg-primary/[0.07] px-3.5 py-3 text-sm font-semibold'
                            : 'flex items-start gap-3 rounded-2xl px-3.5 py-3 text-sm text-muted-foreground'
                        }
                      >
                        <span
                          className={
                            side === 'dawai'
                              ? 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground'
                              : 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-rose-500/12 text-rose-500'
                          }
                        >
                          {side === 'dawai' ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="leading-snug">{row[s]}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal variant="fade" delay={0.2} className="mt-10 flex justify-center">
            <Button asChild size="lg" className="group">
              <Link href={`/${lang}/register`}>
                {c.cta}
                <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
