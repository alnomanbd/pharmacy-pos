'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { DatabaseBackup, Download, Eye, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { Section } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';

/**
 * "Is my data safe?" — the question an owner asks before any other, answered
 * as six facts round a shield that locks as it comes on screen. Every one is
 * a thing the product already does, nothing aspirational.
 */
const COPY = {
  en: {
    eyebrow: 'Your data',
    title: 'Safer than the notebook in the drawer',
    items: [
      { icon: DatabaseBackup, t: 'Backed up every day', d: 'Copies kept off the server, so a bad day is never the last one.' },
      { icon: Lock, t: 'Encrypted on the way', d: 'Every page and every bill travels over HTTPS.' },
      { icon: KeyRound, t: 'Two-factor sign-in', d: 'An authenticator code on top of the password, for anyone who wants it.' },
      { icon: Eye, t: 'Every change on record', d: 'Who cancelled what, and when — on a trail nobody can edit.' },
      { icon: ShieldCheck, t: 'Roles that hold', d: 'A salesman never sees your trade price or margin — the server decides.' },
      { icon: Download, t: 'Yours to take', d: 'Every list exports to CSV. Leave whenever you like, with all of it.' },
    ],
  },
  bn: {
    eyebrow: 'আপনার তথ্য',
    title: 'ড্রয়ারের খাতার চেয়েও নিরাপদ',
    items: [
      { icon: DatabaseBackup, t: 'প্রতিদিন ব্যাকআপ', d: 'সার্ভারের বাইরে কপি থাকে, তাই কোনো খারাপ দিনই শেষ দিন নয়।' },
      { icon: Lock, t: 'আসা-যাওয়ায় এনক্রিপ্টেড', d: 'প্রতিটি পাতা আর বিল HTTPS দিয়ে যায়।' },
      { icon: KeyRound, t: 'দুই ধাপের লগইন', d: 'পাসওয়ার্ডের সাথে অথেন্টিকেটর কোড, যে চান তার জন্য।' },
      { icon: Eye, t: 'প্রতিটি বদলের রেকর্ড', d: 'কে কী বাতিল করল, কখন — এমন খাতায় যা কেউ বদলাতে পারে না।' },
      { icon: ShieldCheck, t: 'ভূমিকা অনুযায়ী অধিকার', d: 'সেলসম্যান কখনো আপনার কেনা দাম বা লাভ দেখে না — সার্ভার ঠিক করে।' },
      { icon: Download, t: 'তথ্য আপনার', d: 'প্রতিটি তালিকা CSV-তে নেওয়া যায়। যখন খুশি সব নিয়ে চলে যান।' },
    ],
  },
} as const;

export function SecuritySection({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const ref = React.useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '-15% 0px' });
  const still = useReducedMotion() ?? false;
  const on = seen || still;

  return (
    <Section id="security" tone="light" orbs={1} className="py-20 sm:py-28">
      <div ref={ref} className="shell grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        {/* ---- the shield ---- */}
        <div className="relative mx-auto grid size-64 place-items-center sm:size-72">
          {[0, 1, 2].map((r) => (
            <motion.span
              key={r}
              className="absolute rounded-full border border-primary/25"
              style={{ inset: r * 26 }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={on ? { scale: 1, opacity: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.1 + r * 0.15, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
          {!still && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ background: 'conic-gradient(from 0deg, transparent 0 75%, rgb(16 185 129 / 0.35) 100%)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
          )}
          <motion.div
            className="relative grid size-28 place-items-center rounded-[2rem] bg-ramp text-white shadow-glow"
            initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
            animate={on ? { scale: 1, rotate: 0, opacity: 1 } : {}}
            transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.5 }}
          >
            <ShieldCheck className="size-14" />
          </motion.div>
        </div>

        {/* ---- the facts ---- */}
        <div>
          <Reveal variant="fade">
            <span className="eyebrow">
              <span className="size-1.5 rounded-full bg-current" />
              {c.eyebrow}
            </span>
          </Reveal>
          <Reveal variant="up" delay={0.05}>
            <h2 className="h-section mt-4">{c.title}</h2>
          </Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {c.items.map((it, i) => (
              <motion.div
                key={it.t}
                initial={{ opacity: 0, y: 14 }}
                animate={on ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="glass flex items-start gap-3 p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <it.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{it.t}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{it.d}</span>
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
