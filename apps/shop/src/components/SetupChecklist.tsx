import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Circle, ListChecks, X } from 'lucide-react';
import { onboardingApi, type ShopSetup } from '../api';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { useToast } from '@dawai/shared/components/Toast';

/**
 * "Setup 3/6" in the top bar, and the list behind it.
 *
 * A shop that signed up and found an empty stock list needs to be told what to
 * do next, in that order, with a link to the page that does it. Every tick is
 * read from what the shop has actually done. It leaves the bar once all six are
 * done, or when the owner puts it away.
 */
export default function SetupChecklist() {
  const t = useT();
  const { toast } = useToast();
  const lang = useUiLang();
  const { pathname } = useLocation();
  const [setup, setSetup] = useState<ShopSetup | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Asked again on every move: finishing a step is usually what the move was.
  useEffect(() => {
    let live = true;
    onboardingApi
      .get()
      .then((s) => live && setSetup(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!setup || setup.dismissed || setup.done >= setup.total) return null;

  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const pct = setup.done / setup.total;
  const R = 8;
  const C = 2 * Math.PI * R;

  const hide = async () => {
    setOpen(false);
    try {
      setSetup(await onboardingApi.dismiss());
      toast(t('Hidden. It is under Help whenever you want it back.'));
    } catch {
      /* Still shown; nothing lost. */
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
        title={t('Getting started')}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="-rotate-90">
          <circle cx="10" cy="10" r={R} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
          <circle cx="10" cy="10" r={R} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} />
        </svg>
        <span className="hidden sm:inline">{t('Setup')}</span> {n(setup.done)}/{n(setup.total)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="flex items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4 text-primary" /> {t('Getting started')}
            </strong>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('Close')} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{t('Six steps, and Dawai runs your whole shop.')}</p>
          <ol className="space-y-0.5">
            {setup.steps.map((s) => (
              <li key={s.key}>
                <Link
                  to={s.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${s.done ? 'text-muted-foreground' : ''}`}
                >
                  {s.done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={s.done ? 'line-through' : ''}>{t(s.label)}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
            <Link to="/support" onClick={() => setOpen(false)} className="font-semibold text-primary hover:underline">
              {t('Want us to set it up with you?')}
            </Link>
            <button type="button" onClick={() => void hide()} className="text-muted-foreground hover:text-foreground">
              {t('Hide')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
