import { CalendarX2, Clock, PackageX, TrendingDown, X } from 'lucide-react';
import { useT } from '../i18n/ui';
import { allAlerts, useAlertStore, useAlertText } from './useStockAlerts';
import type { StockAlert } from '../api';

/**
 * The scrolling bar along the foot of the page.
 *
 * For the counter, where nobody opens a bell between customers: the lots past
 * their date and the shelves that have run out go by in front of them all day.
 * It pauses under the pointer so a line can be read, closes for the visit with
 * the cross, and is switched off for good from the bell.
 *
 * Drawn twice, end to end, and slid by exactly one copy's width, so the loop
 * has no seam and no jump back to the start.
 */

const ICON: Record<StockAlert['kind'], typeof PackageX> = {
  expired: CalendarX2,
  out: PackageX,
  expiring: Clock,
  low: TrendingDown,
};

const TONE: Record<StockAlert['kind'], string> = {
  expired: 'text-destructive',
  out: 'text-destructive',
  expiring: 'text-amber-600 dark:text-amber-400',
  low: 'text-amber-600 dark:text-amber-400',
};

/** Enough entries in one copy to outrun a wide screen. */
const MIN_PER_STRIP = 8;

export default function AlertTicker({ className = '' }: { className?: string }) {
  const t = useT();
  const text = useAlertText();
  const data = useAlertStore((s) => s.data);
  const on = useAlertStore((s) => s.ticker);
  /* Closed for this visit only — kept in the store, so walking from the shop
     to the till does not bring it back. */
  const hidden = useAlertStore((s) => s.tickerHidden);
  const hide = useAlertStore((s) => s.hideTicker);

  const all = allAlerts(data);
  if (!on || hidden || all.length === 0) return null;

  /* A short list is repeated until one copy is wider than the bar, or two
     alerts would bunch up at the left with an empty stretch after them. */
  const rounds = Math.ceil(MIN_PER_STRIP / all.length);
  const items = Array.from({ length: rounds }, (_, r) => all.map((a) => ({ a, r }))).flat();

  const urgent = data!.counts.expired + data!.counts.out > 0;
  /* Roughly constant reading speed however long the list is. */
  const seconds = Math.max(24, items.length * 6);

  const strip = (copy: number) => (
    <div className="alert-ticker-strip" aria-hidden={copy > 0}>
      {items.map(({ a, r }) => {
        const Icon = ICON[a.kind];
        return (
          <span key={`${copy}-${r}-${a.key}`} className="inline-flex items-center gap-1.5 px-5">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE[a.kind]}`} />
            <span>{text(a)}</span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div
      className={`alert-ticker flex h-8 shrink-0 items-center border-t text-xs ${
        urgent ? 'border-destructive/30 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5'
      } ${className}`}
      role="marquee"
      aria-label={t('Stock alerts')}
    >
      <span
        className={`z-10 flex h-full shrink-0 items-center gap-1 px-3 font-semibold text-white ${
          urgent ? 'bg-destructive' : 'bg-amber-500'
        }`}
      >
        🔔 <span className="hidden sm:inline">{t('Alerts')}</span>
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="alert-ticker-track" style={{ animationDuration: `${seconds}s` }}>
          {strip(0)}
          {strip(1)}
        </div>
      </div>
      <button
        type="button"
        onClick={hide}
        aria-label={t('Hide')}
        title={t('Hide')}
        className="z-10 grid h-full w-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
