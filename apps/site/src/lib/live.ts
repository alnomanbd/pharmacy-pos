'use client';

import * as React from 'react';
import { siteConfig } from '@/lib/site';

/**
 * What the console sets for the website (Website page), read once per visit.
 *
 * The site is a static export, so anything that is a business decision — the
 * WhatsApp number, the yearly offer, the calculator's assumptions, whether the
 * demo and the live numbers are shown — comes from the API instead of the
 * build. Until the answer arrives the defaults below stand in, and they are
 * the same as the API's own.
 */
export interface SiteSettings {
  whatsapp: string;
  yearlyFreeMonths: number;
  showLiveStats: boolean;
  calculator: {
    expiryLossPercent: number;
    expirySavedPercent: number;
    bakiLossPercent: number;
    closeMinutesPaper: number;
    closeMinutesDawai: number;
  };
  demo: { enabled: boolean };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  whatsapp: siteConfig.whatsapp,
  yearlyFreeMonths: 2,
  showLiveStats: true,
  calculator: { expiryLossPercent: 2, expirySavedPercent: 70, bakiLossPercent: 1, closeMinutesPaper: 45, closeMinutesDawai: 2 },
  demo: { enabled: true },
};

let settingsPromise: Promise<SiteSettings> | null = null;
let settingsValue: SiteSettings | null = null;

function loadSettings() {
  settingsPromise ??= fetch(`${siteConfig.apiUrl}/public/site`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { data?: Partial<SiteSettings> } | null) => {
      const d = j?.data ?? {};
      settingsValue = {
        ...DEFAULT_SETTINGS,
        ...d,
        calculator: { ...DEFAULT_SETTINGS.calculator, ...(d.calculator ?? {}) },
        demo: { ...DEFAULT_SETTINGS.demo, ...(d.demo ?? {}) },
      };
      return settingsValue;
    })
    .catch(() => DEFAULT_SETTINGS);
  return settingsPromise;
}

export function useSiteSettings(): SiteSettings {
  const [s, setS] = React.useState<SiteSettings>(settingsValue ?? DEFAULT_SETTINGS);
  React.useEffect(() => {
    let live = true;
    void loadSettings().then((v) => live && setS(v));
    return () => {
      live = false;
    };
  }, []);
  return s;
}

/** The months charged when `months` are bought at once — the API's own rule. */
export function chargedMonths(months: number, free: number) {
  if (months < 12 || free <= 0) return months;
  return Math.max(1, months - Math.floor(months / 12) * free);
}

/**
 * Opens the demo shop: asks the API for a one-time code and sends the visitor
 * to the shop app, which trades it for a read-only session.
 */
export async function openDemo(): Promise<boolean> {
  try {
    const r = await fetch(`${siteConfig.apiUrl}/public/demo`, { method: 'POST' });
    const j = (await r.json()) as { data?: { code?: string } };
    if (!r.ok || !j.data?.code) return false;
    window.location.assign(`${siteConfig.appUrl}/support/claim?c=${j.data.code}`);
    return true;
  } catch {
    return false;
  }
}
