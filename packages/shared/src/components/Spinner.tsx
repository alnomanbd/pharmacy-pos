import { Loader2 } from 'lucide-react';

/**
 * Loading indicators.
 *
 * `Spinner` is the bare glyph for a button or a toolbar; `LoadingBlock` fills a
 * panel while its first load is in flight, so the page shows that something is
 * happening instead of an empty card that looks like "no data".
 */

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const;

export function Spinner({
  size = 'sm',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Loader2
      className={`animate-spin ${SIZES[size]} ${className}`}
      aria-hidden="true"
      strokeWidth={2.5}
    />
  );
}

export function LoadingBlock({
  label = 'Loading…',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" className="text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
