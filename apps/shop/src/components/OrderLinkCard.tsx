import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Loader2, MessageCircle, RefreshCw, ShoppingBag } from 'lucide-react';
import { onlineOrdersApi, type OnlineOrderSettings } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * The shop's order link, in Settings: on or off, pickup and delivery, the
 * delivery charge — and the link itself, with a QR to print by the door and
 * a button that shares it on WhatsApp.
 */
export default function OrderLinkCard() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const [s, setS] = useState<OnlineOrderSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));

  useEffect(() => {
    onlineOrdersApi.settings().then(setS).catch(() => undefined);
  }, []);

  const url = s ? `${window.location.origin}/o/${s.code}` : '';
  useEffect(() => {
    if (!url) return;
    void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#064e3b', light: '#ffffff' } }).then(setQr);
  }, [url]);

  useEffect(() => {
    if (window.location.hash === '#set-orders') box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [s]);

  const save = async (patch: Partial<OnlineOrderSettings>) => {
    if (!s) return;
    setS({ ...s, ...patch });
    setBusy(true);
    try {
      setS(await onlineOrdersApi.saveSettings(patch));
    } catch {
      toast(t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!s) return null;
  const share = `https://wa.me/?text=${encodeURIComponent(
    lang === 'bn' ? `এখন থেকে ঘরে বসেই ঔষধ অর্ডার করুন: ${url}` : `Order your medicines from us online: ${url}`,
  )}`;

  return (
    <section id="set-orders" ref={box} className="card mb-0 scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div>
            <h3 className="mb-0">{t('Online orders')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('A link customers order from — typed, or a photo of the prescription — for pickup or delivery.')}
            </p>
          </div>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <label className="mt-4 flex items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={s.enabled} onChange={(e) => void save({ enabled: e.target.checked })} />
        {t('Take orders online')}
      </label>

      {s.enabled && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={s.pickup} onChange={(e) => void save({ pickup: e.target.checked })} />
                {t('Pickup from the shop')}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={s.delivery} onChange={(e) => void save({ delivery: e.target.checked })} />
                {t('Home delivery')}
              </label>
            </div>
            {s.delivery && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  {t('Delivery charge')} ৳
                  <input
                    className="input h-9 w-20 tabular-nums"
                    type="number"
                    min={0}
                    value={s.deliveryCharge}
                    onChange={(e) => setS({ ...s, deliveryCharge: Number(e.target.value) || 0 })}
                    onBlur={() => void save({ deliveryCharge: s.deliveryCharge })}
                  />
                </label>
                <label className="flex items-center gap-2">
                  {t('Free over')} ৳
                  <input
                    className="input h-9 w-24 tabular-nums"
                    type="number"
                    min={0}
                    value={s.freeDeliveryOver}
                    onChange={(e) => setS({ ...s, freeDeliveryOver: Number(e.target.value) || 0 })}
                    onBlur={() => void save({ freeDeliveryOver: s.freeDeliveryOver })}
                  />
                </label>
              </div>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('A note on the order page (optional)')}</span>
              <input
                className="input h-10"
                maxLength={300}
                placeholder={t('e.g. Open 8am–11pm. Delivery within Mirpur only.')}
                value={s.note}
                onChange={(e) => setS({ ...s, note: e.target.value })}
                onBlur={() => void save({ note: s.note })}
              />
            </label>

            {/* ---- the link ---- */}
            <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-3">
              <p className="text-xs font-semibold text-muted-foreground">{t('Your order link')}</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold">{url}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                  onClick={() => void navigator.clipboard?.writeText(url).then(() => toast(t('Copied.')))}
                >
                  <Copy className="h-3.5 w-3.5" /> {t('Copy')}
                </button>
                <a href={share} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                  <MessageCircle className="h-3.5 w-3.5" /> {t('Share on WhatsApp')}
                </a>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                  {t('Open it')}
                </a>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  onClick={async () => {
                    if (!window.confirm(t('Make a new link? The old link and its QR stop working.'))) return;
                    setS(await onlineOrdersApi.newLink());
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> {t('New link')}
                </button>
              </div>
            </div>
          </div>

          {/* ---- the QR, to print by the door ---- */}
          {qr && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-3">
              <img src={qr} alt="QR" className="h-40 w-40" />
              <p className="max-w-[10rem] text-center text-[11px] text-muted-foreground">{t('Scan to order medicines')}</p>
              <a href={qr} download={`order-qr-${s.code}.png`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Download className="h-3.5 w-3.5" /> {t('Download the QR')} ({n(360)}px)
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
