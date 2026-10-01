import { useState } from 'react';
import { Gift, FileText, Loader2 } from 'lucide-react';
import { taka, openPdf, type Purchase } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';
import Modal from './Modal';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const supplierName = (p: Purchase) =>
  typeof p.supplier === 'string' ? '—' : p.supplier?.name || '—';

/**
 * One delivery, opened, drawn as the invoice it answers to.
 *
 * Laid out to be read beside the paper invoice it came from, because that is
 * when somebody opens it: a line per item in the order the invoice has them,
 * the batch and the expiry that went onto the shelf, and the bonus shown as
 * its own column rather than folded into the quantity.
 *
 * The masthead carries the two things the paper carries — the company's name
 * and the invoice number — read aloud, matched against the folder and typed
 * back into the other side's book; a green or amber pill says whether money is
 * still moving on it without asking the eye to total columns.
 *
 * The cost per piece is shown even though nobody typed it. It is the number
 * that decides every margin this shop ever reports, it is derived — the
 * invoice divided by what actually arrived, bonus included — and a figure like
 * that should be visible where it was made rather than only where it is used.
 */
export default function DeliveryDetail({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);

  /* The sheet for the folder the paper invoice lives in — the shop's own
     letterhead, drawn from what is stored rather than from this screen. */
  const openSheet = async () => {
    setOpening(true);
    try {
      await openPdf(`/shop/purchases/${purchase._id}/delivery.pdf`);
    } catch {
      toast('Could not open that sheet.', 'error');
    } finally {
      setOpening(false);
    }
  };
  const bonus = purchase.lines.reduce((n, l) => n + (l.bonusPieces || 0), 0);
  const due = Math.round((purchase.total - purchase.paidAmount) * 100) / 100;

  return (
    <Modal onClose={onClose} className="w-full max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-dashed border-border pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              {t('Supplier')}
            </p>
            <h3 className="mb-0 mt-0.5 text-xl font-semibold tracking-tight">
              {supplierName(purchase)}
            </h3>
            {purchase.createdByName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('Entered by')} {purchase.createdByName}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              {t('Invoice')}
            </p>
            <div className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
              {purchase.invoiceNo || t('No invoice number')}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{when(purchase.invoiceDate)}</p>
            <span
              className={`pill mt-1.5 ${due > 0 ? 'pending' : 'paid'}`}
              title={due > 0 ? `${taka(due)} ${t('Still owed')}` : undefined}
            >
              {due > 0 ? `${taka(due)} ${t('on account')}` : t('Paid in full')}
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">{t('Item')}</th>
                <th className="py-2 pr-3 text-right">{t('Pieces')}</th>
                <th className="py-2 pr-3 text-right">{t('Free')}</th>
                <th className="py-2 pr-3 text-right">{t('Rate')}</th>
                <th className="hidden py-2 pr-3 text-right sm:table-cell">{t('Cost / pc')}</th>
                <th className="py-2 text-right">{t('Total')}</th>
              </tr>
            </thead>
            <tbody>
              {purchase.lines.map((l, i) => {
                const arrived = l.qtyPieces + (l.bonusPieces || 0);
                const cost = arrived > 0 ? l.lineTotal / arrived : 0;
                return (
                  <tr key={l._id ?? i} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-3">
                      <span className="font-semibold">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          l.batchNo && `${t('Batch')} ${l.batchNo}`,
                          l.expiry &&
                            `exp ${new Date(l.expiry).toLocaleDateString('en-GB', {
                              month: 'short',
                              year: 'numeric',
                            })}`,
                          l.mrpPerPiece ? `MRP ${taka(l.mrpPerPiece)}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'no batch recorded'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.qtyPieces}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {l.bonusPieces ? (
                        <span className="font-semibold text-primary">+{l.bonusPieces}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {taka(l.tradePricePerPiece)}
                    </td>
                    <td className="hidden py-2 pr-3 text-right tabular-nums sm:table-cell">
                      {taka(Math.round(cost * 10000) / 10000)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{taka(l.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="text-sm">
            {bonus > 0 && (
              <div className="rounded-lg border border-primary/15 bg-secondary px-3 py-2.5">
                <p className="flex items-start gap-2">
                  <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {bonus} free piece{bonus === 1 ? '' : 's'} came with this delivery. They are not
                    free on the shelf — their cost is spread across everything that arrived, which
                    is why the cost per piece is under the rate.
                  </span>
                </p>
              </div>
            )}
            {purchase.note && (
              <p className={`${bonus > 0 ? 'mt-2' : ''} text-muted-foreground`}>{purchase.note}</p>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
            <div className="px-3 py-2.5 text-sm">
              <div className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>{t('Items')}</span>
                <span className="tabular-nums">{taka(purchase.subTotal)}</span>
              </div>
              {purchase.discount > 0 && (
                <div className="flex justify-between gap-3 py-1 text-muted-foreground">
                  <span>{t('Less')}</span>
                  <span className="tabular-nums">−{taka(purchase.discount)}</span>
                </div>
              )}
              {purchase.vat > 0 && (
                <div className="flex justify-between gap-3 py-1 text-muted-foreground">
                  <span>VAT</span>
                  <span className="tabular-nums">{taka(purchase.vat)}</span>
                </div>
              )}
              {purchase.discount > 0 || purchase.vat > 0 ? (
                <div className="border-t border-border" />
              ) : null}
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="font-semibold">{t('Invoice')}</span>
                <span className="text-lg font-bold tracking-tight tabular-nums">
                  {taka(purchase.total)}
                </span>
              </div>
              <div className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>{t('Paid')}</span>
                <span className="tabular-nums">{taka(purchase.paidAmount)}</span>
              </div>
              {due > 0 && (
                <div className="flex justify-between gap-3 border-t border-destructive/25 py-1.5 font-semibold text-destructive">
                  <span>{t('Still owed')}</span>
                  <span className="tabular-nums">{taka(due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={opening}
            onClick={() => void openSheet()}
          >
            {opening ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {t('Delivery sheet (PDF)')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
    </Modal>
  );
}
