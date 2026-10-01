import { ChevronLeft, ChevronRight } from 'lucide-react';

/** "Page 2 of 9" and the two arrows, as the Shops list draws them. */
export default function Pager({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
