'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Sparkles, ArrowRight, Minus, MonitorSmartphone, Users, MapPin } from 'lucide-react';
import { siteConfig } from '@/lib/site';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * The three plans.
 *
 * One component, two densities: the home page shows the price, the blurb and
 * the first four lines, and the pricing page shows all of them. The alternative
 * — a second, "simplified" card set on the home page — drifts from the real one
 * within a month, and the whole job of a price page is that the number on the
 * home page is the number you get.
 *
 * Basic is the highlighted plan, and deliberately not the cheapest paid one by
 * an accident: it is the plan a single-counter shop actually lands on, and a
 * comparison that pushes everyone to the top tier is a comparison doing sales
 * work instead of buying work.
 */

export type Plan = {
  /** The catalogue's key, so the card can be matched to the live plan. */
  key?: string;
  name: string;
  price: string;
  period: string;
  blurb: string;
  cta: string;
  highlight: boolean;
  badge?: string;
  features: string[];
};

/** What the API says a plan allows — the one source the console edits. */
type Live = {
  key: string;
  price: number;
  includedBranches?: number;
  extraBranchPrice?: number;
  limits: { outlets: number | null; terminals: number | null; shopUsers: number | null };
};

/*
 * The catalogue as it stood when this was written, for the moment before the
 * live one arrives (and for a visitor whose request to the API fails). The
 * live answer replaces it, so a price or limit changed in the console is
 * changed here too, without a rebuild.
 */
const FALLBACK: Live[] = [
  { key: 'trial', price: 0, includedBranches: 1, extraBranchPrice: 0, limits: { outlets: 1, terminals: 1, shopUsers: 2 } },
  { key: 'basic', price: 1500, includedBranches: 1, extraBranchPrice: 0, limits: { outlets: 1, terminals: 1, shopUsers: 2 } },
  { key: 'plus', price: 3000, includedBranches: 1, extraBranchPrice: 0, limits: { outlets: 1, terminals: 5, shopUsers: 10 } },
];

let cache: Live[] | null = null;
function useLivePlans() {
  const [plans, setPlans] = React.useState<Live[]>(cache ?? FALLBACK);
  React.useEffect(() => {
    if (cache) return;
    let live = true;
    fetch(`${siteConfig.apiUrl}/public/plans`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Live[] } | null) => {
        if (!live || !j?.data?.length) return;
        cache = j.data;
        setPlans(j.data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return plans;
}

const BN = '০১২৩৪৫৬৭৮৯';
const digits = (lang: Lang, v: string) => (lang === 'bn' ? v.replace(/[0-9]/g, (d) => BN[+d]) : v);
const tk = (lang: Lang, n: number) => digits(lang, `৳${n.toLocaleString('en-IN')}`);

/** The three lines that are a plan's limits, worded from the live numbers. */
function limitLines(lang: Lang, p: Live): { icon: typeof Users; text: string }[] {
  const bn = lang === 'bn';
  const n = (v: number) => digits(lang, String(v));
  const { terminals, shopUsers, outlets } = p.limits;
  const counters =
    terminals === null
      ? bn ? 'যত খুশি বিলিং কাউন্টার' : 'As many billing counters as you need'
      : terminals === 1
        ? bn ? 'একটি বিলিং কাউন্টার' : 'One billing counter'
        : bn ? `${n(terminals)}টি পর্যন্ত বিলিং কাউন্টার` : `Up to ${terminals} billing counters`;
  const users =
    shopUsers === null
      ? bn ? 'যত খুশি লগইন' : 'As many logins as you need'
      : shopUsers === 2
        ? bn ? 'দুটি লগইন — মালিক ও একজন সেলসম্যান' : 'Two logins — the owner and one salesman'
        : bn ? `${n(shopUsers)}টি পর্যন্ত লগইন, ভূমিকাসহ` : `Up to ${shopUsers} logins, with roles`;
  const extra = p.extraBranchPrice ?? 0;
  const included = p.includedBranches ?? 1;
  let branches: string;
  if (outlets === 1) branches = bn ? 'একটি শাখা' : 'One branch';
  else if (outlets === null) branches = bn ? 'যত খুশি শাখা' : 'As many branches as you need';
  else branches = bn ? `${n(outlets)}টি পর্যন্ত শাখা` : `Up to ${outlets} branches`;
  if (outlets !== 1 && extra > 0) {
    branches += bn
      ? ` · ${n(included)}টি দামের মধ্যে, প্রতিটি অতিরিক্ত ${tk(lang, extra)}/মাস`
      : ` · ${included} included, ${tk(lang, extra)}/month each extra`;
  }
  return [
    { icon: MonitorSmartphone, text: counters },
    { icon: Users, text: users },
    { icon: MapPin, text: branches },
  ];
}

export function PlanCards({
  lang,
  compact = false,
}: {
  lang: Lang;
  compact?: boolean;
}) {
  const t = (p: string) => translate(lang, p);
  const plans = tItems<Plan>(lang, 'pricing.plans');
  const live = useLivePlans();

  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      {plans.map((plan, i) => {
        const lp = live.find((x) => x.key === plan.key);
        const price = lp ? (lp.price === 0 ? plan.price : tk(lang, lp.price)) : plan.price;
        return (
        <Reveal key={plan.name} variant="up" delay={i * 0.08} className="h-full">
          <motion.article
            whileHover={{ y: -5 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex h-full flex-col rounded-3xl border p-6 sm:p-7',
              plan.highlight
                ? 'border-primary/40 bg-gradient-to-b from-primary/[0.08] via-background to-background shadow-glow lg:-mt-4 lg:pb-9 lg:pt-9'
                : 'border-border bg-card/60 backdrop-blur',
            )}
          >
            {plan.badge && (
              <Badge
                variant={plan.highlight ? 'default' : 'soft'}
                className="absolute -top-3 start-6 gap-1.5 shadow-glow"
              >
                <Sparkles className="size-3" />
                {plan.badge}
              </Badge>
            )}

            <h3 className="h-card text-lg">{plan.name}</h3>

            <div className="mt-4 flex items-baseline gap-2">
              <span
                className={cn(
                  'font-mono text-3xl font-bold tabular-nums tracking-tight',
                  lp?.price === 0 && 'text-primary',
                )}
              >
                {price}
              </span>
              <span className="text-xs text-muted-foreground">{plan.period}</span>
            </div>

            <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
              {plan.blurb}
            </p>

            {/* The limits, from the live catalogue: the one place a card cannot promise more than the plan gives. */}
            {lp && (
              <ul className="mt-5 grid gap-2 rounded-2xl border border-primary/15 bg-primary/[0.05] p-3.5">
                {limitLines(lang, lp).map((l) => (
                  <li key={l.text} className="flex items-start gap-2.5 text-sm font-semibold">
                    <l.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="leading-snug">{l.text}</span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {plan.features.slice(0, compact ? 4 : plan.features.length).map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={cn(
                      'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full',
                      plan.highlight
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/15 text-primary',
                    )}
                  >
                    {f.startsWith('Everything in') ? (
                      <Minus className="size-2.5" />
                    ) : (
                      <Check className="size-2.5" />
                    )}
                  </span>
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>

            <Button
              asChild
              className="group mt-7 w-full"
              variant={plan.highlight ? 'primary' : 'outline'}
            >
              <Link href={`/${lang}/register`}>
                {plan.cta}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </motion.article>
        </Reveal>
        );
      })}
    </div>
  );
}
