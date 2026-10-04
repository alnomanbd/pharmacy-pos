import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Delete, X, GripHorizontal, Keyboard } from 'lucide-react';
import { insertIntoBanglaField, backspaceBanglaField, hasBanglaTarget, banglaTarget } from './BanglaField';
import './BanglaKeyboard.css';

/**
 * An on-screen Bangla keyboard.
 *
 * The phonetic keyboard covers most typing, but it asks the typist to know the
 * scheme: `তোমাকে` is `tOmake`, not `tomake`, and a word the dictionary does not
 * carry comes out spelled the way it sounds. That is a fine trade for a typist
 * who knows Avro and a wall for one who does not — and either way there is no
 * way to reach `ঁ` or `ৎ` by guessing.
 *
 * So: every letter, on screen, one tap each. It types into whichever text field
 * has the cursor — not only the Bangla fields, but any input on any page,
 * because a customer's name and a supplier's name get typed in Bangla too.
 *
 * ## How it is laid out
 *
 * Four panes — consonants with their signs, vowels, conjuncts, numbers — named
 * in the title bar, so the keyboard is as tall as one pane and not all of them.
 * (With every group stacked under a caption it stood taller than the page it
 * was typing into.) Every pane is the height of the tallest, so the bottom row
 * does not jump when the pane changes.
 *
 * One grid, twelve keys across, for every block — a vowel, a sign and a
 * consonant are the same size and sit in the same columns. Vowels are tinted,
 * signs sit on a dashed cap the way a primer prints `◌া`, consonants are plain.
 *
 * Space and backspace sit along the bottom, where every keyboard has them, and a
 * line along the top shows the end of what is in the field — because the field
 * is often under the keyboard, and that line is what stops it being typed blind.
 *
 * ## Floating on a desk, docked on a phone
 *
 * On a wide screen it is a floating window, dragged by its title bar to
 * wherever the typist's own text is not, and remembered there. It is not a
 * modal: no backdrop, and the page stays live — every control here swallows its
 * own `mousedown` so the field keeps its focus.
 *
 * A phone has no room for a window, so there it is a sheet along the bottom, the
 * full width of the screen, like the phone's own keyboard. While it is open the
 * phone's keyboard is told to stay down (`inputmode="none"` on the field being
 * typed into), or the two would stack.
 */

/** The rows, grouped the way a Bengali chart is — not the way a QWERTY key is. */
const VOWELS = ['অ', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'ঋ', 'এ', 'ঐ', 'ও', 'ঔ'];

/**
 * The vowel signs, shown attached to a dotted circle.
 *
 * `া` alone in a key cap is a floating stroke nobody recognises; `◌া` is how it
 * appears in every Bengali primer, and it makes clear that the key modifies the
 * letter before it rather than standing on its own.
 */
const MATRAS = ['া', 'ি', 'ী', 'ু', 'ূ', 'ৃ', 'ে', 'ৈ', 'ো', 'ৌ'];

/** Hasant, chandrabindu, anusvara, visarga, khanda ta — unreachable by guessing. */
const MARKS = ['্', 'ঁ', 'ং', 'ঃ', 'ৎ'];

/** The consonants, in chart order. The grid fills them to the panel's width. */
const CONSONANTS = [
  'ক', 'খ', 'গ', 'ঘ', 'ঙ',
  'চ', 'ছ', 'জ', 'ঝ', 'ঞ',
  'ট', 'ঠ', 'ড', 'ঢ', 'ণ',
  'ত', 'থ', 'দ', 'ধ', 'ন',
  'প', 'ফ', 'ব', 'ভ', 'ম',
  'য', 'র', 'ল', 'শ', 'ষ',
  'স', 'হ', 'ড়', 'ঢ়', 'য়',
];

/**
 * The conjuncts that actually come up, as single keys.
 *
 * Reachable by hand — `ক` `্` `ষ` — and nobody does that with a customer waiting.
 */
const CONJUNCTS = ['ক্ষ', 'জ্ঞ', 'ঞ্জ', 'ঙ্গ', 'ত্র', 'দ্ধ', 'ন্ত', 'ম্প', 'স্থ', 'শ্র', 'হ্ম', 'ষ্ট', 'ন্দ', 'ল্প', '্য', '্র'];

const DIGITS = ['১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০'];

const PUNCTUATION = ['।', ',', '?', '!', '-', '(', ')', '/', '%', '৳', ':', '.'];

type Tone = 'vowel' | 'mark' | 'consonant' | 'plain';

/**
 * Four panes, so the keyboard is as tall as one of them rather than all of them.
 *
 * Consonants come first and carry the কার signs with them: a word is a
 * consonant and its sign, again and again — না, পা — and a tab between the two
 * would be a tap per letter. The vowels stand alone (a word starts with one at
 * most), each over its own sign, which is also how a primer teaches them.
 */
type Pane = 'consonants' | 'vowels' | 'conjuncts' | 'numbers';
const PANES: [Pane, string][] = [
  ['consonants', 'ব্যঞ্জন'],
  ['vowels', 'স্বর'],
  ['conjuncts', 'যুক্তাক্ষর'],
  ['numbers', '১২৩'],
];

/** Each vowel's sign, under it — অ has none. */
const VOWEL_SIGNS: Record<string, string> = {
  আ: 'া', ই: 'ি', ঈ: 'ী', উ: 'ু', ঊ: 'ূ', ঋ: 'ৃ', এ: 'ে', ঐ: 'ৈ', ও: 'ো', ঔ: 'ৌ',
};

/** A sign is drawn on the dotted circle it hangs from. */
const isSign = (c: string) => MATRAS.includes(c) || MARKS.includes(c) || c.startsWith('্');

/**
 * One block of keys on the shared grid. Named for screen readers only: the tab
 * already says what the keys are, and a caption over every block was a row of
 * height the keyboard could not spare.
 */
function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="bnk-grid" role="group" aria-label={name} lang="bn">
      {children}
    </div>
  );
}

function Key({ char, tone = 'plain' }: { char: string; tone?: Tone }) {
  const label = isSign(char) ? `◌${char}` : char;
  return (
    <button
      type="button"
      className={`bnk-key bnk-key--${tone}`}
      data-pop={label}
      // The field must not lose focus, or there is nothing to type into: a
      // click blurs before it fires, so the mousedown is swallowed here.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => insertIntoBanglaField(char)}
      aria-label={`Insert ${char}`}
      lang="bn"
    >
      {label}
    </button>
  );
}

/** Where the panel sits, in viewport pixels. */
interface Position {
  x: number;
  y: number;
}

const POSITION_KEY = 'dawai.banglaKeyboard.position';
const WIDTH_KEY = 'dawai.banglaKeyboard.width';

/**
 * How wide the window may be made. The keys scale with it — a bigger keyboard
 * is bigger keys, not more empty space — so the narrowest still has a Bangla
 * letter readable on every key, and the widest is the size of a tablet's own.
 */
const MIN_WIDTH = 380;
const MAX_WIDTH = 900;
/** The size it opens at, and the size its keys are drawn for: `--bnk-s` is 1 here. */
const DEFAULT_WIDTH = 500;

function clampWidth(w: number) {
  const roomy = typeof window === 'undefined' ? MAX_WIDTH : window.innerWidth - 16;
  return Math.round(Math.min(Math.max(MIN_WIDTH, w), Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, roomy))));
}

function storedWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : clampWidth(DEFAULT_WIDTH);
  } catch {
    return clampWidth(DEFAULT_WIDTH);
  }
}

/** Narrower than this, the keyboard is a sheet along the bottom rather than a window. */
const DOCK_BELOW = 640;

/** The panel's size before it has been rendered and measured — a fallback only. */
const PANEL = { width: 500, height: 340 };

interface Size {
  width: number;
  height: number;
}

/** Keeps the whole panel on screen — dragged off an edge it is hard to get back. */
function clampTo({ x, y }: Position, size: Size): Position {
  const maxX = Math.max(8, window.innerWidth - size.width - 8);
  const maxY = Math.max(8, window.innerHeight - size.height - 8);
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY),
  };
}

const clamp = (position: Position) => clampTo(position, PANEL);

/** Bottom-right by default: out of the way of a form that reads top-down. */
function defaultPosition(): Position {
  return clamp({
    x: window.innerWidth - PANEL.width - 24,
    y: window.innerHeight - PANEL.height - 24,
  });
}

function storedPosition(): Position {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return defaultPosition();
    const saved = JSON.parse(raw) as Position;
    if (!Number.isFinite(saved?.x) || !Number.isFinite(saved?.y)) return defaultPosition();
    // Clamped on read as well: the window may have been resized since.
    return clamp(saved);
  } catch {
    return defaultPosition();
  }
}

const isDocked = () => typeof window !== 'undefined' && window.innerWidth < DOCK_BELOW;

/** The end of what is in the field, up to the caret, and a little after it. */
function readTarget(): { before: string; after: string } | null {
  const el = banglaTarget();
  if (!el) return null;
  const caret = el.selectionStart ?? el.value.length;
  const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ⏎ ');
  const before = flat(el.value.slice(0, caret));
  const after = flat(el.value.slice(caret));
  return { before: before.length > 40 ? `…${before.slice(-40)}` : before, after: after.slice(0, 12) };
}

/**
 * Backspace that keeps going while it is held, the way every keyboard's does.
 *
 * The click deletes one, so a tap and the keyboard (Enter or Space on the
 * button) behave the same. Held past a moment, it repeats; the click that ends a
 * held press is then swallowed, or it would delete one more than was meant.
 */
function useRepeatingBackspace() {
  const timers = useRef<{ wait?: number; every?: number }>({});
  const repeated = useRef(false);

  const stop = useCallback(() => {
    window.clearTimeout(timers.current.wait);
    window.clearInterval(timers.current.every);
    timers.current = {};
  }, []);

  useEffect(() => stop, [stop]);

  return {
    onPointerDown: () => {
      repeated.current = false;
      stop();
      timers.current.wait = window.setTimeout(() => {
        repeated.current = true;
        backspaceBanglaField();
        timers.current.every = window.setInterval(backspaceBanglaField, 70);
      }, 420);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick: () => {
      if (repeated.current) {
        repeated.current = false;
        return;
      }
      backspaceBanglaField();
    },
  };
}

export function BanglaKeyboard({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<Pane>('consonants');
  const [docked, setDocked] = useState(isDocked);

  /*
   * Whether a tap has anywhere to go, and what is in that field now.
   *
   * Without the first the keyboard is silent when no text box has been focused —
   * which is exactly what a person does: open the keyboard first, then wonder
   * why nothing happens. Both are re-read whenever focus, the text or the caret
   * moves, because those change for reasons this component never hears about.
   */
  const [hasTarget, setHasTarget] = useState(hasBanglaTarget());
  const [shown, setShown] = useState(readTarget);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      // After the event has settled, so the value and the caret are the new ones.
      frame = requestAnimationFrame(() => {
        setHasTarget(hasBanglaTarget());
        setShown(readTarget());
      });
    };
    check();
    const events = ['focusin', 'focusout', 'input', 'selectionchange', 'keyup'];
    for (const e of events) document.addEventListener(e, check, true);
    return () => {
      cancelAnimationFrame(frame);
      for (const e of events) document.removeEventListener(e, check, true);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setDocked(isDocked());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /*
   * On a touch screen, keep the device's own keyboard down while this one is
   * up: every text box focused while it is open gets `inputmode="none"`, and
   * each gets back what it had when the keyboard closes.
   */
  useEffect(() => {
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (!touch) return;
    const changed = new Map<HTMLElement, string | null>();
    const quiet = (el: Element | null) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (!changed.has(el)) changed.set(el, el.getAttribute('inputmode'));
      el.setAttribute('inputmode', 'none');
    };
    quiet(document.activeElement);
    const onFocus = (e: FocusEvent) => quiet(e.target as Element);
    document.addEventListener('focusin', onFocus, true);
    return () => {
      document.removeEventListener('focusin', onFocus, true);
      for (const [el, was] of changed) {
        if (was === null) el.removeAttribute('inputmode');
        else el.setAttribute('inputmode', was);
      }
    };
  }, []);

  const [position, setPosition] = useState<Position>(storedPosition);
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(storedWidth);
  const [resizing, setResizing] = useState(false);
  const resizeFrom = useRef({ x: 0, width: 0 });
  /** Where in the panel the pointer grabbed it, so it does not jump on grab. */
  const grab = useRef<Position>({ x: 0, y: 0 });
  const panel = useRef<HTMLDivElement | null>(null);

  /** The panel as rendered, which is what has to fit on the screen. */
  const measure = useCallback(
    (): Size => ({
      width: panel.current?.offsetWidth || PANEL.width,
      height: panel.current?.offsetHeight || PANEL.height,
    }),
    [],
  );

  // Pulled back on screen whenever its size can have changed: opening it,
  // switching pane, the window being resized.
  useEffect(() => {
    if (docked) return;
    const fit = () => setPosition((p) => clampTo(p, measure()));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [tab, measure, docked]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (docked) return;
    // Pointer events, so a tablet drags the same way a mouse does.
    // `preventDefault` keeps focus in the field being typed into.
    event.preventDefault();
    grab.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      // A move without coordinates would set the position to NaN, which the
      // stored position would then keep.
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
      setPosition(clampTo({ x: event.clientX - grab.current.x, y: event.clientY - grab.current.y }, measure()));
    };
    const end = () => setDragging(false);
    // On the window, not the handle: a fast drag outruns the element.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging, measure]);

  /*
   * Resizing, by the corner grip: wider is bigger keys, the left edge stays
   * where it is, and the panel is kept on screen as it grows.
   */
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeFrom.current = { x: event.clientX, width };
    setResizing(true);
  };

  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => {
      if (!Number.isFinite(event.clientX)) return;
      setWidth(clampWidth(resizeFrom.current.width + (event.clientX - resizeFrom.current.x)));
    };
    const end = () => setResizing(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [resizing]);

  // A bigger panel may now hang off the screen; and the size is remembered.
  useEffect(() => {
    if (docked) return;
    setPosition((p) => clampTo(p, measure()));
    if (resizing) return;
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* storage unavailable — it just forgets */
    }
  }, [width, resizing, docked, measure]);

  // Remembered once the drag ends, not on every frame.
  useEffect(() => {
    if (dragging || docked) return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
      /* storage unavailable — the keyboard still works, it just forgets */
    }
  }, [dragging, position, docked]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      setPosition((p) => clampTo({ x: p.x + dx, y: p.y + dy }, measure()));
    },
    [measure],
  );

  const backspace = useRepeatingBackspace();
  const swallow = (e: { preventDefault: () => void }) => e.preventDefault();

  return createPortal(
    <div
      ref={panel}
      className={`bnk no-print ${docked ? 'bnk--docked' : 'bnk--float'} ${dragging ? 'is-dragging' : ''} ${
        resizing ? 'is-resizing' : ''
      }`}
      role="group"
      aria-label="Bangla keyboard"
      style={
        docked
          ? undefined
          : ({ left: position.x, top: position.y, width, '--bnk-s': width / DEFAULT_WIDTH } as CSSProperties)
      }
    >
      {/*
        The title bar is the drag handle on a desk. It is also focusable and
        arrow-key movable, because a pointer drag is not available to everyone.
      */}
      <div
        className="bnk-head"
        onPointerDown={startDrag}
        role={docked ? undefined : 'button'}
        tabIndex={docked ? undefined : 0}
        aria-label={docked ? undefined : 'Move the Bangla keyboard'}
        onKeyDown={(e) => {
          if (docked) return;
          const step = e.shiftKey ? 40 : 12;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const delta = moves[e.key];
          if (!delta) return;
          e.preventDefault();
          nudge(delta[0], delta[1]);
        }}
      >
        {docked ? <Keyboard className="bnk-grip h-4 w-4" /> : <GripHorizontal className="bnk-grip h-4 w-4" />}
        {/* The panes, in the title bar: a row of its own was height the keyboard could not spare. */}
        <div className="bnk-tabs" role="tablist" aria-label="বাংলা কীবোর্ড">
          {PANES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`bnk-tab${tab === key ? ' is-on' : ''}`}
              onMouseDown={swallow}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setTab(key)}
              lang="bn"
            >
              {label}
            </button>
          ))}
        </div>
        <span className="bnk-spacer" />
        {onClose && (
          <button
            type="button"
            className="bnk-win"
            onMouseDown={swallow}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label="Close the Bangla keyboard"
            title="বন্ধ করুন"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* What is in the field — often hidden under the keyboard itself. */}
      <div className={`bnk-screen${hasTarget ? '' : ' is-empty'}`}>
        {!hasTarget ? (
          <span className="bnk-nowhere" role="status" lang="bn">
            টাইপ করার ঘরে একবার ক্লিক করুন — তারপর এখান থেকে লিখুন।
          </span>
        ) : (
          <span className="bnk-text" lang="bn">
            {shown?.before}
            <span className="bnk-caret" aria-hidden />
            <span className="bnk-after">{shown?.after}</span>
            {!shown?.before && !shown?.after && <span className="bnk-placeholder">লিখতে শুরু করুন…</span>}
          </span>
        )}
      </div>

      {/* Every pane is the height of the tallest, so the bottom row never moves. */}
      <div className="bnk-body" role="tabpanel">
        {tab === 'consonants' && (
          <>
            {/* ৎ is a consonant — খণ্ড ত — and fills the last slot of the third row. */}
            <Group name="ব্যঞ্জনবর্ণ">
              {[...CONSONANTS, 'ৎ'].map((c) => (
                <Key key={c} char={c} tone="consonant" />
              ))}
            </Group>
            {/* The ten signs, ঁ and ং: one row. Hasant is on the bottom row, ঃ with the vowels. */}
            <Group name="কার ও চিহ্ন">
              {[...MATRAS, 'ঁ', 'ং'].map((c) => (
                <Key key={c} char={c} tone="mark" />
              ))}
            </Group>
          </>
        )}

        {tab === 'vowels' && (
          <>
            <Group name="স্বরবর্ণ">
              {VOWELS.map((c) => (
                <Key key={c} char={c} tone="vowel" />
              ))}
            </Group>
            <Group name="কার">
              {VOWELS.map((c) =>
                VOWEL_SIGNS[c] ? <Key key={c} char={VOWEL_SIGNS[c]} tone="mark" /> : <span key={c} aria-hidden />,
              )}
            </Group>
            <Group name="চিহ্ন">
              {MARKS.map((c) => (
                <Key key={c} char={c} tone="mark" />
              ))}
            </Group>
          </>
        )}

        {tab === 'conjuncts' && (
          <>
            <Group name="যুক্তাক্ষর">
              {CONJUNCTS.map((c) => (
                <Key key={c} char={c} tone={c.startsWith('্') ? 'mark' : 'consonant'} />
              ))}
            </Group>
            <p className="bnk-hint" lang="bn">
              অন্য যুক্তাক্ষর: দুই বর্ণের মাঝে <b>◌্</b> দিন — ক + ◌্ + ত = ক্ত
            </p>
          </>
        )}

        {tab === 'numbers' && (
          <>
            <Group name="সংখ্যা">
              {DIGITS.map((c) => (
                <Key key={c} char={c} tone="vowel" />
              ))}
            </Group>
            <Group name="যতিচিহ্ন">
              {PUNCTUATION.map((c) => (
                <Key key={c} char={c} />
              ))}
            </Group>
            <p className="bnk-hint" lang="bn">
              ঔষধের মাত্রা ইংরেজি অঙ্কেই লেখা ভালো — <b>500 mg</b>, <b>1+0+1</b>
            </p>
          </>
        )}
      </div>

      {/* Along the bottom, where every keyboard keeps them. */}
      <div className="bnk-foot">
        <button
          type="button"
          className="bnk-key bnk-key--fn"
          onMouseDown={swallow}
          onClick={() => insertIntoBanglaField('্')}
          aria-label="Insert hasant"
          title="হসন্ত — যুক্তাক্ষর বানাতে"
          lang="bn"
        >
          ◌্
        </button>
        <button
          type="button"
          className="bnk-key bnk-key--fn"
          onMouseDown={swallow}
          onClick={() => insertIntoBanglaField('।')}
          aria-label="Insert দাঁড়ি"
          lang="bn"
        >
          ।
        </button>
        <button
          type="button"
          className="bnk-key bnk-key--space"
          onMouseDown={swallow}
          onClick={() => insertIntoBanglaField(' ')}
          aria-label="Insert a space"
          lang="bn"
        >
          স্পেস
        </button>
        <button
          type="button"
          className="bnk-key bnk-key--fn bnk-key--back"
          onMouseDown={swallow}
          {...backspace}
          aria-label="Backspace"
          title="মুছুন — চেপে ধরলে মুছতেই থাকবে"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>

      {/* The corner grip: drag to make the whole keyboard bigger or smaller. */}
      {!docked && (
        <div
          className="bnk-resize"
          onPointerDown={startResize}
          onMouseDown={swallow}
          role="slider"
          tabIndex={0}
          aria-label="Resize the Bangla keyboard"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
          title="টেনে ছোট-বড় করুন"
          onKeyDown={(e) => {
            const step = e.shiftKey ? 60 : 20;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setWidth((w) => clampWidth(w + step));
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setWidth((w) => clampWidth(w - step));
            else return;
            e.preventDefault();
          }}
        />
      )}
    </div>,
    document.body,
  );
}
