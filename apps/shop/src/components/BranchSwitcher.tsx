import { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, Check, Layers } from 'lucide-react';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useBranchStore, fetchBranchSwitcher, type BranchSwitcherInfo } from '../branch';
import { useT } from '../i18n/ui';

/**
 * The branch this screen is in, in the top bar.
 *
 * Drawn only for a shop with more than one branch — most have one, and a menu
 * with one choice in it is a question nobody needs asked. A device starts in
 * the Main branch (or the only one its person works in) and stays where it was
 * last put. "All branches" is for whoever can see more than one: the owner
 * reading the day's figures across the shops, not selling.
 */
export default function BranchSwitcher() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const branch = useBranchStore((s) => s.branch);
  const version = useBranchStore((s) => s.version);
  const pick = useBranchStore((s) => s.pick);
  const [info, setInfo] = useState<BranchSwitcherInfo | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    fetchBranchSwitcher()
      .then((d) => {
        if (!live) return;
        setInfo(d);
        const { branch: chosen } = useBranchStore.getState();
        if (d.count <= 1) {
          // One branch: nothing to choose, and nothing to send.
          if (chosen) pick('');
          return;
        }
        const known = d.branches.some((b) => b._id === chosen);
        const allOk = chosen === 'all' && d.canSeeAll;
        // Nothing chosen yet, or a choice from another account: start in the first (the Main branch).
        if (!known && !allOk && d.branches[0]) pick(d.branches[0]._id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user, version, pick]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, []);

  if (!info || info.count <= 1 || info.branches.length === 0) return null;

  const current = info.branches.find((b) => b._id === branch);
  const label = branch === 'all' ? t('All branches') : (current?.name ?? info.branches[0].name);
  // Somebody limited to one branch sees where they are, with nothing to switch to.
  const fixed = info.branches.length === 1;

  const choose = (id: string) => {
    setOpen(false);
    if (id !== branch) pick(id);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('Branch')}: ${label}`}
        title={`${t('Branch')}: ${label}`}
        className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-sm font-semibold transition-colors hover:bg-muted sm:max-w-[14rem]"
      >
        {branch === 'all' ? <Layers className="h-4 w-4 shrink-0 text-primary" /> : <MapPin className="h-4 w-4 shrink-0 text-primary" />}
        {/* A phone's bar has no room for a name; the menu says it, at the top. */}
        <span className="hidden truncate sm:inline">{label}</span>
        {!fixed && <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />}
      </button>

      {open && (
        <div
          role="menu"
          className="fixed inset-x-4 top-14 z-50 overflow-hidden rounded-lg border border-border bg-card shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-64"
        >
          <div className="border-b border-border px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('Working in')}</span>
            <strong className="block truncate text-sm">{label}</strong>
          </div>
          {info.branches.map((b) => (
            <button
              key={b._id}
              type="button"
              role="menuitemradio"
              aria-checked={b._id === branch}
              onClick={() => choose(b._id)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.name}</span>
                {b.address && <span className="block truncate text-[11px] text-muted-foreground">{b.address}</span>}
              </span>
              {b._id === branch && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
          {info.canSeeAll && (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={branch === 'all'}
              onClick={() => choose('all')}
              className="flex w-full items-start gap-2.5 border-t border-border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t('All branches')}</span>
                <span className="block text-[11px] text-muted-foreground">{t('Figures added up — pick one branch to sell or receive stock')}</span>
              </span>
              {branch === 'all' && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
