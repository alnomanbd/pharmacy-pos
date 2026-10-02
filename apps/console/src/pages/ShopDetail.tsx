import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Users as UsersIcon,
  ReceiptText,
  Package,
  Monitor,
  Banknote,
  TrendingDown,
  Download,
  Eye,
  Pencil,
  Ban,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Save,
  ClipboardList,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { platformApi, downloadBlob, type Shop, type ShopMonth, type SeatUsage, type ShopPlanUsage } from '../api';
import ShopUserActions from '../components/ShopUserActions';
import { openSupportView } from '../lib/supportView';
import RecordPaymentDialog from '../components/RecordPaymentDialog';
import ShopNotesCard from '../components/ShopNotesCard';
import ShopLimitsCard, { signupSummary } from '../components/ShopLimitsCard';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock, Spinner } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { BTN_DANGER, BTN_OUTLINE, BTN_OUTLINE_DANGER, BTN_SECONDARY, can, errorMessage, useAccess } from '../lib/ui';
import type { User } from '@dawai/shared/types';
import { lastSeen } from '../lib/lastSeen';

/**
 * One shop, for the operator: what it is on, how it is doing month by month,
 * who works there, and the two levers support pulls most — correcting a user's
 * details and setting a password for an owner who is locked out.
 */

const taka = (n: number) => `৳ ${n.toLocaleString('en-IN')}`;
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const seat = (s?: SeatUsage) => (s ? `${s.used} / ${s.limit ?? '∞'}` : '—');

/** The address as the profile endpoint takes it. */
const ADDRESS_FIELDS: { key: string; label: string }[] = [
  { key: 'street', label: 'Street' },
  { key: 'area', label: 'Area' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'postalCode', label: 'Postcode' },
];

const EMPTY_PROFILE = {
  name: '',
  contactPhone: '',
  contactEmail: '',
  address: { street: '', area: '', city: '', district: '', postalCode: '' } as Record<string, string>,
};

export default function ShopDetail() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const [org, setOrg] = useState<Shop | null>(null);
  const [recording, setRecording] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [counts, setCounts] = useState({ bills: 0, products: 0, counters: 0, users: 0 });
  const [plan, setPlan] = useState<ShopPlanUsage | null>(null);
  const [usage, setUsage] = useState<ShopMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const access = useAccess();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [busy, setBusy] = useState('');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

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

  const openProfile = () => {
    if (!org) return;
    setProfile({
      name: org.name ?? '',
      contactPhone: org.contactPhone ?? '',
      contactEmail: org.contactEmail ?? '',
      address: Object.fromEntries(ADDRESS_FIELDS.map((f) => [f.key, org.address?.[f.key] ?? ''])),
    });
    setProfileOpen(true);
  };

  const emailBad = Boolean(profile.contactEmail.trim()) && !/^\S+@\S+\.\S+$/.test(profile.contactEmail.trim());
  const nameBad = profile.name.trim().length < 2;

  const saveProfile = async () => {
    if (nameBad || emailBad) return;
    setBusy('profile');
    try {
      await platformApi.updateShopProfile(id, {
        name: profile.name.trim(),
        contactPhone: profile.contactPhone.trim(),
        contactEmail: profile.contactEmail.trim(),
        address: Object.fromEntries(Object.entries(profile.address).map(([k, v]) => [k, v.trim()])),
      });
      toast('Shop details saved.');
      setProfileOpen(false);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save those details.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const setStatus = async (status: 'active' | 'suspended', reason?: string) => {
    setBusy('status');
    try {
      await platformApi.updateOrganization(id, status === 'suspended' ? { status, suspendedReason: reason } : { status });
      toast(status === 'suspended' ? 'Shop suspended.' : 'Shop reactivated.');
      setSuspendOpen(false);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not update that shop.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!org) return;
    setBusy('delete');
    try {
      const res = await platformApi.deleteOrganization(id, deleteConfirm.trim());
      toast(`${res.name} deleted permanently.`);
      navigate('/', { replace: true });
    } catch (e) {
      toast(errorMessage(e, 'Could not delete that shop.'), 'error');
      setBusy('');
    }
  };

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
  const canEdit = can(access, 'shops.edit');
  const canSuspend = can(access, 'shops.suspend');
  const canDelete = can(access, 'shops.delete');
  const canPlan = can(access, 'shops.plan');
  const canViewAs = can(access, 'shops.impersonate');
  const canRecordPayment = can(access, 'payments.verify');
  /* The owner if they can sign in, or else the first account that can. */
  const viewTarget =
    users.find((u) => u.role === 'admin' && u.isActive !== false) ?? users.find((u) => u.isActive !== false);
  const viewShop = async () => {
    if (!viewTarget) return;
    try {
      const shop = await openSupportView(id, viewTarget._id);
      toast(`Opened ${shop} as ${viewTarget.name} in a new tab — read-only, for 30 minutes.`);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not open the support view.', 'error');
    }
  };
  const asked = signupSummary(org.signup);

  return (
    <div className="page">
      {canRecordPayment && (
        <RecordPaymentDialog
          open={recording}
          onClose={() => setRecording(false)}
          shop={{ _id: id, name: org.name, plan: org.plan, trialEndsAt: org.trialEndsAt }}
          onRecorded={() => void load()}
        />
      )}
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
        <div className="flex flex-wrap gap-2">
          {canRecordPayment && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setRecording(true)}>
              <Banknote className="h-4 w-4" /> Record payment
            </button>
          )}
          {canViewAs && viewTarget && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => void viewShop()}
              title={`See the shop app as ${viewTarget.name} sees it. Read-only, for 30 minutes.`}
            >
              <Eye className="h-4 w-4" /> View shop
            </button>
          )}
          {canEdit && (
            <button type="button" className={BTN_SECONDARY} onClick={openProfile}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
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
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Bills', value: counts.bills.toLocaleString(), icon: ReceiptText },
          { label: 'Products', value: counts.products.toLocaleString(), icon: Package },
          {
            label: plan?.terminals.overridden ? 'Counters (custom)' : 'Counters (plan)',
            value: seat(plan?.terminals),
            icon: Monitor,
          },
          {
            label: plan?.shopUsers.overridden ? 'Staff logins (custom)' : 'Staff logins (plan)',
            value: seat(plan?.shopUsers),
            icon: UsersIcon,
          },
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

      {/* What they told us on the form — read before ringing them. */}
      {asked && (
        <div className="card">
          <h3 className="mb-1 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Sign-up details
          </h3>
          <p className="break-words text-sm">{asked}</p>
        </div>
      )}

      <ShopLimitsCard shopId={id} usage={plan} canEdit={canPlan} onSaved={load} />
      <ShopNotesCard shopId={id} isOwner={Boolean(access?.isOwner)} />

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
                  <td className="text-sm text-muted-foreground">
                    <Link to={`/messages?q=${encodeURIComponent(u.email)}`} className="hover:underline" title="Emails sent to this address">
                      {u.email}
                    </Link>
                  </td>
                  <td className="text-sm text-muted-foreground">{u.phone}</td>
                  <td className="text-sm text-muted-foreground">
                    {lastSeen(u.lastLoginAt) ?? 'never'}
                  </td>
                  <td className="text-right">
                    <ShopUserActions shopId={id} user={u} onChanged={() => void load()} canViewAs={canViewAs} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mb-0 flex-1">Shop details</h3>
          {canEdit && (
            <button type="button" className={BTN_OUTLINE} onClick={openProfile}>
              <Pencil className="h-3.5 w-3.5" /> Edit shop details
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Phone</dt>
            <dd className="break-words">{org.contactPhone || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="break-all">{org.contactEmail || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Address</dt>
            <dd className="break-words">
              {ADDRESS_FIELDS.map((f) => org.address?.[f.key])
                .filter(Boolean)
                .join(', ') || '—'}
            </dd>
          </div>
        </dl>
      </div>

      {(canSuspend || canDelete) && (
        <div className="card" style={{ borderColor: 'hsl(var(--destructive) / 0.45)' }}>
          <h3 className="mb-1 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Danger zone
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Suspend first. A suspended shop can then be deleted.
          </p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {canSuspend && (
              <div className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1 basis-56">
                  <strong className="block text-sm">
                    {org.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                  </strong>
                  <span className="block text-xs text-muted-foreground">
                    {org.status === 'suspended'
                      ? org.suspendedReason
                        ? `Suspended: ${org.suspendedReason}`
                        : 'Suspended. Everyone is refused at login.'
                      : 'Signs everyone out and refuses them at login.'}
                  </span>
                </div>
                {org.status === 'suspended' ? (
                  <button
                    type="button"
                    className={BTN_OUTLINE}
                    disabled={busy === 'status'}
                    onClick={() => void setStatus('active')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className={BTN_OUTLINE_DANGER}
                    disabled={busy === 'status'}
                    onClick={() => {
                      setSuspendReason('');
                      setSuspendOpen(true);
                    }}
                  >
                    <Ban className="h-3.5 w-3.5" /> Suspend
                  </button>
                )}
              </div>
            )}
            {canDelete && (
              <div className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1 basis-56">
                  <strong className="block text-sm">Delete permanently</strong>
                  <span className="block text-xs text-muted-foreground">
                    {org.status === 'suspended'
                      ? 'Removes its bills, stock, khata and files. No undo.'
                      : 'Suspend the shop first.'}
                  </span>
                </div>
                <button
                  type="button"
                  className={BTN_DANGER}
                  disabled={org.status !== 'suspended'}
                  onClick={() => {
                    setDeleteConfirm('');
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete permanently
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Edit shop details"
        width="max-w-lg"
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setProfileOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={nameBad || emailBad || busy === 'profile'}
              onClick={() => void saveProfile()}
            >
              {busy === 'profile' ? <Spinner /> : <Save className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile();
          }}
        >
          <label className="label sm:col-span-2">
            Shop name
            <input
              className="input mt-1"
              value={profile.name}
              maxLength={160}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              autoFocus
            />
          </label>
          <label className="label">
            Contact phone
            <input
              className="input mt-1"
              type="tel"
              value={profile.contactPhone}
              onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
            />
          </label>
          <label className="label">
            Contact email
            <input
              className="input mt-1"
              type="email"
              value={profile.contactEmail}
              aria-invalid={emailBad}
              onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
            />
            {emailBad && <span className="mt-0.5 block text-[11px] text-destructive">Not an email.</span>}
          </label>
          {ADDRESS_FIELDS.map((f) => (
            <label key={f.key} className={`label ${f.key === 'street' ? 'sm:col-span-2' : ''}`}>
              {f.label}
              <input
                className="input mt-1"
                value={profile.address[f.key] ?? ''}
                onChange={(e) =>
                  setProfile({ ...profile, address: { ...profile.address, [f.key]: e.target.value } })
                }
              />
            </label>
          ))}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      {/* The shop is shown this reason at the login screen. */}
      <Modal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title={`Suspend ${org.name}?`}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setSuspendOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              disabled={!suspendReason.trim() || busy === 'status'}
              onClick={() => void setStatus('suspended', suspendReason.trim())}
            >
              <Ban className="h-4 w-4" /> Suspend
            </button>
          </>
        }
      >
        <label className="label">
          Reason
          <input
            className="input mt-1"
            placeholder="e.g. Payment overdue since 12 August"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            autoFocus
          />
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            They see this when they try to sign in.
          </span>
        </label>
      </Modal>

      {/* Typing the name back is the guard: there is no undo. */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${org.name}?`}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              disabled={deleteConfirm.trim() !== org.name || busy === 'delete'}
              onClick={() => void remove()}
            >
              {busy === 'delete' ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete permanently
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This removes {counts.bills.toLocaleString()} bills, {counts.products.toLocaleString()} products,
          the stock, the khata and every uploaded file. It cannot be undone. Export the data first.
        </p>
        <label className="label mt-3">
          Type <strong className="text-foreground">{org.name}</strong> to confirm
          <input
            className="input mt-1"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            autoFocus
          />
        </label>
      </Modal>
    </div>
  );
}
