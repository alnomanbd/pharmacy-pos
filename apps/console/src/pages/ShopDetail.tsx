import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Users as UsersIcon,
  ReceiptText,
  Package,
  Monitor,
  Banknote,
  TrendingDown,
  Download,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { platformApi, downloadBlob, type Shop, type ShopMonth, type SeatUsage } from '../api';
import ShopUserActions from '../components/ShopUserActions';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import type { User } from '@dawai/shared/types';

/**
 * One shop, for the operator: what it is on, how it is doing month by month,
 * who works there, and the two levers support pulls most — correcting a user's
 * details and setting a password for an owner who is locked out.
 */

const taka = (n: number) => `৳ ${n.toLocaleString('en-IN')}`;
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const seat = (s?: SeatUsage) => (s ? `${s.used} / ${s.limit ?? '∞'}` : '—');

export default function ShopDetail() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const [org, setOrg] = useState<Shop | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [counts, setCounts] = useState({ bills: 0, products: 0, counters: 0, users: 0 });
  const [plan, setPlan] = useState<{ planName: string; terminals: SeatUsage; shopUsers: SeatUsage } | null>(null);
  const [usage, setUsage] = useState<ShopMonth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, months] = await Promise.all([platformApi.organization(id), platformApi.usage(id, 6)]);
      setOrg(detail.organization);
      setUsers(detail.users);
      setCounts(detail.counts);
      setPlan(detail.usage);
      setUsage(months);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || 'Could not load that shop.', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }
  if (!org) return null;

  // Last month against the one before — the number that says "leaving".
  const [prev, last] = usage.slice(-2);
  const trend = prev && last && prev.bills > 0 ? Math.round(((last.bills - prev.bills) / prev.bills) * 100) : null;
  const lapsed = org.trialEndsAt ? new Date(org.trialEndsAt) < new Date() : false;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <Link to="/" className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All shops
          </Link>
          <h1>{org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {org.status} · {plan?.planName ?? org.plan}
            {org.trialEndsAt && (
              <span className={lapsed ? 'font-semibold text-destructive' : ''}>
                {' '}
                · {lapsed ? 'lapsed' : 'until'} {new Date(org.trialEndsAt).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
          onClick={() =>
            void platformApi
              .exportOrganization(id)
              .then((b) => downloadBlob(b, `${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`))
              .catch(() => toast('Could not export that shop.', 'error'))
          }
        >
          <Download className="h-4 w-4" /> Export data
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Bills', value: counts.bills.toLocaleString(), icon: ReceiptText },
          { label: 'Products', value: counts.products.toLocaleString(), icon: Package },
          { label: 'Counters (plan)', value: seat(plan?.terminals), icon: Monitor },
          { label: 'Staff logins (plan)', value: seat(plan?.shopUsers), icon: UsersIcon },
        ].map((s) => (
          <div className="card" key={s.label}>
            <div className="flex items-center gap-2">
              <s.icon className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold tabular-nums">{s.value}</span>
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mb-0">Last six months</h3>
          {trend !== null && trend <= -30 && (
            <span className="pill noShow inline-flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> bills down {Math.abs(trend)}%
            </span>
          )}
        </div>

        {usage.every((m) => m.bills === 0 && m.purchases === 0) ? (
          <div className="empty">Nothing recorded yet.</div>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={usage.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="bills" name="Bills" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" name="Deliveries" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Bills</th>
                <th>Takings</th>
                <th>Deliveries</th>
              </tr>
            </thead>
            <tbody>
              {[...usage].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="tabular-nums">{m.bills.toLocaleString()}</td>
                  <td className="inline-flex items-center gap-1 tabular-nums">
                    <Banknote className="h-3 w-3 text-muted-foreground" />
                    {taka(m.takings)}
                  </td>
                  <td className="tabular-nums">{m.purchases.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3">People</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Last seen</th>
                <th className="text-right">Support</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-sm">{u.role === 'admin' ? 'owner' : u.role}</td>
                  <td className="text-sm text-muted-foreground">{u.email}</td>
                  <td className="text-sm text-muted-foreground">{u.phone}</td>
                  <td className="text-sm text-muted-foreground">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}
                  </td>
                  <td className="text-right">
                    <ShopUserActions shopId={id} user={u} onChanged={() => void load()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
