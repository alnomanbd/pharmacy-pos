import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  UserCog,
  ShieldAlert,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  PlusCircle,
  Pencil,
} from 'lucide-react';
import { platformApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import type { PlatformAuditEntry } from '@dawai/shared/types';

/**
 * The platform's own audit trail.
 *
 * Every audited act a platform operator takes was being written with no
 * `organization` — an operator does not belong to one — and the only reader in
 * the app filtered by organization. So suspending a customer, moving one
 * between plans, deleting one permanently and setting one of its users'
 * passwords were all recorded faithfully and readable by nobody. This is the
 * reader.
 *
 * Read-only, and that is structural: nothing in this app updates or deletes an
 * audit row, and there is no endpoint that would. A trail an operator can edit
 * is not a trail.
 *
 * It shows **platform** actions only. A shop's own trade — who rang up which
 * bill, who voided which sale — is that shop's own trail,
 * read on its own Activity page, and holding `audit.view` here is deliberately
 * not a window into it.
 */

/** A short, readable line for each action, and the icon that carries it. */
const SHAPE: Record<string, { icon: typeof Building2; label: string; tone?: 'warn' }> = {
  // Who was in the console, and when.
  'auth.login': { icon: LogIn, label: 'Signed in' },
  'auth.logout': { icon: LogOut, label: 'Signed out' },
  'auth.failed_login': { icon: ShieldAlert, label: 'Failed sign-in', tone: 'warn' },
  'auth.session.revoke': { icon: MonitorSmartphone, label: 'Ended a device session' },
  'auth.session.revoke_others': {
    icon: MonitorSmartphone,
    label: 'Ended every other device session',
  },
  'password.change': { icon: KeyRound, label: 'Changed their own password' },
  'password.reset': { icon: KeyRound, label: 'Reset their password by email', tone: 'warn' },
  'twoFactor.setup': { icon: KeyRound, label: 'Second factor enabled' },
  'twoFactor.disable': { icon: KeyRound, label: 'Second factor disabled', tone: 'warn' },

  // What was done to a customer.
  'organization.platform_create': { icon: PlusCircle, label: 'Opened an account for a customer' },
  'organization.platform_update': { icon: Building2, label: 'Account changed by an operator' },
  'organization.platform_profile': { icon: Pencil, label: "Corrected a customer's details" },
  'organization.platform_limits': { icon: Building2, label: "Changed a customer's counter or login limits" },
  'user.platform_update': { icon: UserCog, label: "Corrected a customer's user" },
  'user.platform_password': {
    icon: KeyRound,
    label: "Set a customer user's password",
    tone: 'warn',
  },
};

/*
 * Always the date, always the year, always the clock time.
 *
 * It used to say "today 08:42" for anything from the last few hours, which is
 * the one form a trail cannot use: read back a week later, or exported, or
 * quoted in an answer to a customer, "today" names no day at all. The full
 * stamp is four characters longer and means the same thing in June as it does
 * on the afternoon it was written.
 */
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // 12-hour with am/pm: the clock everyone here reads and speaks.
    hour12: true,
  });

/** The same moment to the second, for a hover — a trail sometimes needs it. */
const exact = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

/**
 * The diff, as one line.
 *
 * "Changed the plan" without saying from what is not an audit entry, so the
 * fields that were sent are printed — and only those: the trail stores a diff
 * rather than a copy of the record, which is what keeps it from becoming a
 * second database of customer data.
 */
function changeLine(entry: PlatformAuditEntry): string {
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const parts = Object.entries(after)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  return parts.join(' · ');
}

export default function Audit() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PlatformAuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await platformApi.audit({ action: action || undefined, limit: 100 });
      setRows(res.data);
      setActions(res.actions);
      setTotal(res.total);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load the audit trail.', 'error');
    } finally {
      setLoading(false);
    }
  }, [action, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <div className="topbar flex-wrap">
        <div>
          <h1>Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            What this team did to customer accounts — approvals, suspensions, plan changes,
            deletions and support sessions. Append-only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input h-9 w-56" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All platform actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {SHAPE[a]?.label ?? a}
              </option>
            ))}
          </select>
          <span className="pill">{total} entries</span>
        </div>
      </div>

      <div className="card p-0">
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty py-12">
            {action ? 'Nothing recorded under that action yet.' : 'Nothing recorded yet.'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const shape = SHAPE[r.action] ?? { icon: UserCog, label: r.action };
              const Icon = shape.icon;
              const change = changeLine(r);
              return (
                <div key={r._id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      shape.tone === 'warn'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-secondary text-primary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold">{shape.label}</span>
                      {r.target.label && (
                        <span className="text-sm text-muted-foreground">— {r.target.label}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {/* Who, and from where. Both are the point of the entry. */}
                      {r.actorName || 'Unknown operator'}
                      {r.actorRole ? ` · ${r.actorRole}` : ''} ·{' '}
                      <time dateTime={r.createdAt} title={exact(r.createdAt)}>
                        {when(r.createdAt)}
                      </time>
                      {r.ip ? ` · ${r.ip}` : ''}
                    </p>
                    {change && (
                      <p className="mt-1 break-words rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {change}
                      </p>
                    )}
                  </div>
                  <span className="pill shrink-0">{r.action}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Entries are never edited or removed — not from here and not from anywhere else in the app.
        A customer&apos;s own trading activity is not shown here; it belongs to them and is
        read on their Activity page.
      </p>
    </div>
  );
}
