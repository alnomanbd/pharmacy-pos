import { create } from 'zustand';
import type { AuthUser } from '../types';

/**
 * A support view an operator is looking through.
 *
 * It carries only what the banner has to say. The operator's own session is not
 * kept aside here: it lives on the console, which this app does not disturb, so
 * leaving a support view ends it rather than swapping back.
 */
export interface Impersonation {
  shop: string;
  userName: string;
  operator: string;
  /** ISO time the read-only token dies. There is no refresh behind it. */
  expiresAt: string;
}

interface AuthState {
  user: AuthUser | null;
  /**
   * Held in memory only, and deliberately so.
   *
   * It used to be persisted alongside the refresh token, which meant one
   * injected script could read a session that renewed itself forever. Now a
   * reload throws this away and `restoreSession()` trades the httpOnly cookie
   * for a new one — see `api/client.ts` and the API's `utils/cookies.ts`.
   *
   * The one exception is a support view, which has no cookie behind it — see
   * `SUPPORT_KEY` below.
   */
  accessToken: string | null;
  impersonating: Impersonation | null;
  /** False until the start-up refresh has been tried, so the router waits. */
  hydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setUser: (user: AuthUser) => void;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  markHydrated: () => void;
  /** Opens a read-only support view handed over by the operator console. */
  startImpersonation: (session: { accessToken: string; user: AuthUser; view: Impersonation }) => void;
  endImpersonation: () => void;
}

/**
 * Where a support view survives a reload: `sessionStorage`, this tab only.
 *
 * It was handed over by the console and has no refresh cookie behind it, so a
 * reload would otherwise drop the operator on the login page halfway through a
 * call. The token is read-only and dies in thirty minutes, and the copy dies
 * with the tab. Ordinary sessions never touch it.
 */
const SUPPORT_KEY = 'dawai.support-view';

interface SavedView {
  accessToken: string;
  user: AuthUser;
  view: Impersonation;
}

function readSaved(): SavedView | null {
  try {
    const raw = sessionStorage.getItem(SUPPORT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedView;
    // A dead token is no session: dropped rather than shown with a banner.
    if (!saved?.accessToken || !(new Date(saved.view?.expiresAt).getTime() > Date.now())) {
      sessionStorage.removeItem(SUPPORT_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

function writeSaved(saved: SavedView | null) {
  try {
    if (saved) sessionStorage.setItem(SUPPORT_KEY, JSON.stringify(saved));
    else sessionStorage.removeItem(SUPPORT_KEY);
  } catch {
    /* A locked store only costs the view its reload. */
  }
}

const saved = typeof window === 'undefined' ? null : readSaved();

export const useAuthStore = create<AuthState>()((set) => ({
  user: saved?.user ?? null,
  accessToken: saved?.accessToken ?? null,
  impersonating: saved?.view ?? null,
  hydrated: false,
  // Any real session replacing this one ends a support view with it.
  setAuth: (user, accessToken) => {
    writeSaved(null);
    set({ user, accessToken, impersonating: null });
  },
  setUser: (user) => set({ user }),
  login: (user, accessToken) => {
    writeSaved(null);
    set({ user, accessToken, impersonating: null });
  },
  logout: () => {
    writeSaved(null);
    set({ user: null, accessToken: null, impersonating: null });
  },
  markHydrated: () => set({ hydrated: true }),
  startImpersonation: ({ accessToken, user, view }) => {
    writeSaved({ accessToken, user, view });
    set({ user, accessToken, impersonating: view });
  },
  endImpersonation: () => {
    writeSaved(null);
    set({ user: null, accessToken: null, impersonating: null });
  },
}));
