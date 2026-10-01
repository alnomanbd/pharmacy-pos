import { useCallback, useEffect, useState } from 'react';
import { Loader2, ReceiptText, Printer, Ban, CloudOff } from 'lucide-react';
import { tillApi, taka, type BillRow, type Sale } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';
import Modal from '../components/Modal';

/**
 * The last bills, without leaving the counter.
 *
 * A customer comes back thirty seconds later — they wanted the syrup too, or
 * the strip is the wrong strength, or they think they were charged twice. The
 * counter should not have to leave the till and go looking through the register
 * to answer that; the answer is almost always in the last ten bills.
 *
 * So: today's, newest first, with the paper one key away and — for a mis-punch
 * — cancelling it one more. The rule about who may cancel what lives on the
 * server (see `saleAdmin.mayVoid`); this screen simply shows what came back.
 */
export default function RecentBills({
  onClose,
  onPrint,
  onChanged,
}: {
  onClose: () => void;
  onPrint: (sale: Sale) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [rows, setRows] = useState<BillRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* Which bill is being cancelled, and why — the reason is not optional. */
  const [voiding, setVoiding] = useState<BillRow | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setRows((await tillApi.bills({ page: 1 })).sales);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const print = async (row: BillRow) => {
    setBusy(row._id);
    try {
      onPrint(await tillApi.sale(row._id));
      onClose();
    } catch {
      toast(t('Could not open that bill.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!voiding || reason.trim().length < 3) return;
    setBusy(voiding._id);
    try {
      await tillApi.voidSale(voiding._id, reason.trim());
      toast(`${t('Bill')} ${voiding.billNo} ${t('cancelled')}.`);
      setVoiding(null);
      setReason('');
      await load();
      onChanged();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not cancel that bill.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4" /> {t('The last bills')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('Today, newest first. Print one again, or cancel a mis-punch.')}
            </p>
          </div>
        </div>

        {!rows ? (
          <div className="grid h-32 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('Nothing sold yet today.')}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((s) => (
              <div
                key={s._id}
                className="flex items-center gap-3 border-b border-border py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold tabular-nums">{s.billNo}</span>
                  {s.status === 'void' && (
                    <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      {t('cancelled')}
                    </span>
                  )}
                  {s.status === 'returned' && (
                    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {t('taken back')}
                    </span>
                  )}
                  {s.wasOffline && (
                    <CloudOff className="ml-1 inline h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(s.soldAt).toLocaleTimeString('en-GB', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}{' '}
                    · {s.items} {t('items')}
                    {s.customerName ? ` · ${s.customerName}` : ''}
                    {s.due > 0 ? ` · ${taka(s.due)} ${t('on account')}` : ''}
                  </span>
                </div>

                <span
                  className={`shrink-0 text-right font-semibold tabular-nums ${
                    s.status === 'void' ? 'text-muted-foreground line-through' : ''
                  }`}
                >
                  {taka(s.total)}
                </span>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void print(s)}
                    disabled={busy === s._id}
                    aria-label={t('Print it again')}
                    title={t('Print it again')}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                  {s.status !== 'void' && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoiding(s);
                        setReason('');
                      }}
                      aria-label={t('Cancel this bill')}
                      title={t('Cancel this bill')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- why ---- */}
        {voiding && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm font-semibold">
              {t('Cancel bill')} {voiding.billNo} · {taka(voiding.total)}
            </p>
            <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
              {t(
                'The stock goes back on the shelf and the money comes off the day. The bill stays on the register, cancelled, with your name and this reason on it.',
              )}
            </p>
            <div className="flex gap-2">
              <input
                className="input h-9 flex-1"
                placeholder={t('Why — required')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-ghost h-9"
                onClick={() => setVoiding(null)}
              >
                {t('Not yet')}
              </button>
              <button
                type="button"
                className="btn h-9"
                disabled={reason.trim().length < 3 || busy === voiding._id}
                onClick={() => void cancel()}
              >
                {busy === voiding._id && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('Cancel it')}
              </button>
            </div>
          </div>
        )}
    </Modal>
  );
}
