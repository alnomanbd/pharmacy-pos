'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Sparkles, ArrowRight, Minus } from 'lucide-react';
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
  name: string;
  price: string;
  period: string;
  blurb: string;
  cta: string;
  highlight: boolean;
  badge?: string;
  features: string[];
};

export function PlanCards({
  lang,
  compact = false,
}: {
  lang: Lang;
  compact?: boolean;
}) {
  const t = (p: string) => translate(lang, p);
  const plans = tItems<Plan>(lang, 'pricing.plans');

  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      {plans.map((plan, i) => (
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
                  plan.price === 'Free' && 'text-primary',
                )}
              >
                {plan.price}
              </span>
              <span className="text-xs text-muted-foreground">{plan.period}</span>
            </div>

            <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
              {plan.blurb}
            </p>

            <ul className="mt-6 flex flex-1 flex-col gap-2.5">
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
      ))}
    </div>
  );
}
