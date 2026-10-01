import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  Mail,
  Phone,
  Building2,
  Ban,
  CalendarClock,
  UserCheck,
  StickyNote,
  Megaphone,
} from 'lucide-react';
import { platformApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import type { Lead, LeadStatus, PlatformAccess, PlatformMember } from '@dawai/shared/types';

/**
 * Enquiries from the public site, and what happened to each one.
 *
 * The inbox for people who are not customers yet. The contact form on the
 * marketing site used to be a `mailto:` link, which meant an enquiry existed
 * only if the visitor then pressed Send in their own mail client, and nobody on
 * the team could see what had come in or whether it had been answered. Those
 * messages now post to `POST /api/public/contact` and land here.
 *
 * Deliberately *not* the Support screen. A support thread belongs to a customer
 * and is a conversation; an enquiry is a stranger who has not bought anything.
 *
 * ## Why it is a pipeline now
 *
 * It was three verbs — answered, closed, spam — which is enough for a contact
 * form and not enough for a sale. Nothing recorded who was working an enquiry,
 * when to ring them back, or what was said on the last call, so an enquiry that
 * needed three calls over two weeks got one, and the second week was somebody
 * re-reading the same message wondering whether anyone had rung.
 *
 * Five live states and two endings — contacted, demo, trial, then won or lost.
 * A longer funnel is a longer form to fill in, and a stage nobody updates is
 * worse than no stage at all.
 *
 * The reply itself stays a `mailto:` — and that is the right place for one. An
 * enquiry is answered by a person writing a real email from a real address,
 * often forwarding it to a colleague; a sending pipeline here would land the
 * reply in a prospect's inbox from a no-reply address they cannot answer.
 */

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
};

/** A follow-up date, said the way an operator would say it out loud. */
const dueLabel = (iso: string) => {
  const due = new Date(iso);
  const days = Math.round((due.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days < -1) return `${Math.abs(days)} days late`;
  if (days === -1) return 'yesterday';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const isOverdue = (iso?: string | null) =>
  !!iso && new Date(iso).setHours(0, 0, 0, 0) <= new Date().setHours(-24, 0, 0, 0);

/** For the date input, which wants `YYYY-MM-DD` and nothing else. */
const asDateValue = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/**
 * The stages, in order, with the word an operator would use.
 *
 * `replied` and `closed` are the first version's states. They are not offered
 * as choices — nothing new should land in them — but rows already carry them,
 * so they still have a label and a filter.
 */
const STAGES: { key: LeadStatus; label: string; hint: string }[] = [
  { key: 'new', label: 'New', hint: 'Nobody has looked at it' },
  { key: 'contacted', label: 'Contacted', hint: 'Rung or written to' },
  { key: 'demo', label: 'Demo', hint: 'Shown the product' },
  { key: 'trial', label: 'Trial', hint: 'Using it on a trial' },
  { key: 'won', label: 'Won', hint: 'Signed up and paying' },
  { key: 'lost', label: 'Lost', hint: 'Not going ahead' },
];

const FILTERS: (LeadStatus | 'all')[] = [
  'new',
  'contacted',
  'demo',
  'trial',
  'won',
  'lost',
  'spam',
  'all',
];

/** The pill each state wears, borrowed from the rest of the console. */
const tone: Record<LeadStatus, string> = {
  new: 'pill',
  contacted: 'pill',
  demo: 'pill',
  trial: 'pill pending',
  won: 'pill completed',
  lost: 'pill cancelled',
  replied: 'pill completed',
  closed: 'pill',
  spam: 'pill cancelled',
};

const stageLabel = (s: LeadStatus) => STAGES.find((x) => x.key === s)?.label ?? s;

export default function Leads() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Lead[]>([]);
  const [status, setStatus] = useState<LeadStatus | 'all'>('new');
  const [q, setQ] = useState('');
  const [waiting, setWaiting] = useState(0);
  const [openId, setOpenId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<PlatformAccess | null>(null);
  const [team, setTeam] = useState<PlatformMember[]>([]);
  const [noteDraft, setNoteDraft] = useState('');

  const canManage = !access || access.permissions.includes('leads.manage');

  const load = useCallback(async () => {
    try {
      const res = await platformApi.leads({ status, q: q.trim() || undefined, limit: 100 });
      setRows(res.data);
      setWaiting(res.waiting);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load enquiries.', 'error');
    } finally {
      setLoading(false);
    }
  }, [status, q, toast]);

  useEffect(() => {
    platformApi
      .access()
      .then(setAccess)
      .catch(() => undefined);
    /* Owners are shown by name, not by id. A failure here is not fatal: the
       picker falls back to ids rather than the page falling over. */
    platformApi
      .team()
      .then(setTeam)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerName = useCallback(
    (id?: string | null) => {
      if (!id) return '';
      return team.find((m) => m._id === id)?.name || 'an operator';
    },
    [team],
  );

  /** Anything with a call due today or earlier, whatever stage it is in. */
  const due = useMemo(
    () => rows.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= new Date()),
    [rows],
  );

  const patch = async (id: string, payload: Parameters<typeof platformApi.updateLead>[1], said: string) => {
    setBusy(true);
    try {
      await platformApi.updateLead(id, payload);
      toast(said);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not update that.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const open = rows.find((r) => r.id === openId) ?? null;

  /**
   * The reply, pre-addressed and pre-quoted.
   *
   * The subject carries what they asked about and the body quotes their own
   * message, because the operator writing back is usually not the person who
   * read it first — and an answer that does not say what it is answering gets a
   * "sorry, which enquiry is this?" in return.
   */
  const replyHref = (l: Lead) => {
    const subject = `Re: ${l.topic || 'Your message to Dawai'}`;
    const quoted = l.message
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const greeting = l.lang === 'bn' ? `আসসালামু আলাইকুম ${l.name},` : `Dear ${l.name},`;
    return `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(`${greeting}\n\n\n\n---\n${quoted}\n`)}`;
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap">
        <div>
          <h1>Enquiries</h1>
          <p className="text-sm text-muted-foreground">
            {waiting > 0
              ? `${waiting} nobody has looked at yet`
              : 'Everything has been looked at'}
            {due.length > 0 && ` · ${due.length} call${due.length === 1 ? '' : 's'} due`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input h-9 w-48"
            placeholder="Name, email, practice…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((s) => (
              <button
                key={s}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${
                  status === s
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                onClick={() => {
                  setStatus(s);
                  setOpenId('');
                }}
              >
                {s === 'all' ? 'All' : stageLabel(s as LeadStatus)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <div className={`card ${openId ? 'hidden lg:block' : ''}`}>
          <h3 className="mb-2 flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Inbox
          </h3>
          {loading ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <div className="empty">Nothing here.</div>
          ) : (
            <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
              {rows.map((l) => (
                <button
                  key={l.id}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    openId === l.id ? 'border-primary bg-secondary' : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => {
                    setOpenId(l.id);
                    setNoteDraft('');
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.name}</span>
                    {l.status === 'new' && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-primary"
                        title="Nobody has looked at it"
                      />
                    )}
                  </div>
                  <div className="truncate text-xs font-medium">{l.topic || 'No topic given'}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{l.message}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {when(l.createdAt)}
                    {l.shop && <span className="truncate">{l.shop}</span>}
                    {l.lang === 'bn' && <span className="pill">বাংলা</span>}
                    {l.status !== 'new' && (
                      <span className={tone[l.status]}>{stageLabel(l.status)}</span>
                    )}
                    {/* The call, and how late it is. This is the line that makes
                        the screen a queue rather than an archive. */}
                    {l.nextFollowUpAt && (
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isOverdue(l.nextFollowUpAt) ? 'text-destructive' : ''
                        }`}
                      >
                        <CalendarClock className="h-3 w-3" /> {dueLabel(l.nextFollowUpAt)}
                      </span>
                    )}
                    {l.owner && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <UserCheck className="h-3 w-3" /> {ownerName(l.owner)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {open ? (
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate">{open.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {when(open.createdAt)} · from the {open.source} site
                  {open.handledAt ? ` · last worked ${when(open.handledAt)}` : ''}
                </p>
              </div>
              <button className="btn btn-ghost lg:hidden" onClick={() => setOpenId('')}>
                Back
              </button>
            </div>

            {/* Who they are, as links: an operator's next action is nearly
                always to write or to call, not to read further. */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a className="flex items-center gap-1.5 text-primary" href={`mailto:${open.email}`}>
                <Mail className="h-3.5 w-3.5" /> {open.email}
              </a>
              {open.phone && (
                <a className="flex items-center gap-1.5 text-primary" href={`tel:${open.phone}`}>
                  <Phone className="h-3.5 w-3.5" /> {open.phone}
                </a>
              )}
              {open.shop && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {open.shop}
                </span>
              )}
              {open.topic && <span className="pill">{open.topic}</span>}
            </div>

            {/* Where they came from. Kept beside the message because "which ad
                was this" is the question the spend report cannot answer later
                if nobody looks now. */}
            {(open.utm?.campaign || open.utm?.source || open.fbclid || open.landingPage) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <Megaphone className="h-3.5 w-3.5" /> Came from
                </span>
                {open.utm?.source && <span>source: {open.utm.source}</span>}
                {open.utm?.campaign && <span>campaign: {open.utm.campaign}</span>}
                {open.utm?.medium && <span>medium: {open.utm.medium}</span>}
                {open.landingPage && <span className="truncate">page: {open.landingPage}</span>}
                {open.fbclid && <span>has a Facebook click id</span>}
              </div>
            )}

            <div className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed">
              {open.message}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a className="btn" href={replyHref(open)}>
                <Mail className="h-4 w-4" /> Reply by email
              </a>
              {canManage && open.status !== 'spam' && (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void patch(open.id, { status: 'spam' }, 'Filed as spam.')}
                >
                  <Ban className="h-4 w-4" /> Spam
                </button>
              )}
            </div>

            {canManage && (
              <div className="mt-5 border-t border-border pt-4">
                {/* ------------------------------ the stage ------------------- */}
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Where it has got to
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map((s) => (
                    <button
                      key={s.key}
                      title={s.hint}
                      disabled={busy}
                      aria-pressed={open.status === s.key}
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        open.status === s.key
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() =>
                        void patch(open.id, { status: s.key }, `Moved to ${s.label.toLowerCase()}.`)
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {open.status === 'lost' && (
                  <div className="mt-3">
                    <label
                      className="mb-1.5 block text-xs font-semibold text-muted-foreground"
                      htmlFor="lead-lost"
                    >
                      Why it was lost
                    </label>
                    <input
                      id="lead-lost"
                      className="input h-9 w-full max-w-md"
                      defaultValue={open.lostReason ?? ''}
                      placeholder="Too expensive · went with someone else · not ready"
                      onBlur={(e) => {
                        if (e.target.value === (open.lostReason ?? '')) return;
                        void patch(open.id, { lostReason: e.target.value }, 'Reason saved.');
                      }}
                    />
                  </div>
                )}

                {/* --------------------- who has it, and when to ring --------- */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold text-muted-foreground"
                      htmlFor="lead-owner"
                    >
                      Who is working it
                    </label>
                    <select
                      id="lead-owner"
                      className="input h-9 w-full"
                      value={open.owner ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        void patch(
                          open.id,
                          { owner: e.target.value || null },
                          e.target.value ? `${ownerName(e.target.value)} has it.` : 'Unassigned.',
                        )
                      }
                    >
                      <option value="">Nobody yet</option>
                      {team.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold text-muted-foreground"
                      htmlFor="lead-due"
                    >
                      Ring them back on
                    </label>
                    <input
                      id="lead-due"
                      type="date"
                      className="input h-9 w-full"
                      value={asDateValue(open.nextFollowUpAt)}
                      disabled={busy}
                      onChange={(e) =>
                        void patch(
                          open.id,
                          { nextFollowUpAt: e.target.value || null },
                          e.target.value ? 'Call put in the diary.' : 'Call taken out of the diary.',
                        )
                      }
                    />
                  </div>
                </div>

                {/* ------------------------------ the calls ------------------- */}
                <div className="mt-4">
                  <label
                    className="mb-1.5 block text-xs font-semibold text-muted-foreground"
                    htmlFor="lead-note"
                  >
                    What was said
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <textarea
                      id="lead-note"
                      rows={2}
                      className="input min-w-0 flex-1 py-2"
                      placeholder="Rang, asked for a call after Friday prayers…"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <button
                      className="btn btn-secondary h-9 self-end"
                      disabled={busy || !noteDraft.trim()}
                      onClick={() => {
                        const body = noteDraft.trim();
                        if (!body) return;
                        setNoteDraft('');
                        void patch(open.id, { addNote: body }, 'Noted.');
                      }}
                    >
                      <StickyNote className="h-4 w-4" /> Add
                    </button>
                  </div>

                  {(open.notes?.length ?? 0) > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {[...(open.notes ?? [])].reverse().map((n, i) => (
                        <li
                          key={`${n.at}-${i}`}
                          className="rounded-lg border border-border px-3 py-2 text-sm"
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {ownerName(n.by) || 'an operator'} ·{' '}
                            {new Date(n.at).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {open.note && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      <strong>Standing note:</strong> {open.note}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card hidden lg:flex lg:items-center lg:justify-center">
            <p className="text-sm text-muted-foreground">Pick an enquiry to work it.</p>
          </div>
        )}
      </div>
    </div>
  );
}
