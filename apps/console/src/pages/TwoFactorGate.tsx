import { ShieldAlert } from 'lucide-react';
import TwoFactorSetup from '@dawai/shared/components/TwoFactorSetup';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import { signOut } from '@dawai/shared/api';

/**
 * What an operator sees instead of the console until they have a second factor.
 *
 * Not a nag in the settings page. These accounts can suspend a shop, export any
 * shop's data, and change what every customer pays; a password alone
 * is not a proportionate lock on that. The API enforces it — `requireAuth`
 * refuses every call from a platform account without 2FA except the enrolment
 * ones — so this screen is what stops the refusal being a wall of failed
 * requests with no explanation.
 *
 * Two ways out, both of them deliberate: enrol, or sign out.
 */
export default function TwoFactorGate() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">
              Set up two-factor authentication to use the console
            </p>
            <p className="mt-1 text-muted-foreground">
              This account can reach every customer on the platform. Press{' '}
              <strong className="font-semibold text-foreground">Turn on</strong> below, scan the
              code with an authenticator app, then enter the six digits it shows. Keep the
              recovery codes it gives you — they are shown once.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <TwoFactorSetup
            onEnabled={() => {
              // The session's copy of the flag is what the router reads; the
              // account itself was changed by the call that just returned.
              if (user) setUser({ ...user, twoFactorEnabled: true });
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Sign out instead
        </button>
      </div>
    </main>
  );
}
