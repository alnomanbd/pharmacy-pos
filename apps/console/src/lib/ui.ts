/**
 * Small pieces the console's newer screens share: the outline buttons every
 * page already writes out by hand, the server's message out of an error, and
 * "3 days ago".
 */
import { useEffect, useState } from 'react';
import { platformApi } from '../api';
import type { PlatformAccess } from '@dawai/shared/types';

/** The quiet button beside a primary `.btn`. */
export const BTN_OUTLINE =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

/** The same, for something that destroys. */
export const BTN_OUTLINE_DANGER =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50';

/** A square icon button for a table row. */
export const BTN_ICON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

/** A full-size secondary button, for a dialog's foot. */
export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50';

/** The red one, full size. */
export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50';

/** The server's own words, if it sent any. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return msg || fallback;
}

/** "just now", "5 min ago", "3 days ago" — a queue is read by age. */
export function age(value?: string | null): string {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** A value that settles `delay` ms after it stops changing — for search boxes. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return settled;
}

/**
 * What the signed-in operator may do. `null` until it arrives; callers treat
 * that as "no" so a write button never flashes up and then vanishes.
 */
export function useAccess(): PlatformAccess | null {
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  useEffect(() => {
    let live = true;
    platformApi
      .access()
      .then((a) => live && setAccess(a))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return access;
}

export const can = (access: PlatformAccess | null, permission: string) =>
  Boolean(access && (access.isOwner || access.permissions.includes(permission)));
