import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRoundSearch, Plus, Pencil, Copy, Loader2, Phone, Wallet } from 'lucide-react';
import { platformApi, type AgentRow, type AgentDetail } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { BTN_ICON, BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import { BRAND } from '../brand';

/**
 * Field agents: the people who sign pharmacies up, the shops they brought in,
 * and the commission they are owed on every payment those shops make.
 *
 * Each agent has a sign-up link with their code on it. A commission line is
 * recorded the moment a payment from one of their shops is accepted, at the
 * agent's rate then, and stays owed until it is marked paid here with the
 * payout's reference.
 */

const taka = (n: number) => `৳ ${Math.round(n).toLocaleString('en-BD')}`;
const linkFor = (code: string) => `${BRAND.siteUrl.replace(/\/$/, '')}/bn/register?agent=${code}`;

type Draft = { name: string; code: string; phone: string; email: string; area: string; commissionPercent: string; payoutNote: string; active: boolean };
const EMPTY: Draft = { name: '', code: '', phone: '', email: '', area: '', commissionPercent: '10', payoutNote: '', active: true };

export default function Agents() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [payoutRef, setPayoutRef] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await platformApi.agents());
    } catch (e) {
      toast(errorMessage(e, 'Could not load the agents.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    try {
      const d = await platformApi.agent(id);
      setDetail(d);
      setPicked(d.commissions.filter((c) => c.status === 'owed').map((c) => c._id));
      setPayoutRef('');
    } catch (e) {
      toast(errorMessage(e, 'Could not open that agent.'), 'error');
    }
  };

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    setBusy(true);
    try {
      const payload = {
        name: d.name.trim(),
        phone: d.phone.trim() || undefined,
        email: d.email.trim() || undefined,
        area: d.area.trim() || undefined,
        commissionPercent: Number(d.commissionPercent),
        payoutNote: d.payoutNote.trim() || undefined,
        active: d.active,
      };
      if (editing.id) await platformApi.updateAgent(editing.id, payload);
      else await platformApi.createAgent({ ...payload, code: d.code });
      toast(editing.id ? 'Agent updated.' : 'Agent added.');
      setEditing(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that agent.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const payOut = async () => {
    if (!detail || !picked.length) return;
    setBusy(true);
    try {
      const r = await platformApi.payAgent(detail.agent._id, picked, payoutRef.trim());
      toast(`${taka(r.total)} marked as paid to ${detail.agent.name}.`);
      await openDetail(detail.agent._id);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not mark that paid.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code));
      toast('Link copied.');
    } catch {
      toast(linkFor(code));
    }
  };

  const pickedTotal = useMemo(
    () => (detail ? detail.commissions.filter((c) => picked.includes(c._id)).reduce((a, c) => a + c.amount, 0) : 0),
    [detail, picked],
  );
  const owedTotal = rows.reduce((a, r) => a + r.owed, 0);
  const d = editing?.draft;
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <UserRoundSearch className="h-5 w-5" /> Agents
          </h1>
          <p className="text-sm text-muted-foreground">
            The people who sign shops up, and their share of every payment.
            {owedTotal > 0 && <> <strong>{taka(owedTotal)}</strong> owed in all.</>}
          </p>
        </div>
        <button className="btn" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
          <Plus className="h-4 w-4" /> New agent
        </button>
      </div>

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">No agents yet. Add one, and give them their link.</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((a) => (
              <div key={a._id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="font-semibold hover:underline" onClick={() => void openDetail(a._id)}>
                      {a.name}
                    </button>
                    <span className="pill font-mono">{a.code}</span>
                    <span className="pill booked">{a.commissionPercent}%</span>
                    {!a.active && <span className="pill cancelled">off</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {a.area && <span>{a.area}</span>}
                    {a.phone && (
                      <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 hover:underline">
                        <Phone className="h-3 w-3" /> {a.phone}
                      </a>
                    )}
                    <span>
                      {a.shops} shop{a.shops === 1 ? '' : 's'} · {a.payingShops} paying
                    </span>
                    <span>Paid {taka(a.paid)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {a.owed > 0 && (
                    <button className={BTN_OUTLINE} onClick={() => void openDetail(a._id)}>
                      <Wallet className="h-3.5 w-3.5" /> {taka(a.owed)} owed
                    </button>
                  )}
                  <button className={BTN_OUTLINE} onClick={() => void copy(a.code)} title={linkFor(a.code)}>
                    <Copy className="h-3.5 w-3.5" /> Link
                  </button>
                  <button
                    className={BTN_ICON}
                    aria-label="Edit"
                    title="Edit"
                    onClick={() =>
                      setEditing({
                        id: a._id,
                        draft: {
                          name: a.name,
                          code: a.code,
                          phone: a.phone,
                          email: a.email,
                          area: a.area,
                          commissionPercent: String(a.commissionPercent),
                          payoutNote: a.payoutNote,
                          active: a.active,
                        },
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && d && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${d.name}` : 'New agent'}
          width="max-w-xl"
          footer={
            <>
              <button className={BTN_SECONDARY} onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={() => void save()} disabled={busy || d.name.trim().length < 2 || d.code.length < 3}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Name
              <input className="input mt-1" maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Code <span className="font-normal text-muted-foreground">(on their link)</span>
              <input className="input mt-1 font-mono uppercase" maxLength={24} disabled={!!editing.id} value={d.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} placeholder="RAHIM" />
            </label>
            <label className="text-sm font-medium">
              Phone
              <input className="input mt-1" maxLength={40} value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              Area
              <input className="input mt-1" maxLength={120} value={d.area} onChange={(e) => set({ area: e.target.value })} placeholder="Mirpur 10" />
            </label>
            <label className="text-sm font-medium">
              Commission (% of each payment)
              <input className="input mt-1" inputMode="decimal" value={d.commissionPercent} onChange={(e) => set({ commissionPercent: e.target.value.replace(/[^\d.]/g, '') })} />
            </label>
            <label className="text-sm font-medium">
              Email <span className="font-normal text-muted-foreground">(optional)</span>
              <input className="input mt-1" maxLength={200} value={d.email} onChange={(e) => set({ email: e.target.value })} />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              How they are paid <span className="font-normal text-muted-foreground">(optional)</span>
              <input className="input mt-1" maxLength={200} value={d.payoutNote} onChange={(e) => set({ payoutNote: e.target.value })} placeholder="bKash 01XXXXXXXXX, monthly" />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 shrink-0" style={{ width: 16 }} checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> Active — earns commission
            </label>
          </div>
          {editing.id && (
            <p className="mt-3 text-xs text-muted-foreground">A new rate applies to payments from now on; what is already owed stays at the rate it was earned at.</p>
          )}
        </Modal>
      )}

      {detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={`${detail.agent.name} · ${detail.agent.code}`}
          width="max-w-2xl"
          footer={
            picked.length > 0 ? (
              <>
                <input className="input mr-auto h-9 max-w-xs" maxLength={120} value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="Payout reference, e.g. bKash TRX 8N7A…" />
                <button className="btn" onClick={() => void payOut()} disabled={busy || payoutRef.trim().length < 2}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Mark {taka(pickedTotal)} paid
                </button>
              </>
            ) : undefined
          }
        >
          {detail.agent.payoutNote && <p className="mb-3 text-sm text-muted-foreground">Paid by: {detail.agent.payoutNote}</p>}
          <h4 className="mb-1 text-sm font-semibold">Shops ({detail.shops.length})</h4>
          {detail.shops.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {detail.shops.map((s) => (
                <Link key={s._id} to={`/shops/${s._id}`} className="pill hover:underline" onClick={() => setDetail(null)}>
                  {s.name}
                </Link>
              ))}
            </div>
          )}
          <h4 className="mb-1 text-sm font-semibold">Commission</h4>
          {detail.commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing earned yet — it starts with the first accepted payment from one of their shops.</p>
          ) : (
            <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
              {detail.commissions.map((c) => {
                const shop = typeof c.organization === 'object' && c.organization ? c.organization.name : 'A shop';
                return (
                  <label key={c._id} className="flex items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      style={{ width: 16 }}
                      disabled={c.status === 'paid'}
                      checked={c.status === 'paid' || picked.includes(c._id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c._id] : p.filter((x) => x !== c._id)))}
                    />
                    <span className="min-w-0 flex-1">
                      <strong>{taka(c.amount)}</strong> <span className="text-muted-foreground">— {c.percent}% of {taka(c.paymentAmount)} from {shop}, {lastSeen(c.createdAt)}</span>
                    </span>
                    {c.status === 'paid' ? (
                      <span className="pill completed" title={c.payoutRef}>paid {c.paidAt ? lastSeen(c.paidAt) : ''}</span>
                    ) : (
                      <span className="pill waiting">owed</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
