import { useEffect, useRef } from 'react';

/**
 * The function keys, which is how a counter is actually driven.
 *
 * Every pharmacy POS in this country is worked by somebody who never touches
 * the mouse: F-keys and Enter, because a hand on a keyboard is faster than a
 * hand on a mouse and the person using it has learned the layout by the end of
 * the first week. The mouse targets stay — a touch screen and a new salesman
 * both need them — but nothing here requires one.
 *
 * ## Why this is a hook and not a `keydown` in the component
 *
 * Three things have to be true at once and they fight each other:
 *
 * - **It must work while the search box has focus**, because that is where the
 *   cursor lives all evening. So it listens on the window, not on an element.
 * - **It must not fire while somebody is typing a customer's name.** A plain
 *   letter key belongs to the input; an F-key never does. So single letters and
 *   digits are handed to the field and only the function keys are taken.
 * - **The browser wants some of them.** F1 is help, F3 is find, F5 is reload.
 *   `preventDefault` takes them back, which is right here: on this screen those
 *   browser features are never what somebody meant. F11 is left alone — most
 *   browsers will not give it up, and there is a button for it.
 *
 * The handler map is read through a ref so the listener is bound once and still
 * sees today's closures — otherwise every keystroke would rebind the window.
 */

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

/** What the bottom bar prints, in the order somebody learns them. */
export const SHORTCUT_HINTS: { keys: string; label: string }[] = [
  { keys: 'F1', label: 'Keys' },
  { keys: 'F2', label: 'Find' },
  { keys: 'F4', label: 'Customer' },
  { keys: 'F5', label: 'Discount' },
  { keys: 'F6', label: 'Hold' },
  { keys: 'F7', label: 'Held bills' },
  { keys: 'F8', label: 'Take payment' },
  { keys: 'F9', label: 'Return' },
  { keys: 'F10', label: 'Exact cash' },
  { keys: 'Esc', label: 'Clear' },
];

/** The ones that need a longer word than the bar has room for. */
export const SHORTCUT_HELP: { keys: string; label: string }[] = [
  ...SHORTCUT_HINTS,
  { keys: 'F3', label: 'Calculator' },
  { keys: '⇧F2', label: 'The last bills' },
  { keys: '↑ ↓', label: 'Move down the bill' },
  { keys: '+ −', label: 'One more, one less of the picked line' },
  { keys: '*', label: 'A whole strip of the picked line' },
  { keys: 'Del', label: 'Take the picked line off the bill' },
  { keys: 'Enter', label: 'Add what the search has found' },
];

export function useShortcuts(map: ShortcutMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      /*
       * `shift+F2` and `F2` are two different keys.
       *
       * The map is keyed by what the person pressed, so a shortcut that needs a
       * modifier says so — otherwise Shift+F2 would fire whatever F2 does, and
       * a counter reaching for the last bills would get the search box instead.
       */
      const isFn = /^F\d{1,2}$/.test(e.key);
      /*
       * Modifiers only count on a function key.
       *
       * On most keyboards `+` *is* Shift and `=`, so treating Shift as part of
       * the shortcut would turn "one more of this line" into "shift++" and it
       * would never fire. A function key has no such excuse: ⇧F2 is a key
       * somebody meant to press.
       */
      const combo = isFn
        ? [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', e.key]
            .filter(Boolean)
            .join('+')
        : e.key;
      const handler = ref.current[combo];
      if (!handler) return;

      /*
       * A letter or a digit belongs to whatever is focused; an F-key or Escape
       * never does. Without this, typing "Kabir" into the customer field would
       * fire whatever is bound to "b".
       *
       * The exception is the search box, which holds the cursor all evening and
       * is empty between items. An empty box is not somebody typing — it is the
       * counter waiting — so `+`, `−`, `*`, Del and the arrows reach the bill
       * from there. The moment a letter is in it, the keys are the box's again.
       * Marked with `data-shortcut-passthrough` rather than by id, so the rule
       * is visible on the element it applies to.
       */
      const active = document.activeElement;
      const isField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement;
      const waiting =
        active instanceof HTMLInputElement &&
        active.dataset.shortcutPassthrough !== undefined &&
        active.value === '';
      const isFunctionKey = isFn || e.key === 'Escape';
      if (isField && !waiting && !isFunctionKey) return;

      /* F11 is the browser's own fullscreen and most will not hand it over. */
      if (e.key !== 'F11') e.preventDefault();
      handler(e);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
