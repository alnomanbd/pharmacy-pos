import { useState } from 'react';
import {
  Printer,
  Undo2,
  Ban,
  Pencil,
  Loader2,
  History,
  Trash2,
  RotateCcw,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { shopApi, tillApi, taka, type Sale } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { bdMobile, BD_MOBILE_MESSAGE } from '@dawai/shared/lib/phone';
import ConfirmWithReason from './ConfirmWithReason';
import { useT } from '../i18n/ui';
import Modal from './Modal';

/** The payment methods, in the words the counter uses. */
const METHOD_WORDS: Record<string, string> = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  upay: 'Upay',
  card: 'Card',
  bank: 'Bank',
  due: 'On account',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/**
 * One bill, opened.
 *
 * Line by line with the lot each piece came out of, because that is the
 * question somebody has when they open an old bill: which batch, so it can be
 * checked against the strip in front of them.
 */
export default function BillDetail({
  sale,
  canSeeCost,
  onClose,
  onPrint,
  onChanged,
}: {
  sale: Sale;
  canSeeCost: boolean;
  onClose: () => void;
  /** Left out where there is no paper set up to print onto. */
  onPrint?: () => void;
  /** Left out where the bill is only being read — the baki khata does that. */
  onChanged?: (sale: Sale) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  /* One at a time: correcting a bill and cancelling it are different acts and
     the reason box belongs to whichever one is open. */
  const [doing, setDoing] = useState<'edit' | 'void' | null>(null);
  const [reason, setReason] = useState('');
  const [name, setName] = useState(sale.customerName ?? '');
  const [phone, setPhone] = useState(sale.customerPhone ?? '');
  const phoneBad = phone.trim() !== '' && !bdMobile(phone);
  const [note, setNote] = useState(sale.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      const next = await shopApi.editSale(sale._id, {
        customerName: name,
        customerPhone: phone,
        note,
        reason: reason.trim(),
      });
      toast(t('Bill corrected'));
      setDoing(null);
      setReason('');
      onChanged?.(next);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not correct that bill.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  /*
   * The four acts that move a bill between states.
   *
   * One handler, because they differ only in which call they make and what the
   * confirmation says — and because they must all behave the same way when the
   * server refuses: show its words, not ours. The server is where the rules
   * live (who may, and when), so a message coming back from it is the real
   * answer and this screen never second-guesses it.
   */
  const [asking, setAsking] = useState<null | 'void' | 'revert' | 'hold' | 'unhold' | 'delete'>(
    null,
  );

  const ACTS = {
    void: {
      title: t('Cancel this bill'),
      message: t(
        'The stock goes back on the shelf and the money comes off the day. The bill stays on the register, cancelled, with your name and this reason on it.',
      ),
      confirm: t('Cancel it'),
      run: (why: string) => tillApi.voidSale(sale._id, why),
      done: t('Bill cancelled'),
    },
    revert: {
      title: t('Put this bill back'),
      message: t(
        'The stock comes off the shelf again and the money goes back on the day, exactly as it was. Use this when the wrong bill was cancelled.',
      ),
      confirm: t('Put it back'),
      run: (why: string) => shopApi.revertSale(sale._id, why),
      done: t('Bill put back'),
    },
    hold: {
      title: t('Hold this bill'),
      message: t(
        'Nothing moves — no stock, no money. It is marked as being checked, and nobody can correct it until you let it go.',
      ),
      confirm: t('Hold it'),
      run: (why: string) => shopApi.holdSale(sale._id, true, why),
      done: t('Bill held'),
    },
    unhold: {
      title: t('Let this bill go'),
      message: t('It goes back to being an ordinary bill.'),
      confirm: t('Let it go'),
      reason: false,
      run: () => shopApi.holdSale(sale._id, false),
      done: t('Bill let go'),
    },
    delete: {
      title: t('Delete this bill'),
      message: t(
        'It goes to the Recycle Bin and off the register. If it has not been cancelled it will be cancelled on the way. Nothing is destroyed — you can take it back out of the Recycle Bin.',
      ),
      confirm: t('Move it to the Recycle Bin'),
      run: (why: string) => shopApi.deleteSale(sale._id, why),
      done: t('Bill moved to the Recycle Bin'),
    },
  } as const;

  const act = async (why: string) => {
    if (!asking) return;
    const which = ACTS[asking];
    setBusy(true);
    try {
      const next = await which.run(why);
      toast(which.done);
      setAsking(null);
      onChanged?.(next);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('That did not work.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const returned = sale.lines.reduce((n, l) => n + (l.returnedPieces ?? 0), 0);

  return (
    <Modal onClose={onClose} className="w-full max-w-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 flex items-center gap-2 text-base">
              {t('Bill')} {sale.billNo}
              {sale.status === 'returned' && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {t('taken back')}
                </span>
              )}
              {sale.status === 'void' && (
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  {t('cancelled')}
                </span>
              )}
              {sale.onHold && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-500">
                  {t('on hold')}
                </span>
              )}
              {sale.deletedAt && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {t('in the Recycle Bin')}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {when(sale.soldAt)} · {sale.salesmanName}
              {sale.terminal ? ` · ${sale.terminal}` : ''}
              {sale.customerName ? ` · ${sale.customerName}` : ''}
              {sale.customerPhone ? ` · ${sale.customerPhone}` : ''}
            </p>
          </div>
        </div>

        {sale.onHold && sale.holdReason && (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            <strong className="font-semibold">{t('Being checked')}:</strong> {sale.holdReason}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 pr-3">{t('Item')}</th>
                <th className="py-2 pr-3 text-right">{t('Pieces')}</th>
                <th className="py-2 pr-3 text-right">{t('Price')}</th>
                <th className="py-2 text-right">{t('Total')}</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l, i) => (
                <tr key={l._id ?? i} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-semibold">{l.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {l.batchNo ? `${t('Batch')} ${l.batchNo}` : t('no batch recorded')}
                      {l.returnedPieces ? ` · ${l.returnedPieces} back` : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.qtyPieces}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{taka(l.pricePerPiece)}</td>
                  <td className="py-2 text-right tabular-nums">{taka(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="text-sm">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('How it was paid')}
            </div>
            {(sale.payments ?? []).length === 0 ? (
              <p className="mt-1 text-muted-foreground">{t('Nothing taken.')}</p>
            ) : (
              <ul className="mt-1">
                {sale.payments.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 py-0.5">
                    <span>{t(METHOD_WORDS[p.method] ?? p.method)}</span>
                    <span className="tabular-nums">{taka(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {returned > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {returned} piece{returned === 1 ? '' : 's'} came back against this bill.
              </p>
            )}
          </div>

          <div className="text-sm">
            <div className="flex justify-between gap-3 py-0.5 text-muted-foreground">
              <span>{t('Items')}</span>
              <span className="tabular-nums">{taka(sale.subTotal)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between gap-3 py-0.5 text-muted-foreground">
                <span>{t('Less')}</span>
                <span className="tabular-nums">−{taka(sale.discount)}</span>
              </div>
            )}
            {(sale.vat ?? 0) > 0 && (
              <div className="flex justify-between gap-3 py-0.5 text-muted-foreground">
                <span>
                  {t('VAT')}
                  {sale.vatPercent ? ` ${sale.vatPercent}%` : ''}
                </span>
                <span className="tabular-nums">{taka(sale.vat ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-border py-1 font-semibold">
              <span>{t('Total')}</span>
              <span className="tabular-nums">{taka(sale.total)}</span>
            </div>
            <div className="flex justify-between gap-3 py-0.5">
              <span>{t('Taken')}</span>
              <span className="tabular-nums">{taka(sale.paid)}</span>
            </div>
            {(sale.changeGiven ?? 0) > 0 && (
              <div className="flex justify-between gap-3 py-0.5 text-muted-foreground">
                <span>
                  {t('Given')} {taka(sale.cashTendered ?? 0)} · {t('Change')}
                </span>
                <span className="tabular-nums">{taka(sale.changeGiven ?? 0)}</span>
              </div>
            )}
            {sale.due > 0 && (
              <div className="flex justify-between gap-3 py-0.5 font-semibold text-destructive">
                <span>{t('On account')}</span>
                <span className="tabular-nums">{taka(sale.due)}</span>
              </div>
            )}
            {canSeeCost && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("Kept with the bill: what these pieces cost the shop, so the profit on it is a fact about this delivery and not about today's price.")}
              </p>
            )}
          </div>
        </div>

        {/* ---- who has had their hands on this ---- */}
        {(sale.history?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-lg border border-border p-3">
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              <History className="h-3 w-3" /> {t('Changed after it was rung up')}
            </div>
            {sale.history?.map((h, i) => (
              <div key={h._id ?? i} className="border-b border-border py-1.5 text-sm last:border-0">
                <span className="font-semibold">
                  {h.action === 'void' ? t('Cancelled') : t('Corrected')}
                </span>{' '}
                <span className="text-muted-foreground">
                  {t('by')} {h.actorName}
                  {h.actorRole ? ` (${h.actorRole})` : ''} · {when(h.at)}
                </span>
                <span className="block text-[11px]">
                  <span className="text-muted-foreground">{t('Reason')}:</span> {h.reason}
                  {h.note ? ` · ${h.note}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ---- correcting it, or cancelling it ---- */}
        {doing === 'edit' && (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="mb-2 text-sm font-semibold">{t('Correct this bill')}</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              {t(
                'Only the name, the phone and the note. What left the shelf cannot be changed after the customer has walked out with it — cancel the bill and ring it up again instead.',
              )}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="input h-9"
                placeholder={t('Who is taking it')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div>
                <input
                  className="input h-9"
                  placeholder={t('Phone')}
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={phoneBad}
                />
                {phoneBad && (
                  <p className="mt-1 text-[11px] text-destructive">{t(BD_MOBILE_MESSAGE)}</p>
                )}
              </div>
              <input
                className="input h-9 sm:col-span-2"
                placeholder={t('Note')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <input
                className="input h-9 sm:col-span-2"
                placeholder={t('Why — required, and kept with the bill')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost h-9" onClick={() => setDoing(null)}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="btn h-9"
                disabled={busy || reason.trim().length < 3 || phoneBad}
                onClick={() => void save()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save')}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {/*
            Only the owner sees these, and the server checks again anyway — the
            screen not offering a thing and the server refusing it are two
            different guarantees and this has both.
          */}
          {onChanged && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAsking('delete')}
                title={t('Delete this bill')}
              >
                <Trash2 className="h-4 w-4" /> {t('Delete')}
              </button>

              {sale.status === 'void' ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAsking('revert')}
                >
                  <RotateCcw className="h-4 w-4" /> {t('Put it back')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setAsking(sale.onHold ? 'unhold' : 'hold')}
                  >
                    {sale.onHold ? (
                      <>
                        <PlayCircle className="h-4 w-4" /> {t('Let it go')}
                      </>
                    ) : (
                      <>
                        <PauseCircle className="h-4 w-4" /> {t('Hold it')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setAsking('void')}
                  >
                    <Ban className="h-4 w-4" /> {t('Cancel it')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={sale.onHold}
                    title={sale.onHold ? t('That bill is being checked — let it go first') : ''}
                    onClick={() => {
                      setDoing('edit');
                      setReason('');
                    }}
                  >
                    <Pencil className="h-4 w-4" /> {t('Correct it')}
                  </button>
                </>
              )}
            </>
          )}
          {/* Returns are taken at the counter, against an open till — so this
              hands the counter the bill rather than asking for it again. */}
          {sale.status !== 'void' && (
            <Link to={`/?return=${encodeURIComponent(sale.billNo)}`} className="btn btn-ghost">
              <Undo2 className="h-4 w-4" /> {t('Take something back')}
            </Link>
          )}
          {onPrint && (
            <button type="button" className="btn" onClick={onPrint}>
              <Printer className="h-4 w-4" /> {t('Print it again')}
            </button>
          )}
        </div>

      <ConfirmWithReason
        open={asking !== null}
        title={asking ? ACTS[asking].title : ''}
        message={asking ? ACTS[asking].message : ''}
        confirmLabel={asking ? ACTS[asking].confirm : ''}
        tone={asking === 'revert' || asking === 'unhold' ? 'normal' : 'danger'}
        reason={asking ? (ACTS[asking] as { reason?: boolean }).reason !== false : true}
        busy={busy}
        onConfirm={(why) => void act(why)}
        onCancel={() => setAsking(null)}
      />
    </Modal>
  );
}
