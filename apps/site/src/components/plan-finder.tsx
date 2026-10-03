'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, RotateCcw, Sparkles } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { useLivePlans, type Live } from '@/components/plan-cards';
import { Button } from '@/components/ui/button';

/**
 * "Which plan fits my shop?" — three taps, then the plan, from the live
 * catalogue's limits (the console's Plans page): the cheapest paid plan whose
 * counters, logins and branches cover the answers.
 */
const COPY = {
  en: {
    open: 'Not sure? Find your plan in 3 taps',
    q: ['How many billing counters?', 'How many people will sign in?', 'How many branches?'],
    a: [
      ['1', '2–5', '6 or more'],
      ['1–2', '3–10', 'More than 10'],
      ['One shop', '2–3 branches', 'More'],
    ],
    fits: 'Fits your shop',
    custom: 'A shop your size gets a plan of its own — tell us about it.',
    talk: 'Talk to us',
    start: 'Start free',
    again: 'Start over',
  },
  bn: {
    open: 'নিশ্চিত নন? ৩ চাপে আপনার প্ল্যান খুঁজুন',
    q: ['কয়টি বিলিং কাউন্টার?', 'কয়জন লগইন করবেন?', 'কয়টি শাখা?'],
    a: [
      ['১টি', '২–৫টি', '৬ বা বেশি'],
      ['১–২ জন', '৩–১০ জন', '১০-এর বেশি'],
      ['একটি দোকান', '২–৩টি শাখা', 'আরও বেশি'],
    ],
    fits: 'আপনার দোকানের জন্য',
    custom: 'আপনার মাপের দোকানের জন্য আলাদা প্ল্যান হয় — আমাদের জানান।',
    talk: 'কথা বলুন',
    start: 'ফ্রি শুরু করুন',
    again: 'আবার শুরু',
  },
} as const;

/* What each answer needs, as a lower bound to compare against a plan's limits. */
const NEED = [
  [1, 2, 6],
  [2, 3, 11],
  [1, 2, 4],
];

function pick(plans: Live[], answers: number[]): Live | null {
  const [t, u, b] = answers.map((a, i) => NEED[i][a]);
  const ok = (lim: number | null, need: number) => lim === null || lim >= need;
  return (
    plans
      .filter((p) => p.price > 0)
      .filter((p) => ok(p.limits.terminals, t) && ok(p.limits.shopUsers, u) && ok(p.limits.outlets, b))
      .sort((a, b2) => a.price - b2.price)[0] ?? null
  );
}

export function PlanFinder({ lang, names }: { lang: Lang; names: Record<string, string> }) {
  const c = COPY[lang];
  const plans = useLivePlans();
  const [open, setOpen] = React.useState(false);
  const [answers, setAnswers] = React.useState<number[]>([]);
  const step = answers.length;
  const done = step === 3;
  const result = done ? pick(plans, answers) : null;
  const bn = lang === 'bn';
  const tk = (n: number) => {
    const s = `৳${n.toLocaleString('en-IN')}`;
    return bn ? s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]) : s;
  };

  if (!open) {
    return (
      <div className="mb-10 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/[0.12]"
        >
          <Sparkles className="size-4" /> {c.open}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-12 max-w-2xl">
      <div className="glass overflow-hidden p-5 sm:p-6">
        {/* progress */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((k) => (
            <motion.span key={k} className="h-1.5 flex-1 rounded-full bg-muted" animate={{ backgroundColor: k < step ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
              <p className="mt-5 text-lg font-bold">{c.q[step]}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {c.a[step].map((label, k) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAnswers([...answers, k])}
                    className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.05]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="mt-5">
              {result ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl bg-ramp text-white shadow-glow">
                    <Check className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.fits}</p>
                    <p className="text-2xl font-bold">
                      {names[result.key] ?? result.key} <span className="font-mono text-lg text-muted-foreground">· {tk(result.price)}/{bn ? 'মাস' : 'month'}</span>
                    </p>
                  </div>
                  <Button asChild size="md" className="group">
                    <Link href={`/${lang}/register`}>
                      {c.start} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <p className="min-w-0 flex-1 text-sm">{c.custom}</p>
                  <Button asChild size="md" variant="outline">
                    <Link href={`/${lang}/contact`}>{c.talk}</Link>
                  </Button>
                </div>
              )}
              <button type="button" onClick={() => setAnswers([])} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <RotateCcw className="size-3.5" /> {c.again}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
