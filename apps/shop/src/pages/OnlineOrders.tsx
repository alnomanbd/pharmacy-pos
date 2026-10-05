import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCan } from '../access';
import {
  Bike,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  PackageCheck,
  Phone,
  ReceiptText,
  ShoppingBag,
  Store,
  XCircle,
} from 'lucide-react';
import { onlineOrdersApi, type OnlineOrder, type OnlineOrderStatus } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import Modal from '../components/Modal';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import ConfirmWithReason from '../components/ConfirmWithReason';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * Orders from customers, through the shop's own link.
 *
 * A board in four columns — new, confirmed, ready, on the way — so the
 * counter sees at a glance what is waiting and moves each along with one tap.
 * An order is answered by an ordinary bill rung up at the POS; its number is
 * written on the order, and the customer gets an SMS at each step.
 */

const COLUMNS: { key: OnlineOrderStatus; label: string; tone: string; icon: typeof Clock }[] = [
  { key: 'new', label: 'New', tone: 'bg-amber-500', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', tone: 'bg-sky-500', icon: CheckCircle2 },
  { key: 'ready', label: 'Ready', tone: 'bg-violet-500', icon: PackageCheck },
  { key: 'out', label: 'On the way', tone: 'bg-emerald-500', icon: Bike },
];

/** The one next step each status offers as its main button. */
const NEXT: Partial<Record<OnlineOrderStatus, { to: OnlineOrderStatus; label: string }>> = {
  new: { to: 'confirmed', label: 'Confirm' },
  confirmed: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'delivered', label: 'Handed over' },
  out: { to: 'delivered', label: 'Delivered' },
};

/** What is asked before a step: every step sends the customer an SMS. */
const STEP: Partial<Record<OnlineOrderStatus, { title: string; label: string }>> = {
  confirmed: { title: 'Confirm this order?', label: 'Confirm' },
  ready: { title: 'Mark this order ready?', label: 'Mark ready' },
  out: { title: 'Send this order out?', label: 'Send out' },
  delivered: { title: 'Close this order as delivered?', label: 'Mark delivered' },
};

const since = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export default function OnlineOrders() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const [rows, setRows] = useState<OnlineOrder[] | null>(null);
  const [view, setView] = useState<'open' | 'delivered' | 'cancelled'>('open');
  const [open, setOpen] = useState<OnlineOrder | null>(null);
  const runsTheShop = useCan()('settings.manage');

  const load = useCallback(async () => {
    try {
      setRows(await onlineOrdersApi.list(view));
    } catch {
      toast(t('Could not load the orders.'), 'error');
    }
  }, [view, toast, t]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const move = async (o: OnlineOrder, to: OnlineOrderStatus, extra: { reason?: string } = {}) => {
    /* Cancelling has asked already, with its reason; every other step asks here. */
    const step = STEP[to];
    if (
      step &&
      !(await confirmAction({
        title: t(step.title),
        message: `${n(o.number)} · ${o.customerName} ${t('gets an SMS saying so.')}`,
        confirmLabel: t(step.label),
        icon: 'send',
      }))
    )
      return;
    try {
      const next = await onlineOrdersApi.update(o._id, { status: to, ...extra });
      setRows((r) => (r ?? []).map((x) => (x._id === o._id ? next : x)).filter((x) => view !== 'open' || !['delivered', 'cancelled'].includes(x.status)));
      setOpen((cur) => (cur?._id === o._id ? next : cur));
      toast(t('Updated — the customer gets an SMS.'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not update the order.'), 'error');
    }
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" /> {t('Online orders')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('Orders customers send through your link — confirm, bill at the POS, and send them on.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist">
            {(['open', 'delivered', 'cancelled'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                onClick={() => setView(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                {t(k === 'open' ? 'Open' : k === 'delivered' ? 'Done' : 'Cancelled')}
              </button>
            ))}
          </div>
          {runsTheShop && (
            <Link to="/settings#set-orders" className="btn btn-ghost h-9">
              {t('Your order link')}
            </Link>
          )}
        </div>
      </div>

      {!rows ? (
        <LoadingBlock />
      ) : view === 'open' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = rows.filter((r) => r.status === col.key);
            return (
              <section key={col.key} className="flex min-h-[200px] flex-col rounded-2xl border border-border bg-muted/30 p-3">
                <h3 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.tone}`} />
                  {t(col.label)}
                  <span className="ml-auto rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{n(list.length)}</span>
                </h3>
                <div className="flex flex-col gap-2.5">
                  {list.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t('Nothing here')}</p>}
                  {list.map((o) => (
                    <OrderCard key={o._id} o={o} n={n} onOpen={() => setOpen(o)} onNext={(to) => void move(o, to)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center text-sm text-muted-foreground">{t('Nothing here')}</div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((o) => (
            <OrderCard key={o._id} o={o} n={n} onOpen={() => setOpen(o)} />
          ))}
        </div>
      )}

      {open && <OrderDetail o={open} n={n} onClose={() => setOpen(null)} onMove={move} onSaved={(x) => { setOpen(x); void load(); }} />}
    </div>
  );
}

function OrderCard({
  o,
  n,
  onOpen,
  onNext,
}: {
  o: OnlineOrder;
  n: (v: number | string) => string;
  onOpen: () => void;
  onNext?: (to: OnlineOrderStatus) => void;
}) {
  const t = useT();
  const next = o.status === 'confirmed' && o.mode === 'delivery' ? { to: 'out' as const, label: 'Send out' } : NEXT[o.status];
  return (
    <div className="motion-rise rounded-xl border border-border bg-card p-3 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold">{n(o.number)}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {o.mode === 'delivery' ? <Bike className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
            {n(since(o.createdAt))}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold">{o.customerName}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {o.lines?.length ? o.lines.map((l) => `${l.name} ×${l.qty}`).join(', ') : o.items || t('Prescription photo')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {o.photos.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
              <ImageIcon className="h-3 w-3" /> {n(o.photos.length)}
            </span>
          )}
          {o.billNo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              <ReceiptText className="h-3 w-3" /> {o.billNo}
            </span>
          )}
          {o.status === 'cancelled' && <span className="pill cancelled !py-0 text-[10px]">{t('Cancelled')}</span>}
        </div>
      </button>
      {onNext && next && (
        <button type="button" onClick={() => onNext(next.to)} className="btn mt-2.5 h-8 w-full justify-center text-xs">
          {t(next.label)}
        </button>
      )}
    </div>
  );
}

function Photo({ k }: { k: string }) {
  const t = useT();
  const [url, setUrl] = useState('');
  useEffect(() => {
    let made = '';
    onlineOrdersApi
      .photo(k)
      .then((b) => {
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [k]);
  if (!url) return <span className="grid h-40 place-items-center rounded-xl bg-muted"><Loader2 className="h-5 w-5 animate-spin" /></span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-border">
      <img src={url} alt={t('Prescription')} className="max-h-80 w-full object-contain bg-black/5" />
    </a>
  );
}

function OrderDetail({
  o,
  n,
  onClose,
  onMove,
  onSaved,
}: {
  o: OnlineOrder;
  n: (v: number | string) => string;
  onClose: () => void;
  onMove: (o: OnlineOrder, to: OnlineOrderStatus, extra?: { reason?: string }) => Promise<void>;
  onSaved: (o: OnlineOrder) => void;
}) {
  const t = useT();
  const lang = useUiLang();
  const num = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const { toast } = useToast();
  const [billNo, setBillNo] = useState(o.billNo);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const phone = o.customerPhone.replace(/\D/g, '');
  const wa = `https://wa.me/${phone.startsWith('88') ? phone : `88${phone}`}`;
  const open = !['delivered', 'cancelled'].includes(o.status);
  const next = o.status === 'confirmed' && o.mode === 'delivery' ? { to: 'out' as const, label: 'Send out' } : NEXT[o.status];

  const link = async () => {
    setBusy(true);
    try {
      onSaved(await onlineOrdersApi.update(o._id, { billNo }));
      toast(t('Bill linked.'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not link that bill.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-xl" label={o.number}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="mb-0 font-mono text-lg">{n(o.number)}</h3>
          <p className="text-xs text-muted-foreground">
            {new Date(o.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} ·{' '}
            {t(o.mode === 'delivery' ? 'Delivery' : 'Pickup')}
          </p>
        </div>
        <span className="pill neutral">{t(COLUMNS.find((c) => c.key === o.status)?.label ?? (o.status === 'delivered' ? 'Done' : 'Cancelled'))}</span>
      </div>

      {/* ---- who ---- */}
      <div className="mt-4 rounded-xl border border-border p-3">
        <p className="font-semibold">{o.customerName}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
            <Phone className="h-3.5 w-3.5" /> {o.customerPhone}
          </a>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </div>
        {o.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-start gap-1.5 text-sm text-primary hover:underline"
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {o.address} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
          </a>
        )}
      </div>

      {/* ---- what they picked from the list ---- */}
      {(o.lines?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">{t('Their list')}</p>
          <ul className="mt-1 divide-y divide-border rounded-xl border border-border">
            {o.lines!.map((l, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {l.name}
                  {!l.product && <span className="ml-1.5 text-[11px] font-normal text-amber-600">{t('typed')}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {num(l.qty)} {t(l.unit === 'piece' ? 'pc' : l.unit)}
                </span>
                {l.price > 0 && <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">৳{num(Math.round(l.price * l.qty))}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- what they wrote ---- */}
      {o.items && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">{t('What they asked for')}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void navigator.clipboard?.writeText(o.items).then(() => toast(t('Copied.')))}
            >
              <Copy className="h-3.5 w-3.5" /> {t('Copy')}
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{o.items}</p>
        </div>
      )}
      {o.note && <p className="mt-2 text-sm text-muted-foreground">“{o.note}”</p>}
      {o.photos.length > 0 && (
        <div className="mt-3 grid gap-2">
          {o.photos.map((k) => (
            <Photo key={k} k={k} />
          ))}
        </div>
      )}

      {/* ---- the bill ---- */}
      <div className="mt-4 rounded-xl border border-border p-3">
        <p className="text-xs font-semibold text-muted-foreground">{t('The bill for it')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link to="/" className="btn btn-ghost h-9" onClick={onClose}>
            <ReceiptText className="h-4 w-4" /> {t('Bill it at the POS')}
          </Link>
          <input className="input h-9 w-32 font-mono" placeholder={t('Bill no.')} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          <button type="button" className="btn h-9" disabled={busy || billNo === o.billNo} onClick={() => void link()}>
            {t('Link')}
          </button>
        </div>
        {o.total > 0 && (
          <p className="mt-2 text-sm">
            {t('Bill')} <strong className="tabular-nums">৳{n(o.total)}</strong>
            {o.deliveryCharge > 0 && (
              <>
                {' '}
                + {t('delivery')} ৳{n(o.deliveryCharge)} = <strong className="tabular-nums">৳{n(o.total + o.deliveryCharge)}</strong>
              </>
            )}
          </p>
        )}
      </div>

      {o.status === 'cancelled' && o.cancelReason && <p className="mt-3 text-sm text-destructive">{o.cancelReason}</p>}

      {open && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
            onClick={() => setCancelling(true)}
          >
            <XCircle className="h-4 w-4" /> {t('Cancel order')}
          </button>
          {o.status === 'confirmed' && o.mode === 'delivery' && (
            <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-muted" onClick={() => void onMove(o, 'ready')}>
              {t('Mark ready')}
            </button>
          )}
          {next && (
            <button type="button" className="btn h-10" onClick={() => void onMove(o, next.to)}>
              {t(next.label)}
            </button>
          )}
        </div>
      )}
      <ConfirmWithReason
        open={cancelling}
        title={t('Cancel this order?')}
        message={`${n(o.number)} · ${o.customerName} ${t('gets an SMS saying it is cancelled, with your reason.')}`}
        placeholder={t('Why is it cancelled? The customer is told.')}
        confirmLabel={t('Cancel the order')}
        onCancel={() => setCancelling(false)}
        onConfirm={(reason) => {
          setCancelling(false);
          void onMove(o, 'cancelled', { reason });
        }}
      />
    </Modal>
  );
}
