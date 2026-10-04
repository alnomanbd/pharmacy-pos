import { useEffect, useRef } from 'react';
import { AlertTriangle, Download, HelpCircle, Send, Trash2, Upload, X, Lock } from 'lucide-react';
import { useConfirmStore, type ConfirmIcon } from '../lib/confirm';
import './ConfirmHost.css';

/**
 * The one "are you sure?" dialog — see lib/confirm. Mounted once at the root of
 * each app; `confirmAction()` anywhere opens it.
 *
 * Keys: Escape is No. Enter answers whichever button has the focus — and in a
 * red one that is Cancel, so the Enter that was meant for the till never
 * deletes or sends anything. Both are stopped here, so they never reach the
 * page's own shortcuts underneath (on the till, Escape clears the bill).
 */

const ICONS: Record<ConfirmIcon, typeof AlertTriangle> = {
  export: Download,
  send: Send,
  delete: Trash2,
  warning: AlertTriangle,
  question: HelpCircle,
  import: Upload,
  close: Lock,
};

export default function ConfirmHost({ cancelLabel = 'Cancel' }: { cancelLabel?: string }) {
  const current = useConfirmStore((s) => s.current);
  const answer = useConfirmStore((s) => s.answer);
  const yes = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);

  const options = current?.options;
  const danger = options?.tone === 'danger';

  useEffect(() => {
    if (!current) return;
    // The safe answer has the focus when the act cannot be taken back.
    (danger ? no : yes).current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        answer(false);
      } else if (e.key === 'Enter' || /^F\d{1,2}$/.test(e.key)) {
        // Enter belongs to the focused button; the till's F-keys wait until this is answered.
        e.stopPropagation();
        if (e.key !== 'Enter') e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current, danger, answer]);

  if (!current || !options) return null;
  const Icon = ICONS[options.icon ?? (danger ? 'warning' : 'question')];

  return (
    <div className="cfm-backdrop no-print" onMouseDown={() => answer(false)}>
      <div
        className="cfm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cfm-title"
        aria-describedby={options.message ? 'cfm-message' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* For the mouse only: the Cancel button below is the same answer, and the one a keyboard reaches. */}
        <button type="button" className="cfm-x" onClick={() => answer(false)} tabIndex={-1} aria-hidden="true">
          <X className="h-4 w-4" />
        </button>
        <div className={`cfm-icon${danger ? ' is-danger' : ''}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h2 id="cfm-title" className="cfm-title">
          {options.title}
        </h2>
        {options.message && (
          <div id="cfm-message" className="cfm-message">
            {options.message}
          </div>
        )}
        <div className="cfm-actions">
          <button ref={no} type="button" className="cfm-btn" onClick={() => answer(false)}>
            {options.cancelLabel ?? cancelLabel}
          </button>
          <button
            ref={yes}
            type="button"
            className={`cfm-btn ${danger ? 'cfm-btn--danger' : 'cfm-btn--primary'}`}
            onClick={() => answer(true)}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
