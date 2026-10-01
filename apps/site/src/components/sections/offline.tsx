'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, CloudUpload, ShieldCheck, RefreshCw } from 'lucide-react';
import { translate, tItems, type Lang } from '@/i18n/dictionary';
import { cn } from '@/lib/utils';
import { Section, SectionHead } from '@/components/section';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives';
import { Badge } from '@/components/ui/badge';
import { mockT, num, money } from '@/i18n/mock';

/*
 * When the line drops.
 *
 * A dropped connection is a closed shop at a counter, so this is the one band on the page that is a dark room with a
 * machine in it. The demonstration is a state machine rather than a loop of
 * decoration: the connection really does fail on a timer, bills really do pile
 * up in the local queue, and the sync really does replay them when the line
 * comes back — with the deduplication shown as one bill turning into one bill.
 */

type State = 'online' | 'down' | 'syncing';

const QUEUE = [
  { ref: 'BILL-7F2A', amount: 640 },
  { ref: 'BILL-7F31', amount: 1180 },
  { ref: 'BILL-7F38', amount: 325 },
  { ref: 'BILL-7F40', amount: 2010 },
] as const;

export function OfflineSection({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const points = tItems<{ title: string; body: string }>(lang, 'offline.points');

  return (
    <Section id="offline" tone="dark" orbs={2} className="py-20 sm:py-28">
      <div className="shell">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <SectionHead
              eyebrow={t('offline.kicker')}
              title={t('offline.title')}
              lede={t('offline.lede')}
            />

            <Stagger className="mt-9 grid gap-3" step={0.08}>
              {points.map((p) => (
                <StaggerItem key={p.title} variant="up">
                  <div className="flex gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div>
                      <h3 className="text-sm font-bold text-white">{p.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-white/55">{p.body}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          {/* -------------------------------------------------- the demonstration */}
          <Reveal variant="fade" delay={0.1}>
            <OfflineDemo lang={lang} />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

function OfflineDemo({ lang }: { lang: Lang }) {
  const m = mockT(lang).offline;
  const [state, setState] = React.useState<State>('online');
  const [queue, setQueue] = React.useState<string[]>([]);
  const [bills, setBills] = React.useState(0);

  /* Nine seconds is the whole story: three of connection, three of a dropped
     line and a shop that stays open, three of the replay. Long enough to read,
     short enough to not be a thing anyone sits through twice. */
  React.useEffect(() => {
    let i = 0;
    let q = 0;
    let b = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i <= 3) {
        setState('online');
      } else if (i <= 6) {
        setState('down');
        b += 1;
        setBills(b);
        setQueue((prev) => (prev.length < QUEUE.length ? [...prev, QUEUE[prev.length].ref] : prev));
      } else if (i <= 8) {
        setState('syncing');
        q += 1;
        setQueue((prev) => prev.slice(Math.min(q, prev.length)));
      } else {
        setState('online');
        setQueue([]);
        i = 0;
        b = 0;
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const offline = state === 'down';

  return (
    <div className="glass-dark relative overflow-hidden p-5 sm:p-6">
      {/* The status bar. This is the only part of the UI a shop owner checks
          when something is wrong, so it is the biggest thing on the card. */}
      <div className="flex items-center gap-3">
        <motion.span
          animate={offline ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
          transition={offline ? { duration: 1.4, repeat: Infinity } : {}}
          className={cn(
            'grid size-10 place-items-center rounded-xl',
            offline
              ? 'bg-amber-500/15 text-amber-400'
              : state === 'syncing'
                ? 'bg-cyan-500/15 text-cyan-400'
                : 'bg-emerald-500/15 text-emerald-400',
          )}
        >
          {offline ? (
            <WifiOff className="size-5" />
          ) : state === 'syncing' ? (
            <RefreshCw className="size-5 animate-spin" />
          ) : (
            <ShieldCheck className="size-5" />
          )}
        </motion.span>
        <div>
          <p className="text-sm font-bold text-white">
            {offline ? m.down : state === 'syncing' ? m.syncing : m.online}
          </p>
          <p className="font-mono text-2xs text-white/45">
            {offline
              ? m.downNote
              : state === 'syncing'
                ? `${num(lang, queue.length)} ${m.leftToSend}`
                : m.upToDate}
          </p>
        </div>
        <Badge
          variant={offline ? 'warning' : state === 'syncing' ? 'soft' : 'success'}
          className="ml-auto"
        >
          {offline ? m.badgeDown : state === 'syncing' ? m.badgeSync : m.badgeOnline}
        </Badge>
      </div>

      {/* The billing screen keeps taking money either way. */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-white/50">{m.rung}</span>
          <span className="font-mono text-lg font-bold tabular-nums text-white">
            {num(lang, bills)}
          </span>
        </div>

        <div className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {queue.length === 0 ? (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-3 text-center font-mono text-2xs text-white/30"
              >
                {m.empty}
              </motion.p>
            ) : (
              queue.map((ref, i) => (
                <motion.div
                  key={ref}
                  layout
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 22 }}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2 font-mono text-2xs',
                    state === 'syncing'
                      ? 'border-cyan-500/25 bg-cyan-500/[0.07] text-cyan-200'
                      : 'border-white/10 bg-white/[0.04] text-white/70',
                  )}
                >
                  <CloudUpload
                    className={cn(
                      'size-3 shrink-0',
                      state === 'syncing' ? 'animate-bounce text-cyan-400' : 'text-white/35',
                    )}
                  />
                  <span className="truncate">{ref}</span>
                  <span className="ml-auto tabular-nums opacity-60">
                    ৳{money(lang, QUEUE.find((x) => x.ref === ref)?.amount ?? 0)}
                  </span>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
