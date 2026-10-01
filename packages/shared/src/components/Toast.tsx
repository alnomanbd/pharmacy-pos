import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, BellRing } from 'lucide-react';
import '../styles/toast.css';

/**
 * The app's answer to "did that work?".
 *
 * Three things about this have been wrong at different times, and each one made
 * a message that might as well not have been shown:
 *
 *   - It had **no stylesheet at all**, so `position: static` put the stack in
 *     normal flow below the page — transparent, off screen. Every confirmation
 *     and every error in every page went there.
 *   - It sat in the top bar's space, but glued to its left edge, which is
 *     exactly where a page puts its own actions. Pressing "Add staff" raised a
 *     message that covered "Add staff". It is pinned to the top-right corner
 *     now, clear of the in-page toolbar, while still being where the eye
 *     naturally goes for the result of an action.
 *   - It could only be dismissed by clicking it, which nobody knew, and there
 *     was nothing to say how long it would stay. So: a close button, and a bar
 *     that runs down as the time does.
 *
 * The bar is not decoration — it is the answer to "is this about to vanish
 * before I have read it". Hovering stops it, and stops the clock with it, so a
 * long validation message can be read at leisure rather than raced.
 */

/*
 * `warning` is for what is not a failure but needs doing — a lot going out of
 * date, a shelf gone empty — and stays up as long as an error does.
 */
export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** How long it should stay, in milliseconds. */
  life: number;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * How long each kind stays up.
 *
 * An error stays twice as long as a confirmation: a confirmation only has to be
 * noticed, while an error has to be *read* — and the useful ones are a sentence
 * long ("Password: use at least 8 characters"). Four seconds is not enough time
 * to read that and act on it, and it cannot be brought back.
 */
const LIFE: Record<ToastKind, number> = { success: 4200, info: 5200, warning: 9000, error: 9000 };

const ICON: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
  warning: BellRing,
};

/** How long the exit animation runs; the toast is removed when it ends. */
const LEAVE_MS = 220;

/**
 * One toast: its message, its close button, and its clock.
 *
 * The timer lives here rather than in the provider so that hovering this toast
 * pauses this toast — with one timer per stack, hovering the newest would keep
 * an older one alive too.
 */
function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  /* Leaving is a state of its own so it can be animated out rather than
     vanishing mid-read; the provider only drops it once that has played. */
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback(() => setLeaving(true), []);
  /** How much of the life is left when paused, so resuming is not a restart. */
  const remaining = useRef(item.life);
  const startedAt = useRef(Date.now());
  const Icon = ICON[item.kind];

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onClose, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, onClose]);

  useEffect(() => {
    if (paused || leaving) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(leave, remaining.current);
    return () => {
      window.clearTimeout(timer);
      // Only charge for the time actually spent visible.
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, leaving, leave]);

  return (
    <div
      className={`toast toast-${item.kind}${paused ? ' is-paused' : ''}${leaving ? ' is-leaving' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast-icon" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="toast-text">{item.message}</span>
      <button className="toast-close" onClick={leave} aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
      {/*
        The clock, drawn. `animationDuration` comes from the same number the
        timer uses, so the bar reaching the end and the toast leaving are the
        same moment rather than two guesses.
      */}
      <span
        className="toast-bar"
        style={{ animationDuration: `${item.life}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    /* The same words twice say nothing new, and a pile of them buries the
       screen — the newest few are kept, the oldest give way. */
    setItems((prev) =>
      [...prev.filter((t) => t.message !== message), { id, kind, message, life: LIFE[kind] }].slice(-4),
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/*
        `role="status"` on the container rather than on each toast, so a screen
        reader announces whatever appears inside it without re-announcing the
        container. Polite: a confirmation must not interrupt what is being read.
      */}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <Toast key={item.id} item={item} onClose={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
