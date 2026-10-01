import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { authApi } from '../api';
import { useToast } from './Toast';
import { passwordProblem } from '../lib/password';

/**
 * Changing your own password.
 *
 * The shop's owner could set anybody's password from the Staff page and
 * nobody could change their own — so a salesman handed a password on their
 * first day had to ask the owner to change it, out loud, and the owner then
 * knew it. Every account here can be signed into from a counter PC that other
 * people use; this is the screen that was missing, not a nicety.
 *
 * Reached from the profile menu in the top bar, which is the one place present
 * on every page for every role.
 *
 * ## Why it signs you out
 *
 * `changePassword` on the server clears the account's refresh tokens, which is
 * the point of changing a password: whoever else was signed in — the old
 * session on the ward computer, a phone left in a drawer — is cut off. That
 * includes this session, so staying on the page would leave the user in a
 * session that works until its access token expires and then fails in the
 * middle of something. Signing out here, with the reason on screen, is the
 * honest version of what has already happened.
 */
export default function ChangePasswordDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful change, once the user has been told. */
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Nothing typed is kept between openings: this is a password field on a
  // shared machine.
  useEffect(() => {
    if (open) return;
    setCurrent('');
    setNext('');
    setRepeat('');
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mismatch = repeat.length > 0 && next !== repeat;

  const submit = async () => {
    setError('');
    if (!current) return setError('Type your current password.');
    /* The same rule the API applies, so the dialog cannot accept something
       the request will refuse. */
    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    if (next !== repeat) return setError('The two new passwords do not match.');
    if (next === current) return setError('The new password is the same as the old one.');

    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      toast('Password changed. Sign in again with the new one.');
      onChanged();
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Could not change the password.';
      // Shown in the dialog, not only as a toast: "current password is
      // incorrect" is a message you act on right where you typed it.
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cpw-backdrop" role="dialog" aria-modal="true" aria-label="Change password">
      <div className="cpw">
        <div className="cpw-head">
          <KeyRound className="h-4 w-4 text-primary" />
          <strong>Change your password</strong>
          <button className="cpw-x" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cpw-body">
          <label className="label" htmlFor="cpw-current">
            Current password
          </label>
          <input
            id="cpw-current"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />

          <label className="label mt-3" htmlFor="cpw-new">
            New password
          </label>
          <input
            id="cpw-new"
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <span className="cpw-hint">At least 8 characters, and not a common one.</span>

          <label className="label mt-3" htmlFor="cpw-repeat">
            Repeat new password
          </label>
          <input
            id="cpw-repeat"
            className="input"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          {mismatch && <span className="cpw-bad">The two do not match.</span>}

          {error && (
            <p className="cpw-error" role="alert">
              {error}
            </p>
          )}

          <p className="cpw-note">
            Everywhere you are signed in — including here — is signed out, so nobody keeps
            a session opened with the old password.
          </p>
        </div>

        <div className="cpw-foot">
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Changing…' : 'Change password'}
          </button>
          <button
            className="btn border border-border bg-card text-foreground"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
