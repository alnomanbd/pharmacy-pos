import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * The page numbers worth showing: the first, the last, and one either side of
 * where you are, with a gap mark wherever that skips some.
 */
export function pageList(current: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, current - 1, current, current + 1]);
  const out: (number | '…')[] = [];
  let last = 0;
  for (let p = 1; p <= pages; p++) {
    if (!keep.has(p)) continue;
    if (p - last > 1) out.push('…');
    out.push(p);
    last = p;
  }
  return out;
}

/**
 * "16–30 of 42", and the numbers to move between pages.
 *
 * Draws nothing for a single page: a pager with one button is a control that
 * does nothing, and it pushes the page's own foot further down.
 */
export default function Pager({
  page,
  pageSize,
  total,
  onPage,
  className = '',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm ${className}`}>
      <span className="text-muted-foreground">
        {n((page - 1) * pageSize + 1)}–{n(Math.min(page * pageSize, total))} {t('of')} {n(total)}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label={t('Previous page')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageList(page, pages).map((x, i) =>
          x === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={x}
              type="button"
              onClick={() => onPage(x)}
              aria-current={x === page ? 'page' : undefined}
              className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold tabular-nums transition-colors ${
                x === page
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {n(x)}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn btn-ghost h-8 px-2"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label={t('Next page')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
