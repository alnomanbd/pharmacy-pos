import { useState } from 'react';
import { KeyRound, Loader2, Pencil, ShieldAlert, X } from 'lucide-react';
import { platformApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import type { User } from '@dawai/shared/types';

/**
 * Correcting a shop user, and setting their password.
 *
 * The support call this answers: an owner at 6pm with a queue at the counter,
 * locked out, whose account email is an address nobody has opened in two years. The
 * self-service reset link is the first answer; this is the second, and until it
 * existed the real second answer was "share your password with us", which is
 * worse in every way.
 *
 * It is not a quiet capability and the interface says so. The reason is
 * required and goes into the audit trail with the operator's name, the shop
 * user is emailed that support did this, and every session on that account
 * ends. All three are enforced on the server; the warning here is so that
 * nobody is surprised by them.
 */
export default function ShopUserActions({
  shopId,
  user,
  onChanged,
}: {
  shopId: string;
  user: User;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'' | 'edit' | 'password'>('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone });
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');

  const saveDetails = async () => {
    setBusy(true);
    try {
      await platformApi.updateShopUser(shopId, user._id, form);
      toast('Details updated.');
      setMode('');
      onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not update that user.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setUserPassword = async () => {
    setBusy(true);
    try {
      await platformApi.setShopUserPassword(shopId, user._id, password, reason);
      toast(`Password set for ${user.email}. They have been emailed and signed out.`);
      setMode('');
      setPassword('');
      setReason('');
      onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not set that password.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'edit') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`name-${user._id}`}
          className="input h-8 w-36 text-sm"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          aria-label="Name"
        />
        <input
          id={`email-${user._id}`}
          className="input h-8 w-48 text-sm"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          aria-label="Email"
        />
        <input
          id={`phone-${user._id}`}
          className="input h-8 w-32 text-sm"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          aria-label="Phone"
        />
        <button className="btn btn-sm" disabled={busy} onClick={() => void saveDetails()}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
        <button
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setMode('')}
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (mode === 'password') {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {user.name} will be emailed that support did this, signed out everywhere, and the
            reason below is kept in the audit trail with your name.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`pw-${user._id}`}
            className="input h-8 w-44 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
          />
          <input
            id={`reason-${user._id}`}
            className="input h-8 w-64 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why — e.g. locked out, called the office"
            aria-label="Reason"
          />
          <button
            className="btn btn-sm"
            disabled={busy || password.length < 8 || reason.trim().length < 5}
            onClick={() => void setUserPassword()}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Set password
          </button>
          <button
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setMode('')}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary"
        onClick={() => setMode('edit')}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      <button
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary"
        onClick={() => setMode('password')}
      >
        <KeyRound className="h-3.5 w-3.5" /> Password
      </button>
    </div>
  );
}
