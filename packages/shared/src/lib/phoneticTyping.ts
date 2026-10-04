import { create } from 'zustand';
import { toBangla, isBanglishLetter } from './banglish';

/**
 * Bangla from the ordinary keyboard, in every text box at once.
 *
 * With the switch on Bangla, `amar` typed into any field comes out as `আমার` —
 * a customer's name, an address, a note, a search — without a Bangla layout
 * installed on the counter PC and without each form having to opt in. With it
 * on English (the default) nothing is intercepted at all.
 *
 * It is the same phonetic scheme as `BanglaField` (lib/banglish), applied from
 * one listener on the document rather than inside one component, so a field
 * written next year gets it for nothing.
 *
 * ## Why it buffers the word
 *
 * A Bengali consonant carries an inherent `অ`, so `o` after a consonant emits
 * nothing: after `so` the field reads `স`, exactly as after `s`, and the next
 * key has to know which — `sokal` is `সকাল`, `skal` is `স্কাল`. So the Latin
 * letters of the word being typed are kept, re-converted as a whole on every
 * key, and the result replaces the previous rendering. Anything that ends a
 * word — space, punctuation, a digit, Enter, an arrow, a click, a paste — drops
 * the buffer, which is also what makes an edit in the middle of text behave.
 *
 * ## Fields it leaves alone
 *
 * Whatever is English by nature: email, password, phone, number, date and URL
 * inputs, a numeric `inputmode`, login autocompletes, and anything inside an
 * element marked `data-latin` — the medicine searches, because the catalogue's
 * brand names are English and `napa` must find Napa, not look for নাপা. A
 * `BanglaField` already converting by itself (`data-bangla-own`) is left to it.
 */

const STORE_KEY = 'dawai.typing.bangla';

function stored(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

interface TypingState {
  /** True: every eligible text box types Bangla phonetically. */
  bangla: boolean;
  toggle: () => void;
  set: (bangla: boolean) => void;
}

export const useTypingMode = create<TypingState>((set, get) => ({
  bangla: typeof window === 'undefined' ? false : stored(),
  toggle: () => get().set(!get().bangla),
  set: (bangla) => {
    try {
      localStorage.setItem(STORE_KEY, bangla ? '1' : '0');
    } catch {
      /* storage unavailable — it holds for this visit */
    }
    set({ bangla });
  },
}));

type TextControl = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = ['text', 'search', ''];
const LATIN_INPUTMODES = ['numeric', 'decimal', 'tel', 'email', 'url', 'none'];
const LATIN_AUTOCOMPLETE = ['username', 'email', 'current-password', 'new-password', 'one-time-code', 'tel', 'url'];

/** Whether typing into this element should come out in Bangla. */
export function convertsToBangla(el: EventTarget | null): el is TextControl {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el.readOnly || el.disabled) return false;
  if (el instanceof HTMLInputElement && !TEXT_TYPES.includes(el.type.toLowerCase())) return false;
  if (LATIN_INPUTMODES.includes((el.getAttribute('inputmode') || '').toLowerCase())) return false;
  if (LATIN_AUTOCOMPLETE.includes((el.getAttribute('autocomplete') || '').toLowerCase())) return false;
  if (el.closest('[data-latin]')) return false;
  if (el.hasAttribute('data-bangla-own')) return false;
  return true;
}

interface WordBuffer {
  latin: string;
  start: number;
  end: number;
}

const buffers = new WeakMap<TextControl, WordBuffer>();
const MODIFIER_KEYS = new Set(['Shift', 'CapsLock', 'Control', 'Alt', 'Meta', 'AltGraph', 'Fn', 'NumLock']);
/** Set while this module is writing, so its own `input` event does not reset the word. */
let writing = false;

/**
 * Writes into a React-controlled field: through the prototype's setter, which
 * React does not patch, and then an `input` event — the one `onChange` hears.
 */
function write(el: TextControl, next: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  writing = true;
  try {
    if (setter) setter.call(el, next);
    else el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } finally {
    writing = false;
  }
  el.setSelectionRange(caret, caret);
}

function onKeyDown(event: KeyboardEvent) {
  // Ctrl+Space switches, from anywhere — the shortcut Bangla typists already use.
  if (event.ctrlKey && !event.altKey && !event.metaKey && (event.code === 'Space' || event.key === ' ')) {
    event.preventDefault();
    useTypingMode.getState().toggle();
    return;
  }
  if (!useTypingMode.getState().bangla) return;
  const el = event.target;
  if (!convertsToBangla(el)) return;
  // An input method of the system's own is already composing: leave it be.
  if (event.isComposing) return;
  // Shift on its own is half of a capital — `O` is ও-কার — not the end of the
  // word. Treated as one, `sOnar` lost its `s`.
  if (MODIFIER_KEYS.has(event.key)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) {
    buffers.delete(el);
    return;
  }

  const from = el.selectionStart ?? el.value.length;
  const to = el.selectionEnd ?? from;
  const active = buffers.get(el);

  if (event.key === 'Backspace') {
    // Only our own word, and only with the caret still at its end — otherwise
    // this is an ordinary delete somewhere else.
    if (!active || active.end !== from || from !== to) {
      buffers.delete(el);
      return;
    }
    event.preventDefault();
    const latin = active.latin.slice(0, -1);
    const converted = toBangla(latin);
    write(el, el.value.slice(0, active.start) + converted + el.value.slice(active.end), active.start + converted.length);
    if (latin) buffers.set(el, { latin, start: active.start, end: active.start + converted.length });
    else buffers.delete(el);
    return;
  }

  if (event.key.length !== 1 || !isBanglishLetter(event.key)) {
    // Space, punctuation, digits, Enter, Tab, arrows: the word is finished.
    buffers.delete(el);
    return;
  }

  event.preventDefault();
  const continuing = active && active.end === from && from === to;
  const latin = continuing ? active.latin + event.key : event.key;
  const start = continuing ? active.start : from;
  const converted = toBangla(latin);
  write(el, el.value.slice(0, start) + converted + el.value.slice(to), start + converted.length);
  buffers.set(el, { latin, start, end: start + converted.length });
}

/** A paste, a dictation, the on-screen keyboard: the buffered word no longer describes the field. */
function onForeignInput(event: Event) {
  if (writing) return;
  const el = event.target;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) buffers.delete(el);
}

/** A click or a drag moves the caret out of the word. */
function onPointer(event: Event) {
  const el = event.target;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) buffers.delete(el);
}

function onBlur(event: FocusEvent) {
  const el = event.target;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) buffers.delete(el);
}

let installed = false;

/**
 * Listens on the document, once. Capture phase, so it runs before React's own
 * handlers and a converted key never reaches them as a Latin letter.
 */
export function installPhoneticTyping() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('input', onForeignInput, true);
  document.addEventListener('mousedown', onPointer, true);
  document.addEventListener('focusout', onBlur, true);
}

/** For tests: back to a document with no listener. */
export function uninstallPhoneticTyping() {
  if (!installed) return;
  installed = false;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('input', onForeignInput, true);
  document.removeEventListener('mousedown', onPointer, true);
  document.removeEventListener('focusout', onBlur, true);
}
