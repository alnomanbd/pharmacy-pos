import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * A dialog, or — with `side` — a panel that slides in from the right.
 *
 * Both fit a 360px phone: the box is never wider than the screen less its
 * gutter, and the body scrolls while the head and the foot stay put, so the
 * Save button is never below the fold of a long form.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  side = false,
  width = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: boolean;
  /** A Tailwind max-width class. */
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const label = typeof title === 'string' ? title : undefined;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${side ? 'justify-end' : 'items-center justify-center p-4'}`}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative z-10 flex w-full flex-col border border-border bg-popover shadow-2xl ${width} ${
          side ? 'h-full' : 'max-h-[calc(100vh-2rem)] rounded-xl'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h3>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
