import { create } from 'zustand';

/**
 * Whether the on-screen Bangla keyboard is open.
 *
 * In a store rather than in a page's state because the shop has two shells —
 * the till and the back room — and a salesman typing a customer's name in
 * Bangla should not lose the keyboard by walking from one to the other.
 */
interface BanglaKeyboardState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const useBanglaKeyboard = create<BanglaKeyboardState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));
