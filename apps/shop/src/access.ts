import { useEffect } from 'react';
import { create } from 'zustand';
import api, { getData } from '@dawai/shared/api/client';
import { useAuthStore } from '@dawai/shared/store/auth.store';

/**
 * What the signed-in person may do in this shop — their role's permissions,
 * from the server (`/till/access`). The menu, the pages and the buttons ask
 * here, so a Cashier never sees the stock list and a Store keeper never sees
 * the till. The server refuses the same things anyway; this is only so the
 * app does not offer what it would then refuse.
 *
 * Until the answer arrives, the built-in role's own set stands in, so a page
 * does not flash a "not for you" at an owner on a slow line.
 */

export type ShopPermission =
  | 'pos.sell'
  | 'pos.discount'
  | 'sales.return'
  | 'sales.cancel'
  | 'sales.view_all'
  | 'sales.edit'
  | 'online_orders.manage'
  | 'customers.manage'
  | 'customers.delete'
  | 'stock.view'
  | 'stock.manage'
  | 'purchases.manage'
  | 'transfers.manage'
  | 'reports.view'
  | 'accounts.view'
  | 'accounts.manage'
  | 'accounts.close'
  | 'data.export'
  | 'settings.manage'
  | 'staff.manage'
  | 'branches.manage'
  | 'audit.view';

const SALESMAN: ShopPermission[] = ['pos.sell', 'pos.discount', 'sales.return', 'customers.manage', 'online_orders.manage'];
const NOT_PHARMACIST: ShopPermission[] = ['accounts.close', 'branches.manage', 'audit.view'];

interface AccessState {
  loadedFor: string | null;
  permissions: ShopPermission[] | null;
  roleName: string;
  isOwner: boolean;
  load: (userId: string) => Promise<void>;
  clear: () => void;
}

export const useAccessStore = create<AccessState>((set) => ({
  loadedFor: null,
  permissions: null,
  roleName: '',
  isOwner: false,
  load: async (userId) => {
    try {
      const a = await getData<{ permissions: ShopPermission[]; roleName: string; isOwner: boolean }>(api.get('/till/access'));
      set({ loadedFor: userId, permissions: a.permissions, roleName: a.roleName, isOwner: a.isOwner });
    } catch {
      /* Left on the stand-in; the server still decides every request. */
    }
  },
  clear: () => set({ loadedFor: null, permissions: null, roleName: '', isOwner: false }),
}));

/** Loads (and reloads, when the person changes) what they may do. Call once, high up. */
export function useLoadAccess() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const loadedFor = useAccessStore((s) => s.loadedFor);
  const load = useAccessStore((s) => s.load);
  const clear = useAccessStore((s) => s.clear);
  useEffect(() => {
    if (!userId) {
      clear();
      return;
    }
    if (loadedFor !== userId) void load(userId);
  }, [userId, loadedFor, load, clear]);
  /* Roles can change while somebody is signed in: look again every few minutes. */
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => void load(userId), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [userId, load]);
}

/** `can('stock.view')` — whether this person's role allows it. */
export function useCan() {
  const role = useAuthStore((s) => s.user?.role);
  const permissions = useAccessStore((s) => s.permissions);
  return (p: ShopPermission | null | undefined) => {
    if (!p) return true;
    if (permissions) return permissions.includes(p);
    if (role === 'admin') return true;
    if (role === 'pharmacist') return !NOT_PHARMACIST.includes(p);
    return SALESMAN.includes(p);
  };
}
