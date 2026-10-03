import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Loader2, Smartphone, X, Zap } from 'lucide-react';
import { tillApi } from '../api';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Taking bKash or Nagad at the counter.
 *
 * Two ways, chosen by what the shop has set up (Settings → bKash & Nagad):
 *
 * - **Automatic (bKash merchant).** The till starts the payment, the customer
 *   scans the QR with their phone and pays on bKash's page with their PIN, and
 *   the till sees it arrive — amount and transaction id filled in.
 * - **The shop's own number.** A QR and the number in large type, with the
 *   amount, for the customer to send money to; the salesman types the
 *   transaction id from the confirmation SMS.
 *
 * Either way the bill gets the amount in that method's box and the
 * transaction id as its reference.
 */

export type WalletMethod = 'bkash' | 'nagad';

export function WalletPanel({
  method,
  amount,
  number,
  auto,
  onDone,
  onClose,
}: {
  method: WalletMethod;
  /** What is left to take, as a starting figure. */
  amount: number;
  number: string;
  auto: boolean;
  onDone: (amount: number, reference: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const [value, setValue] = useState(String(Math.max(0, Math.round(amount * 100) / 100) || ''));
  const [trx, setTrx] = useState('');
  const [qr, setQr] = useState('');
  const [live, setLive] = useState<{ id: string; url: string } | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'waiting' | 'done' | 'failed'>('idle');
  const [error, setError] = useState('');
  const poll = useRef<number | null>(null);
  const brand = method === 'bkash' ? { name: 'bKash', tone: 'from-pink-500 to-rose-600', ring: 'ring-pink-500/30' } : { name: 'Nagad', tone: 'from-orange-500 to-red-500', ring: 'ring-orange-500/30' };
  const amt = Number(value) || 0;
  const automatic = method === 'bkash' && auto;

  /* The manual QR: the number and the amount, readable by any phone's camera. */
  useEffect(() => {
    if (automatic || !number) return;
    void QRCode.toDataURL(`${brand.name} ${number} — ৳${amt}`, { margin: 1, width: 300 }).then(setQr);
  }, [automatic, number, amt, brand.name]);

  useEffect(
    () => () => {
      if (poll.current) window.clearInterval(poll.current);
    },
    [],
  );

  const start = async () => {
    setError('');
    setState('starting');
    try {
      const p = await tillApi.startBkash(amt);
      setLive({ id: p.id, url: p.payURL });
      setQr(await QRCode.toDataURL(p.payURL, { margin: 1, width: 300 }));
      setState('waiting');
      poll.current = window.setInterval(async () => {
        const s = await tillApi.walletStatus(p.id).catch(() => null);
        if (!s) return;
        if (s.status === 'completed') {
          window.clearInterval(poll.current!);
          setState('done');
          setTimeout(() => onDone(s.amount, s.trxID), 900);
        } else if (s.status === 'failed' || s.status === 'cancelled') {
          window.clearInterval(poll.current!);
          setState('failed');
          setError(t('The customer’s payment did not go through. Try again, or take it another way.'));
        }
      }, 2500);
    } catch (e: unknown) {
      setState('idle');
      setError((e as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not start the payment.'));
    }
  };

  const close = () => {
    if (live && state === 'waiting') void tillApi.cancelWallet(live.id).catch(() => undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={close}>
      <div className={`w-full max-w-sm overflow-hidden rounded-3xl bg-card shadow-2xl ring-4 ${brand.ring}`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between bg-gradient-to-r ${brand.tone} px-5 py-3.5 text-white`}>
          <span className="flex items-center gap-2 text-lg font-bold">
            <Smartphone className="h-5 w-5" /> {brand.name}
            {automatic && (
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                <Zap className="h-3 w-3" /> {t('automatic')}
              </span>
            )}
          </span>
          <button type="button" aria-label={t('Close')} onClick={close} className="rounded-full p-1 hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <label className="block text-xs font-semibold text-muted-foreground">
            {t('Amount')}
            <input
              className="input mt-1 h-12 text-center text-2xl font-bold tabular-nums"
              inputMode="decimal"
              value={value}
              disabled={state === 'waiting' || state === 'done'}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>

          {automatic ? (
            <div className="mt-4 text-center">
              {state === 'idle' || state === 'starting' || state === 'failed' ? (
                <button type="button" className="btn h-12 w-full justify-center text-base" disabled={!(amt > 0) || state === 'starting'} onClick={() => void start()}>
                  {state === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                  {t('Show the customer a QR')}
                </button>
              ) : state === 'done' ? (
                <div className="py-6">
                  <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
                  <p className="mt-2 text-lg font-bold text-emerald-600">{t('Paid')} ৳{n(amt)}</p>
                </div>
              ) : (
                <>
                  {qr && <img src={qr} alt="QR" className="mx-auto h-56 w-56 rounded-xl border border-border" />}
                  <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t('Waiting for the customer to pay…')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('They scan it, pay with their PIN, and it fills in here.')}</p>
                </>
              )}
            </div>
          ) : (
            <div className="mt-4">
              {number ? (
                <div className="flex items-center gap-4 rounded-2xl border border-border p-3">
                  {qr && <img src={qr} alt="QR" className="h-28 w-28 rounded-lg" />}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t('Send money to')}</p>
                    <p className="font-mono text-xl font-bold tracking-wide">{number}</p>
                    <p className="mt-1 text-sm font-semibold">৳{n(amt)}</p>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{t('Add your bKash and Nagad numbers in Settings to show them here.')}</p>
              )}
              <label className="mt-4 block text-xs font-semibold text-muted-foreground">
                {t('Transaction ID (from the SMS)')}
                <input
                  className="input mt-1 h-11 font-mono uppercase"
                  value={trx}
                  maxLength={30}
                  placeholder="9AB1CD2EF3"
                  onChange={(e) => setTrx(e.target.value.toUpperCase().replace(/\s/g, ''))}
                />
              </label>
              <button type="button" className="btn mt-4 h-11 w-full justify-center" disabled={!(amt > 0)} onClick={() => onDone(amt, trx)}>
                <CheckCircle2 className="h-4 w-4" /> {t('Received')} ৳{n(amt)}
              </button>
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
