import { create } from 'zustand';
import api from '@dawai/shared/api/client';

/**
 * Which branch this screen is working in.
 *
 * Kept per device, because a device stands in one branch: the Mirpur counter
 * is always the Mirpur counter. Sent on every call as `X-Branch`; the server
 * checks it against the branches this person may see and ignores anything
 * else, so a stale value here is harmless. A shop with one branch never sets
 * it, and never sees any of this.
 */

const KEY = 'dawai.branch';

const read = () => {
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

interface BranchState {
  /** A branch id, `all`, or empty for "whatever the server defaults to". */
  branch: string;
  /** Bumped when the list of branches changes, so the switcher asks again. */
  version: number;
  pick: (id: string) => void;
  changed: () => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  branch: read(),
  version: 0,
  pick: (id) => {
    try {
      if (id) window.localStorage.setItem(KEY, id);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* private window: it lasts until the tab closes, which is fine */
    }
    set({ branch: id });
  },
  changed: () => set((s) => ({ version: s.version + 1 })),
}));

api.interceptors.request.use((config) => {
  const b = useBranchStore.getState().branch;
  if (b) config.headers['X-Branch'] = b;
  return config;
});

export interface BranchSwitcherInfo {
  count: number;
  branches: { _id: string; name: string; isMain: boolean; address: string; phone: string }[];
  current: string | null;
  canSeeAll: boolean;
}

export const fetchBranchSwitcher = () => api.get<{ data: BranchSwitcherInfo }>('/till/branches').then((r) => r.data.data);
