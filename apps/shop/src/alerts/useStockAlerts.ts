import { useEffect } from 'react';
import { create } from 'zustand';
import { tillApi, type StockAlert, type StockAlerts } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * The shop's bell: what has gone out of date, is about to, has run out, or is
 * running low.
 *
 * One store for the whole app, because the bell in the top bar, the ticker at
 * the foot of the page and the till all show the same four lists, and three
 * copies polling on their own is three answers a few seconds apart.
 */

/** Often enough that a shelf emptied by the last bill shows up before the next customer asks. */
const POLL_MS = 5 * 60_000;
/** What this browser has already been told, this session — so a reload is not a second round of toasts. */
const SEEN_KEY = 'dawai.shop.alerts.seen';
/** Whether the scrolling bar is wanted on this machine. Per browser, like the rail. */
const TICKER_KEY = 'dawai.shop.ticker';

const readSeen = (): Set<string> | null => {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
};

const writeSeen = (keys: Set<string>) => {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    /* A locked store only means the toasts may repeat after a reload. */
  }
};

const readTicker = () => {
  try {
    return localStorage.getItem(TICKER_KEY) !== 'off';
  } catch {
    return true;
  }
};

interface AlertState {
  data: StockAlerts | null;
  /** Bumped by anything that just changed the shelf, so the poller fetches now. */
  nonce: number;
  ticker: boolean;
  /* Closed with its cross: for this visit, across the till and the shop alike. */
  tickerHidden: boolean;
  hideTicker: () => void;
  setData: (data: StockAlerts) => void;
  refresh: () => void;
  setTicker: (on: boolean) => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  data: null,
  nonce: 0,
  ticker: readTicker(),
  tickerHidden: false,
  hideTicker: () => set({ tickerHidden: true }),
  setData: (data) => set({ data }),
  refresh: () => set((s) => ({ nonce: s.nonce + 1 })),
  setTicker: (on) => {
    try {
      localStorage.setItem(TICKER_KEY, on ? 'on' : 'off');
    } catch {
      /* Still honoured for this visit. */
    }
    /* Switching it on from the bell is asking to see it, closed or not. */
    set({ ticker: on, tickerHidden: false });
  },
}));

/** Every alert, most urgent first — the order the bell and the ticker read in. */
export function allAlerts(data: StockAlerts | null): StockAlert[] {
  if (!data) return [];
  return [...data.expired, ...data.out, ...data.expiring, ...data.low];
}

/** Total across the four lists, from the uncapped counts. */
export function alertTotal(data: StockAlerts | null) {
  if (!data) return 0;
  const c = data.counts;
  return c.expired + c.expiring + c.out + c.low;
}

/** Days from now to an expiry, rounded the way a person would say it. */
export function daysUntil(iso?: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * One alert as a sentence, in the counter's language.
 *
 * Numbers go to Bangla digits in Bangla; the batch number does not, because it
 * is matched against the foil.
 */
export function useAlertText() {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const month = (iso?: string | null) => {
    if (!iso) return '';
    const s = new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return lang === 'bn' ? bnNumerals(s) : s;
  };

  return (a: StockAlert) => {
    switch (a.kind) {
      case 'expired':
        return `${a.name}${a.batchNo ? ` · ${t('batch')} ${a.batchNo}` : ''} — ${t('expired')} ${month(a.expiry)} · ${n(a.qty)} ${t('pcs')}`;
      case 'expiring': {
        const d = daysUntil(a.expiry) ?? 0;
        return `${a.name}${a.batchNo ? ` · ${t('batch')} ${a.batchNo}` : ''} — ${t('expires in')} ${n(d)} ${t('days')} · ${n(a.qty)} ${t('pcs')}`;
      }
      case 'out':
        return `${a.name} — ${t('out of stock')}`;
      case 'low':
        return `${a.name} — ${t('only')} ${n(a.qty)} ${t('pcs left')}`;
    }
  };
}

/**
 * Keeps the store fresh and says what is new.
 *
 * Mounted once, by whichever shell is on screen (the shop's layout, or the
 * till, which has none). The first answer of a session becomes one summary
 * toast; after that, anything that was not there last time gets a toast of its
 * own — the shelf that the last bill just emptied — up to three before it
 * falls back to a summary again.
 */
export function useStockAlertsPoll() {
  const { toast } = useToast();
  const t = useT();
  const lang = useUiLang();
  const text = useAlertText();
  const nonce = useAlertStore((s) => s.nonce);
  const setData = useAlertStore((s) => s.setData);

  useEffect(() => {
    let alive = true;
    const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));

    const load = async () => {
      let data: StockAlerts;
      try {
        data = await tillApi.alerts();
      } catch {
        /* A bell that cannot ring is not worth an error toast every five
           minutes; the last answer stays on screen. */
        return;
      }
      if (!alive) return;
      setData(data);

      const list = allAlerts(data);
      const seen = readSeen();
      const fresh = seen ? list.filter((a) => !seen.has(a.key)) : list;
      writeSeen(new Set([...(seen ?? []), ...list.map((a) => a.key)]));
      if (fresh.length === 0) return;

      if (!seen || fresh.length > 3) {
        const c = data.counts;
        const say = (count: number, one: string, many: string) =>
          count ? `${n(count)} ${t(count === 1 ? one : many)}` : '';
        const parts = [
          say(c.expired, 'lot expired', 'lots expired'),
          say(c.out, 'item out of stock', 'items out of stock'),
          say(c.expiring, 'lot expiring soon', 'lots expiring soon'),
          say(c.low, 'item running low', 'items running low'),
        ].filter(Boolean);
        if (parts.length) {
          toast(`🔔 ${parts.join(' · ')}`, c.expired || c.out ? 'warning' : 'info');
        }
        return;
      }
      for (const a of fresh) {
        toast(text(a), a.kind === 'expired' || a.kind === 'out' ? 'warning' : 'info');
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    /* `text` and `t` follow the language, which is already listed. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, lang, setData, toast]);
}
