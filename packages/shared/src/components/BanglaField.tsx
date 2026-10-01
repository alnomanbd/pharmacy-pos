import { useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { toBangla, isBanglishLetter } from '../lib/banglish';

/**
 * A text field that types Bangla from a Latin keyboard.
 *
 * A shop wants its customers' names, its notes and its own name in Bangla — a
 * customer who cannot read English cannot read their own name on a bill in it —
 * and the counter PC does not have a Bangla layout installed. So this field converts
 * phonetically as you type: `sokal e ekbar` becomes `সকাল এ একবার`.
 *
 * ## Why it buffers the word rather than converting each keystroke
 *
 * A Bengali consonant carries an inherent `অ`, so `o` after a consonant emits
 * *nothing*. That means the text on screen cannot tell you what was typed:
 * after `so` it reads `স`, exactly as `s` alone would, and the next keystroke
 * has to know which — `sokal` is `সকাল` while `skal` is `স্কাল`. Converting
 * character by character off the rendered text therefore gets conjuncts wrong.
 *
 * So each keystroke is appended to a Latin buffer for the word being typed, the
 * whole buffer is re-converted, and the result replaces the previous rendering.
 * The buffer is dropped on anything that ends a word — space, punctuation, a
 * digit, an arrow key, a click elsewhere — which is also what makes a paste or
 * an edit in the middle of existing text behave normally.
 *
 * Turning the switch off leaves an ordinary field: no interception at all, so a
 * typist with their own IME, or one writing English, is not fighting this.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** When false this is a plain field and nothing is intercepted. */
  bangla?: boolean;
  textarea?: boolean;
  className?: string;
  placeholder?: string;
  rows?: number;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * The field an on-screen keyboard types into: whichever one was focused last.
 *
 * Module-level, deliberately. An on-screen keyboard is one panel serving every
 * field on the form, and the alternative — a keyboard rendered inside each
 * field — puts a keyboard under the advice box, another under the complaint box,
 * and a third under every medicine's instruction. This is the same thing a
 * platform's own soft keyboard does: it types into whatever has focus.
 *
 * What is registered is the field's *ref*, not the pair of closures inside it.
 * That distinction is the whole correctness of this: the closures capture
 * `value` from the render that made them, and registering them directly meant
 * every tap after the first wrote into the value as it was when the field was
 * focused — so `ক` then `া` produced `া`, each key replacing the last. Holding
 * the ref reads whatever the current render put there.
 */
interface ActiveField {
  el: HTMLInputElement | HTMLTextAreaElement | null;
  insert: (text: string) => void;
  backspace: () => void;
}

let activeField: { current: ActiveField } | null = null;

type TextControl = HTMLInputElement | HTMLTextAreaElement;

/**
 * The last ordinary text box that had focus, keyboard's own controls excluded.
 *
 * Reported as: open the keyboard from the top bar, tap a letter, nothing
 * happens. The reason was that clicking the keyboard button takes focus off the
 * field — and unless the field was one of the page's own `BanglaField`s, which
 * register themselves, there was nothing left to type into. On a page whose
 * search box is an ordinary `<input>`, every tap went nowhere and the keyboard
 * looked broken.
 *
 * So every text box on the page is remembered as it is focused, and a tap with
 * nothing focused goes back to it. Listener attached once, passive, capture — a
 * focus inside a portal still bubbles to the document.
 */
let lastPlainControl: TextControl | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      const el = event.target;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        // The keyboard's own buttons are not text boxes, so they never land
        // here; a second keyboard-like panel would, which is why this checks
        // the element rather than the event path.
        const typed = el instanceof HTMLInputElement ? el.type.toLowerCase() : 'textarea';
        const writable =
          el instanceof HTMLTextAreaElement ||
          ['text', 'search', 'tel', 'email', 'url', ''].includes(typed);
        if (writable && !el.readOnly && !el.disabled) lastPlainControl = el;
      }
    },
    { capture: true, passive: true },
  );
}

/** Whether a tap on the on-screen keyboard has anywhere at all to go. */
export function hasBanglaTarget(): boolean {
  return Boolean(focusedControl() || activeField?.current?.el || isConnected(lastPlainControl));
}

function isConnected(el: TextControl | null): el is TextControl {
  return Boolean(el && el.isConnected);
}

/** The focused element, if it is somewhere text can be typed. */
function focusedControl(): TextControl | null {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && !el.readOnly && !el.disabled) {
    // Checkboxes and the like have a `value`, but not one a keyboard writes to.
    const typed = el.type.toLowerCase();
    if (['text', 'search', 'tel', 'email', 'url', ''].includes(typed)) return el;
  }
  return null;
}

/**
 * Writes into a field this module does not own — any plain `<input>` on the page.
 *
 * The on-screen keyboard has to work everywhere, not only in its own fields: a
 * customer's name, a supplier's name and the shop's own address are all
 * ordinary inputs, and a salesman who can type a Bangla note but not a Bangla
 * customer name has been given half a feature.
 *
 * Those inputs are React-controlled, and assigning `el.value` on one is
 * invisible to React — the next render puts the old value straight back. So the
 * value goes through the DOM prototype's own setter, bypassing React's patched
 * one, and then an `input` event is dispatched: that is the event React's
 * `onChange` actually listens for, so the owning component updates its state
 * exactly as if the character had been typed.
 */
function writeToPlainControl(el: TextControl, next: string, caret: number) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.setSelectionRange(caret, caret);
}

/**
 * Types `text` at the cursor of whatever text field is focused.
 *
 * A `BanglaField` handles its own insertion, because it also owns the phonetic
 * word buffer that a tapped character has to interrupt. Anything else is written
 * through the DOM.
 */
export function insertIntoBanglaField(text: string) {
  const focused = focusedControl();
  const registered = activeField?.current;

  if (registered && focused && registered.el === focused) {
    registered.insert(text);
    return;
  }

  if (focused) {
    const from = focused.selectionStart ?? focused.value.length;
    const to = focused.selectionEnd ?? from;
    writeToPlainControl(
      focused,
      focused.value.slice(0, from) + text + focused.value.slice(to),
      from + text.length,
    );
    return;
  }

  // Nothing focused. A registered Bangla field first — it owns a phonetic
  // buffer the plain path would not update — and then the last ordinary text
  // box that had focus, which is what makes the keyboard work on every other
  // screen in the app rather than only inside one form.
  if (registered?.el) {
    registered.insert(text);
    return;
  }
  if (isConnected(lastPlainControl)) {
    const el = lastPlainControl;
    const from = el.selectionStart ?? el.value.length;
    const to = el.selectionEnd ?? from;
    writeToPlainControl(el, el.value.slice(0, from) + text + el.value.slice(to), from + text.length);
    // Focus goes back, so the next tap takes the fast path above and the caret
    // is where the person can see it.
    el.focus({ preventScroll: true });
  }
}

/** Deletes one character before the cursor of the focused text field. */
export function backspaceBanglaField() {
  const focused = focusedControl();
  const registered = activeField?.current;

  if (registered && focused && registered.el === focused) {
    registered.backspace();
    return;
  }

  if (focused) {
    const from = focused.selectionStart ?? focused.value.length;
    const to = focused.selectionEnd ?? from;
    if (from !== to) {
      writeToPlainControl(focused, focused.value.slice(0, from) + focused.value.slice(to), from);
    } else if (from > 0) {
      writeToPlainControl(
        focused,
        focused.value.slice(0, from - 1) + focused.value.slice(from),
        from - 1,
      );
    }
    return;
  }

  if (registered?.el) {
    registered.backspace();
    return;
  }
  if (isConnected(lastPlainControl)) {
    const el = lastPlainControl;
    const from = el.selectionStart ?? el.value.length;
    const to = el.selectionEnd ?? from;
    const cutFrom = from === to ? Math.max(0, from - 1) : from;
    writeToPlainControl(el, el.value.slice(0, cutFrom) + el.value.slice(to), cutFrom);
    el.focus({ preventScroll: true });
  }
}

interface WordBuffer {
  /** What was typed, in Latin, for the word under the cursor. */
  latin: string;
  /** Where that word starts in the field's value. */
  start: number;
  /** Where the cursor sat after the last conversion. */
  end: number;
}

export function BanglaField({
  value,
  onChange,
  bangla = false,
  textarea = false,
  ...rest
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const buffer = useRef<WordBuffer | null>(null);
  /*
   * Where to put the cursor once React has re-rendered with the new value.
   *
   * Needed because the field is controlled: setting `selectionStart` during the
   * key handler is undone by the render that follows, which would drop the
   * caret to the end of the field on every keystroke.
   */
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    ref.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  const reset = () => {
    buffer.current = null;
  };

  /**
   * What the on-screen keyboard does to this field.
   *
   * Kept in a ref so the registration does not have to be re-run on every
   * keystroke, while still closing over the latest `value`.
   */
  const ops = useRef<ActiveField>({ el: null, insert: () => {}, backspace: () => {} });
  ops.current = {
    el: ref.current,
    insert: (text: string) => {
      const el = ref.current;
      const from = el?.selectionStart ?? value.length;
      const to = el?.selectionEnd ?? from;
      // A tapped character is finished: it is not part of a phonetic word being
      // spelled out, so the Latin buffer must not absorb it.
      reset();
      onChange(value.slice(0, from) + text + value.slice(to));
      caret.current = from + text.length;
    },
    backspace: () => {
      const el = ref.current;
      const from = el?.selectionStart ?? value.length;
      const to = el?.selectionEnd ?? from;
      reset();
      if (from !== to) {
        onChange(value.slice(0, from) + value.slice(to));
        caret.current = from;
        return;
      }
      if (from === 0) return;
      onChange(value.slice(0, from - 1) + value.slice(from));
      caret.current = from - 1;
    },
  };

  const claimKeyboard = () => {
    activeField = ops;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!bangla) return;
    // Let the browser's own editing and shortcuts through untouched.
    if (event.ctrlKey || event.metaKey || event.altKey) return reset();

    const el = event.currentTarget;
    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? from;

    if (event.key === 'Backspace') {
      const active = buffer.current;
      // Only rewind our own word, and only when the cursor is still at the end
      // of it — otherwise this is an ordinary delete somewhere else.
      if (!active || active.end !== from || from !== to) return reset();

      event.preventDefault();
      const latin = active.latin.slice(0, -1);
      const converted = toBangla(latin);
      onChange(value.slice(0, active.start) + converted + value.slice(active.end));
      caret.current = active.start + converted.length;
      buffer.current = latin
        ? { latin, start: active.start, end: active.start + converted.length }
        : null;
      return;
    }

    if (event.key.length !== 1 || !isBanglishLetter(event.key)) {
      // Space, punctuation, digits, Enter, Tab, arrows: the word is finished.
      return reset();
    }

    event.preventDefault();

    const active = buffer.current;
    const continuing = active && active.end === from && from === to;
    const latin = continuing ? active!.latin + event.key : event.key;
    const start = continuing ? active!.start : from;

    const converted = toBangla(latin);
    onChange(value.slice(0, start) + converted + value.slice(to));
    caret.current = start + converted.length;
    buffer.current = { latin, start, end: start + converted.length };
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Reached by paste, autofill, dictation and the like — nothing to convert,
    // and the buffered word no longer describes the field.
    reset();
    onChange(event.target.value);
  };

  const shared = {
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onFocus: claimKeyboard,
    onBlur: reset,
    // A click or a drag moves the cursor out of the buffered word.
    onMouseDown: reset,
    // `lang` tells the browser which font and line-breaking rules to use, and
    // Bengali needs more line height than Latin at the same size.
    lang: bangla ? 'bn' : undefined,
    ...rest,
  };

  return textarea ? (
    <textarea ref={ref as React.Ref<HTMLTextAreaElement>} {...shared} />
  ) : (
    <input ref={ref as React.Ref<HTMLInputElement>} {...shared} />
  );
}

/**
 * The switch that turns the phonetic keyboard on, with the hint it needs.
 *
 * The hint is not decoration: nobody guesses that `sokal` produces `সকাল`, and
 * somebody who types `s` `o` `k` and watches letters appear and disappear
 * concludes the field is broken.
 */
export function BanglaTypingToggle({
  on,
  onToggle,
  label = 'Bangla typing',
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  label?: string;
}) {
  return (
    <label className="bangla-toggle" title="Type Bangla phonetically, e.g. sokal → সকাল">
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
      <span>{label}</span>
      {on && <em className="bangla-toggle-hint">sokal → সকাল</em>}
    </label>
  );
}
