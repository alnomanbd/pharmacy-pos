'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  Boxes,
  Check,
  CircleDollarSign,
  Gauge,
  MapPin,
  MessageSquareText,
  Monitor,
  NotebookPen,
  PackageCheck,
  Printer,
  ReceiptText,
  ScanBarcode,
  Smartphone,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Lang } from '@/i18n/dictionary';
import { num, money } from '@/i18n/mock';
import { cn } from '@/lib/utils';
import { Section } from '@/components/section';
import { CountUp, Reveal, Stagger, StaggerItem } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';

/**
 * The parts of the shop a visitor should *watch* rather than read.
 *
 * Each band is one picture that moves on its own once it is on screen — the
 * baki khata being paid down, a month's takings drawing themselves, branches
 * syncing to one owner — with a heading of a few words and one button. The
 * words are kept here beside the pictures rather than in the dictionary,
 * because they are as much a part of the mock as the names in it.
 */

const COPY = {
  en: {
    khata: {
      eyebrow: 'The baki khata',
      title: 'Every taka owed, on one screen',
      chips: ['Credit limit per customer', 'SMS reminder in one tap', 'Your old notebook, carried in'],
      head: 'Baki khata',
      people: '41 customers',
      owed: 'Total owed',
      paid: 'paid',
      received: 'received',
      sms: 'Reminder sent',
      smsText: (name: string, amt: string) => `${name}, ৳${amt} is due at Jonni Pharmacy. Thank you.`,
      limit: 'over limit',
      cta: 'Start free',
    },
    reports: {
      eyebrow: 'Reports',
      title: 'Your month, at a glance',
      tiles: ['Sales', 'Profit', 'Bills', 'Expiring in 90 days'],
      vsLast: 'vs last month',
      chart: 'Sales by week',
      thisMonth: 'This month',
      lastMonth: 'Last month',
      weeks: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      mix: 'How customers paid',
      sellFirst: 'sell first, or send back',
      k: 'k',
      methods: ['Cash', 'bKash', 'Nagad', 'Card'],
      cta: 'See a demo',
    },
    branches: {
      eyebrow: 'More than one branch',
      title: 'Every branch, one owner’s phone',
      owner: 'All branches today',
      names: ['Main branch', 'Mirpur 10', 'Banani'],
      today: 'today',
      transfer: 'Napa × 200 sent',
      chips: ['Own stock and counters', 'Shared baki and suppliers', 'Price shown before you open one'],
      cta: 'Start free',
    },
    hardware: {
      title: 'Works with what is already on your counter',
      items: ['Any computer', '80 or 58 mm printer', 'Barcode scanner', 'Phone or tablet'],
    },
  },
  bn: {
    khata: {
      eyebrow: 'বাকি খাতা',
      title: 'কার কাছে কত পাওনা, এক স্ক্রিনে',
      chips: ['প্রতি কাস্টমারের বাকির সীমা', 'এক চাপে SMS রিমাইন্ডার', 'পুরোনো খাতা থেকে জের'],
      head: 'বাকি খাতা',
      people: '৪১ জন কাস্টমার',
      owed: 'মোট পাওনা',
      paid: 'জমা',
      received: 'পাওয়া গেল',
      sms: 'রিমাইন্ডার গেছে',
      smsText: (name: string, amt: string) => `${name}, জরী ফার্মেসিতে ৳${amt} বাকি আছে। ধন্যবাদ।`,
      limit: 'সীমা পার',
      cta: 'ফ্রি শুরু করুন',
    },
    reports: {
      eyebrow: 'রিপোর্ট',
      title: 'পুরো মাস, এক নজরে',
      tiles: ['বিক্রি', 'লাভ', 'বিল', '৯০ দিনে মেয়াদ শেষ'],
      vsLast: 'গত মাসের তুলনায়',
      chart: 'সপ্তাহ অনুযায়ী বিক্রি',
      thisMonth: 'এই মাস',
      lastMonth: 'গত মাস',
      weeks: ['১ম সপ্তাহ', '২য় সপ্তাহ', '৩য় সপ্তাহ', '৪র্থ সপ্তাহ'],
      mix: 'কাস্টমার কীভাবে দিলেন',
      sellFirst: 'আগে বিক্রি করুন, বা ফেরত দিন',
      k: ' হাজার',
      methods: ['ক্যাশ', 'বিকাশ', 'নগদ', 'কার্ড'],
      cta: 'ডেমো দেখুন',
    },
    branches: {
      eyebrow: 'একাধিক শাখা',
      title: 'সব শাখা, মালিকের এক ফোনে',
      owner: 'আজ সব শাখা মিলে',
      names: ['প্রধান শাখা', 'মিরপুর ১০', 'বনানী'],
      today: 'আজ',
      transfer: 'নাপা × ২০০ পাঠানো হলো',
      chips: ['নিজের স্টক আর কাউন্টার', 'বাকি আর সাপ্লায়ার সবার এক', 'খোলার আগেই দাম দেখায়'],
      cta: 'ফ্রি শুরু করুন',
    },
    hardware: {
      title: 'কাউন্টারে যা আছে, তাতেই চলে',
      items: ['যেকোনো কম্পিউটার', '৮০ বা ৫৮ মিমি প্রিন্টার', 'বারকোড স্ক্যানার', 'ফোন বা ট্যাবলেট'],
    },
  },
} as const;

/** Runs `tick` every `ms` while the element is on screen, and not at all for a visitor who asked for less motion. */
function useLoop(ref: React.RefObject<Element | null>, ms: number, tick: () => void) {
  const inView = useInView(ref, { margin: '-15% 0px' });
  const still = useReducedMotion();
  const saved = React.useRef(tick);
  saved.current = tick;
  React.useEffect(() => {
    if (!inView || still) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [inView, still, ms]);
  return inView;
}

function Heading({ eyebrow, title, dark }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Reveal variant="fade">
        <span className="eyebrow">
          <span className="size-1.5 rounded-full bg-current" />
          {eyebrow}
        </span>
      </Reveal>
      <Reveal variant="up" delay={0.05}>
        <h2 className={cn('h-section', dark && 'text-white')}>{title}</h2>
      </Reveal>
    </div>
  );
}

function Chips({ items, icons, dark }: { items: readonly string[]; icons: React.ElementType[]; dark?: boolean }) {
  return (
    <Stagger className="mt-7 flex flex-col gap-2.5" step={0.08}>
      {items.map((c, i) => {
        const Icon = icons[i] ?? Check;
        return (
          <StaggerItem key={c} variant="up">
            <div
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold',
                dark ? 'border-white/10 bg-white/[0.04] text-white' : 'border-border/70 bg-card/70 backdrop-blur',
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-4" />
              </span>
              {c}
            </div>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

/* ================================================================ khata */

const PEOPLE = {
  en: [
    { name: 'Karim Uddin', phone: '01711-xxx210', owed: 1250, limit: 2000 },
    { name: 'Shilpi Begum', phone: '01819-xxx544', owed: 2300, limit: 2000 },
    { name: 'Rahim Store', phone: '01912-xxx087', owed: 860, limit: 3000 },
    { name: 'Nasima Akter', phone: '01556-xxx310', owed: 540, limit: 1500 },
    { name: 'Jalal Mia', phone: '01733-xxx902', owed: 1780, limit: 2500 },
  ],
  bn: [
    { name: 'করিম উদ্দিন', phone: '01711-xxx210', owed: 1250, limit: 2000 },
    { name: 'শিল্পী বেগম', phone: '01819-xxx544', owed: 2300, limit: 2000 },
    { name: 'রহিম স্টোর', phone: '01912-xxx087', owed: 860, limit: 3000 },
    { name: 'নাসিমা আক্তার', phone: '01556-xxx310', owed: 540, limit: 1500 },
    { name: 'জালাল মিয়া', phone: '01733-xxx902', owed: 1780, limit: 2500 },
  ],
} as const;

/* The script the card plays: a payment, a reminder, a payment — then it starts over. */
const STEPS: { kind: 'pay' | 'sms'; who: number; amount: number }[] = [
  { kind: 'pay', who: 2, amount: 500 },
  { kind: 'sms', who: 0, amount: 0 },
  { kind: 'pay', who: 4, amount: 780 },
  { kind: 'sms', who: 1, amount: 0 },
  { kind: 'pay', who: 3, amount: 540 },
];

function KhataCard({ lang }: { lang: Lang }) {
  const c = COPY[lang].khata;
  const people = PEOPLE[lang];
  const ref = React.useRef<HTMLDivElement>(null);
  const [owed, setOwed] = React.useState<number[]>(people.map((p) => p.owed));
  const [step, setStep] = React.useState(-1);

  /* The step is kept in a ref as well, so each tick applies its payment once —
     a state updater may run twice, and a payment taken twice is a wrong khata. */
  const at = React.useRef(-1);
  useLoop(ref, 2600, () => {
    const next = at.current + 1;
    if (next >= STEPS.length) {
      at.current = -1;
      setOwed(people.map((p) => p.owed));
      setStep(-1);
      return;
    }
    at.current = next;
    const st = STEPS[next];
    if (st.kind === 'pay') setOwed((o) => o.map((v, i) => (i === st.who ? Math.max(0, v - st.amount) : v)));
    setStep(next);
  });

  const now = step >= 0 ? STEPS[step] : null;
  const total = owed.reduce((a, b) => a + b, 0);
  const most = Math.max(...people.map((p) => p.limit));

  return (
    <div ref={ref} className="glass relative overflow-visible p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <BookOpenCheck className="size-4 text-primary" /> {c.head}
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">{c.people}</p>
        </div>
        <div className="text-end">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{c.owed}</p>
          <motion.p key={total} initial={{ scale: 1.12 }} animate={{ scale: 1 }} className="font-mono text-xl font-bold tabular-nums">
            ৳{money(lang, total, 'en-IN')}
          </motion.p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {people.map((p, i) => {
          const active = now?.who === i;
          const over = owed[i] > p.limit;
          return (
            <motion.li
              key={p.phone}
              layout
              className={cn(
                'relative rounded-2xl border px-3.5 py-2.5 transition-colors duration-500',
                active && now?.kind === 'pay' ? 'border-emerald-500/50 bg-emerald-500/[0.08]' : active ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/60 bg-background/40',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-2xs font-bold text-primary">
                  {p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="font-mono text-[0.65rem] text-muted-foreground">{p.phone}</p>
                </div>
                {over && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    {c.limit}
                  </span>
                )}
                <span className="w-20 text-end font-mono text-sm font-bold tabular-nums">৳{money(lang, owed[i], 'en-IN')}</span>
              </div>
              {/* What is owed against the most anybody may owe — a bar that only ever shrinks as money comes in. */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={cn('h-full rounded-full', over ? 'bg-amber-500' : 'bg-primary')}
                  animate={{ width: `${Math.min(100, (owed[i] / most) * 100)}%` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <AnimatePresence>
                {active && now?.kind === 'pay' && (
                  <motion.span
                    initial={{ opacity: 0, y: 6, scale: 0.9 }}
                    animate={{ opacity: 1, y: -14, scale: 1 }}
                    exit={{ opacity: 0, y: -26 }}
                    transition={{ duration: 0.5 }}
                    className="pointer-events-none absolute -top-1 end-3 rounded-full bg-emerald-500 px-2.5 py-1 text-2xs font-bold text-white shadow-glow"
                  >
                    +৳{money(lang, now.amount)} {c.received}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>

      {/* The reminder, as it lands on the customer's phone. */}
      <AnimatePresence>
        {now?.kind === 'sms' && (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute -end-3 -bottom-6 z-10 w-64 rounded-2xl border border-border bg-card p-3 shadow-lift sm:-end-8"
          >
            <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-primary">
              <MessageSquareText className="size-3.5" /> {c.sms}
            </p>
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
              {c.smsText(people[now.who].name, money(lang, owed[now.who], 'en-IN'))}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function KhataSection({ lang }: { lang: Lang }) {
  const c = COPY[lang].khata;
  return (
    <Section id="khata" tone="light" orbs={2} className="py-20 sm:py-28">
      <div className="shell grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <Heading eyebrow={c.eyebrow} title={c.title} />
          <Chips items={c.chips} icons={[Gauge, BellRing, NotebookPen]} />
          <Reveal variant="up" delay={0.2} className="mt-8">
            <Button asChild size="lg" className="group">
              <Link href={`/${lang}/register`}>
                {c.cta}
                <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </Reveal>
        </div>
        <Reveal variant="up" delay={0.1}>
          <KhataCard lang={lang} />
        </Reveal>
      </div>
    </Section>
  );
}

/* ============================================================== reports */

/* Thousands of taka, by week. Made up, and plain about it: a mock month. */
const WEEKS_NOW = [182, 214, 198, 248];
const WEEKS_LAST = [168, 190, 186, 207];
/* The categorical slots, in order, validated light and dark (dataviz palette). */
const MIX = [
  { share: 48, light: '#2a78d6', dark: '#3987e5' },
  { share: 27, light: '#eb6834', dark: '#d95926' },
  { share: 15, light: '#1baf7a', dark: '#199e70' },
  { share: 10, light: '#eda100', dark: '#c98500' },
];

function ReportsBoard({ lang }: { lang: Lang }) {
  const c = COPY[lang].reports;
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const [hover, setHover] = React.useState<number | null>(null);
  const top = Math.max(...WEEKS_NOW, ...WEEKS_LAST);
  const bn = lang === 'bn';

  const tiles = [
    { icon: CircleDollarSign, to: 842300, prefix: '৳', delta: '+12%', good: true },
    { icon: TrendingUp, to: 126400, prefix: '৳', delta: '+9%', good: true },
    { icon: ReceiptText, to: 6214, prefix: '', delta: '+6%', good: true },
    { icon: Boxes, to: 18900, prefix: '৳', delta: '', good: false },
  ];

  return (
    <div ref={ref} className="glass p-5 sm:p-7">
      {/* ---- four figures ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tl, i) => (
          <div key={i} className="rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{c.tiles[i]}</span>
              <tl.icon className={cn('size-4', tl.good ? 'text-primary' : 'text-amber-500')} />
            </div>
            <p className="mt-2 font-mono text-lg font-bold tabular-nums sm:text-xl">
              {inView ? <CountUp to={tl.to} prefix={tl.prefix} bangla={bn} /> : `${tl.prefix}0`}
            </p>
            {tl.delta ? (
              <p className="mt-0.5 text-[0.65rem] font-semibold text-emerald-600 dark:text-emerald-400">
                ▲ {num(lang, tl.delta)} <span className="font-normal text-muted-foreground">{c.vsLast}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-[0.65rem] font-semibold text-amber-600 dark:text-amber-400">● {c.sellFirst}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ---- this month against last, week by week ---- */}
        <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">{c.chart}</p>
            <div className="flex items-center gap-3 text-2xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" /> {c.thisMonth}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-muted-foreground/35" /> {c.lastMonth}
              </span>
            </div>
          </div>
          <div className="relative mt-4 flex h-44 items-end gap-4 border-b border-border/70 sm:gap-6" onMouseLeave={() => setHover(null)}>
            {WEEKS_NOW.map((v, i) => (
              <div
                key={i}
                className="relative flex h-full flex-1 cursor-default items-end justify-center gap-[2px] rounded-t-md"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${c.weeks[i]}: ${c.thisMonth} ৳${num(lang, v)}${c.k}, ${c.lastMonth} ৳${num(lang, WEEKS_LAST[i])}${c.k}`}
              >
                {[WEEKS_LAST[i], v].map((x, j) => (
                  <motion.div
                    key={j}
                    className={cn('w-full max-w-7 rounded-t-[4px]', j === 1 ? 'bg-primary' : 'bg-muted-foreground/35')}
                    initial={{ height: 0 }}
                    animate={{ height: inView ? `${(x / top) * 100}%` : 0 }}
                    transition={{ duration: 0.9, delay: 0.15 + i * 0.12 + j * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  />
                ))}
                {hover === i && (
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-card px-3 py-2 text-2xs shadow-lift">
                    <p className="font-semibold">{c.weeks[i]}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-sm bg-primary" /> {c.thisMonth}
                      <span className="ms-auto font-mono font-bold text-foreground">৳{num(lang, v)}{c.k}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-sm bg-muted-foreground/35" /> {c.lastMonth}
                      <span className="ms-3 font-mono font-bold text-foreground">৳{num(lang, WEEKS_LAST[i])}{c.k}</span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 sm:gap-6">
            {c.weeks.map((w) => (
              <span key={w} className="flex-1 text-center text-[0.65rem] text-muted-foreground">
                {w}
              </span>
            ))}
          </div>
        </div>

        {/* ---- how it was paid: one bar, four parts, each labelled ---- */}
        <div className="flex flex-col rounded-2xl border border-border/60 bg-background/50 p-4">
          <p className="text-sm font-bold">{c.mix}</p>
          <div className="mt-5 flex h-4 gap-[2px] overflow-hidden rounded-full">
            {MIX.map((m, i) => (
              <motion.div
                key={i}
                className="h-full first:rounded-s-full last:rounded-e-full"
                style={{ background: `var(--mix-${i})` }}
                initial={{ width: 0 }}
                animate={{ width: inView ? `${m.share}%` : 0 }}
                transition={{ duration: 1, delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
            {MIX.map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--mix-${i})` }} />
                <span className="text-muted-foreground">{c.methods[i]}</span>
                <span className="ms-auto font-mono font-bold tabular-nums">{num(lang, m.share)}%</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center gap-2 rounded-xl bg-primary/[0.07] px-3 py-2 pt-2 text-2xs text-muted-foreground max-lg:mt-5">
            <Users className="size-3.5 text-primary" />
            {lang === 'bn' ? '৬,২১৪ বিল · গড় বিল ৳১৩৬' : '6,214 bills · average bill ৳136'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsSection({ lang }: { lang: Lang }) {
  const c = COPY[lang].reports;
  return (
    <Section id="reports" tone="light" orbs={1} className="py-20 sm:py-28">
      {/* The payment colours, light and dark, as variables the bars and the key both read. */}
      <style>{`
        #reports { ${MIX.map((m, i) => `--mix-${i}: ${m.light};`).join(' ')} }
        .dark #reports { ${MIX.map((m, i) => `--mix-${i}: ${m.dark};`).join(' ')} }
      `}</style>
      <div className="shell">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <Heading eyebrow={c.eyebrow} title={c.title} />
          <Reveal variant="fade" delay={0.1}>
            <Button asChild variant="outline" size="md" className="group">
              <Link href={`/${lang}/demo`}>
                {c.cta}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </Reveal>
        </div>
        <Reveal variant="up" delay={0.1} className="mt-10">
          <ReportsBoard lang={lang} />
        </Reveal>
      </div>
    </Section>
  );
}

/* ============================================================= branches */

const TAKINGS = [94200, 71800, 48600];
/* Where each branch sits around the owner, as a share of the picture. */
const SPOTS = [
  { x: 17, y: 20 },
  { x: 83, y: 20 },
  { x: 50, y: 86 },
];

function BranchMap({ lang }: { lang: Lang }) {
  const c = COPY[lang].branches;
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const [beat, setBeat] = React.useState(0);
  useLoop(ref, 1800, () => setBeat((b) => b + 1));
  const live = TAKINGS.map((v, i) => v + ((beat * (i + 3) * 137) % 2400));
  const all = live.reduce((a, b) => a + b, 0);
  const hub = { x: 50, y: 46 };

  return (
    /* Taller on a phone, so the three branches and the owner do not touch. The
       lines stretch with it: the picture is drawn in shares of its own size. */
    <div ref={ref} className="relative mx-auto aspect-[0.86/1] w-full max-w-xl sm:aspect-[1.25/1]">
      {/* The lines, drawn in, with a pulse running along each toward the owner. */}
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden>
        {SPOTS.map((s, i) => {
          const d = `M ${s.x} ${s.y * 0.8} L ${hub.x} ${hub.y * 0.8}`;
          return (
            <g key={i}>
              <motion.path
                d={d}
                stroke="rgb(52 211 153 / 0.45)"
                strokeWidth="0.35"
                strokeDasharray="1.2 1.2"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: inView ? 1 : 0 }}
                transition={{ duration: 1.1, delay: 0.2 + i * 0.15 }}
              />
              <circle r="0.9" fill="rgb(52 211 153)">
                <animateMotion dur={`${2.2 + i * 0.4}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          );
        })}
        {/* A transfer between two branches: stock, not money, so a box and not a dot. */}
        <path id="transfer" d={`M ${SPOTS[0].x} ${SPOTS[0].y * 0.8} Q 50 0 ${SPOTS[1].x} ${SPOTS[1].y * 0.8}`} stroke="rgb(251 191 36 / 0.55)" strokeWidth="0.35" fill="none" strokeDasharray="0.8 1" />
        <rect x="-1.4" y="-1.1" width="2.8" height="2.2" rx="0.4" fill="rgb(251 191 36)">
          <animateMotion dur="3.4s" repeatCount="indefinite" path={`M ${SPOTS[0].x} ${SPOTS[0].y * 0.8} Q 50 0 ${SPOTS[1].x} ${SPOTS[1].y * 0.8}`} />
        </rect>
      </svg>

      <span className="absolute left-1/2 top-[3%] -translate-x-1/2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[0.65rem] font-semibold text-amber-300">
        <PackageCheck className="me-1 inline size-3" />
        {c.transfer}
      </span>

      {/* The owner, in the middle. */}
      {/* Placed by a plain wrapper: an animated transform on the same element would replace the centring. */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${hub.x}%`, top: `${hub.y}%` }}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: inView ? 1 : 0.6, opacity: inView ? 1 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative grid place-items-center">
          <span className="absolute size-28 animate-pulse-ring rounded-full bg-primary/20" />
          <div className="relative flex w-36 flex-col items-center rounded-3xl border border-primary/40 bg-[#062b22]/90 p-3 text-center shadow-glow backdrop-blur sm:w-44 sm:p-3.5">
            <Smartphone className="size-5 text-primary" />
            <p className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-white/60">{c.owner}</p>
            <motion.p key={all} initial={{ y: -4, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="font-mono text-lg font-bold tabular-nums text-white">
              ৳{money(lang, all, 'en-IN')}
            </motion.p>
          </div>
        </div>
      </motion.div>
      </div>

      {/* The branches. */}
      {SPOTS.map((s, i) => (
        <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: inView ? 0 : 20, opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.6, delay: 0.35 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex w-[6.6rem] flex-col items-center rounded-2xl border border-white/12 bg-white/[0.06] p-2.5 text-center backdrop-blur sm:w-36 sm:p-3">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/20 text-primary">
              {i === 0 ? <Store className="size-4" /> : <MapPin className="size-4" />}
            </span>
            <p className="mt-1.5 truncate text-xs font-bold text-white">{c.names[i]}</p>
            <p className="font-mono text-sm font-bold tabular-nums text-emerald-300">৳{money(lang, live[i], 'en-IN')}</p>
            <p className="text-[0.6rem] text-white/50">{c.today}</p>
          </div>
        </motion.div>
        </div>
      ))}
    </div>
  );
}

export function BranchesSection({ lang }: { lang: Lang }) {
  const c = COPY[lang].branches;
  return (
    <Section id="branches" tone="dark" orbs={2} className="py-20 sm:py-28">
      <div className="shell grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div>
          <Heading eyebrow={c.eyebrow} title={c.title} dark />
          <Chips items={c.chips} icons={[Boxes, Users, CircleDollarSign]} dark />
          <Reveal variant="up" delay={0.2} className="mt-8">
            <Button asChild size="lg" className="group">
              <Link href={`/${lang}/register`}>
                {c.cta}
                <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </Reveal>
        </div>
        <Reveal variant="fade" delay={0.1}>
          <BranchMap lang={lang} />
        </Reveal>
      </div>
    </Section>
  );
}

/* ============================================================= hardware */

/** The things already on a counter, each ticked as it comes in. */
export function HardwareStrip({ lang }: { lang: Lang }) {
  const c = COPY[lang].hardware;
  const icons = [Monitor, Printer, ScanBarcode, Smartphone];
  return (
    <div className="mt-14">
      <Reveal variant="fade">
        <p className="text-center text-sm font-semibold text-muted-foreground">{c.title}</p>
      </Reveal>
      <Stagger className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" step={0.1}>
        {c.items.map((label, i) => {
          const Icon = icons[i];
          return (
            <StaggerItem key={label} variant="up">
              <div className="glass group flex flex-col items-center gap-3 p-5 text-center">
                <span className="relative">
                  <motion.span
                    className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 4 + i * 0.6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Icon className="size-7" />
                  </motion.span>
                  <span className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-emerald-500 text-white shadow">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
