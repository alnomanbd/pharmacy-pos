import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, FlaskConical, PackageX, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { shopApi, type TrendingReport, type TrendItem } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { Rise, useSeen } from '@dawai/shared/components/motion';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { taka } from '../api';

/**
 * What is moving in the shop — the Reports page's third tab.
 *
 * Rising, falling and new, each against the same days before; what is rising
 * and about to run out, first, because that is the one to act on today; what
 * is sitting on the shelf; and the same by generic and by company.
 */

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (n: number) => key(new Date(Date.now() - n * 86_400_000));
const RANGES = [
  { key: '7', label: 'Last 7 days', from: () => ago(6) },
  { key: '30', label: 'Last 30 days', from: () => ago(29) },
  { key: '90', label: 'Last 90 days', from: () => ago(89) },
];

export default function TrendingView() {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const money = (v: number) => n(taka(v));
  const { toast } = useToast();
  const [range, setRange] = useState('30');
  const [data, setData] = useState<TrendingReport | null>(null);

  useEffect(() => {
    setData(null);
    const r = RANGES.find((x) => x.key === range)!;
    shopApi
      .trending({ from: r.from(), to: ago(0) })
      .then(setData)
      .catch(() => toast(t('Could not load the figures.'), 'error'));
  }, [range, toast, t]);

  const name = (r: { name: string; strength?: string }) => [r.name, r.strength].filter(Boolean).join(' ');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${range === r.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('Against the same number of days before. Pieces that stayed sold — returns taken off.')}</p>
      </div>

      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          {/* ---- act on this first ---- */}
          {data.runningOut.length > 0 && (
            <Rise className="card mb-4 border-amber-500/40 bg-amber-500/[0.06]">
              <h3 className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> {t('Selling well, running out')}
              </h3>
              <p className="-mt-1 mb-3 text-xs text-muted-foreground">{t('At this stretch’s pace, the shelf lasts a week or less. Reorder before the next customer asks.')}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.runningOut.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-card px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{name(r)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {n(r.pieces)} {t('sold')} · {n(r.onHand)} {t('left')}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${r.onHand <= 0 ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}>
                      {r.onHand <= 0 ? t('Out now') : r.daysLeft === 0 ? t('Lasts today') : `${n(r.daysLeft ?? 0)} ${t(r.daysLeft === 1 ? 'day' : 'days')}`}
                    </span>
                  </div>
                ))}
              </div>
            </Rise>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <MoverList title="Rising" icon={TrendingUp} tone="up" rows={data.rising} n={n} empty="Nothing is selling noticeably more." />
            <MoverList title="Falling" icon={TrendingDown} tone="down" rows={data.falling} n={n} empty="Nothing is selling noticeably less." />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Rise delay={80} className="card mb-0">
              <h3 className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" /> {t('New movers')}
              </h3>
              <p className="-mt-1 mb-2 text-xs text-muted-foreground">{t('Sold this stretch, not at all the one before.')}</p>
              {data.fresh.length === 0 ? (
                <div className="empty py-6">{t('Nothing new started selling.')}</div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.fresh.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{name(r)}</span>
                      <span className="shrink-0 tabular-nums">
                        {n(r.pieces)} <span className="text-xs text-muted-foreground">{t('pcs')}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Rise>
            <Rise delay={120} className="card mb-0">
              <h3 className="flex items-center gap-2">
                <PackageX className="h-4 w-4 text-muted-foreground" /> {t('Slow movers')}
              </h3>
              <p className="-mt-1 mb-2 text-xs text-muted-foreground">{t('On the shelf, worth the most, and barely selling — money standing still.')}</p>
              {data.slow.length === 0 ? (
                <div className="empty py-6">{t('Everything on the shelf is moving.')}</div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.slow.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{r.name}</span>
                      <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {n(r.onHand)} {t('on hand')} · {n(r.sold)} {t('sold')}
                        <span className="block font-semibold text-foreground">{money(r.value)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Rise>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <GroupTable title="By generic" icon={FlaskConical} rows={data.byGeneric} money={money} n={n} />
            <GroupTable title="By company" icon={Building2} rows={data.byCompany} money={money} n={n} />
          </div>
        </>
      )}
    </>
  );
}

/** Rising or falling: this stretch's pieces against the last, as two bars, with the change. */
function MoverList({
  title,
  icon: Icon,
  tone,
  rows,
  n,
  empty,
}: {
  title: string;
  icon: typeof TrendingUp;
  tone: 'up' | 'down';
  rows: TrendItem[];
  n: (v: number | string) => string;
  empty: string;
}) {
  const t = useT();
  const [ref, seen] = useSeen<HTMLUListElement>();
  const top = Math.max(1, ...rows.flatMap((r) => [r.pieces, r.piecesBefore]));
  const up = tone === 'up';
  return (
    <Rise className="card mb-0 min-w-0">
      <h3 className={`flex items-center gap-2 ${up ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
        <Icon className="h-4 w-4" /> {t(title)}
      </h3>
      {rows.length === 0 ? (
        <div className="empty py-6">{t(empty)}</div>
      ) : (
        <ul ref={ref} className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{[r.name, r.strength].filter(Boolean).join(' ')}</span>
                <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {r.change !== null ? `${n(Math.abs(r.change))}%` : ''}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {[
                  { v: r.pieces, cls: up ? 'bg-emerald-500' : 'bg-destructive/70' },
                  { v: r.piecesBefore, cls: 'bg-muted-foreground/30' },
                ].map((b, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${b.cls} ${seen ? 'motion-grow-x' : 'scale-x-0'}`} style={{ width: `${(b.v / top) * 100}%`, animationDelay: `${i * 60 + j * 40}ms` }} />
                    </div>
                    <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">{n(b.v)}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Rise>
  );
}

function GroupTable({
  title,
  icon: Icon,
  rows,
  money,
  n,
}: {
  title: string;
  icon: typeof TrendingUp;
  rows: TrendingReport['byGeneric'];
  money: (v: number) => string;
  n: (v: number | string) => string;
}) {
  const t = useT();
  return (
    <Rise delay={160} className="card mb-0 min-w-0">
      <h3 className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {t(title)}
      </h3>
      {rows.length === 0 ? (
        <div className="empty py-6">{t('Nothing sold in this stretch.')}</div>
      ) : (
        <table className="table w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="max-w-[16rem] truncate" title={r.name}>
                  {r.name}
                </td>
                <td className="text-right font-semibold tabular-nums">{money(r.value)}</td>
                <td className="w-20 text-right">
                  {r.change !== null && (
                    <span className={`pill ${r.change >= 0 ? 'success' : 'danger'} !py-0 text-[11px] tabular-nums`}>
                      {r.change >= 0 ? '+' : '−'}
                      {n(Math.abs(r.change))}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Rise>
  );
}
