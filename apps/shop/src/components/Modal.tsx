import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n/ui';

/**
 * Everything the shop opens on top of a screen.
 *
 * One shell, for one reason that matters at a counter: **the way out is always
 * in the same place.** Each of these panels used to carry its own close button
 * inside its own header, so the target moved with the panel's width, its title
 * and its content — a salesman closing a bill, a delivery and a held list
 * reached for three different spots, and on a full-height panel the button sat
 * halfway down the screen.
 *
 * It is now outside the card, in the top-right corner of the overlay, where it
 * does not move and does not compete with the panel's own heading. The dimmed
 * backdrop closes too, and so does Escape: three ways out, none of which
 * depends on where the panel happens to end.
 *
 * `onClose` is optional. A panel that must be answered rather than dismissed —
 * a confirmation with a reason — simply does not pass one, and then no corner
 * button is drawn and neither the backdrop nor Escape does anything.
 */
export default function Modal({
  onClose,
  children,
  /** The panel's own width; the shell only centres it. */
  className = 'w-full max-w-2xl',
  /** Above another panel that is already open, rather than beside it. */
  z = 50,
  label,
}: {
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  z?: number;
  label?: string;
}) {
  const t = useT();

  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        /* Stopped here, or the till's own Escape — which clears the bill —
           fires on the same press as the one that closed this. */
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
      style={{ zIndex: z }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      /* Only a click that started *and* ended on the backdrop: dragging a
         selection out of the panel used to close it. */
      onMouseDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      {/*
        The card, and the way out pinned to its corner.

        The button is a sibling of the panel rather than a child of it: the
        panel scrolls, and a close button inside a scrolling box scrolls away
        with the content. Sitting on the corner it stays put, it is outside the
        panel's own heading so it competes with nothing, and it is in the same
        place on every screen the shop opens.
      */}
      {/* One column no wider than the screen: an auto column grew to fit the
          widest thing inside — a delivery's line table — and pushed the whole
          dialog, its close button and its heading, off the right of a phone. */}
      <div className={`relative min-w-0 ${className}`} onMouseDown={(e) => e.stopPropagation()}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            title={`${t('Close')} · Esc`}
            className="absolute -right-2 -top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:border-destructive hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
