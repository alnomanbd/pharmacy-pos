import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Shield, ShieldOff, X, Save, Trash2, KeyRound, Check, Pencil, Lock, Power } from 'lucide-react';
import { platformApi, type PlatformRole } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock, Spinner } from '@dawai/shared/components/Spinner';
import ConfirmDialog from '@dawai/shared/components/ConfirmDialog';
import PasswordMeter from '@dawai/shared/components/PasswordMeter';
import { passwordProblem } from '@dawai/shared/lib/password';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import type { PlatformMember, PermissionPreset } from '@dawai/shared/types';
import Modal from '../components/Modal';
import { BTN_OUTLINE, BTN_OUTLINE_DANGER, BTN_SECONDARY, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';

/**
 * The people who run this deployment.
 *
 * One operator account was never a plan, and the alternative people reach for —
 * sharing the owner's login — means anyone who needed to check a payment can
 * also suspend a customer or delete a shop's records.
 *
 * So access is granted piece by piece. The presets exist because sixteen
 * checkboxes is a decision nobody makes correctly at speed; the full list is
 * underneath for when a preset is not quite right.
 */

/* A new member gets a role (by id), or `custom` with permissions picked by hand. */
const EMPTY = { name: '', email: '', phone: '', password: '', roleId: '', permissions: [] as string[] };

/** Grouped by what they are about, so the list reads rather than scans. */
const GROUPS: { title: string; prefix: string }[] = [
  { title: 'Accounts', prefix: 'shops.' },
  { title: 'Payments', prefix: 'payments.' },
  { title: 'Plans', prefix: 'plans.' },
  { title: 'Medicines', prefix: 'formulary.' },
  { title: 'Medicine Requests', prefix: 'requests.' },
  { title: 'Catalogue', prefix: 'catalogue.' },
  { title: 'Team', prefix: 'team.' },
  { title: 'Data API', prefix: 'dataapi.' },
];

/** Whatever no group above claims, so a new permission is never ungrantable. */
const inAnyGroup = (p: string) => GROUPS.some((g) => p.startsWith(g.prefix));

/** The ones that should never be handed out casually. */
const DANGEROUS = new Set(['shops.delete', 'plans.manage', 'team.manage', 'dataapi.manage']);

export default function Team() {
  const { toast } = useToast();
  const [members, setMembers] = useState<PlatformMember[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [, setPresets] = useState<PermissionPreset[]>([]);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  /* The role being edited in the Roles card: an id, `new`, or nothing. */
  const [roleEdit, setRoleEdit] = useState<{ id: string; name: string; description: string; permissions: string[] } | null>(null);
  /* Changing a member's access: a role id, or `custom`. */
  const [editRole, setEditRole] = useState<string>('custom');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState<string>('');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] = useState<PlatformMember | null>(null);
  const [resetTarget, setResetTarget] = useState<PlatformMember | null>(null);
  const me = useAuthStore((s) => s.user);
  /** Whose name, email and phone are being corrected. */
  const [detailsTarget, setDetailsTarget] = useState<PlatformMember | null>(null);
  const [details, setDetails] = useState({ name: '', email: '', phone: '' });
  const [passwordTarget, setPasswordTarget] = useState<PlatformMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const isMe = (m: PlatformMember) => Boolean(me && (me.id === m._id || me.email === m.email));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [team, catalogue, roleList] = await Promise.all([
        platformApi.team(),
        platformApi.teamPermissions(),
        platformApi.teamRoles(),
      ]);
      setMembers(team);
      setRoles(roleList);
      setPermissions(catalogue.permissions);
      setPresets(catalogue.presets);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load the team.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!draft.name.trim() || !draft.email.trim() || draft.password.length < 10) {
      toast('Name, email and a password of at least 10 characters are required.', 'error');
      return;
    }
    setBusy('new');
    try {
      const { roleId, permissions: perms, ...who } = draft;
      await platformApi.addTeamMember(roleId && roleId !== 'custom' ? { ...who, roleId } : { ...who, permissions: perms });
      toast(`${draft.name} added. Give them the password you set — they can change it after.`);
      setAdding(false);
      setDraft(EMPTY);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not add them.', 'error');
    } finally {
      setBusy('');
    }
  };

  const savePerms = async (m: PlatformMember) => {
    setBusy(m._id);
    try {
      await platformApi.updateTeamMember(
        m._id,
        editRole === 'custom' ? { roleId: null, permissions: editPerms } : { roleId: editRole },
      );
      toast('Access updated.');
      setEditing('');
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not update access.', 'error');
    } finally {
      setBusy('');
    }
  };

  const toggleActive = async (m: PlatformMember) => {
    setBusy(m._id);
    try {
      const on = m.isActive !== false;
      await platformApi.updateTeamMember(m._id, { isActive: !on });
      toast(on ? `${m.name} disabled.` : `${m.name} enabled.`);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not update.', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(removeTarget._id);
    try {
      await platformApi.removeTeamMember(removeTarget._id);
      toast(`${removeTarget.name} removed.`);
      setRemoveTarget(null);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not remove them.', 'error');
    } finally {
      setBusy('');
    }
  };

  /* A colleague's lost phone. They are sent to setup on their next sign-in. */
  const resetTwoFactor = async () => {
    if (!resetTarget) return;
    setBusy(resetTarget._id);
    try {
      await platformApi.resetTeamMemberTwoFactor(resetTarget._id);
      toast(`${resetTarget.name}'s two-factor is reset. They set it up again when they sign in.`);
      setResetTarget(null);
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not reset two-factor.', 'error');
    } finally {
      setBusy('');
    }
  };

  const openDetails = (m: PlatformMember) => {
    setDetailsTarget(m);
    setDetails({ name: m.name, email: m.email, phone: m.phone ?? '' });
  };

  const saveDetails = async () => {
    const m = detailsTarget;
    if (!m) return;
    const name = details.name.trim();
    const email = details.email.trim();
    if (!name || (!isMe(m) && !email)) {
      toast('A name and an email are required.', 'error');
      return;
    }
    setBusy(`details-${m._id}`);
    try {
      if (isMe(m)) {
        await platformApi.updateMe({ name, phone: details.phone.trim() });
        // The account menu shows the name too.
        if (me) useAuthStore.getState().setUser({ ...me, name });
      } else {
        await platformApi.updateTeamMember(m._id, { name, email, phone: details.phone.trim() });
      }
      toast(isMe(m) ? 'Your details are saved.' : `${name} updated.`);
      setDetailsTarget(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save those details.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const pwProblem = newPassword ? passwordProblem(newPassword) : null;

  const savePassword = async () => {
    const m = passwordTarget;
    if (!m || passwordProblem(newPassword)) return;
    setBusy(`pw-${m._id}`);
    try {
      await platformApi.setTeamMemberPassword(m._id, newPassword);
      toast(`Password set. ${m.name} is signed out everywhere — tell them the new one in person.`);
      setPasswordTarget(null);
      setNewPassword('');
    } catch (e) {
      toast(errorMessage(e, 'Could not set that password.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const PermissionGrid = ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (next: string[]) => void;
  }) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[...GROUPS, { title: 'Other', prefix: '' }].map((g) => {
        const inGroup = permissions.filter((p) =>
          g.prefix ? p.startsWith(g.prefix) : !inAnyGroup(p),
        );
        if (inGroup.length === 0) return null;
        return (
          <div key={g.prefix}>
            <div className="label">{g.title}</div>
            {inGroup.map((p) => (
              <label key={p} className="flex items-start gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={value.includes(p)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))
                  }
                />
                <span className={DANGEROUS.has(p) ? 'font-semibold text-destructive' : ''}>
                  {g.prefix ? p.split('.')[1] : p}
                  {DANGEROUS.has(p) && <span className="ml-1 text-[10px]">(careful)</span>}
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );

  const saveRole = async () => {
    if (!roleEdit) return;
    setBusy('role');
    try {
      const body = { name: roleEdit.name.trim(), description: roleEdit.description.trim(), permissions: roleEdit.permissions };
      if (roleEdit.id === 'new') await platformApi.createTeamRole(body);
      else await platformApi.updateTeamRole(roleEdit.id, body);
      toast('Role saved — everybody with it has the change now.');
      setRoleEdit(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not save the role.'), 'error');
    } finally {
      setBusy('');
    }
  };
  const deleteRole = async (r: PlatformRole) => {
    if (!window.confirm(`Delete the role “${r.name}”?`)) return;
    try {
      await platformApi.deleteTeamRole(r.id);
      toast('Role deleted.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not delete the role.'), 'error');
    }
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>Team</h1>
          <p className="text-sm text-muted-foreground">
            Who runs this deployment, and what each of them may do.
          </p>
        </div>
        <button className="btn" onClick={() => setAdding((v) => !v)}>
          <UserPlus className="h-4 w-4" /> Add member
        </button>
      </div>

      {adding && (
        <div className="card" style={{ borderColor: 'hsl(var(--primary) / 0.4)' }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="mb-0">Add a team member</h3>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              onClick={() => setAdding(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="label">
              Name
              <input
                className="input mt-1"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="label">
              Email
              <input
                className="input mt-1"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <label className="label">
              Phone (optional)
              <input
                className="input mt-1"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </label>
            <label className="label">
              Password
              <input
                className="input mt-1"
                type="password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder="At least 10 characters"
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Tell them in person. They can change it once they are in.
              </span>
            </label>
          </div>

          <div className="mt-3">
            <div className="label">Their role</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...roles.map((r) => ({ key: r.id, label: r.name, description: r.description || `${r.permissions.length} permissions` })), { key: 'custom', label: 'Custom', description: 'Pick the permissions one by one' }].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    draft.roleId === p.key ? 'border-primary bg-secondary' : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => setDraft({ ...draft, roleId: p.key })}
                >
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.description}</span>
                </button>
              ))}
            </div>
            {draft.roleId === 'custom' && (
              <div className="mt-3">
                <PermissionGrid value={draft.permissions} onChange={(v) => setDraft({ ...draft, permissions: v })} />
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              A role keeps a member's access in step with everybody else who does the same job. You can only give what you hold yourself.
            </p>
          </div>

          <button className="btn mt-3" onClick={() => void add()} disabled={busy === 'new'}>
            <Save className="h-4 w-4" /> Add
          </button>
        </div>
      )}

      {/* ---- roles: a named set of permissions, given to members ---- */}
      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="mb-0">Roles</h3>
            <p className="text-xs text-muted-foreground">Change a role and it changes for every member who has it.</p>
          </div>
          <button className={BTN_OUTLINE} onClick={() => setRoleEdit({ id: 'new', name: '', description: '', permissions: [] })}>
            <UserPlus className="h-3.5 w-3.5" /> New role
          </button>
        </div>
        {roleEdit && (
          <div className="mb-3 rounded-lg border border-primary/40 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
              <label className="label">
                Name
                <input className="input mt-1" value={roleEdit.name} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} />
              </label>
              <label className="label">
                What it is for
                <input className="input mt-1" value={roleEdit.description} onChange={(e) => setRoleEdit({ ...roleEdit, description: e.target.value })} />
              </label>
            </div>
            <div className="mt-3">
              <PermissionGrid value={roleEdit.permissions} onChange={(v) => setRoleEdit({ ...roleEdit, permissions: v })} />
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-sm" disabled={busy === 'role' || !roleEdit.name.trim()} onClick={() => void saveRole()}>
                <Check className="h-3.5 w-3.5" /> Save role
              </button>
              <button className={BTN_OUTLINE} onClick={() => setRoleEdit(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <strong className="text-sm">{r.name}</strong>
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.people} {r.people === 1 ? 'member' : 'members'}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description || '—'}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {r.permissions.length} of {permissions.length} permissions
              </p>
              <div className="mt-2 flex gap-2">
                <button className={BTN_OUTLINE} onClick={() => setRoleEdit({ id: r.id, name: r.name, description: r.description, permissions: r.permissions })}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  className={BTN_OUTLINE_DANGER}
                  disabled={r.people > 0}
                  title={r.people > 0 ? 'Give these members another role first' : 'Delete'}
                  onClick={() => void deleteRole(r)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : (
          members.map((m) => {
            const self = isMe(m);
            return (
              <div className="mt-3 rounded-lg border border-border p-3 first:mt-0" key={m._id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Shield className={`h-4 w-4 ${m.isOwner ? 'text-primary' : 'text-muted-foreground'}`} />
                  <strong>{m.name}</strong>
                  {self && <span className="pill called">you</span>}
                  {m.isOwner && <span className="pill booked">owner</span>}
                  {!m.isOwner && <span className="pill called">{m.roleName || 'Custom'}</span>}
                  {m.isActive === false && <span className="pill cancelled">disabled</span>}
                  {m.twoFactorEnabled && (
                    <span className="pill completed inline-flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> 2FA
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {m.lastLoginAt
                      ? `last seen ${lastSeen(m.lastLoginAt)}`
                      : 'never signed in'}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  <span className="break-all">{m.email}</span>
                  {m.phone && <span>{m.phone}</span>}
                </div>

                {editing === m._id ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label">Role</div>
                    <select className="input mb-3 max-w-xs" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                      <option value="custom">Custom — pick permissions</option>
                    </select>
                    {editRole === 'custom' ? (
                      <PermissionGrid value={editPerms} onChange={setEditPerms} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {roles.find((r) => r.id === editRole)?.permissions.join(' · ')}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        className="btn btn-sm"
                        onClick={() => void savePerms(m)}
                        disabled={busy === m._id}
                      >
                        <Check className="h-3.5 w-3.5" /> Save
                      </button>
                      <button className={BTN_OUTLINE} onClick={() => setEditing('')}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.isOwner ? (
                        <span className="text-xs text-muted-foreground">Full access.</span>
                      ) : m.permissions.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No access yet.</span>
                      ) : (
                        m.permissions.map((p) => (
                          <span
                            key={p}
                            className={`pill ${DANGEROUS.has(p) ? 'noShow' : 'booked'}`}
                            style={{ fontSize: 11 }}
                          >
                            {p}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <button type="button" className={BTN_OUTLINE} onClick={() => openDetails(m)}>
                        <Pencil className="h-3.5 w-3.5" /> {self ? 'Edit my details' : 'Edit details'}
                      </button>
                      {!self && (
                        <button
                          type="button"
                          className={BTN_OUTLINE}
                          onClick={() => {
                            setPasswordTarget(m);
                            setNewPassword('');
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Set password
                        </button>
                      )}
                      {!self && m.twoFactorEnabled && (
                        <button
                          type="button"
                          className={BTN_OUTLINE}
                          disabled={busy === m._id}
                          onClick={() => setResetTarget(m)}
                          title="Lost phone? Clear their two-factor"
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> Reset 2FA
                        </button>
                      )}
                      {m.isOwner ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" /> Owner access is fixed.
                        </span>
                      ) : self ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" /> Another member manages your access.
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={BTN_OUTLINE}
                            onClick={() => {
                              setEditing(m._id);
                              setEditPerms(m.permissions);
                              setEditRole(m.roleId ?? 'custom');
                            }}
                          >
                            <Shield className="h-3.5 w-3.5" /> Change access
                          </button>
                          <button
                            type="button"
                            className={BTN_OUTLINE}
                            disabled={busy === m._id}
                            onClick={() => void toggleActive(m)}
                          >
                            <Power className="h-3.5 w-3.5" /> {m.isActive === false ? 'Enable' : 'Disable'}
                          </button>
                          <button
                            type="button"
                            className={BTN_OUTLINE_DANGER}
                            disabled={busy === m._id}
                            onClick={() => setRemoveTarget(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={Boolean(detailsTarget)}
        onClose={() => setDetailsTarget(null)}
        title={detailsTarget && isMe(detailsTarget) ? 'Edit my details' : `Edit ${detailsTarget?.name ?? ''}`}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setDetailsTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={!details.name.trim() || busy.startsWith('details-')}
              onClick={() => void saveDetails()}
            >
              {busy.startsWith('details-') ? <Spinner /> : <Save className="h-4 w-4" />} Save
            </button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDetails();
          }}
        >
          <label className="label">
            Name
            <input
              className="input mt-1"
              value={details.name}
              onChange={(e) => setDetails({ ...details, name: e.target.value })}
              autoFocus
            />
          </label>
          <label className="label">
            Email
            <input
              className="input mt-1"
              type="email"
              value={details.email}
              disabled={Boolean(detailsTarget && isMe(detailsTarget))}
              onChange={(e) => setDetails({ ...details, email: e.target.value })}
            />
            {detailsTarget && isMe(detailsTarget) && (
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                Your sign-in email. Another member with team access can change it.
              </span>
            )}
          </label>
          <label className="label">
            Phone
            <input
              className="input mt-1"
              type="tel"
              value={details.phone}
              onChange={(e) => setDetails({ ...details, phone: e.target.value })}
            />
          </label>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title={`Set a password for ${passwordTarget?.name ?? ''}`}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setPasswordTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={!newPassword || Boolean(pwProblem) || busy.startsWith('pw-')}
              onClick={() => void savePassword()}
            >
              {busy.startsWith('pw-') ? <Spinner /> : <KeyRound className="h-4 w-4" />} Set password
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void savePassword();
          }}
        >
          <label className="label">
            New password
            <input
              className="input mt-1"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
          </label>
          <PasswordMeter value={newPassword} />
          <p className="mt-3 text-xs text-muted-foreground">
            They are signed out everywhere. Tell them the new password in person.
          </p>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset two-factor?"
        message={
          resetTarget
            ? `For a lost phone. ${resetTarget.name} is signed out everywhere and must scan a new QR code at their next sign-in.`
            : ''
        }
        confirmLabel="Reset two-factor"
        onCancel={() => setResetTarget(null)}
        onConfirm={() => void resetTwoFactor()}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove this team member?"
        message={
          removeTarget
            ? `${removeTarget.name} will lose access immediately. Their name stays on anything they did in the audit trail.`
            : ''
        }
        confirmLabel="Remove"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
