import { useEffect, useState } from 'react';
import { Loader2, Search, Undo2 } from 'lucide-react';
import { tillApi, taka, type Sale } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';
import Modal from './Modal';

/**
 * Somebody has come back with a bill.
 *
 * Always against the original — a counter that can put stock back without
 * naming the bill it came from can put back stock that never left, and the
 * pieces have to return to the lot they were sold from because that is where
 * their expiry and their cost live.
 *
 * The money follows the same rule the sale did: if the bill was on account, the
 * refund comes off what they owe before any cash leaves the box. Refunding cash
 * on a bill nobody paid hands money to somebody who has not given any.
 */

const METHOD_LABEL: Record<string, string> = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', upay: 'Upay', card: 'card', bank: 'bank' };

export default function ReturnBill({
  onClose,
  onDone,
  /** Opened from the sales register against a bill somebody already picked. */
  billNo: prefill = '',
}: {
  onClose: () => void;
  onDone: () => void;
  billNo?: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [billNo, setBillNo] = useState(prefill);
  const [hits, setHits] = useState<Sale[] | null>(null);
  const [bill, setBill] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  /* Straight to the bill when one was named, so opening this from the register
     does not make somebody type a number they have already chosen. */
  useEffect(() => {
    if (prefill) void find();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const find = async () => {
    if (!billNo.trim()) return;
    setBusy(true);
    try {
      const found = await tillApi.findBill(billNo.trim());
      setHits(found);
      if (found.length === 1) setBill(found[0]);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!bill) return;
    const lines = Object.entries(qty)
      .map(([lineId, v]) => ({ lineId, pieces: Number(v) || 0 }))
      .filter((l) => l.pieces > 0);
    if (lines.length === 0) return;

    setBusy(true);
    try {
      const res = await tillApi.returnLines(bill._id, { lines, reason: reason.trim() });
      /* Said the way the counter has to act on it: what comes off the khata,
         what to hand over from the drawer, and what to send back by bKash. */
      const parts = [
        res.againstDue > 0 && `${taka(res.againstDue)} ${t('off their account')}`,
        res.cashBack > 0 && `${taka(res.cashBack)} ${t('cash from the drawer')}`,
        (res.otherBack ?? 0) > 0 && `${taka(res.otherBack ?? 0)} ${t('to send back by')} ${METHOD_LABEL[res.otherMethod ?? ''] ?? res.otherMethod}`,
      ].filter(Boolean);
      toast(`${taka(res.refund)} ${t('returned')}${parts.length ? ` — ${parts.join(', ')}` : ''}.`);
      onDone();
      onClose();
    } catch (e: unknown) {
      const err = (e as { response?: { data?: { message?: string } } }).response;
      toast(err?.data?.message || 'Could not take that back.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /* What the customer actually paid for each piece — after the line's and the
     bill's discount (points included), with its VAT — the same reckoning the
     shop makes, so the figure here is the figure handed back. */
  const keep = bill && bill.subTotal > 0 ? Math.max(0, (bill.subTotal - (bill.discount || 0)) / bill.subTotal) : 1;
  const refund = bill
    ? Math.min(
        Math.max(0, bill.total - (bill.refunds?.value ?? 0)),
        Math.round(
          bill.lines.reduce(
            (n, l) => n + ((Number(qty[l._id ?? '']) || 0) / l.qtyPieces) * (l.lineTotal * keep + (l.vat ?? 0)),
            0,
          ) * 100,
        ) / 100,
      )
    : 0;
  const dueLeft = bill ? Math.max(0, bill.due - (bill.refunds?.againstDue ?? 0)) : 0;

  return (
    <Modal onClose={onClose} className="w-full max-w-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 flex items-center gap-2 text-base">
              <Undo2 className="h-4 w-4" /> Take something back
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('Find the bill they are holding. The strips go back to the lot they came from.')}
            </p>
          </div>
        </div>

        {!bill ? (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="input h-11 pl-9"
                  placeholder={t('Bill number — 13-0042')}
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void find()}
                  autoFocus
                />
              </div>
              <button type="button" className="btn h-11" disabled={busy} onClick={() => void find()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Find
              </button>
            </div>

            {hits?.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('No bill with that number. It is printed at the top of the paper.')}
              </p>
            )}

            {hits && hits.length > 1 && (
              <div className="mt-3 flex flex-col gap-1">
                {hits.map((h) => (
                  <button
                    key={h._id}
                    type="button"
                    onClick={() => setBill(h)}
                    className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {h.billNo} · {taka(h.total)} ·{' '}
                    {new Date(h.soldAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-semibold">Bill {bill.billNo}</span>
              <span className="text-muted-foreground">
                {new Date(bill.soldAt).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-3">{t('Item')}</th>
                  <th className="py-2 pr-3 text-right">{t('Sold')}</th>
                  <th className="py-2 pr-3 text-right">{t('Back already')}</th>
                  <th className="w-24 py-2 text-right">{t('Coming back')}</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((l) => {
                  const left = l.qtyPieces - (l.returnedPieces ?? 0);
                  return (
                    <tr key={l._id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{l.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {taka(l.pricePerPiece)} / {t('pc')}{l.batchNo ? ` · ${t('Batch')} ${l.batchNo}` : ''}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.qtyPieces}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {l.returnedPieces ?? 0}
                      </td>
                      <td className="py-2 text-right">
                        <input
                          className="input h-9 text-right tabular-nums"
                          inputMode="numeric"
                          placeholder="0"
                          disabled={left <= 0}
                          value={qty[l._id ?? ''] ?? ''}
                          onChange={(e) =>
                            setQty({
                              ...qty,
                              [l._id ?? '']: String(Math.min(left, Number(e.target.value) || 0)),
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <input
              className="input mt-3 h-10"
              placeholder={t('Why — kept with the return')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {t('To give back')}
                </div>
                <div className="text-xl font-semibold tabular-nums">{taka(refund)}</div>
                {dueLeft > 0 && refund > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {taka(Math.min(refund, dueLeft))} {t('comes off their account first.')}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setBill(null)}>
                  {t('Another bill')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || refund <= 0}
                  onClick={() => void send()}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Take it back
                </button>
              </div>
            </div>
          </>
        )}
    </Modal>
  );
}
