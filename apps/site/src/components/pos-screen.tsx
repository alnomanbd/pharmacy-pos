'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanBarcode,
  Search,
  Check,
  Banknote,
  Clock3,
  Maximize2,
  User,
  PackageCheck,
} from 'lucide-react';
import { BILLING_TAPE } from '@/lib/data';
import { cn } from '@/lib/utils';
import type { Lang } from '@/lib/site';
import { mockT, num, money } from '@/i18n/mock';

/*
 * The billing screen, running.
 *
 * This is the single most important thing on the site, so it is the actual
 * product rather than a picture of it: the same rows, the same fields, the same
 * keyboard, drawn in markup and CSS. A screenshot of this screen would be
 * honest in a way a marketing illustration never is, and it costs no image
 * weight on a 3G connection.
 *
 * What moves, and why exactly that:
 *
 * - The **tape turns over** every 3.6 seconds. A billing screen is a queue, and a
 *   screenshot of a queue is a still photograph of the one thing that is
 *   supposed to be moving.
 * - The **takings rise** on each turn, because that is what a sale does, and
 *   three figures moving together is what makes it read as a billing screen rather than
 *   as a list.
 * - The **scanner walks the barcode** on a 2.6s loop, on its own, the way a USB
 *   wedge does — it is the one decorative motion on the screen and it is the
 *   one a shop owner looks for first, because it is how the medicine gets on
 *   the bill.
 * - The **function keys** light up in sequence, which is the whole promise of
 *   the product: you can sell with a hand on the keyboard and the mouse idle.
 *
 * The figures are illustrative, and everything on this screen is a shape the
 * app's own data has — a rack, a strip count, a piece price, a batch. Nothing
 * here is a claim about a real customer.
 */

const ROWS = 5;

/** A plausible evening already behind the counter, before the visitor arrived. */
const OPEN_TAKINGS = 84_120;
const OPEN_BILLS = 214;

/** Hard bars of a pack code, drawn rather than scraped off the web. */
const BARS = [2, 1, 3, 1, 1, 2, 2, 1, 4, 1, 1, 2, 1, 3, 1, 2, 1, 1, 3, 1, 2, 1, 1, 4, 2, 1, 3, 1, 1, 2, 2, 1, 1, 3, 1, 2];
const BAR_SPAN = BARS.reduce((a, b) => a + b, 0) + (BARS.length - 1) * 2;

const KEYS = [
  { k: 'F2', label: 'খুঁজুন' },
  { k: 'F4', label: 'কাস্টমার' },
  { k: 'F5', label: 'ছাড়' },
  { k: 'F6', label: 'সরাও' },
  { k: 'F8', label: 'টাকা' },
  { k: 'F10', label: 'পুরো ক্যাশ' },
] as const;

export function PosScreen({ className, lang = 'en' }: { className?: string; lang?: Lang }) {
  const m = mockT(lang).pos;
  const [turn, setTurn] = React.useState(0);
  const [key, setKey] = React.useState(-1);

  /* The turn. One interval, and everything on the screen is derived from it,
     so the takings, the bill number and the tape can never disagree — which on
     a real billing screen is the thing a shop owner checks first. */
  React.useEffect(() => {
    const id = window.setInterval(() => setTurn((t) => t + 1), 3600);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setKey((k) => (k >= KEYS.length - 1 ? -1 : k + 1));
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key.startsWith('F') || e.key === 'F1' || e.key === 'F11' || e.key === 'F12') return;
      const idx = KEYS.findIndex((x) => `F${x.k.slice(1)}` === e.key);
      if (idx >= 0) setKey(idx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const h = new Date().getHours();
      const m = new Date().getMinutes().toString().padStart(2, '0');
      setClock(`${h.toString().padStart(2, '0')}:${m}`);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const [clock, setClock] = React.useState('21:04');

  const takings = OPEN_TAKINGS + turn * 11 + (turn % 7) * 3;
  const bills = OPEN_BILLS + turn;
  const rows = Array.from({ length: ROWS }, (_, i) => BILLING_TAPE[(turn + i) % BILLING_TAPE.length]);
  const billNo = String(1048 + turn).padStart(4, '0');

  return (
    <div
      className={cn(
        'ink-band relative isolate overflow-hidden rounded-[1.75rem] p-2 shadow-[0_50px_120px_-40px_rgba(4,47,46,0.75)]',
        className,
      )}
    >
      <div className="aurora-field opacity-60">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(30rem 18rem at 20% 0%, rgb(16 185 129 / 0.22), transparent 62%)',
          }}
        />
      </div>

      {/* The machine's bezel. `Fullscreen` is on the real screen too, because
          every POS in a shop runs with the browser chrome gone. */}
      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-ink-950/80 backdrop-blur-xl">
        {/* the bar */}
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider text-primary-foreground">
            C1
          </span>
          <span className="text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            POS
          </span>
          <span className="ms-auto inline-flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
            <span className="relative grid size-1.5 place-items-center">
              <span className="absolute size-1.5 animate-pulse-ring rounded-full bg-emerald-400" />
              <span className="size-1.5 rounded-full bg-emerald-400" />
            </span>
            {m.online}
          </span>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">{num(lang, clock)}</span>
          <Maximize2 className="size-3 text-muted-foreground/60" />
        </div>

        <div className="grid gap-0 sm:grid-cols-[1fr_15rem]">
          {/* the bill */}
          <div className="min-w-0 border-b border-white/[0.07] p-4 sm:border-b-0 sm:border-r">
            {/* search — the cursor's home */}
            <div className="flex items-center gap-2.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5">
              <Search className="size-3.5 shrink-0 text-primary" />
              <span className="truncate font-mono text-xs text-foreground/90">
                Napa Extra
                <span className="ml-0.5 inline-block h-3.5 w-[1.5px] translate-y-0.5 animate-blink-caret bg-primary align-middle" />
              </span>
              <span className="ms-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[0.6rem] font-semibold text-muted-foreground">
                F2
              </span>
            </div>

            {/* the tape */}
            <div className="mt-3 overflow-hidden">
              <div className="mb-1.5 flex items-center justify-between px-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                <span>#{billNo}</span>
                <span>{num(lang, ROWS)} {m.lines}</span>
              </div>

              <div className="flex flex-col">
                <AnimatePresence initial={false} mode="popLayout">
                  {rows.map(([name, pack, qty, amount], i) => (
                    <motion.div
                      key={`${turn}-${i}`}
                      layout="position"
                      variants={{
                        hidden: { opacity: 0, y: -12 },
                        show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
                      }}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0 }}
                      className={cn(
                        'grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors',
                        i === 0 ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <span className="font-mono text-[0.6rem] tabular-nums text-muted-foreground/60">
                        {String(48 + ((turn + i) % 60)).padStart(3, '0')}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium leading-tight text-foreground/95">
                          {name}
                        </span>
                        <span className="block truncate text-[0.6rem] leading-tight text-muted-foreground/70">
                          {pack.replace(/(\d+) strips?/, (_, n: string) => `${num(lang, n)} ${n === '1' ? m.strip : m.strips}`)}
                        </span>
                      </span>
                      <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">
                        {num(lang, qty)}
                      </span>
                      <span className="w-12 text-right font-mono text-[0.68rem] font-semibold tabular-nums text-foreground">
                        ৳{num(lang, amount)}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* the scanner */}
            <div className="relative mt-3 overflow-hidden rounded-lg bg-black/35 px-3 py-2.5">
              <ScanBarcode className="h-4 w-full text-white/45" strokeWidth={1.4} />
              <span className="absolute inset-x-0 top-0 h-8 animate-scan-line bg-gradient-to-b from-transparent via-emerald-400/45 to-transparent" />
            </div>
          </div>

          {/* the money */}
          <div className="flex flex-col p-4">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
              {m.takings}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
              ৳{money(lang, takings)}
            </p>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              <span className="tabular-nums">{num(lang, bills)}</span> {m.bills} · <span className="tabular-nums">{num(lang, 41)}</span> {m.khata}
            </p>

            <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-3.5 text-[0.7rem]">
              <div className="flex justify-between text-muted-foreground">
                <span>{m.subtotal}</span>
                <span className="font-mono tabular-nums">৳{money(lang, takings - 210)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{m.discount}</span>
                <span className="font-mono tabular-nums text-emerald-400">−৳{num(lang, 210)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-white/12 pt-2">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.toPay}
                </span>
                <span className="font-mono text-base font-bold tabular-nums text-foreground">
                  ৳{money(lang, takings)}
                </span>
              </div>
            </div>

            <div className="mt-auto space-y-1.5 pt-4">
              <div className="grid grid-cols-3 gap-1.5">
                {KEYS.map((kk, i) => (
                  <div
                    key={kk.k}
                    className={cn(
                      'rounded-md border px-1 py-1.5 text-center transition-all duration-200',
                      key === i
                        ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                        : 'border-white/10 bg-white/[0.04] text-muted-foreground',
                    )}
                  >
                    <div className="font-mono text-[0.6rem] font-bold">{kk.k}</div>
                    <div className="truncate text-[0.55rem] leading-tight opacity-80">{kk.label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between rounded-lg bg-white/[0.05] px-2.5 py-2 text-[0.65rem]">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Banknote className="size-3 text-emerald-400" />
                  {m.exactCash}
                </span>
                <span className="font-mono font-semibold tabular-nums text-foreground">F10</span>
              </div>
            </div>
          </div>
        </div>

        {/* the foot: the two facts a counter machine is judged on */}
        <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-2 text-[0.6rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <User className="size-3 text-primary" />
            {m.salesman} · C1
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PackageCheck className="size-3 text-primary" />
            {money(lang, 2418)} {m.onHand}
          </span>
          <span className="ms-auto inline-flex items-center gap-1.5">
            <Clock3 className="size-3 text-emerald-400" />
            {m.shiftOpen} {num(lang, '09:00')}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The receipt, printing.
 *
 * The second half of the promise: it comes out of the printer the shop already
 * owns, at the width that printer takes, with the shop's name, its DGDA drug
 * licence and the salesman's name on it — and the amount in words, because
 * "পঞ্চাশ টাকা" on a counter is a thing customers ask for.
 *
 * It is the same component in two states, because a page that shows the screen
 * and not the paper has stopped one step short of the sale.
 */
export function Receipt({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative mx-auto w-[15.5rem] rounded-b-lg bg-[#fdfdfa] px-4 pb-5 pt-4 text-ink-900 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]',
        className,
      )}
    >
      {/* the perforated top edge of the roll */}
      <div className="perf absolute inset-x-0 -top-[7px] h-[7px] text-[#fdfdfa]" />

      <div className="text-center">
        <p className="text-[0.7rem] font-extrabold leading-tight">জন্নী ফার্মেসি</p>
        <p className="text-[0.5rem] font-medium text-ink-500">JONNI PHARMACY, BOGURA</p>
        <p className="mt-0.5 text-[0.45rem] text-ink-400">মেসার্স ফার্মেসি, বগুড়া শহর</p>
      </div>

      <div className="my-2 border-t border-dashed border-ink-300" />

      <div className="space-y-[3px] font-mono text-[0.5rem] leading-tight">
        {[
          ['Napa Extra 500mg', '1x30', '30'],
          ['Seclo 20mg', '2x29', '58'],
          ['Alatrol 10mg', '1x20', '20'],
          ['Fexo 120mg', '1x42', '42'],
        ].map(([n, q, a]) => (
          <div key={n} className="grid grid-cols-[1fr_auto] gap-x-2">
            <span className="truncate">{n}</span>
            <span className="tabular-nums text-ink-500">
              {q} {a}
            </span>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-ink-300" />

      <div className="space-y-[3px] text-[0.5rem]">
        <div className="flex justify-between">
          <span>মোট</span>
          <span className="font-mono tabular-nums">150.00</span>
        </div>
        <div className="flex justify-between text-ink-500">
          <span>ছাড়</span>
          <span className="font-mono tabular-nums">10.00</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-ink-900 pt-1 font-bold">
          <span>পরিশোধযোগ্য</span>
          <span className="font-mono text-[0.6rem] tabular-nums">৳140.00</span>
        </div>
      </div>

      <p className="mt-1.5 text-center text-[0.42rem] italic text-ink-500">
        একশো চল্লিশ টাকা মাত্র
      </p>

      <div className="my-2 border-t border-dashed border-ink-300" />

      <div className="space-y-[2px] text-center text-[0.45rem] text-ink-500">
        <p>ড্রাগ লাইসেন্স নং: ৭৮৯১২৩-০০১</p>
        <p>বিক্রেতা: রাশেদুল ইসলাম</p>
        <p className="font-mono">#01051 · 21:07</p>
      </div>

      <p className="mt-2.5 text-center text-[0.4rem] leading-tight text-ink-400">
        ঔষুধের লাইসেন্সধারী প্রতিষ্ঠান। চিকিৎসকের পরামর্শ ছাড়া ঔষুধ
        <br />
        ক্রয় বা ব্যবহার করবেন না।
      </p>

      {/* The QR the billing screen prints so a bill can be found again without a
          number written on a slip. */}
      <div className="mx-auto mt-2.5 grid size-12 place-items-center rounded bg-ink-900 p-1">
        <div className="grid size-full grid-cols-4 grid-rows-4 gap-[1px]">
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              className={cn('rounded-[1px]', [0, 1, 2, 4, 5, 8, 9, 11, 13, 14, 15].includes(i) ? 'bg-white' : 'bg-white/15')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** the strip the billing screen prints, used in the "how it works" band. */
export function PrintedBillNote({ lang = 'en' }: { lang?: Lang }) {
  return (
    <p className="flex items-center gap-2 text-2xs text-muted-foreground">
      <Check className="size-3.5 text-emerald-500" />
      {lang === 'bn' ? '৮০ মিমি · ৫৮ মিমি · যেকোনো মাপ' : '80mm · 58mm · any width you type'}
    </p>
  );
}
