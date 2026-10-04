import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Calculator as CalcIcon, X, Banknote, ReceiptText, GripHorizontal } from 'lucide-react';
import { useT, useLangStore, bnNumerals } from '../i18n/ui';
import './Calculator.css';
import { evaluate, opFor, shown, plain, OPS, type Op } from './calc';

/**
 * A calculator at the counter.
 *
 * Every counter in the country has a calculator beside the till, for the sums
 * the till does not do: strips times the price for a customer asking "how much
 * for three", a part payment, a discount worked out by hand. So it is here, a
 * key away (F3), and it knows the two things a desk calculator does not — the
 * bill's total, as a key, and the cash box, as a place to put the answer.
 *
 * It floats beside the payment panel rather than covering the bill, and keys
 * typed while it is in focus are its own: digits, + − × ÷ (or * /), %, Enter
 * for =, Backspace, and Escape to close — which must never reach the till,
 * where Escape clears the bill.
 */

const HISTORY = 4;

/** Where it was dragged to, remembered on this machine. Unset: beside the payment panel. */
const POSITION_KEY = 'dawai.calculator.position';
type Position = { x: number; y: number };

/** Narrower than this it is a sheet along the bottom, and stays put. */
const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 640;

function storedPosition(): Position | null {
  try {
    const p = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null') as Position | null;
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

/** Kept wholly on screen: dragged off an edge it would be hard to get back. */
function clampTo(p: Position, w: number, h: number): Position {
  return {
    x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - h - 8)),
  };
}

export default function Calculator({
  billTotal,
  onUseAsCash,
  onClose,
}: {
  /** The bill being rung up, offered as a key. */
  billTotal: number;
  /** Puts the answer in the cash box. */
  onUseAsCash: (amount: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const read = (s: string) => (lang === 'bn' ? bnNumerals(s) : s);
  const [expr, setExpr] = useState('');
  /** The last answer, once = was pressed: the next digit starts afresh, an operator carries on from it. */
  const [settled, setSettled] = useState(false);
  const [history, setHistory] = useState<{ expr: string; result: number }[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(storedPosition);
  const [dragging, setDragging] = useState(false);
  const grab = useRef<Position>({ x: 0, y: 0 });

  /*
   * Moved by its title bar, wherever the counter wants it — over the bill, by
   * the cash box, out of the way of a long list. Pointer events, so a touch
   * screen at the counter drags it the same way a mouse does.
   */
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPhone() || (e.target as HTMLElement).closest('button')) return;
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    grab.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    setPosition({ x: box.left, y: box.top });
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const box = panel.current;
      if (!box || !Number.isFinite(e.clientX)) return;
      setPosition(clampTo({ x: e.clientX - grab.current.x, y: e.clientY - grab.current.y }, box.offsetWidth, box.offsetHeight));
    };
    const end = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging]);

  // Remembered once it is put down; pulled back on screen if the window has shrunk since.
  useEffect(() => {
    if (dragging || !position) return;
    const box = panel.current;
    if (box) {
      const fitted = clampTo(position, box.offsetWidth, box.offsetHeight);
      if (fitted.x !== position.x || fitted.y !== position.y) return setPosition(fitted);
    }
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
      /* storage unavailable — it forgets, and opens beside the panel next time */
    }
  }, [dragging, position]);

  /** Back beside the payment panel, where it opens by default. */
  const resetPosition = () => {
    setPosition(null);
    try {
      localStorage.removeItem(POSITION_KEY);
    } catch {
      /* nothing to forget */
    }
  };

  // Focused on opening, so the number pad types into it straight away.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  const result = evaluate(expr);
  const last = expr.slice(-1);

  const digit = (d: string) => {
    if (settled) {
      setExpr(d === '.' ? '0.' : d);
      setSettled(false);
      return;
    }
    // One point per number.
    if (d === '.') {
      const current = expr.split(/[+\-×÷%]/).pop() ?? '';
      if (current.includes('.')) return;
      if (current === '') return setExpr(expr + '0.');
    }
    setExpr(expr + d);
  };

  const op = (o: Op) => {
    setSettled(false);
    if (expr === '') {
      if (o === '-') setExpr('-');
      return;
    }
    // A second operator replaces the first: 5 + × 3 is 5 × 3.
    if ((OPS as string[]).includes(last)) setExpr(expr.slice(0, -1) + o);
    else setExpr(expr + o);
  };

  const percent = () => {
    setSettled(false);
    if (expr && /[0-9.]/.test(last)) setExpr(expr + '%');
  };

  const equals = () => {
    if (result === null || settled) return;
    setHistory((h) => [{ expr, result }, ...h].slice(0, HISTORY));
    setExpr(String(result));
    setSettled(true);
  };

  const back = () => {
    setSettled(false);
    setExpr(expr.slice(0, -1));
  };

  const clear = () => {
    setSettled(false);
    setExpr('');
  };

  /** The bill's total as a number in the sum — `570 - 70` for what is left after a part payment. */
  const bill = () => {
    const value = plain(billTotal);
    if (settled || expr === '') {
      setExpr(value);
      setSettled(false);
      return;
    }
    if (/[0-9.%]/.test(last)) setExpr(expr + '+' + value);
    else setExpr(expr + value);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Ours, all of them: none of these may reach the till's own keys.
    const k = e.key;
    const o = opFor(k);
    let handled = true;
    if (/^[0-9]$/.test(k) || k === '.' || k === ',') digit(k === ',' ? '.' : k);
    else if (o) op(o);
    else if (k === '%') percent();
    else if (k === 'Enter' || k === '=') equals();
    else if (k === 'Backspace') back();
    else if (k === 'Delete' || k === 'c' || k === 'C') clear();
    else if (k === 'Escape' || k === 'F3') onClose();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const key = (label: string, onClick: () => void, tone = '', aria?: string) => (
    <button
      key={aria ?? label}
      type="button"
      className={`calc-key ${tone}`}
      onClick={onClick}
      aria-label={aria ?? label}
      // Keep the focus on the panel, where the typed keys go.
      onMouseDown={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={panel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label={t('Calculator')}
      className={`calc no-print${dragging ? ' is-dragging' : ''}`}
      style={position && !isPhone() ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      {/* The title bar is the handle; a double-click puts it back beside the payment panel. */}
      <div className="calc-head" onPointerDown={startDrag} onDoubleClick={resetPosition} title={t('Drag to move')}>
        <GripHorizontal className="calc-grip h-4 w-4" />
        <CalcIcon className="h-4 w-4 text-primary" />
        <strong className="text-sm">{t('Calculator')}</strong>
        <kbd className="calc-kbd">F3</kbd>
        <span className="flex-1" />
        <button type="button" className="calc-x" onClick={onClose} aria-label={t('Close')} onMouseDown={(e) => e.preventDefault()}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="calc-screen" aria-live="polite">
        <div className="calc-expr">{expr ? read(expr.replace(/-/g, '−')) : ' '}</div>
        <div className={`calc-result${settled ? ' is-settled' : ''}`}>
          {result === null ? (expr ? '—' : read('0')) : read(shown(result))}
        </div>
      </div>

      <div className="calc-pad">
        {key('C', clear, 'calc-key--fn', t('Clear'))}
        {key('⌫', back, 'calc-key--fn', 'Backspace')}
        {key('%', percent, 'calc-key--op')}
        {key('÷', () => op('÷'), 'calc-key--op')}
        {['7', '8', '9'].map((d) => key(read(d), () => digit(d), '', d))}
        {key('×', () => op('×'), 'calc-key--op')}
        {['4', '5', '6'].map((d) => key(read(d), () => digit(d), '', d))}
        {key('−', () => op('-'), 'calc-key--op', 'minus')}
        {['1', '2', '3'].map((d) => key(read(d), () => digit(d), '', d))}
        {key('+', () => op('+'), 'calc-key--op')}
        {key(read('00'), () => digit('00'), '', '00')}
        {key(read('0'), () => digit('0'), '', '0')}
        {key('.', () => digit('.'), '', 'point')}
        {key('=', equals, 'calc-key--eq', 'equals')}
      </div>

      <div className="calc-actions">
        <button
          type="button"
          className="calc-act"
          onClick={bill}
          onMouseDown={(e) => e.preventDefault()}
          disabled={billTotal <= 0}
          title={t('Put the bill total in the sum')}
        >
          <ReceiptText className="h-3.5 w-3.5" /> {t('Bill')} ৳{read(shown(billTotal))}
        </button>
        <button
          type="button"
          className="calc-act calc-act--primary"
          onClick={() => result !== null && result >= 0 && onUseAsCash(plain(result))}
          onMouseDown={(e) => e.preventDefault()}
          disabled={result === null || result < 0}
          title={t('Put the answer in the cash box')}
        >
          <Banknote className="h-3.5 w-3.5" /> {t('Use as cash')}
        </button>
      </div>

      {history.length > 0 && (
        <ul className="calc-history">
          {history.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setExpr(String(h.result));
                  setSettled(true);
                }}
                onMouseDown={(e) => e.preventDefault()}
                title={t('Use this answer again')}
              >
                <span className="truncate">{read(h.expr.replace(/-/g, '−'))}</span>
                <b>= {read(shown(h.result))}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
