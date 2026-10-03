import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { CountUp, Rise, Sparkline, useSeen } from '@dawai/shared/components/motion';

/**
 * The pieces of a "stretch" page — the console's Overview and Reports, drawn
 * the way the shop app draws its own: a run of days against the same run just
 * before it, every figure with which way it went and what it was.
 */

export const taka = (n: number) => `৳ ${Math.round(n).toLocaleString('en-BD')}`;
export const num = (n: number) => Math.round(n).toLocaleString('en-BD');

/* ------------------------------------------------------------------ */
/* The range                                                           */
/* ------------------------------------------------------------------ */

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => key(new Date(Date.now() - n * 86_400_000));

export type Preset = 'month' | '7' | '30' | '90' | 'year' | 'custom';
export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
];

export function rangeFor(p: Preset, custom?: { from: string; to: string }) {
  const today = key(new Date());
  const now = new Date();
  switch (p) {
    case 'month':
      return { from: key(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case '7':
      return { from: daysAgo(6), to: today };
    case '90':
      return { from: daysAgo(89), to: today };
    case 'year':
      return { from: key(new Date(now.getFullYear(), 0, 1)), to: today };
    case 'custom':
      return custom ?? { from: daysAgo(29), to: today };
    default:
      return { from: daysAgo(29), to: today };
  }
}

export function useRange(initial: Preset = '30') {
  const [preset, setPreset] = useState<Preset>(initial);
  const [custom, setCustom] = useState(() => rangeFor('30'));
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  return { preset, setPreset, custom, setCustom, range };
}

export function RangeBar({ r, right }: { r: ReturnType<typeof useRange>; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => r.setPreset(p.key)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              r.preset === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="date"
          className="input h-9 w-[9.5rem]"
          value={r.range.from}
          max={r.range.to}
          onChange={(e) => {
            r.setCustom({ from: e.target.value, to: r.range.to });
            r.setPreset('custom');
          }}
        />
        to
        <input
          type="date"
          className="input h-9 w-[9.5rem]"
          value={r.range.to}
          min={r.range.from}
          onChange={(e) => {
            r.setCustom({ from: r.range.from, to: e.target.value });
            r.setPreset('custom');
          }}
        />
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

const pretty = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const rangeLine = (r: { from: string; to: string; prevFrom: string; prevTo: string; days: number }) =>
  `${r.days} days · against ${pretty(r.prevFrom)} — ${pretty(r.prevTo)}, the same number of days before it`;

/* ------------------------------------------------------------------ */
/* Which way it went                                                    */
/* ------------------------------------------------------------------ */

/** Up or down since last time, as a pill — the word and the percent say it, not only the colour. */
export function Delta({ now, before, format = num, upIsBad = false }: { now: number; before: number; format?: (v: number) => string; upIsBad?: boolean }) {
  const change = before !== 0 ? Math.round(((now - before) / Math.abs(before)) * 1000) / 10 : null;
  const flat = now === before;
  const up = now > before;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const good = flat ? null : up !== upIsBad;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`pill ${good === null ? '' : good ? 'success' : 'danger'} !py-0.5 tabular-nums`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {flat ? 'same' : `${up ? 'up' : 'down'}${change !== null ? ` ${Math.abs(change)}%` : ''}`}
      </span>
      <span className="text-[11px] text-muted-foreground">was {format(before)}</span>
    </span>
  );
}

/** The headline: one big figure, its line across the stretch behind it, and which way it went. */
export function Hero({
  icon: Icon,
  label,
  now,
  before,
  format,
  sub,
  line,
  extra,
}: {
  icon: LucideIcon;
  label: string;
  now: number;
  before: number;
  format: (v: number) => string;
  sub?: string;
  line: number[];
  /** A second figure beside the first — the monthly revenue beside what came in. */
  extra?: ReactNode;
}) {
  return (
    <Rise className="relative mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-primary/[0.05] to-transparent p-5 sm:p-6">
      <Sparkline values={line.length > 1 ? line : [0, 0]} className="pointer-events-none absolute bottom-0 right-0 h-3/5 w-full opacity-60 sm:w-3/5" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
            <div className="mt-0.5 text-4xl font-bold tracking-tight tabular-nums text-foreground">
              <CountUp value={now} format={format} />
            </div>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {extra && <div className="border-l border-primary/20 pl-6">{extra}</div>}
        </div>
        <Delta now={now} before={before} format={format} />
      </div>
    </Rise>
  );
}

/** A figure and the same figure last time. */
export function CompareTile({
  icon: Icon,
  label,
  now,
  before,
  format = num,
  upIsBad = false,
  tone = 'bg-muted text-muted-foreground',
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  now: number;
  before: number;
  format?: (v: number) => string;
  upIsBad?: boolean;
  tone?: string;
  delay?: number;
}) {
  return (
    <Rise delay={delay} className="stat flex h-full min-h-[128px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className="label !mt-0 line-clamp-2 leading-tight">{label}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="value mt-1 tabular-nums">
        <CountUp value={now} format={format} />
      </div>
      <div className="mt-auto pt-1">
        <Delta now={now} before={before} format={format} upIsBad={upIsBad} />
      </div>
    </Rise>
  );
}

/* ------------------------------------------------------------------ */
/* Pictures                                                            */
/* ------------------------------------------------------------------ */

type Point = { dayKey: string; total: number; count: number };

/**
 * This stretch against the last, in a handful of equal pieces — days for a
 * week, weeks for a month, fortnights or months beyond — grouped bars, the
 * stretch in the brand's colour and the one before in grey, each piece
 * naming both on hover.
 */
export function PeriodBars({
  title,
  now,
  before,
  pick = (p) => p.total,
  format = num,
  delay = 0,
}: {
  title: string;
  now: Point[];
  before: Point[];
  pick?: (p: Point) => number;
  format?: (v: number) => string;
  delay?: number;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (now.length === 0) return null;
  const size = now.length <= 7 ? 1 : now.length <= 31 ? 7 : now.length <= 120 ? 14 : 30;
  const chunk = (rows: Point[]) => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size).reduce((a, r) => a + pick(r), 0));
    return out;
  };
  const a = chunk(now);
  const b = chunk(before);
  const top = Math.max(1, ...a, ...b);
  const nothing = a.every((v) => v === 0) && b.every((v) => v === 0);
  const label = (i: number) => {
    if (size === 1) return pretty(now[i].dayKey);
    const len = Math.min(size, now.length - i * size);
    if (len < size) return `${len} days`;
    return `${size === 7 ? 'Week' : size === 14 ? 'Fortnight' : 'Month'} ${i + 1}`;
  };
  return (
    <Rise delay={delay} className="card mb-0 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="mb-0 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" /> {title}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> This stretch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" /> The one before
          </span>
        </div>
      </div>
      {nothing ? (
        <div className="empty mt-4 py-14">Nothing in this stretch, or the one before it.</div>
      ) : (
      <>
      <div ref={ref} className="relative mt-5 flex h-48 items-end gap-2 border-b border-border sm:gap-4" onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((f) => (
          <span key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${f * 100}%` }} aria-hidden="true" />
        ))}
        {a.map((v, i) => (
          <div
            key={i}
            tabIndex={0}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${label(i)}: ${format(v)}, the one before ${format(b[i] ?? 0)}`}
            className="relative flex h-full flex-1 items-end justify-center gap-[3px] outline-none"
          >
            {[b[i] ?? 0, v].map((x, j) => (
              <div
                key={j}
                className={`w-full max-w-9 rounded-t-[5px] ${j === 1 ? 'bg-gradient-to-t from-primary/80 to-primary' : 'bg-muted-foreground/35'} ${seen ? 'motion-grow-y' : 'scale-y-0'}`}
                style={{ height: `${(x / top) * 100}%`, minHeight: x > 0 ? 3 : 0, animationDelay: `${i * 90 + j * 60}ms` }}
              />
            ))}
            {hover === i && (
              <div
                className={`pointer-events-none absolute -top-2 z-10 w-max -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg ${
                  i === 0 ? 'left-0' : i === a.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                }`}
              >
                <span className="font-semibold">{label(i)}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-primary" /> <span className="text-muted-foreground">This stretch</span>
                  <span className="ml-auto pl-3 font-semibold tabular-nums">{format(v)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> <span className="text-muted-foreground">The one before</span>
                  <span className="ml-auto pl-3 font-semibold tabular-nums">{format(b[i] ?? 0)}</span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 sm:gap-4">
        {a.map((_, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground">
            {label(i)}
          </span>
        ))}
      </div>
      </>
      )}
    </Rise>
  );
}

const MIX = ['var(--mix-0)', 'var(--mix-1)', 'var(--mix-2)', 'var(--mix-3)'];

/** One bar split into its parts, every part named with its figure and share — four at most, the rest folded. */
export function MixBar({
  icon: Icon,
  title,
  rows,
  format = num,
  empty = 'Nothing in this stretch.',
  delay = 80,
}: {
  icon: LucideIcon;
  title: string;
  rows: { label: string; value: number }[];
  format?: (v: number) => string;
  empty?: string;
  delay?: number;
}) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const total = rows.reduce((a, r) => a + r.value, 0);
  const rest = rows.slice(4).reduce((a, r) => a + r.value, 0);
  const parts = [...rows.slice(0, 4).map((r, i) => ({ ...r, color: MIX[i] })), ...(rest > 0 ? [{ label: 'Other', value: rest, color: 'var(--mix-other)' }] : [])];
  return (
    <Rise delay={delay} className="card mb-0 flex min-w-0 flex-col">
      <h3 className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {total <= 0 ? (
        <div className="empty py-8">{empty}</div>
      ) : (
        <>
          <div ref={ref} className="mt-2 flex h-4 gap-[2px] overflow-hidden rounded-full">
            {parts.map((p, i) => (
              <div
                key={p.label}
                className={`h-full first:rounded-l-full last:rounded-r-full ${seen ? 'motion-grow-x' : 'scale-x-0'}`}
                style={{ width: `${(p.value / total) * 100}%`, background: p.color, animationDelay: `${200 + i * 110}ms` }}
              />
            ))}
          </div>
          <ul className="mt-5 flex flex-col gap-2.5">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-2.5 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate capitalize">{p.label}</span>
                <span className="font-semibold tabular-nums">{format(p.value)}</span>
                <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{Math.round((p.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Rise>
  );
}

/** A ranked list with a bar under each row against the first — who did most. */
export function RankList({
  icon: Icon,
  title,
  rows,
  format = num,
  empty = 'Nobody yet.',
  delay = 120,
}: {
  icon: LucideIcon;
  title: string;
  rows: { id: string; name: string; value: number; sub?: string }[];
  format?: (v: number) => string;
  empty?: string;
  delay?: number;
}) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Rise delay={delay} className="card mb-0 min-w-0">
      <h3 className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {rows.length === 0 ? (
        <div className="empty py-8">{empty}</div>
      ) : (
        <ul ref={ref} className="mt-1 flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <Link to={`/shops/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                  {r.name}
                </Link>
                {r.sub && <span className="text-[11px] text-muted-foreground">{r.sub}</span>}
                <span className="font-semibold tabular-nums">{format(r.value)}</span>
              </div>
              <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-primary/70 to-primary ${seen ? 'motion-grow-x' : 'scale-x-0'}`}
                  style={{ width: `${(r.value / top) * 100}%`, animationDelay: `${i * 70}ms` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Rise>
  );
}

/** Rows to a CSV the browser downloads — every table on the Reports page can leave as a file. */
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const q = (v: string | number) => (typeof v === 'number' ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = '\uFEFF' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
