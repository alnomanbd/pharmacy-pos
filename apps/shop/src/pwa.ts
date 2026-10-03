import { useEffect, useState } from 'react';
import api from '@dawai/shared/api/client';

/**
 * The shop app on a phone's home screen, and alerts on that phone.
 *
 * The service worker (public/sw.js) is registered once on load. The browser's
 * install offer arrives as an event that has to be caught early and kept for
 * when the owner presses the button; iPhones never send it, and are told
 * where Safari keeps "Add to Home Screen" instead.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Whether the app can be installed from a button, is already installed, or needs the iPhone steps. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIos() && !isStandalone(),
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      changed();
      return outcome === 'accepted';
    },
  };
}

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

export type PushKind = 'takings' | 'stock' | 'orders';

export const pushSupported = () =>
  typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'Computer';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' · ');
}

export interface PushState {
  subscribed: boolean;
  kinds: PushKind[];
  phones: number;
}

export const pushApi = {
  state: async (): Promise<PushState> => {
    const sub = await currentSubscription();
    if (!sub) return { subscribed: false, kinds: [], phones: 0 };
    const { data } = await api.post('/shop/push/me', { endpoint: sub.endpoint });
    return data.data as PushState;
  },
  /** Asks for permission if it has not been given, and signs this phone up. */
  enable: async (kinds: PushKind[]): Promise<PushState> => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('denied');
    const { data } = await api.get('/shop/push/key');
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.data.publicKey) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const res = await api.post('/shop/push/subscribe', { subscription: { endpoint: json.endpoint, keys: json.keys }, kinds, device: deviceName() });
    return res.data.data as PushState;
  },
  kinds: async (kinds: PushKind[]): Promise<PushState> => {
    const sub = await currentSubscription();
    if (!sub) throw new Error('not-subscribed');
    const { data } = await api.patch('/shop/push/kinds', { endpoint: sub.endpoint, kinds });
    return data.data as PushState;
  },
  disable: async () => {
    const sub = await currentSubscription();
    if (!sub) return;
    await api.post('/shop/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  },
  test: async () => {
    const sub = await currentSubscription();
    if (!sub) throw new Error('not-subscribed');
    await api.post('/shop/push/test', { endpoint: sub.endpoint });
  },
};
