import { useEffect, useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { useT } from '../i18n/ui';
import Modal from './Modal';

/**
 * Are you sure — and why.
 *
 * The browser's own `confirm()` is not used anywhere in this app, and would not
 * do here even if it were: it cannot carry the shop's words, it cannot be
 * translated, it cannot take a reason, and on a counter machine it arrives as a
 * grey box from somewhere else that people learn to dismiss without reading.
 *
 * Every act on this screen that moves money or hides a record asks for a reason,
 * and the reason is not decoration: it is what the owner reads a week later when
 * they ask why a bill is missing. So the button stays dead until there is one.
 *
 * `reason={false}` for the acts that only need a yes — putting something *back*
 * needs no defence.
 */
export default function ConfirmWithReason({
  open,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  reason = true,
  placeholder,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** `danger` for anything that takes something away. */
  tone?: 'danger' | 'normal';
  reason?: boolean;
  placeholder?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [why, setWhy] = useState('');

  useEffect(() => {
    if (open) setWhy('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onCancel]);

  if (!open) return null;

  const ready = !reason || why.trim().length >= 3;

  return (
    <Modal onClose={onCancel} className="w-full max-w-md" z={60} label={title}>
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              tone === 'danger'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-primary/10 text-primary'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="mb-0 text-base">{title}</h3>
              <button
                type="button"
                onClick={onCancel}
                aria-label={t('Close')}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>

            {reason && (
              <input
                className="input mt-3 h-10"
                placeholder={placeholder ?? t('Why — required, and kept with the record')}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                autoFocus
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('Not yet')}
          </button>
          <button
            type="button"
            className={`btn${tone === 'danger' ? ' btn-danger' : ''}`}
            disabled={!ready || busy}
            onClick={() => onConfirm(why.trim())}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </button>
        </div>
    </Modal>
  );
}
