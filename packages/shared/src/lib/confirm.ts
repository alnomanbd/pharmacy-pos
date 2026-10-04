import type { ReactNode } from 'react';
import { create } from 'zustand';

/**
 * "Are you sure?" before anything that cannot simply be clicked away.
 *
 * One line at the button — `if (!(await confirmAction({...}))) return;` — and
 * one dialog for the whole app (`ConfirmHost`), so every export, delete, send
 * and close asks the same way, in the shop's own words and language. The
 * browser's `window.confirm` cannot be translated or styled, and on a counter
 * PC it is a grey box people learn to dismiss without reading.
 *
 * Asked for: an export that ran the moment it was clicked, so a slip of the
 * mouse put the whole register in the downloads folder.
 */

export type ConfirmTone = 'danger' | 'normal';
export type ConfirmIcon = 'export' | 'send' | 'delete' | 'warning' | 'question' | 'import' | 'close';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  message?: ReactNode;
  /** The verb on the button — "Export", "Send to 41 customers" — never just "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for what takes something away or reaches a customer: red, and Cancel has the focus. */
  tone?: ConfirmTone;
  icon?: ConfirmIcon;
}

interface Pending {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  current: Pending | null;
  queue: Pending[];
  answer: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  queue: [],
  answer: (ok) => {
    const { current, queue } = get();
    current?.resolve(ok);
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
  },
}));

/**
 * Asks, and resolves `true` only for a yes. Two asked at once are asked in
 * turn, never on top of each other.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const pending = { options, resolve };
    const { current, queue } = useConfirmStore.getState();
    if (current) useConfirmStore.setState({ queue: [...queue, pending] });
    else useConfirmStore.setState({ current: pending });
  });
}
