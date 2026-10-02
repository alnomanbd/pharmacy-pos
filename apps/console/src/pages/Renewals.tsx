import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Mail, MessageSquareText, Phone, Eye, Banknote } from 'lucide-react';
import { platformApi, type RetentionPile, type RetentionRow, type RetentionBoard } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { BTN_OUTLINE, can, errorMessage, useAccess } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import RecordPaymentDialog from '../components/RecordPaymentDialog';

/**
 * Who is about to leave, and who already has.
 *
 * The automatic emails go out at 7, 3 and 1 days before a subscription ends,
 * but an email is easy to ignore; a phone call the day before is what renews a
 * pharmacy. This is the list to make those calls from, with the owner's number
 * on every row and a way to send a reminder that the next operator can see was
 * already sent.
 */

const PILES: { key: RetentionPile; label: string; hint: string; kind: 'renewal' | 'inactive' | 'setup' }[] = [
  { key: 'trialsEnding', label: 'Trials ending', hint: 'On the free trial, and it runs out soon.', kind: 'renewal' },
  { key: 'renewalsDue', label: 'Renewals due', hint: 'Paying, and the paid time runs out soon.', kind: 'renewal' },
  { key: 'lapsed', label: 'Lapsed', hint: 'Ended in the last 30 days and not renewed — read-only, still worth a call.', kind: 'renewal' },
  { key: 'inactive', label: 'Inactive', hint: 'In good standing, but no bill or sign-in for a week.', kind: 'inactive' },
  { key: 'stuck', label: 'Stuck in setup', hint: 'New in the last two months, and fewer than half the getting-started steps done. Offer to set it up with them.', kind: 'setup' },
];

const taka = (n: number) => `৳ ${n.toLocaleString('en-BD')}`;

/** "ends in 3 days", "ends today", "ended 4 days ago". */
function endsLabel(r: RetentionRow) {
  if (r.daysLeft === null) return '';
  if (r.daysLeft === 0) return 'ends today';
  if (r.daysLeft === 1) return 'ends tomorrow';
  if (r.daysLeft > 1) return `ends in ${r.daysLeft} days`;
  return `ended ${-r.daysLeft} day${r.daysLeft === -1 ? '' : 's'} ago`;
}

export default function Renewals() {
  const { toast } = useToast();
  const access = useAccess();
  const canRemind = can(access, 'shops.edit') || can(access, 'support.reply');
  const canRecordPayment = can(access, 'payments.verify');
  const [paying, setPaying] = useState<RetentionRow | null>(null);
  const [days, setDays] = useState(7);
  const [pile, setPile] = useState<RetentionPile>('trialsEnding');
  const [board, setBoard] = useState<RetentionBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  /* Opens on the first pile with anybody in it, until the operator picks one. */
  const picked = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await platformApi.retention(days);
      setBoard(next);
      if (!picked.current) {
        const first = PILES.find((p) => next.counts[p.key] > 0);
        if (first) setPile(first.key);
      }
    } catch (e) {
      toast(errorMessage(e, 'Could not load renewals.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const remind = async (r: RetentionRow, kind: 'renewal' | 'inactive' | 'setup', sms: boolean) => {
    setBusy(`${r._id}:${sms ? 'sms' : 'email'}`);
    try {
      const res = await platformApi.remindShop(r._id, kind, sms);
      toast(`Reminder sent to ${r.name} by ${res.sent.join(' and ')}.`);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not send that reminder.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const current = PILES.find((p) => p.key === pile)!;
  const rows = board?.[pile] ?? [];

  return (
    <div className="page">
      {paying && (
        <RecordPaymentDialog
          open
          onClose={() => setPaying(null)}
          shop={{ _id: paying._id, name: paying.name, plan: paying.plan, trialEndsAt: paying.endsAt }}
          onRecorded={() => void load()}
        />
      )}
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Renewals
          </h1>
          <p className="text-sm text-muted-foreground">
            Shops to call before they leave. Ending within the next{' '}
            <select
              className="input inline-block h-8 w-auto py-0 text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Window"
            >
              {[3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </p>
        </div>
      </div>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="tablist">
        {PILES.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={pile === p.key}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ${
              pile === p.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              picked.current = true;
              setPile(p.key);
            }}
          >
            {p.label}
            <span className="rounded-full bg-background px-1.5 text-xs tabular-nums">{board?.counts[p.key] ?? '·'}</span>
          </button>
        ))}
      </div>

      <div className="card mt-4">
        <p className="mb-3 text-sm text-muted-foreground">{current.hint}</p>
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">Nobody here. 🎉</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r._id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/shops/${r._id}`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <span className="pill">{r.planName}</span>
                      {r.status === 'suspended' && <span className="pill cancelled">suspended</span>}
                      {r.daysLeft !== null && (
                        <span className={`pill ${r.daysLeft < 0 ? 'cancelled' : r.daysLeft <= 1 ? 'waiting' : 'booked'}`}>
                          {endsLabel(r)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {r.endsAt && <span>Ends {new Date(r.endsAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</span>}
                      {!r.trial && r.price > 0 && <span>{taka(r.price)} / month</span>}
                      <span>Last active {lastSeen(r.lastActivityAt) ?? 'never'}</span>
                      {r.setup && r.setup.done < r.setup.total && <span>Setup {r.setup.done}/{r.setup.total}</span>}
                      {r.lastManualReminder?.at && (
                        <span className="font-medium text-foreground/80">
                          Reminded {lastSeen(r.lastManualReminder.at)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
                      {r.owner.name && <span>{r.owner.name}</span>}
                      {r.owner.phone && (
                        <a href={`tel:${r.owner.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Phone className="h-3.5 w-3.5" /> {r.owner.phone}
                        </a>
                      )}
                      {r.owner.email && <span className="text-muted-foreground">{r.owner.email}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canRemind && (
                      <>
                        <button
                          className={BTN_OUTLINE}
                          disabled={!!busy || !r.owner.email}
                          onClick={() => void remind(r, current.kind, false)}
                          title={r.owner.email ? `Email ${r.owner.email}` : 'No email address on this shop'}
                        >
                          <Mail className="h-3.5 w-3.5" /> Email
                        </button>
                        <button
                          className={BTN_OUTLINE}
                          disabled={!!busy || !r.owner.phone}
                          onClick={() => void remind(r, current.kind, true)}
                          title={r.owner.phone ? `Email and SMS ${r.owner.phone}` : 'No phone number on this shop'}
                        >
                          <MessageSquareText className="h-3.5 w-3.5" /> Email + SMS
                        </button>
                      </>
                    )}
                    {canRecordPayment && current.kind === 'renewal' && (
                      <button className={BTN_OUTLINE} onClick={() => setPaying(r)} disabled={!!busy}>
                        <Banknote className="h-3.5 w-3.5" /> Record payment
                      </button>
                    )}
                    <Link to={`/shops/${r._id}`} className={BTN_OUTLINE}>
                      <Eye className="h-3.5 w-3.5" /> Open
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
