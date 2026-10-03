import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound, Pencil, Plus } from 'lucide-react';
import { platformApi, type DataApiClientDetail, type DataApiPlan } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import ConfirmDialog from '@dawai/shared/components/ConfirmDialog';
import Modal from '../components/Modal';
import { num, taka } from '../components/Stretch';
import { BTN_OUTLINE, BTN_OUTLINE_DANGER, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { BRAND } from '../brand';
import { CallBars, ClientDialog, KIND_WORDS, SCOPE_WORDS, dateOnly, endpointName, logWords, reachOf, statusPill, useDataApiAccess, when } from './DataApi';

/**
 * One Data API client: their plan, their keys, what they have used, and what
 * was changed. A new key is shown once, here, and never again — only its first
 * characters are kept.
 */
export default function DataApiClient() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const { canManage } = useDataApiAccess();
  const [c, setC] = useState<DataApiClientDetail | null>(null);
  const [plans, setPlans] = useState<DataApiPlan[]>([]);
  const [editing, setEditing] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; prefix: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    platformApi
      .dataApiClient(id)
      .then(setC)
      .catch((e) => toast(errorMessage(e, 'Could not load this client.'), 'error'));
  }, [id, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    platformApi
      .dataApiPlans()
      .then((d) => setPlans(d.plans))
      .catch(() => undefined);
  }, []);

  const makeKey = async () => {
    setBusy(true);
    try {
      const r = await platformApi.dataApiMakeKey(id, label.trim());
      setFresh(r.key);
      setKeyOpen(false);
      setLabel('');
      load();
    } catch (e) {
      toast(errorMessage(e, 'Could not make a key.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await platformApi.dataApiRevokeKey(revoking.id);
      toast('Key revoked. Anything using it stops within a minute.');
      setRevoking(null);
      load();
    } catch (e) {
      toast(errorMessage(e, 'Could not revoke that key.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fresh ?? '');
      toast('Copied.');
    } catch {
      toast('Select the key and copy it by hand.', 'error');
    }
  };

  if (!c) return <LoadingBlock />;
  const plan = plans.find((p) => p.key === c.plan);
  const live = c.keys.filter((k) => !k.revokedAt);
  const dead = c.keys.filter((k) => k.revokedAt);

  return (
    <div className="page">
      <Link to="/data-api?tab=clients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>{c.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {KIND_WORDS[c.kind]} {statusPill(c)} on <b className="text-foreground">{plan?.name ?? c.plan}</b>
            {plan && <span>({taka(plan.priceMonthly)}/month)</span>}
          </p>
        </div>
        {canManage && (
          <button className={BTN_OUTLINE} onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card mb-0">
          <div className="text-xs font-semibold text-muted-foreground">Calls today</div>
          <div className="text-2xl font-bold tabular-nums">{num(c.usage.callsToday)}</div>
          <div className="text-xs text-muted-foreground">of {plan ? num(plan.requestsPerDay) : '—'}</div>
        </div>
        <div className="card mb-0">
          <div className="text-xs font-semibold text-muted-foreground">Calls this month</div>
          <div className="text-2xl font-bold tabular-nums">{num(c.usage.callsThisMonth)}</div>
          <div className="text-xs text-muted-foreground">of {plan ? num(plan.requestsPerMonth) : '—'}</div>
        </div>
        <div className="card mb-0">
          <div className="text-xs font-semibold text-muted-foreground">Live keys</div>
          <div className="text-2xl font-bold tabular-nums">{live.length}</div>
        </div>
        <div className="card mb-0">
          <div className="text-xs font-semibold text-muted-foreground">Contract ends</div>
          <div className="text-lg font-bold">{dateOnly(c.expiresAt)}</div>
        </div>
      </div>

      {plan && (
        <div className="card">
          <h3>What they get</h3>
          <div className="flex flex-wrap gap-1">
            {plan.scopes.map((s) => (
              <span key={s} className="pill success" title={SCOPE_WORDS[s]?.sells}>
                {SCOPE_WORDS[s]?.label ?? s}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {reachOf(plan)} · {num(plan.requestsPerMinute)}/minute · {num(plan.requestsPerDay)}/day · {num(plan.requestsPerMonth)}/month ·{' '}
            <a className="text-primary hover:underline" href={`${BRAND.dataApiUrl}/docs/`} target="_blank" rel="noreferrer">
              the reference to send them
            </a>
          </p>
        </div>
      )}

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="mb-0 flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Keys
          </h3>
          {canManage && (
            <button className="btn" onClick={() => setKeyOpen(true)}>
              <Plus className="h-4 w-4" /> New key
            </button>
          )}
        </div>
        {fresh && (
          <div className="mb-3 rounded-lg border border-dashed border-primary bg-primary/5 p-3">
            <p className="text-sm font-semibold">Copy this key now — it is not shown again.</p>
            <code className="my-2 block break-all rounded bg-muted p-2 text-xs">{fresh}</code>
            <div className="flex flex-wrap items-center gap-2">
              <button className={BTN_OUTLINE} onClick={() => void copy()}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
              <span className="text-xs text-muted-foreground">
                Send it privately. They send it as <code>Authorization: Bearer …</code>
              </span>
            </div>
          </div>
        )}
        {c.keys.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Label</th>
                  <th>Made</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...live, ...dead].map((k) => (
                  <tr key={k.id} className={k.revokedAt ? 'opacity-60' : ''}>
                    <td className="font-mono text-xs">{k.prefix}…</td>
                    <td>{k.label || <span className="text-muted-foreground">—</span>}</td>
                    <td className="whitespace-nowrap">
                      {dateOnly(k.createdAt)}
                      <span className="block text-xs text-muted-foreground">{k.createdBy}</span>
                    </td>
                    <td className="whitespace-nowrap">{when(k.lastUsedAt)}</td>
                    <td className="text-right">
                      {k.revokedAt ? (
                        <span className="pill">Revoked {dateOnly(k.revokedAt)}</span>
                      ) : (
                        canManage && (
                          <button className={BTN_OUTLINE_DANGER} onClick={() => setRevoking({ id: k.id, prefix: k.prefix })}>
                            Revoke
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No keys yet.</p>
        )}
      </div>

      <div className="card">
        <h3>Calls, last 30 days</h3>
        <CallBars series={c.usage.series} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card mb-0 overflow-x-auto">
          <h3>What they asked for, last 30 days</h3>
          {c.usage.endpoints.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th className="num">Calls</th>
                  <th className="num">Rows</th>
                </tr>
              </thead>
              <tbody>
                {c.usage.endpoints.map((e) => (
                  <tr key={e.endpoint}>
                    <td className="font-mono text-xs">{endpointName(e.endpoint)}</td>
                    <td className="num">{num(e.calls)}</td>
                    <td className="num">{num(e.rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No calls yet.</p>
          )}
        </div>
        <div className="card mb-0">
          <h3>Contact</h3>
          <p className="text-sm">
            {c.contactName || '—'}
            {c.email && (
              <>
                <br />
                <a className="text-primary hover:underline" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              </>
            )}
            {c.phone && (
              <>
                <br />
                {c.phone}
              </>
            )}
          </p>
          {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>}
          <h3 className="mt-4">Changes</h3>
          {c.log.length ? (
            <ul className="divide-y divide-border text-sm">
              {c.log.map((l) => (
                <li key={l._id} className="flex justify-between gap-3 py-2">
                  <span>{logWords(l, (k) => plans.find((p) => p.key === k)?.name ?? k)}</span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {l.by}
                    <br />
                    {when(l.at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None.</p>
          )}
        </div>
      </div>

      <ClientDialog
        open={editing}
        plans={plans}
        client={{ ...c, expiresAt: c.expiresAt ?? '' }}
        onClose={() => setEditing(false)}
        onSaved={load}
      />

      <Modal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        title="New key"
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setKeyOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void makeKey()}>
              Make key
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void makeKey();
          }}
        >
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="dk-label">
            A label, to tell their keys apart
          </label>
          <input id="dk-label" className="input h-10 w-full" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Production server" autoFocus />
          <p className="mt-2 text-xs text-muted-foreground">The key is shown once, on the next screen. Only its first characters are kept.</p>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        title={`Revoke ${revoking?.prefix ?? ''}…?`}
        message="Anything using this key stops working within a minute. This cannot be undone — make them a new key instead."
        confirmLabel="Revoke"
        loading={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
