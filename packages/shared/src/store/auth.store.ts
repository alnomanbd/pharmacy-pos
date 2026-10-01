import { create } from 'zustand';
import type { AuthUser } from '../types';

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
   * Nothing else here is worth keeping across a reload either: the user comes
   * back with the refreshed token, so the store is not persisted at all.
   */
  accessToken: string | null;
  /** False until the start-up refresh has been tried, so the router waits. */
  hydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setUser: (user: AuthUser) => void;
  login: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  markHydrated: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  hydrated: false,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setUser: (user) => set({ user }),
  login: (user, accessToken) => set({ user, accessToken }),
  logout: () => set({ user: null, accessToken: null }),
  markHydrated: () => set({ hydrated: true }),
}));
