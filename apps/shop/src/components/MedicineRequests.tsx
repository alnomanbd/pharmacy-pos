import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, PackagePlus, Plus, Send, Undo2 } from 'lucide-react';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { medicineRequestsApi, type MedicineRequest, type MedicineRequestInput } from '../api';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import Modal from './Modal';

/**
 * Asking Dawai for a medicine the catalogue does not have.
 *
 * The catalogue is shared, so a brand added once is spelled the same in every
 * shop. A shop that cannot find one does not type it in as "something else" —
 * it asks, and the medicine comes back as a proper catalogue row it can stock.
 *
 * Both of these live behind the back room: they are opened from Stock, which a
 * salesman never reaches.
 */

const errorOf = (err: unknown) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message;

/* What the boxes say. Kept in English: the catalogue is written that way. */
const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops', 'Cream', 'Ointment', 'Gel', 'Inhaler', 'Powder', 'Suppository'];

const EMPTY = {
  brandName: '',
  genericName: '',
  companyName: '',
  strength: '',
  dosageForm: '',
  packSize: '',
  note: '',
};

/** The small form: what the box says, as much of it as the shop knows. */
export function AskForMedicine({
  initialBrand = '',
  onClose,
  onSent,
  z = 60,
}: {
  initialBrand?: string;
  onClose: () => void;
  onSent?: (r: MedicineRequest) => void;
  z?: number;
}) {
  const t = useT();
  const { toast } = useToast();
  const [form, setForm] = useState({ ...EMPTY, brandName: initialBrand.trim() });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: MedicineRequestInput = { brandName: form.brandName.trim() };
    /* Only what was filled in: an empty box is "don't know", not "blank". */
    (Object.keys(EMPTY) as (keyof typeof EMPTY)[]).forEach((k) => {
      if (k === 'brandName') return;
      const v = form[k].trim();
      if (v) payload[k] = v;
    });
    setBusy(true);
    try {
      const made = await medicineRequestsApi.create(payload);
      toast(t('We’ll add it, usually within a day.'));
      onSent?.(made);
      onClose();
    } catch (err) {
      toast(errorOf(err) || t('Could not send that request.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const field = (
    k: keyof typeof form,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor={`ask-${k}`}>
        {label}
      </label>
      <input id={`ask-${k}`} className="input h-10" value={form[k]} onChange={set(k)} {...extra} />
    </div>
  );

  return (
    <Modal onClose={onClose} className="w-full max-w-lg" z={z} label={t('Ask us to add a medicine')}>
      <div className="mb-4">
        <h3 className="mb-0 text-base">{t('Ask us to add a medicine')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('Write it the way the box does. We add it to the catalogue, and then you can add it to your stock.')}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {field('brandName', t('Brand name'), { placeholder: 'Napa Extend', maxLength: 160, autoFocus: true, required: true })}
        <div className="grid gap-3 sm:grid-cols-2">
          {field('genericName', t('Generic name'), { placeholder: 'Paracetamol', maxLength: 200 })}
          {field('companyName', t('Company'), { placeholder: 'Beximco', maxLength: 160 })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field('strength', t('Strength'), { placeholder: '665 mg', maxLength: 80 })}
          {field('dosageForm', t('Form'), { placeholder: 'Tablet', list: 'ask-forms', maxLength: 80 })}
          <div className="col-span-2 sm:col-span-1">
            {field('packSize', t('Pack'), { placeholder: '10 x 10', maxLength: 80 })}
          </div>
        </div>
        <datalist id="ask-forms">
          {FORMS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="ask-note">
            {t('Note')}
          </label>
          <textarea
            id="ask-note"
            className="input min-h-[4.5rem] py-2"
            value={form.note}
            onChange={set('note')}
            maxLength={500}
            placeholder={t('Anything that helps us find it — e.g. new from the company this month')}
          />
        </div>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || form.brandName.trim().length === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{' '}
            {t('Send the request')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "3 days ago", the way somebody at a counter would say it. */
const ago = (iso: string, n: (v: number | string) => string, t: (k: string) => string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 30) return `${n(days)} ${t('days ago')}`;
  const months = Math.floor(days / 30);
  return `${n(months)} ${t(months === 1 ? 'month ago' : 'months ago')}`;
};

const STATUS: Record<MedicineRequest['status'], { label: string; tone: string }> = {
  pending: { label: 'Waiting', tone: 'pending' },
  added: { label: 'Added', tone: 'success' },
  rejected: { label: 'Not added', tone: 'danger' },
};

/**
 * What this shop has asked for, and where each one stands.
 *
 * `onStock` is the way on from an added one: it opens the shop's own "new item"
 * with the brand already typed, because that is the next thing anybody does.
 */
export function MedicineRequestsPanel({
  onClose,
  onStock,
}: {
  onClose: () => void;
  onStock: (brandName: string) => void;
}) {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [rows, setRows] = useState<MedicineRequest[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [withdrawing, setWithdrawing] = useState('');

  const n = useCallback(
    (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v)),
    [lang],
  );

  const load = useCallback(async () => {
    try {
      setRows(await medicineRequestsApi.list());
    } catch (err) {
      setRows([]);
      toast(errorOf(err) || t('Could not load your requests.'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const withdraw = async (r: MedicineRequest) => {
    setWithdrawing(r._id);
    try {
      await medicineRequestsApi.withdraw(r._id);
      setRows((now) => (now ?? []).filter((x) => x._id !== r._id));
      toast(t('Request withdrawn.'));
    } catch (err) {
      toast(errorOf(err) || t('Could not withdraw that.'), 'error');
    } finally {
      setWithdrawing('');
    }
  };

  return (
    <>
      <Modal onClose={asking ? undefined : onClose} className="w-full max-w-xl" label={t('Medicine requests')}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="mb-0 text-base">{t('Medicine requests')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('Medicines you asked us to add to the catalogue.')}
            </p>
          </div>
          <button type="button" className="btn h-9" onClick={() => setAsking(true)}>
            <Plus className="h-4 w-4" /> {t('Ask for a medicine')}
          </button>
        </div>

        {rows === null ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty py-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PackagePlus className="h-6 w-6" />
            </span>
            <p>{t('You have not asked for anything yet.')}</p>
            <p className="max-w-sm text-xs">
              {t('When a medicine is not in the catalogue, ask for it from New item and it shows up here.')}
            </p>
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {rows.map((r) => {
              const s = STATUS[r.status] ?? STATUS.pending;
              const detail = [r.genericName, r.dosageForm, r.companyName].filter(Boolean).join(' · ');
              return (
                <li key={r._id} className="px-3 py-3 sm:px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">
                        {r.brandName}
                        {r.strength && <span className="font-normal text-muted-foreground"> {r.strength}</span>}
                      </p>
                      {detail && <p className="break-words text-xs text-muted-foreground">{detail}</p>}
                    </div>
                    <span className={`pill ${s.tone} shrink-0 !px-1.5 !py-0 text-[10.5px]`}>{t(s.label)}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />{' '}
                    {/* "Asked 3 days ago", and in Bangla the verb goes last. */}
                    {lang === 'bn'
                      ? `${ago(r.createdAt, n, t)} ${t('Asked')}`
                      : `${t('Asked')} ${ago(r.createdAt, n, t)}`}
                  </p>

                  {r.status === 'added' && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                      <span>{t('Now in the catalogue — you can add it to your stock.')}</span>
                      <button
                        type="button"
                        className="btn h-8 px-3 text-xs"
                        onClick={() =>
                          onStock(typeof r.medicine === 'object' && r.medicine ? r.medicine.brandName : r.brandName)
                        }
                      >
                        <Plus className="h-3.5 w-3.5" /> {t('Add to stock')}
                      </button>
                    </div>
                  )}
                  {r.status === 'rejected' && (
                    <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {t('Why')}: {r.rejectionReason || t('No reason given.')}
                    </p>
                  )}
                  {r.status === 'pending' && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        className="btn btn-ghost h-8 px-3 text-xs"
                        disabled={withdrawing === r._id}
                        onClick={() => void withdraw(r)}
                      >
                        {withdrawing === r._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" />
                        )}{' '}
                        {t('Withdraw')}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      {asking && (
        <AskForMedicine
          onClose={() => setAsking(false)}
          onSent={(made) => setRows((now) => [made, ...(now ?? [])])}
        />
      )}
    </>
  );
}
