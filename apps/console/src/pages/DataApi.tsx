import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Building2,
  Database,
  ExternalLink,
  FlaskConical,
  MapPin,
  Package,
  Pill,
  Plug,
  Plus,
  ScrollText,
  Search,
  Tags,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  platformApi,
  type DataApiClient,
  type DataApiClientInput,
  type DataApiDay,
  type DataApiLogRow,
  type DataApiOverview,
  type DataApiPlan,
  type DataApiReadiness,
  type DataApiScope,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import DistrictSelect from '@dawai/shared/components/DistrictSelect';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import Modal from '../components/Modal';
import { RankList, num, taka } from '../components/Stretch';
import { BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { BRAND } from '../brand';

/**
 * Selling the Data API: the medicine catalogue, and which medicines sell
 * where — to pharma companies, distributors and researchers, by key.
 *
 * The Data API is its own service with its own records; this page runs it
 * through the platform API (`dataapi.view` to look, `dataapi.manage` to
 * change). What a client is sent always passes the five-shop rule there, and
 * "Try it" shows exactly that.
 */

export const SCOPE_WORDS: Record<DataApiScope, { label: string; sells: string }> = {
  catalogue: { label: 'Medicine data', sells: 'Every registered medicine: brand, generic, strength, form, maker, listed price, DAR number, indications.' },
  demand: { label: 'Sales figures', sells: 'What sells across the country: top medicines, generics, companies, and brand shares within a generic.' },
  trends: { label: 'Rising & falling', sells: 'Which medicines are climbing or dropping, month against month.' },
  districts: { label: 'By district', sells: 'All of the above, for any of the 64 districts, and each district’s share.' },
};

export const KIND_WORDS: Record<DataApiClient['kind'], string> = {
  pharma: 'Pharma company',
  distributor: 'Distributor',
  research: 'Research',
  government: 'Government',
  other: 'Other',
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'sell', label: 'What we sell', icon: Package },
  { key: 'clients', label: 'Clients', icon: Building2 },
  { key: 'plans', label: 'Plans & prices', icon: Tags },
  { key: 'try', label: 'Try it', icon: FlaskConical },
  { key: 'log', label: 'Changes', icon: ScrollText },
] as const;
type Tab = (typeof TABS)[number]['key'];

export const when = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const dateOnly = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const endpointName = (e: string) => (e === 'index' ? '/v1' : `/v1/${e}`);

export function useDataApiAccess() {
  const perms = useAuthStore((s) => (s.user as { permissions?: string[] } | null)?.permissions ?? []);
  // The owner holds every permission implicitly and is sent none by name.
  return { canManage: perms.length === 0 || perms.includes('dataapi.manage') };
}

export default function DataApi() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const [off, setOff] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Data API
          </h1>
          <p className="text-sm text-muted-foreground">
            Sell the medicine catalogue and which medicines sell where — by key, to companies, distributors and researchers.
          </p>
        </div>
        <a className={BTN_OUTLINE} href={`${BRAND.dataApiUrl}/docs/`} target="_blank" rel="noreferrer">
          <BookOpen className="h-3.5 w-3.5" /> API reference <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'overview' ? {} : { tab: t.key })}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {off ? (
        <NotConnected message={off} />
      ) : (
        <>
          {tab === 'overview' && <OverviewTab onOff={setOff} />}
          {tab === 'sell' && <SellTab onOff={setOff} />}
          {tab === 'clients' && <ClientsTab onOff={setOff} />}
          {tab === 'plans' && <PlansTab onOff={setOff} />}
          {tab === 'try' && <TryTab />}
          {tab === 'log' && <LogTab onOff={setOff} />}
        </>
      )}
    </div>
  );
}

/** Not set up yet, or not answering: say which, and what to do. */
function NotConnected({ message }: { message: string }) {
  return (
    <div className="card max-w-2xl">
      <h3 className="flex items-center gap-2">
        <Plug className="h-4 w-4" /> The Data API is not reachable
      </h3>
      <p className="text-sm text-muted-foreground">{message}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Start the service: <code className="rounded bg-muted px-1">docker compose up -d data-api</code> (or <code className="rounded bg-muted px-1">npm run dev:data-api</code> locally).
        </li>
        <li>
          Give it an admin password, <code className="rounded bg-muted px-1">DATA_API_ADMIN_TOKEN</code>, 32+ random characters.
        </li>
        <li>
          Set the same password and where it answers on the platform API: <code className="rounded bg-muted px-1">DATA_API_URL</code> (e.g.{' '}
          <code className="rounded bg-muted px-1">http://data-api:5200</code>) and <code className="rounded bg-muted px-1">DATA_API_ADMIN_TOKEN</code>.
        </li>
      </ol>
    </div>
  );
}

/** Loads one thing; a "not connected" answer goes up to the page, anything else is a toast. */
function useLoad<T>(fn: () => Promise<T>, onOff: (m: string) => void, deps: unknown[] = []) {
  const { toast } = useToast();
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(() => {
    fn()
      .then(setData)
      .catch((e) => {
        const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code ?? '';
        if (code.startsWith('DATA_API_')) onOff(errorMessage(e, 'The Data API is not reachable.'));
        else toast(errorMessage(e, 'Could not load that.'), 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { data, reload: load };
}

function Tile({ label, value, sub, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: typeof Activity }) {
  return (
    <div className="card mb-0">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Calls a day: answered, and refused stacked on top. */
export function CallBars({ series }: { series: DataApiDay[] }) {
  const max = Math.max(1, ...series.map((s) => s.calls + s.refused));
  const [hover, setHover] = useState<number | null>(null);
  const h = hover === null ? null : series[hover];
  return (
    <div>
      <div className="mb-1 h-5 text-xs text-muted-foreground">
        {h ? (
          <>
            <b className="text-foreground">{dateOnly(h.day)}</b> · {num(h.calls)} answered{h.refused ? ` · ${num(h.refused)} refused` : ''}
          </>
        ) : (
          'Hover a day'
        )}
      </div>
      <div className="flex h-28 items-end gap-[2px]" onMouseLeave={() => setHover(null)} role="img" aria-label="Calls per day, last 30 days">
        {series.map((s, i) => (
          <div key={s.day} className="flex h-full flex-1 flex-col-reverse gap-[2px]" onMouseEnter={() => setHover(i)}>
            <span className="block rounded-t-[3px] bg-primary" style={{ height: `${(s.calls / max) * 100}%` }} />
            {s.refused > 0 && <span className="block rounded-t-[3px] bg-amber-500" style={{ height: `${(s.refused / max) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{dateOnly(series[0]?.day)}</span>
        <span>{dateOnly(series.at(-1)?.day)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> Answered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> Refused — over a limit, not in plan, or a bad request
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- overview -- */

function OverviewTab({ onOff }: { onOff: (m: string) => void }) {
  const { data } = useLoad<DataApiOverview>(() => platformApi.dataApiOverview(), onOff);
  if (!data) return <LoadingBlock />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Wallet} label="Monthly revenue" value={taka(data.monthlyRevenue)} sub="Active clients at their plans’ prices" />
        <Tile icon={Building2} label="Active clients" value={num(data.clients.active)} sub={`${num(data.clients.suspended)} suspended · ${num(data.keys)} live keys`} />
        <Tile icon={Activity} label="Calls today" value={num(data.today.calls)} sub={`${num(data.today.refused)} refused`} />
        <Tile icon={Database} label={`Calls in ${data.month.month}`} value={num(data.month.calls)} sub={`${num(data.month.rows)} rows sent`} />
      </div>
      <div className="card mb-0">
        <h3>Calls, last 30 days</h3>
        <CallBars series={data.series} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankList icon={Building2} title="Busiest clients this month" rows={data.topClients.map((c) => ({ id: c.id, name: c.name, value: c.calls }))} empty="No calls yet this month." />
        <RankList icon={Plug} title="Most-used endpoints this month" rows={data.topEndpoints.map((e) => ({ id: e.endpoint, name: endpointName(e.endpoint), value: e.calls }))} empty="No calls yet this month." />
      </div>
      <p className="text-xs text-muted-foreground">
        Figures last rebuilt {when(data.figuresBuiltAt)} · every figure a client gets rests on {data.minShops}+ shops.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- what we sell -- */

function SellTab({ onOff }: { onOff: (m: string) => void }) {
  const r = useLoad<DataApiReadiness>(() => platformApi.dataApiReadiness(), onOff);
  const p = useLoad(() => platformApi.dataApiPlans(), onOff);
  const d = r.data;
  if (!d || !p.data) return <LoadingBlock />;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  return (
    <div className="space-y-4">
      <div className="card mb-0">
        <h3 className="flex items-center gap-2">
          <Pill className="h-4 w-4" /> Medicine data
        </h3>
        <p className="card-sub">Ready to sell on any plan — public facts, gathered and kept tidy, no shop data at all.</p>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Medicines" value={num(d.catalogue.medicines)} />
          <Tile label="Generics" value={num(d.catalogue.generics)} />
          <Tile label="Companies" value={num(d.catalogue.companies)} />
        </div>
      </div>

      <div className="card mb-0">
        <h3 className="flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Which medicines sell where — {d.month}
        </h3>
        <p className="card-sub">
          A figure is sold only where at least {d.minShops} different shop{d.minShops === 1 ? '' : 's'} sold that medicine, in that district, that month. More shops counted means more of
          this can be sold.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Shops counted" value={num(d.shopsCounted)} sub="Most in one day that month" />
          <Tile label="Medicines a client sees" value={num(d.sellable.medicines)} sub={`of ${num(d.all.medicines)} sold · ${pct(d.sellable.medicines, d.all.medicines)}`} />
          <Tile label="Districts a client sees" value={num(d.sellable.districts)} sub={`of ${num(d.all.districts)} with sales`} />
          <Tile label="Pieces a client sees" value={`${d.sellable.share}%`} sub={`${num(d.sellable.pieces)} of ${num(d.all.pieces)}`} />
        </div>
        {d.sellable.pieces === 0 && (
          <p className="mt-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Nothing clears the {d.minShops}-shop rule yet, so sales figures would come back empty. Sell the medicine data now; the figures fill in as more shops
            are counted.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Figures last rebuilt {when(d.figuresBuiltAt)}.</p>
      </div>

      <div className="card mb-0">
        <h3>The parts a plan can include</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SCOPE_WORDS) as DataApiScope[]).map((s) => (
            <div key={s} className="rounded-lg border border-border p-3">
              <div className="font-semibold">{SCOPE_WORDS[s].label}</div>
              <p className="text-sm text-muted-foreground">{SCOPE_WORDS[s].sells}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                In:{' '}
                {p.data!.plans
                  .filter((x) => x.scopes.includes(s))
                  .map((x) => x.name)
                  .join(', ') || 'no plan yet'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- clients -- */

export function statusPill(c: { status: string; expiresAt: string | null }) {
  if (c.status !== 'active') return <span className="pill cancelled">Suspended</span>;
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return <span className="pill cancelled">Contract ended</span>;
  return <span className="pill success">Active</span>;
}

function ClientsTab({ onOff }: { onOff: (m: string) => void }) {
  const navigate = useNavigate();
  const { canManage } = useDataApiAccess();
  const list = useLoad(() => platformApi.dataApiClients(), onOff);
  const plans = useLoad(() => platformApi.dataApiPlans(), onOff);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  if (!list.data || !plans.data) return <LoadingBlock />;
  const planName = (k: string) => plans.data!.plans.find((p) => p.key === k)?.name ?? k;
  const rows = list.data.filter((c) => !q.trim() || `${c.name} ${c.contactName} ${c.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="input h-9 w-full pl-9" placeholder="Find a client" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a client" />
        </label>
        {canManage && (
          <button className="btn" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New client
          </button>
        )}
      </div>
      <div className="card mb-0 overflow-x-auto p-0">
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Plan</th>
                <th>Status</th>
                <th className="num">Keys</th>
                <th className="num">Calls this month</th>
                <th>Last used</th>
                <th>Contract ends</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/data-api/clients/${c.id}`)}>
                  <td>
                    <Link to={`/data-api/clients/${c.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {KIND_WORDS[c.kind]}
                      {c.contactName ? ` · ${c.contactName}` : ''}
                    </div>
                  </td>
                  <td>{planName(c.plan)}</td>
                  <td>{statusPill(c)}</td>
                  <td className="num">{num(c.keys)}</td>
                  <td className="num">{num(c.callsThisMonth)}</td>
                  <td className="whitespace-nowrap">{when(c.lastUsedAt)}</td>
                  <td className="whitespace-nowrap">{dateOnly(c.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {list.data.length ? 'No client matches that.' : 'No clients yet. Add the first one, then make them a key.'}
          </p>
        )}
      </div>
      <ClientDialog
        open={adding}
        plans={plans.data.plans}
        onClose={() => setAdding(false)}
        onSaved={(id) => navigate(`/data-api/clients/${id}`)}
      />
    </div>
  );
}

const EMPTY_CLIENT: DataApiClientInput = { name: '', kind: 'pharma', contactName: '', email: '', phone: '', plan: '', expiresAt: '', notes: '' };

/** Adding a client, or changing one. */
export function ClientDialog({
  open,
  onClose,
  onSaved,
  plans,
  client,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  plans: DataApiPlan[];
  client?: (DataApiClientInput & { id: string; status: 'active' | 'suspended' }) | null;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<DataApiClientInput>(EMPTY_CLIENT);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(client ? { ...client, expiresAt: client.expiresAt ? client.expiresAt.slice(0, 10) : '' } : { ...EMPTY_CLIENT, plan: plans.find((p) => p.isActive)?.key ?? '' });
  }, [open, client, plans]);
  const set = <K extends keyof DataApiClientInput>(k: K, v: DataApiClientInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const ok = f.name.trim().length >= 2 && !!f.plan && (!f.email.trim() || /^\S+@\S+\.\S+$/.test(f.email.trim()));

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const body = { ...f, name: f.name.trim(), email: f.email.trim(), contactName: f.contactName.trim(), phone: f.phone.trim() };
      if (client) {
        await platformApi.dataApiUpdateClient(client.id, body);
        toast('Saved.');
        onSaved(client.id);
      } else {
        const r = await platformApi.dataApiCreateClient(body);
        toast('Client added. Make them a key next.');
        onSaved(r.id);
      }
      onClose();
    } catch (e) {
      toast(errorMessage(e, 'Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = 'mb-1 block text-xs font-semibold text-muted-foreground';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? `Edit ${client.name}` : 'New client'}
      width="max-w-lg"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!ok || busy} onClick={() => void save()}>
            {client ? 'Save' : 'Add client'}
          </button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="sm:col-span-2">
          <label className={label} htmlFor="dc-name">
            Company or organisation
          </label>
          <input id="dc-name" className="input h-10 w-full" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Square Pharmaceuticals" />
        </div>
        <div>
          <label className={label} htmlFor="dc-kind">
            Kind
          </label>
          <select id="dc-kind" className="input h-10 w-full" value={f.kind} onChange={(e) => set('kind', e.target.value as DataApiClientInput['kind'])}>
            {Object.entries(KIND_WORDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="dc-plan">
            Plan
          </label>
          <select id="dc-plan" className="input h-10 w-full" value={f.plan} onChange={(e) => set('plan', e.target.value)}>
            <option value="">Pick a plan</option>
            {plans
              .filter((p) => p.isActive || p.key === f.plan)
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} — {taka(p.priceMonthly)}/month
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="dc-contact">
            Contact person
          </label>
          <input id="dc-contact" className="input h-10 w-full" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="dc-phone">
            Phone
          </label>
          <input id="dc-phone" className="input h-10 w-full" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="dc-email">
            Email
          </label>
          <input id="dc-email" className="input h-10 w-full" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="dc-exp">
            Contract ends
          </label>
          <input id="dc-exp" className="input h-10 w-full" type="date" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">Keys stop working after this day. Empty: no end.</p>
        </div>
        {client && (
          <div className="sm:col-span-2">
            <label className={label} htmlFor="dc-status">
              Status
            </label>
            <select id="dc-status" className="input h-10 w-full" value={f.status ?? 'active'} onChange={(e) => set('status', e.target.value as 'active' | 'suspended')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended — every key stops within a minute</option>
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={label} htmlFor="dc-notes">
            Notes
          </label>
          <textarea id="dc-notes" className="input w-full" rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="What they use it for, the deal, invoices…" />
        </div>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ plans -- */

type PlanDraft = Omit<DataApiPlan, 'id' | 'clients'>;
const EMPTY_PLAN: PlanDraft = {
  key: '',
  name: '',
  description: '',
  scopes: ['catalogue'],
  historyMonths: 12,
  requestsPerMinute: 60,
  requestsPerDay: 1000,
  requestsPerMonth: 20000,
  priceMonthly: 0,
  isActive: true,
};

export const reachOf = (p: { scopes: DataApiScope[]; historyMonths: number }) =>
  p.scopes.includes('demand') || p.scopes.includes('districts') || p.scopes.includes('trends') ? `${p.historyMonths} months back` : 'Catalogue only';

function PlansTab({ onOff }: { onOff: (m: string) => void }) {
  const { canManage } = useDataApiAccess();
  const { data, reload } = useLoad(() => platformApi.dataApiPlans(), onOff);
  const [edit, setEdit] = useState<{ draft: PlanDraft; isNew: boolean } | null>(null);
  if (!data) return <LoadingBlock />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">What each client pays for. A change reaches every client on that plan within a minute.</p>
        {canManage && (
          <button className="btn" onClick={() => setEdit({ draft: EMPTY_PLAN, isNew: true })}>
            <Plus className="h-4 w-4" /> New plan
          </button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {data.plans.map((p) => (
          <div key={p.key} className="card mb-0 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="mb-0">{p.name}</h3>
                <code className="text-xs text-muted-foreground">{p.key}</code>
              </div>
              {!p.isActive && <span className="pill">Not offered</span>}
            </div>
            <div className="my-2 text-2xl font-bold tabular-nums">
              {taka(p.priceMonthly)}
              <span className="text-sm font-medium text-muted-foreground"> / month</span>
            </div>
            <p className="text-sm text-muted-foreground">{p.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.scopes.map((s) => (
                <span key={s} className="pill success">
                  {SCOPE_WORDS[s]?.label ?? s}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {reachOf(p)} · {num(p.requestsPerMinute)}/minute · {num(p.requestsPerDay)}/day · {num(p.requestsPerMonth)}/month
            </p>
            <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
              <span>
                {num(p.clients)} client{p.clients === 1 ? '' : 's'}
              </span>
              {canManage && (
                <button className={BTN_OUTLINE} onClick={() => setEdit({ draft: { ...p }, isNew: false })}>
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {edit && <PlanDialog draft={edit.draft} isNew={edit.isNew} scopes={data.scopes} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

function PlanDialog({ draft, isNew, scopes, onClose, onSaved }: { draft: PlanDraft; isNew: boolean; scopes: DataApiScope[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [p, setP] = useState<PlanDraft>(draft);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PlanDraft>(k: K, v: PlanDraft[K]) => setP((x) => ({ ...x, [k]: v }));
  const ok = /^[a-z0-9-]{2,40}$/.test(p.key) && p.name.trim().length >= 2 && p.scopes.length > 0;
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const { key, ...body } = p;
      await platformApi.dataApiSavePlan(key, { ...body, name: body.name.trim(), description: body.description.trim() });
      toast('Plan saved.');
      onSaved();
      onClose();
    } catch (e) {
      toast(errorMessage(e, 'Could not save the plan.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const label = 'mb-1 block text-xs font-semibold text-muted-foreground';
  const numField = (k: 'historyMonths' | 'priceMonthly' | 'requestsPerMinute' | 'requestsPerDay' | 'requestsPerMonth', text: string, min = 0) => (
    <div>
      <label className={label} htmlFor={`dp-${k}`}>
        {text}
      </label>
      <input id={`dp-${k}`} className="input h-10 w-full" type="number" min={min} value={p[k]} onChange={(e) => set(k, Math.max(min, Number(e.target.value) || 0))} />
    </div>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New plan' : `Edit ${draft.name}`}
      width="max-w-lg"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!ok || busy} onClick={() => void save()}>
            Save plan
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="dp-key">
            Key
          </label>
          <input id="dp-key" className="input h-10 w-full" value={p.key} readOnly={!isNew} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="e.g. insight-plus" />
          <p className="mt-1 text-[11px] text-muted-foreground">Lower-case letters, digits, dashes. Fixed once made.</p>
        </div>
        <div>
          <label className={label} htmlFor="dp-name">
            Name
          </label>
          <input id="dp-name" className="input h-10 w-full" value={p.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="dp-desc">
            What it is, for the client
          </label>
          <textarea id="dp-desc" className="input w-full" rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={label}>Includes</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {scopes.map((s) => (
              <label key={s} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={p.scopes.includes(s)}
                  onChange={(e) => set('scopes', e.target.checked ? [...p.scopes, s] : p.scopes.filter((x) => x !== s))}
                />
                <span>
                  <b>{SCOPE_WORDS[s]?.label ?? s}</b>
                  <span className="block text-xs text-muted-foreground">{SCOPE_WORDS[s]?.sells}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {numField('priceMonthly', 'Price a month (৳)')}
        {numField('historyMonths', 'Months of figures back')}
        {numField('requestsPerMinute', 'Calls a minute', 1)}
        {numField('requestsPerDay', 'Calls a day', 1)}
        {numField('requestsPerMonth', 'Calls a month', 1)}
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
          <input type="checkbox" checked={p.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Offered to new clients
        </label>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- try it -- */

const WHATS = [
  { key: 'medicines', label: 'Top medicines', part: 'demand' },
  { key: 'generics', label: 'By generic', part: 'demand' },
  { key: 'brands', label: 'Brands within a generic', part: 'demand' },
  { key: 'companies', label: 'By company', part: 'demand' },
  { key: 'districts', label: 'By district', part: 'districts' },
  { key: 'trends', label: 'Rising & falling', part: 'trends' },
  { key: 'medicine', label: 'One medicine, month by month', part: 'demand' },
  { key: 'catalogue', label: 'Medicine data (search)', part: 'catalogue' },
] as const;
type What = (typeof WHATS)[number]['key'];

const monthNow = () => new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 7);
const addMonths = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

type Named = { id: string; name: string };
type MedicineRef = { id: string; brand?: string; strength?: string; form?: string; generic?: string; company?: string };

/**
 * Exactly what a client would be sent — any part, any district, from the
 * admin side so nothing is metered. The five-shop rule applies, so an empty
 * answer here is an empty answer for a client too.
 */
function TryTab() {
  const { toast } = useToast();
  const [what, setWhat] = useState<What>('medicines');
  const [from, setFrom] = useState(addMonths(monthNow(), -3));
  const [to, setTo] = useState(addMonths(monthNow(), -1));
  const [district, setDistrict] = useState('');
  const [generic, setGeneric] = useState<Named | null>(null);
  const [medicine, setMedicine] = useState<MedicineRef | null>(null);
  const [text, setText] = useState('');
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: '25' };
    if (what !== 'catalogue') Object.assign(p, { from, to });
    if (district && what !== 'catalogue') p.district = district;
    if (generic) p.generic = generic.id;
    if (medicine && (what === 'medicine' || what === 'districts')) p.medicine = medicine.id;
    if (what === 'catalogue' && text.trim()) p.q = text.trim();
    return p;
  }, [what, from, to, district, generic, medicine, text]);

  const needs = what === 'brands' && !generic ? 'Pick a generic — run “By generic” and click one.' : what === 'medicine' && !medicine ? 'Pick a medicine — run “Top medicines” and click one.' : '';

  const run = useCallback(async () => {
    if (needs) return;
    setBusy(true);
    try {
      setData(await platformApi.dataApiPreview(what, params));
    } catch (e) {
      setData(null);
      toast(errorMessage(e, 'Could not run that.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [what, params, needs, toast]);

  useEffect(() => {
    if (what !== 'catalogue') void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, from, to, district, generic?.id, medicine?.id]);

  const medName = (m?: MedicineRef) => (m ? `${m.brand ?? ''} ${m.strength ?? ''}`.trim() || m.id : '');
  const pickMedicine = (m: MedicineRef) => {
    setMedicine(m);
    setWhat('medicine');
  };
  const pickGeneric = (g: Named) => {
    setGeneric(g);
    setWhat('brands');
  };

  const rows: Record<string, any>[] = data?.rows ?? [];
  const label = 'mb-1 block text-xs font-semibold text-muted-foreground';
  return (
    <div className="space-y-3">
      <div className="card mb-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="tr-what">
              What a client asks for
            </label>
            <select id="tr-what" className="input h-10 w-full" value={what} onChange={(e) => setWhat(e.target.value as What)}>
              {WHATS.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label} — {SCOPE_WORDS[w.part].label}
                </option>
              ))}
            </select>
          </div>
          {what === 'catalogue' ? (
            <div className="sm:col-span-2">
              <label className={label} htmlFor="tr-q">
                Brand or generic starts with
              </label>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run();
                }}
              >
                <input id="tr-q" className="input h-10 w-full" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. napa, omeprazole" />
                <button className="btn" disabled={busy}>
                  Search
                </button>
              </form>
            </div>
          ) : (
            <>
              <div>
                <label className={label} htmlFor="tr-from">
                  From month
                </label>
                <input id="tr-from" className="input h-10 w-full" type="month" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="tr-to">
                  To month
                </label>
                <input id="tr-to" className="input h-10 w-full" type="month" value={to} min={from} max={monthNow()} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="tr-district">
                  District
                </label>
                <DistrictSelect id="tr-district" className="input h-10 w-full" value={district} onChange={setDistrict} placeholder="The whole country" />
              </div>
            </>
          )}
          {(generic || medicine) && (
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              {generic && (
                <button className="pill" onClick={() => setGeneric(null)} title="Clear">
                  Generic: {generic.name} ✕
                </button>
              )}
              {medicine && (
                <button className="pill" onClick={() => setMedicine(null)} title="Clear">
                  Medicine: {medName(medicine)} ✕
                </button>
              )}
            </div>
          )}
        </div>
        {needs && <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">{needs}</p>}
      </div>

      <div className="card mb-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {data?.range && (
              <>
                {data.range.from} to {data.range.to}
                {data.range.partial ? ' (this month so far)' : ''} · {data.minShops}+ shops behind every figure ·{' '}
              </>
            )}
            {data && <>{num(data.total?.medicines ?? data.total?.pieces ?? rows.length)} {data.total?.medicines !== undefined ? 'medicines' : data.total?.pieces !== undefined ? 'pieces' : 'rows'}</>}
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> Show the JSON
          </label>
        </div>
        {busy && !data ? (
          <LoadingBlock />
        ) : !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{what === 'catalogue' ? 'Search the catalogue.' : 'Nothing yet.'}</p>
        ) : raw ? (
          <pre className="max-h-[480px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ data }, null, 2)}</pre>
        ) : (
          <TryResult what={what} data={data} onMedicine={pickMedicine} onGeneric={pickGeneric} onDistrict={setDistrict} />
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      Nothing clears the five-shop rule here — a client asking this would get an empty answer. Try a longer range, the whole country, or wait for more shops.
    </p>
  );
}

function TryResult({
  what,
  data,
  onMedicine,
  onGeneric,
  onDistrict,
}: {
  what: What;
  data: Record<string, any>;
  onMedicine: (m: MedicineRef) => void;
  onGeneric: (g: Named) => void;
  onDistrict: (d: string) => void;
}) {
  const rows: Record<string, any>[] = data.rows ?? [];
  const med = (m: MedicineRef) => (
    <button className="text-left hover:underline" onClick={() => onMedicine(m)}>
      <b>{m.brand}</b> {m.strength} <span className="text-muted-foreground">{m.form}</span>
      <span className="block text-xs text-muted-foreground">
        {m.generic} · {m.company}
      </span>
    </button>
  );

  if (what === 'catalogue') {
    if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No medicine starts with that.</p>;
    return (
      <div className="overflow-x-auto">
        <table className="table min-w-[560px]">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Generic</th>
              <th>Company</th>
              <th className="num">Price</th>
              <th>DAR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.brand}</b> {m.strength} <span className="text-muted-foreground">{m.form}</span>
                </td>
                <td>{m.generic}</td>
                <td>{m.company}</td>
                <td className="num">{m.price ? taka(m.price) : '—'}</td>
                <td className="text-xs text-muted-foreground">{m.dar || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (what === 'trends') {
    const list = (title: string, icon: ReactNode, items: Record<string, any>[]) => (
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          {icon} {title}
        </h4>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((x) => (
              <li key={x.medicine.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                {med(x.medicine)}
                <span className="shrink-0 text-right tabular-nums">
                  <b className={x.change >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                    {x.change >= 0 ? '+' : ''}
                    {x.change}%
                  </b>
                  <span className="block text-xs text-muted-foreground">
                    {num(x.piecesBefore)} → {num(x.pieces)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None.</p>
        )}
      </div>
    );
    if (!data.rising?.length && !data.falling?.length) return <Empty />;
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {list('Rising', <TrendingUp className="h-4 w-4 text-emerald-600" />, data.rising)}
        {list('Falling', <TrendingDown className="h-4 w-4 text-destructive" />, data.falling)}
        <p className="text-xs text-muted-foreground lg:col-span-2">
          Against {data.previous?.from} to {data.previous?.to}.
        </p>
      </div>
    );
  }

  if (what === 'medicine') {
    const months: { month: string; pieces: number | null; value: number | null }[] = data.months ?? [];
    const max = Math.max(1, ...months.map((m) => m.pieces ?? 0));
    return (
      <div className="space-y-4">
        {data.medicine && <div>{med(data.medicine)}</div>}
        <ul className="space-y-1.5">
          {months.map((m) => (
            <li key={m.month} className="grid grid-cols-[72px_1fr_90px] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{m.month}</span>
              <span className="h-3 rounded-full bg-muted">
                {m.pieces !== null && <span className="block h-3 rounded-full bg-primary" style={{ width: `${(m.pieces / max) * 100}%` }} />}
              </span>
              <span className="text-right tabular-nums">{m.pieces === null ? <span className="text-muted-foreground">withheld</span> : num(m.pieces)}</span>
            </li>
          ))}
        </ul>
        {data.districts?.length > 0 && (
          <ShareTable head="District" rows={data.districts.map((d: any) => ({ key: d.district, name: d.district, pieces: d.pieces, value: d.value, share: d.share }))} onPick={onDistrict} />
        )}
      </div>
    );
  }

  if (!rows.length) return <Empty />;

  if (what === 'medicines' || what === 'brands') {
    return (
      <div className="overflow-x-auto">
        <table className="table min-w-[560px]">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Medicine</th>
              <th className="num">Pieces</th>
              <th className="num">Value</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.medicine.id}>
                <td className="num text-muted-foreground">{r.rank}</td>
                <td>{med(r.medicine)}</td>
                <td className="num">{num(r.pieces)}</td>
                <td className="num">{taka(r.value)}</td>
                <td className="num">{r.share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (what === 'generics') {
    return <ShareTable head="Generic" rows={rows.map((r) => ({ key: r.generic.id, name: r.generic.name, sub: `${r.medicines} brands`, pieces: r.pieces, value: r.value, share: r.share }))} onPick={(id) => onGeneric(rows.find((r) => r.generic.id === id)!.generic)} />;
  }
  if (what === 'companies') {
    return <ShareTable head="Company" rows={rows.map((r) => ({ key: r.company.id, name: r.company.name, sub: `${r.medicines} medicines`, pieces: r.pieces, value: r.value, share: r.share }))} />;
  }
  return <ShareTable head="District" rows={rows.map((r) => ({ key: r.district, name: r.district, sub: `${r.medicines} medicines`, pieces: r.pieces, value: r.value, share: r.share }))} onPick={onDistrict} />;
}

function ShareTable({ head, rows, onPick }: { head: string; rows: { key: string; name: string; sub?: string; pieces: number; value: number; share: number }[]; onPick?: (key: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[560px]">
        <thead>
          <tr>
            <th>{head}</th>
            <th className="num">Pieces</th>
            <th className="num">Value</th>
            <th className="w-[30%]">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {onPick ? (
                  <button className="text-left font-semibold hover:underline" onClick={() => onPick(r.key)}>
                    {r.name}
                  </button>
                ) : (
                  <b>{r.name}</b>
                )}
                {r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}
              </td>
              <td className="num">{num(r.pieces)}</td>
              <td className="num">{taka(r.value)}</td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="h-2 flex-1 rounded-full bg-muted">
                    <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, r.share)}%` }} />
                  </span>
                  <span className="w-12 text-right text-xs tabular-nums">{r.share}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- changes -- */

export function logWords(l: DataApiLogRow, planName: (k: string) => string = (k) => k) {
  const d = (l.detail ?? {}) as Record<string, any>;
  switch (l.action) {
    case 'client.create':
      return `Client added on ${planName(d.plan)}`;
    case 'client.update':
      return `Client changed: ${(d.changed ?? []).join(', ')}`;
    case 'key.create':
      return `Key ${d.prefix}… made${d.label ? ` (${d.label})` : ''}`;
    case 'key.revoke':
      return `Key ${d.prefix}… revoked`;
    case 'plan.create':
      return `Plan ${d.name} added`;
    case 'plan.update':
      return `Plan ${d.name} changed`;
    default:
      return l.action;
  }
}

function LogTab({ onOff }: { onOff: (m: string) => void }) {
  const { data } = useLoad(() => platformApi.dataApiLog(), onOff);
  if (!data) return <LoadingBlock />;
  return (
    <div className="card mb-0 overflow-x-auto p-0">
      {data.length ? (
        <table className="table min-w-[560px]">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Client</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l) => (
              <tr key={l._id}>
                <td className="whitespace-nowrap">{when(l.at)}</td>
                <td>{l.by}</td>
                <td>{logWords(l)}</td>
                <td>{l.client ? <Link to={`/data-api/clients/${l.client}`} className="hover:underline">{l.clientName || 'client'}</Link> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="p-6 text-center text-sm text-muted-foreground">Nothing changed yet.</p>
      )}
    </div>
  );
}

