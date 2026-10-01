import { useEffect, useState } from 'react';
import { User, KeyRound, Loader2, Store, Check } from 'lucide-react';
import api, { getData } from '@dawai/shared/api/client';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { useToast } from '@dawai/shared/components/Toast';
import ChangePasswordDialog from '@dawai/shared/components/ChangePasswordDialog';
import { initialsOf } from '../components/ProfileMenu';
import SessionList from '@dawai/shared/components/SessionList';
import TwoFactorSetup from '@dawai/shared/components/TwoFactorSetup';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Your own details.
 *
 * Small on purpose. A salesman needs three things from this page and the shop
 * needs them to be the three: that the name on their bills is spelled right,
 * that they can change the password they were handed on their first morning
 * without asking the owner out loud, and that they can see where else they are
 * signed in — because the machine at the counter is shared and a session left
 * open on it is somebody else selling under their name.
 *
 * Everything about the *shop* — its name, its paper, its VAT — is Settings, and
 * only the owner sees that. This is about the person.
 */

const ROLE_WORDS: Record<string, string> = {
  admin: 'Owner',
  pharmacist: 'Pharmacist',
  salesman: 'Salesman',
};

export default function Profile() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.logout);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [was, setWas] = useState({ name: user?.name ?? '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  /*
   * The phone is not in the session.
   *
   * `AuthUser` carries what every screen needs on every request and no more, so
   * the number comes from the person's own record. `/users/:id` takes the id
   * from the token for `me`; a salesman reading their own is allowed and
   * reading anybody else's is a 403 from the server, not a guess here.
   */
  useEffect(() => {
    if (!user?.id) return;
    getData<{ name: string; phone?: string }>(api.get(`/users/${user.id}`))
      .then((row) => {
        setName(row.name ?? '');
        setPhone(row.phone ?? '');
        setWas({ name: row.name ?? '', phone: row.phone ?? '' });
      })
      .catch(() => undefined);
  }, [user?.id]);

  const dirty = name.trim() !== was.name || phone.trim() !== was.phone;

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      /* `/users/me` takes the id off the token, never off the URL — there is no
         request here that can address somebody else's record. */
      const updated = await getData<{ _id: string; name: string; phone?: string }>(
        api.patch('/users/me', { name: name.trim(), phone: phone.trim() }),
      );
      setUser({ ...user!, name: updated.name });
      setWas({ name: updated.name, phone: updated.phone ?? '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <h1 className="flex items-center gap-2">
            <User className="h-5 w-5" /> {t('Your profile')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Your own details, your password, and where you are signed in.')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="card">
          <h3>{t('You')}</h3>

          <div className="mb-4 flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initialsOf(user?.name ?? '')}
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-sm">{user?.email}</strong>
              <span className="text-[11px] text-muted-foreground">
                {t(ROLE_WORDS[user?.role ?? ''] ?? user?.role ?? '')}
                {user?.organizationName ? ` · ${user.organizationName}` : ''}
              </span>
            </div>
          </div>

          <div className="grid gap-3">
            <div>
              <label
                className="mb-1 block text-xs font-semibold text-muted-foreground"
                htmlFor="p-name"
              >
                {t('Name')}
              </label>
              <input
                id="p-name"
                className="input h-10"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('This is the name printed on every bill you ring up.')}
              </p>
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold text-muted-foreground"
                htmlFor="p-phone"
              >
                {t('Phone')}
              </label>
              <input
                id="p-phone"
                className="input h-10"
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* The email and the role are not yours to change: one is how you sign
              in and the other is what you are allowed to do. */}
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t('The email and what you are allowed to do are the owner’s to change.')}
          </p>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy || !dirty || !name.trim()}
              onClick={() => void save()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-primary">
                <Check className="h-4 w-4" /> {t('Saved')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card">
            <h3>{t('Password')}</h3>
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">
              {t(
                'Changing it signs out every machine this account is open on, including this one. That is the point of changing it.',
              )}
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="h-4 w-4" /> {t('Change password')}
            </button>
          </div>

          {/* The card is the shared one, in the shop's own words. */}
          <TwoFactorSetup t={t} n={(v) => (lang === 'bn' ? bnNumerals(v) : v)} />

          <div className="card">
            <h3>{t('Where you are signed in')}</h3>
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">
              {t(
                'A counter machine is shared. A session left open on one is somebody else selling under your name — sign it out from here.',
              )}
            </p>
            <SessionList t={t} n={(v) => (lang === 'bn' ? bnNumerals(v) : v)} />
          </div>

          <div className="card">
            <h3 className="flex items-center gap-2">
              <Store className="h-4 w-4" /> {t('The shop')}
            </h3>
            <p className="-mt-1 text-xs text-muted-foreground">
              {t(
                'Everything about the shop itself — its name, its paper, its VAT — is in Settings, and only the owner sees it.',
              )}
            </p>
          </div>
        </div>
      </div>

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChanged={() => {
          setPasswordOpen(false);
          void signOut();
        }}
      />
    </div>
  );
}
