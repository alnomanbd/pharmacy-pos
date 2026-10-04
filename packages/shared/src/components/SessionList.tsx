import { useCallback, useEffect, useState } from 'react';
import { Monitor, Smartphone, LogOut, Loader2, ShieldQuestion } from 'lucide-react';
import { sessionsApi, type SignedInSession } from '../api';
import { useToast } from './Toast';
import { confirmAction } from '../lib/confirm';

/**
 * The devices this account is signed in on, and a way to end them.
 *
 * Before this the only lever was rotating the JWT secrets, which signs out
 * every user of every shop — so in practice a session nobody could account
 * for was simply left running. A person who has left a browser open at the
 * counter is the one who needs to close it, and asking them to raise a support
 * ticket for that means it does not get closed.
 *
 * The session doing the asking is marked and cannot be ended from here: that
 * is what "Sign out" at the top of the app is for, and a list where every row
 * looks the same is a list people are afraid to press.
 */

/** `Mozilla/5.0 (Windows NT 10.0…) … Chrome/140…` → `Chrome on Windows`. */
function describe(userAgent: string): { label: string; phone: boolean } {
  if (!userAgent) return { label: 'Unknown device', phone: false };
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : '';
  const phone = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  const os =
    /Windows/.test(userAgent) ? 'Windows'
    : /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : '';
  const label = [browser, os].filter(Boolean).join(' on ') || userAgent.slice(0, 40);
  return { label, phone };
}

type Say = (text: string) => string;
const same: Say = (text) => text;

function when(value: string | Date, t: Say, n: Say): string {
  const then = new Date(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return t('just now');
  if (minutes < 60) return `${n(String(minutes))} ${t('min ago')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${n(String(hours))} ${t(hours === 1 ? 'hour ago' : 'hours ago')}`;
  return n(new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }));
}

/**
 * `t` and `n` are the app's own words and digits — the shop hands in its
 * Bangla; an app that passes nothing gets the English as it always was.
 */
export default function SessionList({ t = same, n = same }: { t?: Say; n?: Say } = {}) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SignedInSession[] | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    sessionsApi
      .list()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(load, [load]);

  const end = async (id: string, label: string) => {
    if (
      !(await confirmAction({
        title: t('Sign out this device?'),
        message: `${label}: ${t('signed out at once — whoever is using it has to sign in again.')}`,
        confirmLabel: t('Sign it out'),
        tone: 'danger',
        icon: 'close',
      }))
    )
      return;
    setBusy(id);
    try {
      await sessionsApi.revoke(id);
      toast(t('That device has been signed out.'));
      load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not end that session.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const endOthers = async () => {
    if (
      !(await confirmAction({
        title: t('Sign out every other device?'),
        message: t('Every browser but this one is signed out at once — whoever is using them has to sign in again.'),
        confirmLabel: t('Sign them out'),
        tone: 'danger',
        icon: 'close',
      }))
    )
      return;
    setBusy('others');
    try {
      const res = await sessionsApi.revokeOthers();
      toast(res.ended === 0 ? t('No other devices were signed in.') : `${n(String(res.ended))} ${t('signed out.')}`);
      load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not sign the other devices out.'), 'error');
    } finally {
      setBusy('');
    }
  };

  if (!sessions) return null;

  const others = sessions.filter((s) => !s.current).length;

  return (
    <section className="card mb-4 p-4">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <ShieldQuestion className="h-4 w-4" />
        {t('Signed-in devices')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('Where this account is open. Ending one signs that browser out immediately.')}
      </p>

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {sessions.map((s) => {
          const { label, phone } = describe(s.userAgent);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              {phone ? (
                <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {label}
                  {s.current && (
                    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                      {t('this device')}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('Last used')} {when(s.lastSeenAt, t, n)}
                  {s.ip ? ` · ${s.ip}` : ''}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => void end(s.id, label)}
                  disabled={Boolean(busy)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
                >
                  {busy === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  {t('End')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {others > 0 && (
        <button
          type="button"
          onClick={() => void endOthers()}
          disabled={Boolean(busy)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-destructive hover:underline disabled:opacity-60"
        >
          {busy === 'others' && <Loader2 className="h-4 w-4 animate-spin" />}
          {others === 1
            ? t('Sign out the other device')
            : `${t('Sign out the other')} ${n(String(others))} ${t('devices')}`}
        </button>
      )}
    </section>
  );
}
