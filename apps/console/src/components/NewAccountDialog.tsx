import { useState } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import { platformApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';

/**
 * Opening a shop for an owner who rang the office — the commonest way this is
 * sold: "bhai, open one for me", or an agent sitting in the shop. Four fields
 * and a password; plan, trial and counters are set afterwards from the shop's
 * own page, because the person on the phone wants to hear "it is open".
 */
export default function NewAccountDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    organizationName: '',
    ownerName: '',
    email: '',
    phone: '',
    password: '',
  });

  if (!open) return null;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await platformApi.createShop(form);
      toast(`${created.name} is open. Give them the password you set.`);
      onCreated();
      onClose();
      setForm({
        organizationName: '',
        ownerName: '',
        email: '',
        phone: '',
        password: '',
      });
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not open that shop.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">New shop</h3>
            <p className="text-xs text-muted-foreground">
              For an owner who asked over the phone. It opens active, on a trial, and they are
              emailed that it exists.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="np-name">
              Shop name
            </label>
            <input
              id="np-name"
              className="input h-10 w-full"
              value={form.organizationName}
              onChange={set('organizationName')}
              placeholder="Jonni Pharmacy"
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              This prints at the top of every bill they ring up.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="np-owner">
                Owner&apos;s name
              </label>
              <input
                id="np-owner"
                className="input h-10 w-full"
                value={form.ownerName}
                onChange={set('ownerName')}
                placeholder="Rafiq Hasan"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="np-phone">
                Phone
              </label>
              <input
                id="np-phone"
                className="input h-10 w-full"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+8801XXXXXXXXX"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="np-email">
                Email
              </label>
              <input
                id="np-email"
                type="email"
                className="input h-10 w-full"
                value={form.email}
                onChange={set('email')}
                placeholder="owner@pharmacy.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="np-pw">
                Password
              </label>
              <input
                id="np-pw"
                className="input h-10 w-full"
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
                required
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Read it out to them. They can change it once they are in.
              </p>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
