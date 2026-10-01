import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Delete, X, GripHorizontal } from 'lucide-react';
import { insertIntoBanglaField, backspaceBanglaField, hasBanglaTarget } from './BanglaField';
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
 * The two are complementary, not alternatives. Phonetic for speed on ordinary
 * words; this for the letter you cannot spell, the mark you cannot find, and the
 * salesman who would rather not learn a scheme at all.
 *
 * ## Why it floats, and why it is draggable
 *
 * It began as a panel inline in the form, directly under the switch that opened
 * it — which put five rows of keys on top of the very field being typed into.
 * You could not read what you were writing, which defeats the purpose of a
 * keyboard.
 *
 * So it is a floating window: fixed to the viewport, in a portal (a page with
 * `overflow` would otherwise clip it), and dragged by its title bar to wherever
 * the typist's own text is not. Where they put it is remembered, because moving
 * it for every customer is its own annoyance.
 *
 * It is deliberately **not** a modal: no backdrop, nothing to dismiss, and the
 * page behind it stays live. A modal would take focus, and the field it types
 * into is on that page — which is also why every control here swallows its own
 * `pointerdown`/`mousedown`.
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

/**
 * The consonants, in order, as one list.
 *
 * Not cut into rows here. Five-to-a-row is how a বর্ণমালা poster prints them,
 * and it was tried — it made a tall narrow block with two thirds of the panel
 * empty beside it, and the eye has to travel seven rows to reach `হ`. The rows
 * are computed instead, filled to the width of the panel.
 */
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
const CONJUNCTS = ['ক্ষ', 'জ্ঞ', 'ঞ্জ', 'ঙ্গ', 'ত্র', 'দ্ধ', 'ন্ত', 'ম্প', 'স্থ', 'শ্র', 'হ্ম', '্য', '্র'];

const DIGITS = ['১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০'];

const PUNCTUATION = ['।', ',', '?', '!', '-', '(', ')', '/', '%', '৳'];

/**
 * One captioned block of keys.
 *
 * The caption is in Bangla, because the person reading it is looking for a
 * Bangla letter.
 */
function Group({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="bnk-group">
      <span className="bnk-cap" lang="bn">
        {caption}
      </span>
      <div className="bnk-group-keys">{children}</div>
    </div>
  );
}

/**
 * How many keys fit across the panel. Rows are filled up to this.
 *
 * Twelve rather than ten so the eleven vowels are a single full line. With ten
 * they balanced into 6 and 5 — no stub, but keys half again as wide as the
 * consonants below them, which made the sections look like different keyboards.
 */
const PER_ROW = 12;

/**
 * Splits a list into rows of nearly equal length.
 *
 * Plain chunking is what this replaces, and the difference is visible: eleven
 * vowels chunked by five give rows of 5, 5 and **1** — a single key sitting
 * alone under a full row, which reads as a mistake. Balanced, the same eleven
 * give 6 and 5.
 *
 * So: as few rows as will hold the list, and then the keys spread evenly across
 * them, so no row is ever more than one key shorter than another.
 */
function rows<T>(items: T[], perRow = PER_ROW): T[][] {
  const count = Math.max(1, Math.ceil(items.length / perRow));
  const out: T[][] = [];
  let taken = 0;
  for (let i = 0; i < count; i++) {
    // The remainder is spread over the first rows rather than dumped on the
    // last one, which is what keeps the difference to a single key.
    const size = Math.ceil((items.length - taken) / (count - i));
    out.push(items.slice(taken, taken + size));
    taken += size;
  }
  return out;
}

function Key({
  char,
  label,
  tone,
}: {
  char: string;
  label?: string;
  /** `mark` for a sign that attaches to a letter — drawn quieter than a letter. */
  tone?: 'mark';
}) {
  return (
    <button
      type="button"
      className={`bnk-key${tone === 'mark' ? ' bnk-key--mark' : ''}`}
      // The field must not lose focus, or there is nothing to type into: a
      // click blurs before it fires, so the mousedown is swallowed here.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => insertIntoBanglaField(char)}
      aria-label={`Insert ${char}`}
      lang="bn"
    >
      {label ?? char}
    </button>
  );
}

/** Where the panel sits, in viewport pixels. */
interface Position {
  x: number;
  y: number;
}

const POSITION_KEY = 'dawai.banglaKeyboard.position';

/**
 * The panel's size before it has been rendered and measured.
 *
 * A fallback only. The real height is measured, because guessing it wrong is
 * not cosmetic: at an assumed 300px on a 720px-tall screen the panel sat low
 * enough that its consonant rows — most of the keyboard — were below the fold,
 * with nothing to scroll. The keys were there, visible to a test, and
 * unreachable by a hand.
 */
const PANEL = { width: 506, height: 372 };

interface Size {
  width: number;
  height: number;
}

/**
 * Keeps the whole panel on screen.
 *
 * Both edges matter and for different reasons: dragged off the right or the
 * bottom it is hard to get back (and the position is remembered, so a bad drag
 * would persist), and placed too low its own lower half is unusable.
 */
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
    // Clamped on read as well as on write: the window may have been resized, or
    // this may be a different screen from the one it was placed on.
    return clamp(saved);
  } catch {
    // Private mode, blocked site data, or a malformed value — none of which is
    // a reason not to show a keyboard.
    return defaultPosition();
  }
}

export function BanglaKeyboard({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<'letters' | 'conjuncts' | 'numbers'>('letters');

  /*
   * Whether a tap has anywhere to go.
   *
   * Without this the keyboard is silent when no text box has been focused —
   * which is exactly what a person does: open the keyboard first, then wonder
   * why nothing happens. Recomputed on focus changes rather than held once,
   * because focus moves for reasons this component never hears about.
   */
  const [hasTarget, setHasTarget] = useState(hasBanglaTarget());

  useEffect(() => {
    const check = () => setHasTarget(hasBanglaTarget());
    check();
    document.addEventListener('focusin', check, true);
    document.addEventListener('focusout', check, true);
    return () => {
      document.removeEventListener('focusin', check, true);
      document.removeEventListener('focusout', check, true);
    };
  }, []);
  const [position, setPosition] = useState<Position>(storedPosition);
  const [dragging, setDragging] = useState(false);
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

  /*
   * Pulled back on screen after every render that can change its size: opening
   * it, switching pane (the letters pane is much taller than the numbers one),
   * and the window being resized. The first pass matters most — the initial
   * position is computed from the fallback height, before there is anything to
   * measure.
   */
  useEffect(() => {
    const fit = () => setPosition((p) => clampTo(p, measure()));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [tab, measure]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
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
      // browser silently ignores and the *stored* position then keeps — the
      // panel would come back next time with no position at all.
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
      setPosition(
        clampTo(
          { x: event.clientX - grab.current.x, y: event.clientY - grab.current.y },
          measure(),
        ),
      );
    };
    const end = () => setDragging(false);

    // On the window, not the handle: a fast drag outruns the element, and
    // releasing outside it would otherwise leave the panel stuck to the cursor.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging, measure]);

  // Remembered once the drag ends rather than on every frame: that would be a
  // storage write per mouse move.
  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
      /* storage unavailable — the keyboard still works, it just forgets */
    }
  }, [dragging, position]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      setPosition((p) => clampTo({ x: p.x + dx, y: p.y + dy }, measure()));
    },
    [measure],
  );

  return createPortal(
    <div
      ref={panel}
      className={`bnk bnk--float no-print ${dragging ? 'is-dragging' : ''}`}
      role="group"
      aria-label="Bangla keyboard"
      style={{ left: position.x, top: position.y, width: PANEL.width }}
    >
      {!hasTarget && (
        <p className="bnk-nowhere" role="status">
          টাইপ করার ঘরে একবার ক্লিক করুন — তারপর এখান থেকে লিখুন।
        </p>
      )}

      {/*
        The title bar doubles as the drag handle. It is also focusable and
        arrow-key movable, because a pointer drag is not available to everyone.
      */}
      <div
        className="bnk-drag"
        onPointerDown={startDrag}
        role="button"
        tabIndex={0}
        aria-label="Move the Bangla keyboard"
        onKeyDown={(e) => {
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
        <GripHorizontal className="bnk-grip h-4 w-4" />
        <span className="bnk-title" lang="bn">
          বাংলা কীবোর্ড
        </span>
        <span className="bnk-spacer" />
        {onClose && (
          <button
            type="button"
            className="bnk-win"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            aria-label="Close the Bangla keyboard"
            title="বন্ধ করুন"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="bnk-bar">
        <div className="bnk-tabs" role="tablist">
          {(
            [
              ['letters', 'অক্ষর'],
              ['conjuncts', 'যুক্তাক্ষর'],
              ['numbers', 'সংখ্যা'],
            ] as [typeof tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`bnk-tab ${tab === key ? 'is-on' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab(key)}
              lang="bn"
            >
              {label}
            </button>
          ))}
        </div>

        <span className="bnk-spacer" />

        <button
          type="button"
          className="bnk-key bnk-key--util bnk-wide"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertIntoBanglaField(' ')}
          aria-label="Insert a space"
          lang="bn"
        >
          স্পেস
        </button>
        <button
          type="button"
          className="bnk-key bnk-key--util"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => backspaceBanglaField()}
          aria-label="Backspace"
          title="মুছুন"
        >
          <Delete className="h-4 w-4" />
        </button>
      </div>

      {tab === 'letters' && (
        <div className="bnk-pad">
          {/*
            Captioned groups, rows filled to the width of the panel.

            The captions stay because fifty keys in one undifferentiated grid is
            a wall — স্বরবর্ণ, কার ও চিহ্ন and ব্যঞ্জনবর্ণ is how the letters are
            named and taught, so it is how they are found.

            What went: five-to-a-row (the poster layout) and the two columns it
            forced. Five wide made the consonants seven rows tall in a block a
            third of the panel's width, with a stub row at the bottom and empty
            space beside all of it. Filled rows put the same letters in four
            lines a reader can scan.
          */}
          <Group caption="স্বরবর্ণ">
            {rows(VOWELS).map((row) => (
              <div className="bnk-row" key={row.join('')}>
                {row.map((c) => (
                  <Key key={c} char={c} />
                ))}
              </div>
            ))}
          </Group>

          <Group caption="কার ও চিহ্ন">
            {rows([...MATRAS, ...MARKS]).map((row) => (
              <div className="bnk-row" key={row.join('')}>
                {row.map((c) => (
                  <Key key={c} char={c} label={`◌${c}`} tone="mark" />
                ))}
              </div>
            ))}
          </Group>

          <Group caption="ব্যঞ্জনবর্ণ">
            {rows(CONSONANTS).map((row) => (
              <div className="bnk-row" key={row.join('')}>
                {row.map((c) => (
                  <Key key={c} char={c} />
                ))}
              </div>
            ))}
          </Group>
        </div>
      )}

      {tab === 'conjuncts' && (
        <div className="bnk-pad">
          {rows(CONJUNCTS).map((row) => (
            <div className="bnk-row" key={row.join('')}>
              {row.map((c) => (
                <Key
                  key={c}
                  char={c}
                  label={c.startsWith('্') ? `◌${c}` : c}
                  tone={c.startsWith('্') ? 'mark' : undefined}
                />
              ))}
            </div>
          ))}
          <p className="bnk-hint">
            যুক্তাক্ষর নিজে বানাতে দুই বর্ণের মাঝে <span lang="bn">◌্</span> (হসন্ত) দিন।
          </p>
        </div>
      )}

      {tab === 'numbers' && (
        <div className="bnk-pad">
          <Group caption="সংখ্যা">
            {rows(DIGITS).map((row) => (
              <div className="bnk-row" key={row.join('')}>
                {row.map((c) => (
                  <Key key={c} char={c} />
                ))}
              </div>
            ))}
          </Group>
          <Group caption="যতিচিহ্ন">
            {rows(PUNCTUATION).map((row) => (
              <div className="bnk-row" key={row.join('')}>
                {row.map((c) => (
                  <Key key={c} char={c} />
                ))}
              </div>
            ))}
          </Group>
          <p className="bnk-hint">
            ঔষধের মাত্রা ও তারিখ ইংরেজি অঙ্কেই লেখা ভালো — <b>500 mg</b>, <b>1+0+1</b> — কারণ
            ফার্মেসি ও ল্যাব সেটাই পড়ে।
          </p>
        </div>
      )}
    </div>,
    document.body,
  );
}
