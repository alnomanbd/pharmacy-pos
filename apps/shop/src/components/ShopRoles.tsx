import { useCallback, useEffect, useState } from 'react';
import { Copy, Crown, Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { rolesApi, type PermissionGroup, type ShopRole } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { useCan, type ShopPermission } from '../access';
import Modal from './Modal';

/**
 * The shop's roles: what each kind of person who works here may do.
 *
 * Owner, Pharmacist and Salesman come built in and stay as they are; a shop
 * that wants something else — a Cashier who sells but never sees a purchase
 * price, a Store keeper who receives and counts stock but never touches the
 * till — makes a role of its own, starting from nothing or from a copy of
 * one of the built-in ones, ticking what it allows. Changing a role changes
 * it for everybody who has it.
 */
export default function ShopRoles({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const { toast } = useToast();
  const [roles, setRoles] = useState<ShopRole[] | null>(null);
  const [catalogue, setCatalogue] = useState<PermissionGroup[]>([]);
  const [editing, setEditing] = useState<{ role: ShopRole | null; from?: ShopRole } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await rolesApi.list();
      setRoles(r.roles);
      setCatalogue(r.catalogue);
    } catch (e: unknown) {
      toast((e as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not load the roles.'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (r: ShopRole) => {
    if (!window.confirm(`${t('Delete the role')} “${r.name}”?`)) return;
    try {
      await rolesApi.remove(r.id);
      toast(t('Role deleted.'));
      await load();
      onChanged?.();
    } catch (e: unknown) {
      toast((e as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not delete that.'), 'error');
    }
  };

  if (!roles) return <LoadingBlock />;
  const total = catalogue.reduce((k, g) => k + g.permissions.length, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('A role is what a person may do here. Change a role and it changes for everybody who has it.')}
        </p>
        <button type="button" className="btn h-9" onClick={() => setEditing({ role: null })}>
          <Plus className="h-4 w-4" /> {t('New role')}
        </button>
      </div>

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <div key={r.id} className="flex h-full flex-col rounded-[var(--radius)] border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  r.id === 'owner' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : r.builtIn ? 'bg-primary/10 text-primary' : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                }`}
              >
                {r.id === 'owner' ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="mb-0 flex items-center gap-2 truncate text-[15px] font-semibold">
                  {t(r.name)}
                  {r.builtIn && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      <Lock className="h-2.5 w-2.5" /> {t('Built in')}
                    </span>
                  )}
                </h3>
                <p className="line-clamp-2 text-xs text-muted-foreground">{r.description ? t(r.description) : '—'}</p>
              </div>
            </div>

            {/* How much the role allows, as a bar against everything there is. */}
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                <span>
                  {n(r.permissions.length)} / {n(total)} {t('permissions')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {n(r.people)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${total ? (r.permissions.length / total) * 100 : 0}%` }} />
              </div>
            </div>

            <div className="mt-auto flex gap-2 pt-3">
              {r.builtIn ? (
                r.id !== 'owner' && (
                  <button type="button" className="btn btn-ghost h-8 flex-1 border border-border text-xs" onClick={() => setEditing({ role: null, from: r })}>
                    <Copy className="h-3.5 w-3.5" /> {t('Copy into a new role')}
                  </button>
                )
              ) : (
                <>
                  <button type="button" className="btn btn-ghost h-8 flex-1 border border-border text-xs" onClick={() => setEditing({ role: r })}>
                    <Pencil className="h-3.5 w-3.5" /> {t('Edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 border border-border px-3 text-xs text-destructive disabled:opacity-40"
                    disabled={r.people > 0}
                    title={r.people > 0 ? t('Give these people another role first') : t('Delete')}
                    onClick={() => void remove(r)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RoleEditor
          role={editing.role}
          from={editing.from}
          catalogue={catalogue}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({
  role,
  from,
  catalogue,
  onClose,
  onSaved,
}: {
  role: ShopRole | null;
  from?: ShopRole;
  catalogue: PermissionGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const can = useCan();
  const [name, setName] = useState(role?.name ?? (from ? `${t(from.name)} 2` : ''));
  const [description, setDescription] = useState(role?.description ?? (from ? t(from.description) : ''));
  const [picked, setPicked] = useState<string[]>(role?.permissions ?? from?.permissions ?? []);
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const toggleGroup = (g: PermissionGroup) => {
    const mine = g.permissions.map((p) => p.key).filter((k) => can(k as ShopPermission));
    const allOn = mine.every((k) => picked.includes(k));
    setPicked((p) => (allOn ? p.filter((k) => !mine.includes(k)) : [...new Set([...p, ...mine])]));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (role) await rolesApi.update(role.id, { name: name.trim(), description: description.trim(), permissions: picked });
      else await rolesApi.create({ name: name.trim(), description: description.trim(), permissions: picked });
      toast(t('Role saved.'));
      onSaved();
    } catch (err: unknown) {
      toast((err as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-2xl">
      <h3 className="mb-1 text-base">{role ? `${t('Edit')} — ${role.name}` : t('New role')}</h3>
      <p className="mb-4 text-xs text-muted-foreground">{t('Tick what people with this role may do. You can only give what you can do yourself.')}</p>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('Name')}</span>
            <input className="input h-10" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder={t('e.g. Cashier')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('What it is for')}</span>
            <input className="input h-10" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} />
          </label>
        </div>

        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {catalogue.map((g) => {
            const mine = g.permissions.filter((p) => can(p.key as ShopPermission));
            const on = g.permissions.filter((p) => picked.includes(p.key)).length;
            return (
              <fieldset key={g.key} className="rounded-xl border border-border p-3">
                <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold">
                  <span>{t(g.label)}</span>
                  {mine.length > 0 && (
                    <button type="button" className="text-xs font-semibold text-primary" onClick={() => toggleGroup(g)}>
                      {on === mine.length ? t('None') : t('All')}
                    </button>
                  )}
                </legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {g.permissions.map((p) => {
                    const allowed = can(p.key as ShopPermission);
                    const checked = picked.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm ${allowed ? 'cursor-pointer hover:bg-muted/60' : 'cursor-not-allowed opacity-50'} ${checked ? 'bg-primary/[0.05]' : ''}`}
                        title={allowed ? undefined : t('You cannot give what you cannot do yourself')}
                      >
                        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} disabled={!allowed} onChange={() => toggle(p.key)} />
                        <span>
                          <span className="font-medium">{t(p.label)}</span>
                          {p.description && <span className="block text-[11px] text-muted-foreground">{t(p.description)}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save role')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
