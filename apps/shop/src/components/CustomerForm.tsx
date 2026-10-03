import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCan } from '../access';
import { useToast } from '@dawai/shared/components/Toast';
import { tillApi, type ShopCustomer } from '../api';
import { bdMobile, BD_MOBILE_MESSAGE } from '@dawai/shared/lib/phone';
import { useT } from '../i18n/ui';
import Modal from './Modal';

/**
 * Adding a name by hand, or correcting one.
 *
 * One form for the baki khata and the counter, so a customer added at the till
 * is the same record, with the same fields, as one added from the book.
 *
 * The balance is not a field here. A new customer can bring what they owed in
 * the old notebook — written as an opening row on the account — and after that
 * the figure moves only by bills and payments. Credit limit and opening balance
 * are the owner's to set, so a salesman sees neither.
 */
export default function CustomerForm({
  customer,
  initial,
  onClose,
  onSaved,
  onOffline,
  z,
}: {
  customer: ShopCustomer | null;
  /** What was already typed — the counter's search box, carried over. */
  initial?: { name?: string; phone?: string };
  onClose: () => void;
  onSaved: (c: ShopCustomer) => void;
  /**
   * The counter keeps selling with the line down. When the save cannot reach
   * the server, the name goes on the bill as typed instead — the till has
   * always put a customer on the book from a bill's name when it syncs.
   */
  onOffline?: (draft: { name: string; phone: string }) => void;
  z?: number;
}) {
  const t = useT();
  const { toast } = useToast();
  /* A credit limit and an opening balance are money policy, not a counter's call. */
  const can = useCan();
  const runsTheShop = can('accounts.manage');
  const [name, setName] = useState(customer?.name ?? initial?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? initial?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [note, setNote] = useState(customer?.note ?? '');
  const [limit, setLimit] = useState(customer?.creditLimit ? String(customer.creditLimit) : '');
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);

  /* Said while they are still looking at it — the server refuses it anyway. */
  const phoneBad = phone.trim() !== '' && !bdMobile(phone);
  const ready = name.trim().length >= 2 && !phoneBad;

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim(),
        ...(runsTheShop ? { creditLimit: Number(limit) || 0 } : {}),
      };
      const saved = customer
        ? await tillApi.updateCustomer(customer._id, payload)
        : await tillApi.createCustomer({
            ...payload,
            ...(runsTheShop && Number(opening) > 0 ? { openingBalance: Number(opening) } : {}),
          });
      toast(customer ? t('Saved.') : `${saved.name} ${t('is on the book.')}`);
      onSaved(saved);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      if (!res && onOffline && !customer) {
        onOffline({ name: name.trim(), phone: phone.trim() });
        return;
      }
      toast(res?.data?.message || t('Could not save that customer.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const field = 'mb-1 block text-xs font-semibold text-muted-foreground';

  return (
    <Modal onClose={onClose} className="w-full max-w-md" z={z}>
      <div className="mb-4">
        <h3 className="mb-0 text-base">{customer ? t('This customer') : t('Add a customer')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('The phone is how the POS knows them next time.')}
        </p>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <label className={field} htmlFor="cu-name">
            {t('Name')}
          </label>
          <input
            id="cu-name"
            className="input h-10"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className={field} htmlFor="cu-phone">
            {t('Phone')}
          </label>
          <input
            id="cu-phone"
            className="input h-10 tabular-nums"
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={phoneBad}
          />
          {phoneBad && (
            <p className="mt-1 text-[11px] text-destructive">{t(BD_MOBILE_MESSAGE)}</p>
          )}
        </div>
        <div>
          <label className={field} htmlFor="cu-address">
            {t('Address')}
          </label>
          <input
            id="cu-address"
            className="input h-10"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div>
          <label className={field} htmlFor="cu-note">
            {t('Note')}
          </label>
          <input
            id="cu-note"
            className="input h-10"
            placeholder={t('Tea stall next door · settles on the 1st')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {runsTheShop && (
          <div className={`grid gap-3 ${customer ? '' : 'sm:grid-cols-2'}`}>
            <div>
              <label className={field} htmlFor="cu-limit">
                {t('Credit limit')}
              </label>
              <input
                id="cu-limit"
                className="input h-10 tabular-nums"
                inputMode="decimal"
                placeholder={t('No limit')}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            {!customer && (
              <div>
                <label className={field} htmlFor="cu-opening">
                  {t('Already owes')}
                </label>
                <input
                  id="cu-opening"
                  className="input h-10 tabular-nums"
                  inputMode="decimal"
                  placeholder="0"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('From the old notebook — goes on the account as brought forward.')}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn" disabled={busy || !ready}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
