'use client';

import * as React from 'react';
import Link from 'next/link';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpenCheck, CalendarX2, Clock, PiggyBank } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { useSiteSettings } from '@/lib/live';
import { Section } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';

/**
 * "How much would Dawai save my shop?" — three sliders and an answer that
 * moves with them. The assumptions are the console's (Website → Savings
 * calculator), and they are printed under the answer, because a number a
 * buyer cannot check is a number a buyer does not believe.
 */

const COPY = {
  en: {
    eyebrow: 'Savings calculator',
    title: 'What would it save your shop?',
    sales: 'Sales a month',
    stock: 'Stock on the shelves',
    counters: 'Billing counters',
    month: 'a month, roughly',
    expiry: 'Stock that would have expired',
    baki: 'Baki that would go uncollected',
    time: 'Hours back from closing the day',
    hours: 'hours',
    assumptions: (c: { e: number; s: number; b: number; p: number; d: number }) =>
      `Assumes ${c.e}% of stock expires on paper and alerts save ${c.s}% of it, ${c.b}% of sales on the baki is never collected, and closing the day takes ${c.p} minutes by hand and ${c.d} with Dawai.`,
    cta: 'Start free',
  },
  bn: {
    eyebrow: 'সাশ্রয় হিসাব',
    title: 'আপনার দোকানের কত বাঁচবে?',
    sales: 'মাসে বিক্রি',
    stock: 'তাকে থাকা স্টক',
    counters: 'বিলিং কাউন্টার',
    month: 'প্রতি মাসে, আনুমানিক',
    expiry: 'মেয়াদ পেরিয়ে যেত যে স্টক',
    baki: 'আদায় হতো না যে বাকি',
    time: 'দিন শেষের হিসাবে বাঁচা সময়',
    hours: 'ঘণ্টা',
    assumptions: (c: { e: number; s: number; b: number; p: number; d: number }) =>
      `ধরা হয়েছে: খাতায় স্টকের ${c.e}% মেয়াদ পেরোয় আর সতর্কতায় তার ${c.s}% বাঁচে, বিক্রির ${c.b}% বাকি আদায় হয় না, আর দিন শেষের হিসাবে হাতে ${c.p} মিনিট, Dawai-তে ${c.d} মিনিট লাগে।`,
    cta: 'ফ্রি শুরু করুন',
  },
} as const;

const BN = '০১২৩৪৫৬৭৮৯';
const fmt = (lang: Lang, n: number) => {
  const s = Math.round(n).toLocaleString('en-IN');
  return lang === 'bn' ? s.replace(/[0-9]/g, (d) => BN[+d]) : s;
};

/** A figure that glides to its new value as the sliders move. */
function Glide({ value, lang, prefix = '' }: { value: number; lang: Lang; prefix?: string }) {
  const still = useReducedMotion() ?? false;
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    if (still) {
      setShown(value);
      return;
    }
    const c = animate(from.current, value, {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => c.stop();
  }, [value, still]);
  return (
    <>
      {prefix}
      {fmt(lang, shown)}
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  show,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  show: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-mono font-bold tabular-nums text-primary">{show}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="savings-range mt-2 w-full"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </label>
  );
}

export function SavingsSection({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const s = useSiteSettings().calculator;
  const [sales, setSales] = React.useState(400000);
  const [stock, setStock] = React.useState(800000);
  const [counters, setCounters] = React.useState(1);
  const ref = React.useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-15% 0px' });

  /* The three savings, a month. Stock expires over a year, so a twelfth of the yearly loss. */
  const expiry = (stock * (s.expiryLossPercent / 100) * (s.expirySavedPercent / 100)) / 12;
  const baki = sales * (s.bakiLossPercent / 100);
  const hours = (Math.max(0, s.closeMinutesPaper - s.closeMinutesDawai) * 30 * counters) / 60;
  const total = expiry + baki;
  const parts = [
    { icon: CalendarX2, label: c.expiry, value: expiry, money: true },
    { icon: BookOpenCheck, label: c.baki, value: baki, money: true },
    { icon: Clock, label: c.time, value: hours, money: false },
  ];
  const most = Math.max(1, expiry, baki);

  return (
    <Section id="savings" tone="light" orbs={2} className="py-20 sm:py-28">
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

        <div ref={ref} className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* ---- the shop ---- */}
          <Reveal variant="up" className="glass flex flex-col gap-7 p-6 sm:p-7">
            <Slider label={c.sales} value={sales} min={50000} max={3000000} step={10000} onChange={setSales} show={`৳${fmt(lang, sales)}`} />
            <Slider label={c.stock} value={stock} min={100000} max={5000000} step={50000} onChange={setStock} show={`৳${fmt(lang, stock)}`} />
            <Slider label={c.counters} value={counters} min={1} max={6} step={1} onChange={setCounters} show={fmt(lang, counters)} />
          </Reveal>

          {/* ---- the answer ---- */}
          <Reveal variant="up" delay={0.1}>
            <div className="relative h-full overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-card to-card p-6 shadow-glow sm:p-7">
              <div aria-hidden className="absolute -end-14 -top-14 size-48 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="relative">
                <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <PiggyBank className="size-5 text-primary" />
                  {c.month}
                </p>
                <p className="mt-1 font-mono text-5xl font-bold tabular-nums text-primary">
                  <Glide value={seen ? total : 0} lang={lang} prefix="৳" />
                </p>

                <ul className="mt-6 grid gap-4">
                  {parts.map((p, i) => (
                    <li key={p.label}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <p.icon className="size-4 text-primary" />
                          {p.label}
                        </span>
                        <span className="font-mono font-bold tabular-nums">
                          {p.money ? <Glide value={seen ? p.value : 0} lang={lang} prefix="৳" /> : <><Glide value={seen ? p.value : 0} lang={lang} /> {c.hours}</>}
                        </span>
                      </div>
                      {p.money && (
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full bg-ramp"
                            animate={{ width: seen ? `${Math.max(3, (p.value / most) * 100)}%` : 0 }}
                            transition={{ duration: 0.6, delay: seen ? 0 : i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                <Button asChild size="lg" className="group mt-7 w-full">
                  <Link href={`/${lang}/register`}>
                    {c.cta}
                    <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                  {c.assumptions({ e: s.expiryLossPercent, s: s.expirySavedPercent, b: s.bakiLossPercent, p: s.closeMinutesPaper, d: s.closeMinutesDawai })}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
