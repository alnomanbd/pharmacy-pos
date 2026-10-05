import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wallet, CalendarDays, Phone, FileText } from 'lucide-react';
import {
  shopApi,
  taka,
  type SupplierEntry,
  type SupplierKind,
  type SupplierStatement as Statement,
  type Purchase,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useNumerals } from '../i18n/ui';
import DeliveryDetail from './DeliveryDetail';

/**
 * One company's account book.
 *
 * The same shape as a regular's on the other side of the counter, because it is
 * the same object: a running account that somebody argues about with a book open
 * in front of them. Here the rep is holding his own copy of it.
 *
 * Two views of the one thing. **The account** is every row in date order with
 * the balance after each — a delivery, a payment, strips sent back. **What came
 * in** is the invoices themselves, and opening one shows it line by line against
 * the paper it was typed from. A ledger row reading "Delivery, ৳12,000" answers
 * "koto dite hobe" and not "kobe ki dise", and both get asked.
 *
 * Sign convention, said once: everything here is what the shop owes. A delivery
 * increases it, a payment and a return reduce it.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const KIND_LABEL: Record<SupplierKind, string> = {
  company: 'Company depot',
  distributor: 'Wholesaler',
  shop: 'Another shop',
  other: 'Someone else',
};

const ENTRY_LABEL: Record<SupplierEntry['entry'], string> = {
  opening: 'Opening balance',
  purchase: 'Delivery',
  payment: 'Payment',
  purchase_return: 'Returned to company',
  adjustment: 'Adjustment',
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function SupplierStatement({
  id,
  onPaid,
  onClose,
}: {
  id: string;
  onPaid: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const { num, stop } = useNumerals();
  const { toast } = useToast();
  const [data, setData] = useState<Statement | null>(null);
  const [tab, setTab] = useState<'account' | 'deliveries'>('account');
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<Purchase | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await shopApi.supplierLedger(id));
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load that account.'), 'error');
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDelivery = async (purchaseId: string) => {
    setOpening(true);
    try {
      setDelivery(await shopApi.purchase(purchaseId));
    } catch {
      toast(t('Could not open that delivery.'), 'error');
    } finally {
      setOpening(false);
    }
  };

  const pay = async () => {
    const value = Number(amount);
    if (!(value > 0)) return;
    setBusy(true);
    try {
      await shopApi.paySupplier(id, { amount: value, method, reference: reference.trim() });
      toast(`${taka(value)} ${t('paid')}${stop}`);
      setAmount('');
      setReference('');
      setPaying(false);
      await load();
      onPaid();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not record that payment.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <LoadingBlock />;

  const company = data.supplier;

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="mb-0 truncate">{company.name}</h3>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{t(KIND_LABEL[company.kind ?? 'distributor'])}</span>
            {company.repName && (
              <span className="inline-flex items-center gap-1">
                {company.repName}
                {typeof company.repVisitDay === 'number' && company.repVisitDay >= 0 && (
                  <>
                    {' · '}
                    <CalendarDays className="h-3 w-3" /> {DAYS[company.repVisitDay]}
                  </>
                )}
              </span>
            )}
            {(company.repPhone || company.phone) && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {company.repPhone || company.phone}
              </span>
            )}
          </p>
        </div>
        {/* Its own line on a phone, read from the left like the rest of it;
            beside the name on a wider screen. */}
        <div className="w-full sm:w-auto sm:text-right">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {t('Owed')}
          </div>
          <div
            className={`text-xl font-semibold tabular-nums ${
              data.balance > 0 ? 'text-destructive' : ''
            }`}
          >
            {taka(data.balance)}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-border px-3 py-2">
          <div className="font-semibold tabular-nums">{taka(data.totals.bought)}</div>
          <div className="text-[11px] text-muted-foreground">{t('bought in all')}</div>
        </div>
        <div className="rounded-lg border border-border px-3 py-2">
          <div className="font-semibold tabular-nums">{data.deliveries.length}</div>
          <div className="text-[11px] text-muted-foreground">{t('deliveries')}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-border px-3 py-2 sm:col-span-1">
          <div className="font-semibold tabular-nums">{data.entries.length}</div>
          <div className="text-[11px] text-muted-foreground">{t('rows on the account')}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn h-9" onClick={() => setPaying((v) => !v)}>
          <Wallet className="h-4 w-4" /> {t('Record a payment')}
        </button>
        <button type="button" className="btn btn-ghost h-9 lg:hidden" onClick={onClose}>
          {t('Back')}
        </button>
      </div>

      {paying && (
        <div className="mt-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          {/* What is owed, one tap away — and more than that is not paid,
              so the box says so before Save is pressed. */}
          <div>
            <div className="flex gap-1.5">
              <input
                className="input h-9 tabular-nums"
                inputMode="decimal"
                placeholder={data.balance > 0 ? taka(data.balance) : t('Amount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {data.balance > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost h-9 shrink-0 border border-border px-2.5 text-xs"
                  onClick={() => setAmount(String(data.balance))}
                >
                  {t('All')}
                </button>
              )}
            </div>
            {Number(amount) > Math.max(0, data.balance) + 0.009 && (
              <p className="mt-1 text-[11px] font-medium text-destructive">
                {data.balance > 0 ? `${t('You owe only')} ${taka(data.balance)}` : t('Nothing is owed')}
              </p>
            )}
          </div>
          <select className="input h-9" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">{t('Cash')}</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="cheque">{t('Cheque')}</option>
            <option value="bank">{t('Bank')}</option>
          </select>
          <input
            className="input h-9"
            placeholder={t('Cheque no / trx id')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <button
            type="button"
            className="btn h-9"
            disabled={busy || !(Number(amount) > 0) || Number(amount) > Math.max(0, data.balance) + 0.009}
            onClick={() => void pay()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {(['account', 'deliveries'] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`h-9 rounded-md border px-3 text-sm font-semibold transition-colors ${
              tab === key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
            }`}
          >
            {key === 'account' ? t('The account') : t('What came in')}
          </button>
        ))}
      </div>

      {tab === 'account' ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">{t('Date')}</th>
                <th className="py-2 pr-3">{t('What')}</th>
                <th className="py-2 pr-3 text-right">{t('Amount')}</th>
                <th className="py-2 text-right">{t('Owed after')}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    {t('Nothing on this account yet.')}
                  </td>
                </tr>
              )}
              {[...data.entries].reverse().map((e) => (
                <tr key={e._id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{when(e.at)}</td>
                  <td className="py-2 pr-3">
                    {t(ENTRY_LABEL[e.entry])}
                    {(e.reference || e.method || e.note) && (
                      <span className="block text-[11px] text-muted-foreground">
                        {[e.method, e.reference, e.note].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums ${
                      e.amount < 0 ? 'text-primary' : ''
                    }`}
                  >
                    {e.amount < 0 ? `− ${taka(Math.abs(e.amount))}` : taka(e.amount)}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {taka(e.balanceAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">{t('Invoice')}</th>
                <th className="hidden py-2 pr-3 sm:table-cell">{t('Entered by')}</th>
                <th className="py-2 pr-3 text-right">{t('Total')}</th>
                <th className="py-2 text-right">{t('Paid')}</th>
              </tr>
            </thead>
            <tbody>
              {data.deliveries.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    {t('Nothing recorded from this company yet.')}
                  </td>
                </tr>
              )}
              {data.deliveries.map((d) => (
                <tr key={d._id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => void openDelivery(d._id)}
                      className="inline-flex items-center gap-1.5 font-semibold hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {d.invoiceNo || t('No invoice number')}
                    </button>
                    <span className="block text-[11px] text-muted-foreground">
                      {when(d.invoiceDate)} · {num(d.lines)} {t(d.lines === 1 ? 'line' : 'lines')}
                    </span>
                  </td>
                  <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">
                    {d.createdByName || '—'}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{taka(d.total)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {taka(d.paidAmount)}
                    {d.paidAmount < d.total && (
                      <span className="block text-[11px] text-destructive">
                        {taka(d.total - d.paidAmount)} {t('on account')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {opening && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {delivery && <DeliveryDetail purchase={delivery} onClose={() => setDelivery(null)} />}
    </div>
  );
}
