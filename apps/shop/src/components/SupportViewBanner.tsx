import { useEffect, useRef, useState } from 'react';
import { Eye, LogOut } from 'lucide-react';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Says, loudly and always, that this is not the operator's own screen.
 *
 * Somebody looking at a shop through support must never be able to forget it —
 * the failure is reading a real shop's stock and thinking it is test data, or
 * telling the owner something about "your" bill that is somebody else's. So the
 * banner is red, sits above every screen including the till, and carries the
 * only way out.
 *
 * In the flow above the app rather than fixed over it, so it covers nothing.
 * The shell and the till fill the screen, so they need its height taken off
 * theirs: it goes into `--support-banner-h` from a `ResizeObserver`, because
 * the text wraps differently with the width, the language and the shop's name.
 */
export default function SupportViewBanner() {
  const t = useT();
  const lang = useUiLang();
  const view = useAuthStore((s) => s.impersonating);
  const box = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--support-banner-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Left set, the offset would apply to a session that is no longer a support view.
      document.documentElement.style.removeProperty('--support-banner-h');
    };
  }, [view]);

  // The time left, and the end of it: the token dies on the server anyway, but
  // a screen that keeps showing the shop after that is a screen that lies.
  useEffect(() => {
    if (!view) return;
    const tick = window.setInterval(() => {
      setNow(Date.now());
      if (new Date(view.expiresAt).getTime() <= Date.now()) leave();
    }, 15_000);
    return () => window.clearInterval(tick);
  }, [view]);

  if (!view) return null;

  // Capped: the browser and the server clocks can disagree by a little.
  const minutes = Math.min(30, Math.max(0, Math.ceil((new Date(view.expiresAt).getTime() - now) / 60_000)));
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));

  return (
    <div
      ref={box}
      role="status"
      className="relative z-[60] flex items-center gap-x-3 bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
    >
      <Eye className="h-4 w-4 shrink-0" />
      {/* Two short lines on a phone, one on a desktop: the banner has to be
          unmissable, not half the screen. */}
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block truncate sm:inline">
          {t('Support view')} — <bdi>{view.shop}</bdi> · <bdi>{view.userName}</bdi>
        </span>
        <span className="block text-xs font-normal opacity-90 sm:ml-2 sm:inline sm:text-sm">
          <span className="sm:hidden">{t('Read-only')}</span>
          <span className="hidden sm:inline">{t('Read-only: nothing can be changed.')}</span> · {n(minutes)}{' '}
          {t('min left')}
        </span>
      </span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-black/20 px-2.5 py-1.5 text-xs font-semibold hover:bg-black/30"
        onClick={leave}
        aria-label={t('Leave support view')}
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="sm:hidden">{t('Leave')}</span>
        <span className="hidden sm:inline">{t('Leave support view')}</span>
      </button>
    </div>
  );
}

/**
 * Ends the support view. The operator is still signed in on the console, which
 * is where they came from; this tab has nothing left to show, so it closes if
 * the browser lets it and lands on the sign-in page if not.
 */
function leave() {
  useAuthStore.getState().endImpersonation();
  window.close();
  window.location.assign('/login');
}
