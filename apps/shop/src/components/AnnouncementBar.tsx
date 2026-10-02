import { useEffect, useRef, useState } from 'react';
import { Info, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { announcementsApi, type ShopAnnouncement } from '../api';
import { useT, useUiLang } from '../i18n/ui';

/**
 * The team's announcements, across the top of every screen — the till too.
 *
 * "Maintenance tonight from 11 pm" is for whoever is at the counter, not only
 * the owner's inbox. In the flow above the app, like the support-view banner,
 * and measured the same way: its height goes into `--announce-h`, which the
 * shell and the till take off their own (see styles/index.css).
 *
 * Closing one is remembered per browser, by id *and* last edit — so a notice
 * that is changed afterwards ("now from midnight") is shown again.
 */

const DISMISSED_KEY = 'dawai.announcements.dismissed';
const POLL_MS = 10 * 60 * 1000;
const PLATFORM_ROLES = ['platformAdmin', 'platformStaff'];

const stamp = (a: ShopAnnouncement) => `${a._id}:${a.updatedAt}`;

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(-50) : [];
  } catch {
    return [];
  }
}

const TONE = {
  info: { cls: 'bg-primary/10 text-foreground', icon: Info, iconCls: 'text-primary' },
  warning: { cls: 'bg-amber-500/15 text-foreground', icon: AlertTriangle, iconCls: 'text-amber-600 dark:text-amber-400' },
  success: { cls: 'bg-emerald-500/15 text-foreground', icon: CheckCircle2, iconCls: 'text-emerald-600 dark:text-emerald-400' },
} as const;

export default function AnnouncementBar() {
  const t = useT();
  const lang = useUiLang();
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const [rows, setRows] = useState<ShopAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const box = useRef<HTMLDivElement | null>(null);

  const signedIn = Boolean(token && role && !PLATFORM_ROLES.includes(role));

  useEffect(() => {
    if (!signedIn) {
      setRows([]);
      return;
    }
    let live = true;
    const ask = () =>
      announcementsApi
        .list()
        .then((r) => live && setRows(r))
        .catch(() => undefined);
    void ask();
    const tick = window.setInterval(() => document.visibilityState === 'visible' && void ask(), POLL_MS);
    return () => {
      live = false;
      window.clearInterval(tick);
    };
  }, [signedIn]);

  const shown = rows.filter((a) => !(a.dismissible && dismissed.includes(stamp(a))));

  useEffect(() => {
    const el = box.current;
    const root = document.documentElement.style;
    if (!el) {
      root.removeProperty('--announce-h');
      return;
    }
    const publish = () => root.setProperty('--announce-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty('--announce-h');
    };
  }, [shown.length]);

  if (shown.length === 0) return null;

  const dismiss = (a: ShopAnnouncement) => {
    const next = [...dismissed.filter((d) => !d.startsWith(`${a._id}:`)), stamp(a)].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* Closed for this visit, then. */
    }
  };

  return (
    <div ref={box} className="relative z-[55]">
      {shown.map((a) => {
        const tone = TONE[a.tone] ?? TONE.info;
        const Icon = tone.icon;
        const title = lang === 'bn' && a.titleBn ? a.titleBn : a.title;
        const body = lang === 'bn' && a.bodyBn ? a.bodyBn : a.body;
        return (
          <div key={a._id} role="status" className={`flex items-start gap-2.5 border-b border-border px-4 py-2 text-sm ${tone.cls}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconCls}`} />
            <div className="min-w-0 flex-1 leading-snug">
              <strong className="font-semibold">{title}</strong>
              {body && <span className="ml-1.5 text-foreground/80">{body}</span>}
              {a.linkUrl && (
                <a
                  href={a.linkUrl}
                  className="ml-2 whitespace-nowrap font-semibold text-primary underline-offset-2 hover:underline"
                  {...(/^https?:/i.test(a.linkUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {a.linkLabel || t('Read more')} →
                </a>
              )}
            </div>
            {a.dismissible && (
              <button
                type="button"
                onClick={() => dismiss(a)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-black/5 hover:text-foreground"
                aria-label={t('Close')}
                title={t('Close')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
