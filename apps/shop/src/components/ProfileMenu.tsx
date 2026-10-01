import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import ChangePasswordDialog from '@dawai/shared/components/ChangePasswordDialog';
import { useT } from '../i18n/ui';

/**
 * Who is signed in, and the three things they do about it.
 *
 * The bar used to print the person's name in plain text with a sign-out icon
 * beside it, which spent the widest part of the bar on a fact nobody needs to
 * read twice and hid the two things that were actually missing — seeing your
 * own details, and changing your own password. A counter machine is shared;
 * somebody handed a password on their first morning has to be able to change it
 * without asking the owner out loud.
 *
 * So: initials, a menu, and nothing else in the bar.
 */

/** Two letters off a name, which is what a person recognises themselves by. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  /* "Md. Kamal Hossain" → KH: the honorific is not the person. */
  const words = parts.filter((p) => !/^(md|mst|mrs|mr|dr)\.?$/i.test(p));
  const use = words.length > 0 ? words : parts;
  return (use[0][0] + (use[use.length - 1][0] ?? '')).toUpperCase();
}

const ROLE_WORDS: Record<string, string> = {
  admin: 'Owner',
  pharmacist: 'Pharmacist',
  salesman: 'Salesman',
};

export default function ProfileMenu() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* A click anywhere else, or Escape, puts it away — the two things every menu
     on every machine has taught people to expect. */
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

  const leave = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Your account')}
        className="flex items-center gap-1.5 rounded-md p-1 transition-colors hover:bg-muted"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {initialsOf(user?.name ?? '')}
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <strong className="block truncate text-sm">{user?.name}</strong>
            <span className="block truncate text-[11px] text-muted-foreground">
              {user?.email}
            </span>
            {user?.role && (
              <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(ROLE_WORDS[user.role] ?? user.role)}
              </span>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <User className="h-4 w-4 text-muted-foreground" /> {t('Your profile')}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <KeyRound className="h-4 w-4 text-muted-foreground" /> {t('Change password')}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => void leave()}
            className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> {t('Sign out')}
          </button>
        </div>
      )}

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChanged={() => {
          /* The server has already cut every session for this account, this one
             included — see the dialog's own note. */
          setPasswordOpen(false);
          void leave();
        }}
      />
    </div>
  );
}
