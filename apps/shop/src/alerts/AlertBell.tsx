import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarX2, Clock, PackageX, TrendingDown, X } from 'lucide-react';
import type { StockAlert } from '../api';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { alertTotal, useAlertStore, useAlertText } from './useStockAlerts';

/**
 * The bell in the top bar, and the list it opens.
 *
 * The count on it is everything outstanding, not only what is new: an expired
 * strip still in the drawer is still a problem the tenth time the owner looks,
 * and a badge that went quiet after the first look would say otherwise. It
 * clears when the lot is written off or sent back, or the shelf is refilled.
 */

const SECTIONS: {
  kind: StockAlert['kind'];
  title: string;
  icon: typeof Bell;
  tone: string;
  /** Where the owner deals with it. A salesman gets the list without the link. */
  to: string;
}[] = [
  { kind: 'expired', title: 'Expired', icon: CalendarX2, tone: 'text-destructive bg-destructive/10', to: '/expiry' },
  { kind: 'out', title: 'Out of stock', icon: PackageX, tone: 'text-destructive bg-destructive/10', to: '/purchases' },
  { kind: 'expiring', title: 'Expiring soon', icon: Clock, tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-400', to: '/expiry' },
  { kind: 'low', title: 'Running low', icon: TrendingDown, tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-400', to: '/stock' },
];

export default function AlertBell({
  runsTheShop,
  className = '',
}: {
  runsTheShop: boolean;
  className?: string;
}) {
  const t = useT();
  const lang = useUiLang();
  const text = useAlertText();
  const data = useAlertStore((s) => s.data);
  const ticker = useAlertStore((s) => s.ticker);
  const setTicker = useAlertStore((s) => s.setTicker);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const total = alertTotal(data);
  const urgent = data ? data.counts.expired + data.counts.out : 0;
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));

  /* Closes on a click anywhere else, or Escape — the way every menu does. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
          urgent > 0 ? 'bell-ring' : ''
        }`}
        aria-label={t('Stock alerts')}
        title={t('Stock alerts')}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white shadow ${
              urgent > 0 ? 'bg-destructive' : 'bg-amber-500'
            }`}
          >
            {total > 99 ? '99+' : n(total)}
          </span>
        )}
      </button>

      {open && (
        /*
          Hung off the bell on a wide screen. On a phone the bell is not at the
          right edge — the language, theme and profile buttons sit beyond it —
          so a panel anchored to it runs off the left of the screen. There it
          is pinned to the screen instead, a gutter either side.
        */
        <div className="fixed inset-x-3 top-[3.75rem] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <strong className="text-sm">{t('Stock alerts')}</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('Close')}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(60vh,calc(100dvh-10rem))] overflow-y-auto px-2 py-2">
            {total === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                <div className="mb-1 text-2xl">🌿</div>
                {t('All good — nothing expired, nothing run out.')}
              </div>
            ) : (
              SECTIONS.map((sec) => {
                const rows = data?.[sec.kind] ?? [];
                const count = data?.counts[sec.kind] ?? 0;
                if (count === 0) return null;
                return (
                  <section key={sec.kind} className="mb-2">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span className={`grid h-6 w-6 place-items-center rounded-full ${sec.tone}`}>
                          <sec.icon className="h-3.5 w-3.5" />
                        </span>
                        {t(sec.title)}
                        <span className="text-muted-foreground">({n(count)})</span>
                      </span>
                      {runsTheShop && (
                        <Link
                          to={sec.to}
                          onClick={() => setOpen(false)}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          {t('Open')}
                        </Link>
                      )}
                    </div>
                    <ul>
                      {rows.slice(0, 8).map((a) => (
                        <li key={a.key}>
                          {/* The lot on the Expiry page by its batch, the shelf on
                              the Stock page by its name — straight to the row. */}
                          {runsTheShop ? (
                            <Link
                              to={
                                a.kind === 'expired' || a.kind === 'expiring'
                                  ? `/expiry?q=${encodeURIComponent(a.batchNo || a.name)}`
                                  : `/stock?q=${encodeURIComponent(a.name)}`
                              }
                              onClick={() => setOpen(false)}
                              className="block rounded-lg px-2 py-1.5 pl-10 text-xs leading-snug text-foreground/90 hover:bg-muted hover:text-foreground"
                            >
                              {text(a)}
                            </Link>
                          ) : (
                            <span className="block rounded-lg px-2 py-1.5 pl-10 text-xs leading-snug text-foreground/90">
                              {text(a)}
                            </span>
                          )}
                        </li>
                      ))}
                      {count > 8 && (
                        <li className="px-2 py-1 pl-10 text-[11px] text-muted-foreground">
                          +{n(count - Math.min(8, rows.length))} {t('more')}
                        </li>
                      )}
                    </ul>
                  </section>
                );
              })
            )}
          </div>

          {/* The ticker is somebody's choice at their own machine. */}
          <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs">
            <span>{t('Scrolling alert bar at the bottom')}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={ticker}
              onChange={(e) => setTicker(e.target.checked)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
