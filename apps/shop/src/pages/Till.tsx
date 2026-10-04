import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCan } from '../access';
import {
  ScanLine,
  Loader2,
  Trash2,
  Search,
  DoorOpen,
  DoorClosed,
  Receipt as ReceiptIcon,
  Undo2,
  FileText,
  BookUser,
  TriangleAlert,
  CloudOff,
  RefreshCw,
  Maximize,
  Minimize,
  Keyboard,
  PauseCircle,
  Layers,
  Store,
  X,
  Moon,
  Sun,
  Grid3x3,
  History,
  Pill,
  ShoppingBag,
  CalendarClock,
  CornerDownLeft,
  Banknote,
  QrCode,
  Zap,
  Star,
  Calculator as CalculatorIcon,
} from 'lucide-react';
import {
  tillApi,
  settingsApi,
  taka,
  packOf,
  type SellableProduct,
  type Shift,
  type Sale,
  type ShopSettings,
  type ShopCustomer,
  type LoyaltySettings,
  type ShopCounter,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useTheme } from '@dawai/shared/hooks/useTheme';
import { useBanglaKeyboard } from '@dawai/shared/store/banglaKeyboard.store';
import { TypingModeToggle } from '@dawai/shared/components/TypingModeToggle';
import { useFullscreen } from '@dawai/shared/hooks/useFullscreen';
import {
  flushOutbox,
  isOffline,
  newRef,
  onOutboxChange,
  pendingSales,
  provisionalBill,
  queueSale,
  rememberShelf,
  shelfSearch,
  type PendingSale,
} from '../offline';
import { useT, useLangStore } from '../i18n/ui';
import { useShortcuts, SHORTCUT_HELP } from '../pos/useShortcuts';
import { heldBills, hold, drop, labelFor, onHeldChange, type HeldBill } from '../pos/held';
import { quickPicks, remember } from '../pos/quickPicks';
import Receipt from '../components/Receipt';
import ReturnBill from '../components/ReturnBill';
import CustomerPicker, { type CustomerPickerHandle } from '../pos/CustomerPicker';
import Modal from '../components/Modal';
import Clock from '../components/Clock';
import RecentBills from '../pos/RecentBills';
import AlertBell from '../alerts/AlertBell';
import AlertTicker from '../alerts/AlertTicker';
import { useAlertStore, useStockAlertsPoll } from '../alerts/useStockAlerts';
import { WalletPanel, type WalletMethod } from '../pos/WalletPanel';
import CounterCalculator from '../pos/Calculator';

/**
 * The counter.
 *
 * This screen is not a page of the shop's admin app and is deliberately not
 * drawn like one. A till is its own machine: somebody stands at it for ten
 * hours, works it with both hands and almost never the mouse, and the only
 * thing they need to see is the bill — so the rail, the top bar and the page
 * padding all go, and the whole screen becomes the counter.
 *
 * What every real till does, and why each of these is here:
 *
 * - **Full bleed, with a fullscreen key.** A POS in a shop runs with the
 *   browser chrome gone. More of the bill fits, and a screen with no navigation
 *   on it is a screen nobody wanders off in the middle of a sale.
 * - **Function keys.** F2 find, F8 take payment, F6 hold — because a hand on a
 *   keyboard beats a hand on a mouse, and whoever works this has the layout
 *   memorised by the end of the first week. Every one of them is also a button:
 *   a touch screen and a new salesman both need one.
 * - **Bills put aside.** A counter serves three people at once; somebody goes
 *   back to the shelf and the queue does not stop. F6 parks the bill, F7 brings
 *   it back. See `pos/held.ts` for why that never touches the server.
 * - **Quick keys that learn.** The handful of things this counter reaches for,
 *   taken from what it has actually sold rather than from a list somebody was
 *   asked to configure.
 * - **The pharmacy's own facts on every row.** The rack it is on, the pack it
 *   breaks into, how many are left and how soon the oldest lot goes out of date
 *   — the four things somebody would otherwise walk over to the shelf to check.
 *
 * The rules underneath are the ones they always were: no sale without a shift,
 * quantity in pieces with the pack beside it, payment as a split, and a due with
 * a name on it.
 */

interface Line {
  product: SellableProduct;
  qtyPieces: number;
  pricePerPiece: number;
}

const METHODS = [
  { key: 'cash', label: 'Cash', dot: 'bg-emerald-500' },
  { key: 'bkash', label: 'bKash', dot: 'bg-pink-500' },
  { key: 'nagad', label: 'Nagad', dot: 'bg-orange-500' },
  { key: 'card', label: 'Card', dot: 'bg-sky-500' },
] as const;

/**
 * A quantity as a counter says it: so many strips, and so many loose.
 *
 * "Two pata and three tablets" is one sentence at a till, and it was one number
 * on this screen — 23 pieces, which somebody had to work out. The two boxes
 * hold the two halves of the same figure: strips carries the whole ones and
 * pieces carries the remainder, so neither ever shows a fraction.
 *
 * A bottle of syrup is a strip of one, which makes its strip count equal to its
 * piece count and the box pointless — the row hides it rather than showing the
 * same number twice.
 */
export const stripSize = (l: { product: { piecesPerStrip: number } }) =>
  Math.max(1, l.product.piecesPerStrip || 1);

export const splitQty = (l: { qtyPieces: number; product: { piecesPerStrip: number } }) => {
  const strip = stripSize(l);
  return { strips: Math.floor(l.qtyPieces / strip), loose: l.qtyPieces % strip };
};

/** The notes a customer actually hands over. */
const NOTES = [50, 100, 200, 500, 1000];

/** Soon enough that somebody should look at the strip before it goes in the bag. */
const EXPIRY_WARN_DAYS = 90;

const daysTo = (iso: string | null) =>
  iso ? Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;

const shortExpiry = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : '';

export default function Till() {
  /* The till has no shell, so it keeps the bell and the ticker going itself. */
  useStockAlertsPoll();
  /* Toasts rise over the bill here, not over the figure being paid — see
     toast.css. */
  useEffect(() => {
    document.body.classList.add('toasts-bottom-left');
    return () => document.body.classList.remove('toasts-bottom-left');
  }, []);
  const refreshAlerts = useAlertStore((s) => s.refresh);
  /* The bell's stock alerts are for whoever looks after the shelves. */
  const runsTheShop = useCan()('stock.view');
  const t = useT();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const keyboard = useBanglaKeyboard();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SellableProduct[]>([]);
  /* Which search result the arrow keys are sitting on. */
  const [hitAt, setHitAt] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  /* Which line on the bill +, − and Del act on. */
  const [lineAt, setLineAt] = useState(0);
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState<Record<string, string>>({ cash: '' });
  /* The transaction id for a bKash or Nagad payment, kept on the bill as its reference. */
  const [refs, setRefs] = useState<Record<string, string>>({});
  /* The shop's numbers, and whether bKash confirms itself — asked once. */
  const [wallets, setWallets] = useState<{ bkashNumber: string; nagadNumber: string; bkashAuto: boolean } | null>(null);
  const [walletOpen, setWalletOpen] = useState<WalletMethod | null>(null);
  useEffect(() => {
    tillApi.wallets().then(setWallets).catch(() => undefined);
  }, []);
  /* Walk-in is the default and stays the default: almost every bill belongs to
     nobody, and a name field on every sale is a name field typed into badly. */
  const [customer, setCustomer] = useState<ShopCustomer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastBill, setLastBill] = useState<Sale | null>(null);
  /* The shop's header and paper width. Fetched once: it changes about twice a
     year and the counter prints a bill every two minutes. */
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  /* Spending the picked customer's loyalty points on this bill. */
  const [usePoints, setUsePoints] = useState(false);
  const [printing, setPrinting] = useState<Sale | null>(null);
  const [returning, setReturning] = useState(false);
  /* The register sends somebody here with a bill already chosen — ?return=13-0042
     — so they do not type a number they have already picked. */
  const [params, setParams] = useSearchParams();
  const returnBillNo = params.get('return') ?? '';
  const [keysOpen, setKeysOpen] = useState(false);
  /** The counter calculator, beside the payment panel — F3. */
  const [calcOpen, setCalcOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [held, setHeld] = useState<HeldBill[]>(() => heldBills());
  const [picks, setPicks] = useState<SellableProduct[]>(() => quickPicks());

  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<CustomerPickerHandle>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);

  /* Bills rung up while the line was down, still waiting to be posted. */
  const [waiting, setWaiting] = useState<PendingSale[]>(() => pendingSales());
  const [sending, setSending] = useState(false);
  /* Set the moment a request fails to reach anybody, cleared on the next one
     that does. `navigator.onLine` alone lies: a counter is "online" on a wifi
     whose router has no line behind it. */
  const [offline, setOffline] = useState(false);

  const loadShift = useCallback(async () => {
    try {
      const res = await tillApi.shift();
      setShift(res.shift);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShift();
    settingsApi
      .get()
      .then(setSettings)
      .catch(() => undefined);
  }, [loadShift]);

  useEffect(() => {
    const off = onHeldChange(() => setHeld(heldBills()));
    return () => {
      off();
    };
  }, []);

  /**
   * Sends whatever is waiting, whenever there is a chance it will go.
   *
   * On the way in, when the browser says the line is back, and every half
   * minute in between — because "the browser says the line is back" is not the
   * same as "the shop's line is back", and a counter should never have to
   * remember to press anything.
   */
  const send = useCallback(
    async (announce = false) => {
      if (pendingSales().filter((s) => !s.error).length === 0) return;
      setSending(true);
      try {
        const res = await flushOutbox();
        if (res.sent > 0) {
          setOffline(false);
          /* The slip on screen came out without a number. Now there is one, so
             the counter can reprint it if the customer is still there. */
          setLastBill((prev) => res.posted.find((p) => p.clientRef === prev?._id)?.sale ?? prev);
          if (announce) {
            toast(`${res.sent} bill${res.sent === 1 ? '' : 's'} sent to the shop's records.`);
          }
          await loadShift();
        }
      } finally {
        setSending(false);
      }
    },
    [loadShift, toast],
  );

  useEffect(() => {
    const off = onOutboxChange(() => setWaiting(pendingSales()));
    const back = () => void send(true);
    window.addEventListener('online', back);
    const timer = setInterval(() => void send(true), 30_000);
    void send();
    return () => {
      off();
      window.removeEventListener('online', back);
      clearInterval(timer);
    };
  }, [send]);

  /* Search as they type, but only once they stop — a shop's connection is not
     fast and one request per keystroke makes the box feel broken. */
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const found = await tillApi.search(q.trim());
        setHits(found);
        setHitAt(0);
        setOffline(false);
        /* Every search teaches the cache something, so the counter can still
           find it when the line goes. */
        rememberShelf(found);
      } catch (err) {
        if (isOffline(err)) {
          setOffline(true);
          setHits(shelfSearch(q.trim()));
          setHitAt(0);
        } else {
          setHits([]);
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const subTotal = useMemo(
    () => lines.reduce((n, l) => n + l.qtyPieces * l.pricePerPiece, 0),
    [lines],
  );
  /*
   * Loyalty points: as many of the customer's as this bill may take, on the
   * same rule the server holds it to — at least the minimum, never more than
   * the set share of the bill.
   */
  const loyalty = settings?.loyalty?.enabled ? settings.loyalty : null;
  const spendable = useMemo(() => {
    const none = { points: 0, value: 0 };
    if (!loyalty || !customer || !(loyalty.pointValue > 0)) return none;
    const have = Math.floor(customer.points ?? 0);
    const bill = Math.max(0, subTotal - (Number(discount) || 0));
    const cap = Math.floor((bill * loyalty.maxRedeemPercent) / 100 / loyalty.pointValue + 1e-9);
    const points = Math.max(0, Math.min(have, cap));
    return points > 0 && points >= loyalty.minRedeem ? { points, value: Math.round(points * loyalty.pointValue * 100) / 100 } : none;
  }, [loyalty, customer, subTotal, discount]);
  const redeem = useMemo(() => (usePoints ? spendable : { points: 0, value: 0 }), [usePoints, spendable]);
  const afterDiscount = Math.max(0, subTotal - (Number(discount) || 0) - redeem.value);
  /*
   * VAT, shown before the server works it out again.
   *
   * Zero for almost every shop here — medicine is exempt — so this is invisible
   * until somebody sets a rate. Worked out on the same rule the server uses, on
   * the lines that are not medicine, so the figure at the counter is the figure
   * on the paper. The server's is what the bill is actually saved with.
   */
  const vat = useMemo(() => {
    const rate = settings?.vatPercent ?? 0;
    if (!(rate > 0) || subTotal <= 0) return 0;
    const keep = Math.max(0, 1 - ((Number(discount) || 0) + redeem.value) / subTotal);
    const base = lines
      .filter((l) => settings?.vatOnMedicine || l.product.isMedicine === false)
      .reduce((n, l) => n + l.qtyPieces * l.pricePerPiece, 0);
    return Math.round(((base * keep * rate) / 100) * 100) / 100;
  }, [lines, subTotal, discount, settings, redeem.value]);

  const total = Math.round((afterDiscount + vat) * 100) / 100;
  const paidTotal = Object.values(paid).reduce((n, v) => n + (Number(v) || 0), 0);
  /* What is owing lives on `plan` now, since it depends on the rule the save
     follows rather than on the boxes alone. The change does not: it is money
     physically handed over, which only ever comes from a typed figure. */
  /* Change comes out of the cash and only the cash — the server records it
     the same way. A bKash sent over the bill is not notes to hand back, and
     showing it as "give back" sent money out of the drawer the bill never
     accounted for. */
  const change = Math.max(
    0,
    Math.round(Math.min(paidTotal - total, Number(paid.cash) || 0) * 100) / 100,
  );
  const pieces = lines.reduce((n, l) => n + l.qtyPieces, 0);

  const add = useCallback((p: SellableProduct, qty = 1) => {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.product._id === p._id);
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qtyPieces: next[at].qtyPieces + qty };
        setLineAt(at);
        return next;
      }
      setLineAt(prev.length);
      return [...prev, { product: p, qtyPieces: qty, pricePerPiece: p.mrpPerPiece }];
    });
    setQ('');
    setHits([]);
    searchRef.current?.focus();
  }, []);

  /* Adding something that goes out of date soon is worth one line of warning:
     the strip is about to go into a bag and nobody will look at it again. */
  const addChecked = useCallback(
    (p: SellableProduct, qty = 1) => {
      const days = daysTo(p.nearestExpiry);
      if (days !== null && days <= EXPIRY_WARN_DAYS) {
        toast(
          days < 0
            ? `${p.name} — the oldest lot is already out of date. Check the strip.`
            : `${p.name} — the oldest lot goes out of date in ${days} days.`,
          days < 0 ? 'error' : 'warning',
        );
      }
      add(p, qty);
    },
    [add, toast],
  );

  /*
   * A scan puts itself on the bill.
   *
   * The server answers a code with exactly one row, so a single hit whose code
   * is precisely what is in the box is not a search result to choose from — it
   * is the thing under the beam. Adding it here rather than in the search
   * effect keeps one path onto the bill: the expiry warning, the quantity and
   * the focus all still come from `addChecked`.
   */
  useEffect(() => {
    const only = hits.length === 1 ? hits[0] : null;
    if (only?.barcode && only.barcode === q.trim()) addChecked(only);
  }, [hits, q, addChecked]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const removeLine = useCallback((i: number) => {
    setLines((prev) => prev.filter((_, n) => n !== i));
    setLineAt((at) => Math.max(0, at > i ? at - 1 : at));
  }, []);

  const bump = useCallback((i: number, by: number) => {
    setLines((prev) =>
      prev
        .map((l, n) => (n === i ? { ...l, qtyPieces: Math.max(0, l.qtyPieces + by) } : l))
        .filter((l) => l.qtyPieces > 0),
    );
  }, []);

  /** A whole strip of whatever is picked — what a customer usually asks for. */
  const wholeStrip = useCallback(
    (i: number) => {
      const line = lines[i];
      if (!line) return;
      bump(i, Math.max(1, line.product.piecesPerStrip || 1));
    },
    [lines, bump],
  );

  const clear = useCallback(() => {
    setLines([]);
    setLineAt(0);
    setDiscount('');
    setPaid({ cash: '' });
    setRefs({});
    setUsePoints(false);
    setCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
    setQ('');
    setHits([]);
    searchRef.current?.focus();
  }, []);

  /* ---- bills put aside ---- */

  const park = useCallback(() => {
    if (lines.length === 0) return;
    hold({
      label: labelFor(lines, customerName),
      lines,
      customerName,
      customerPhone,
      discount,
      total,
    });
    toast(t('Put aside. F7 brings it back.'));
    clear();
  }, [lines, customerName, customerPhone, discount, total, clear, toast, t]);

  const resume = useCallback((bill: HeldBill) => {
    setLines(bill.lines);
    setLineAt(0);
    setCustomer(null);
    setCustomerName(bill.customerName);
    setCustomerPhone(bill.customerPhone);
    setDiscount(bill.discount);
    setPaid({ cash: '' });
    setRefs({});
    drop(bill.id);
    setHeldOpen(false);
    searchRef.current?.focus();
  }, []);

  /*
   * What this bill is about to do, worked out once.
   *
   * The dialog and the sale read the same object on purpose: they disagreed
   * the first time — the dialog announced "on account" for a bill that was
   * about to be taken as cash, because it was reading the typed boxes while
   * the sale was applying the rule below.
   *
   * The rule: what was taken is what somebody typed into a box, and nothing
   * else. A bill with every box empty is not a cash sale the software may
   * assume — it is a bill nobody has said the money for, and it is refused
   * (with the reason, and the cash box focused). The one way to owe money
   * without typing it is the baki khata, which needs a name against it.
   */
  const plan = useMemo(() => {
    const payments = Object.entries(paid)
      .filter(([, v]) => Number(v) > 0)
      .map(([method, v]) => ({ method, amount: Number(v), ...(refs[method] ? { reference: refs[method] } : {}) }));
    const taken = payments.reduce((n, p) => n + p.amount, 0);
    return {
      payments,
      onAccount: !!customerName.trim(),
      /* Nothing in any box. Not an instruction to assume anything — the money
         has to be said, in a box or as a name on the baki khata. */
      nothingTaken: payments.length === 0,
      owing: Math.max(0, Math.round((total - taken) * 100) / 100),
      change: Math.max(
        0,
        Math.round(
          Math.min(taken - total, payments.filter((p) => p.method === 'cash').reduce((n, p) => n + p.amount, 0)) *
            100,
        ) / 100,
      ),
      /* Over the bill by more than the cash can give back: change only ever
         comes out of the cash line, so the rest stays with the shop. */
      overDigital: Math.max(
        0,
        Math.round(
          (taken - total - payments.filter((p) => p.method === 'cash').reduce((n, p) => n + p.amount, 0)) * 100,
        ) / 100,
      ),
    };
  }, [paid, refs, customerName, total]);

  const sell = useCallback(async () => {
    if (lines.length === 0) return;

    const { payments, owing, onAccount } = plan;

    /* Money left owing and nobody to chase it — a part payment with no name,
       or an empty bill that reached here another way. Said out loud with the
       box opened, rather than a dead button. */
    if (owing > 0 && !onAccount) {
      toast(t('Who is taking it on account?'), 'error');
      customerRef.current?.open();
      return;
    }

    const body = {
      lines: lines.map((l) => ({
        productId: l.product._id,
        qtyPieces: l.qtyPieces,
        pricePerPiece: l.pricePerPiece,
      })),
      payments,
      discount: Number(discount) || 0,
      ...(redeem.points > 0 ? { redeemPoints: redeem.points } : {}),
      /* The id where the shop already knows them, so one Kabir Bhai does not
         become four; the typed name only for somebody new. */
      customerId: customer?._id,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
    };

    setBusy(true);
    try {
      const bill = await tillApi.sell(body);
      setOffline(false);
      setLastBill(bill);
      remember(lines.map((l) => l.product));
      setPicks(quickPicks());
      /* Printed straight away unless the shop has said not to: the customer is
         still standing there, and a bill printed later is a bill nobody takes. */
      if (settings?.autoPrint !== false) setPrinting(bill);
      toast(
        `Bill ${bill.billNo} · ${taka(bill.total)}` +
          (bill.loyalty?.earned ? ` · +${bill.loyalty.earned} ${t('points')}` : ''),
      );
      /* That bill may have emptied a shelf; the bell should know before the
         next customer asks for it. */
      refreshAlerts();
      clear();
      await loadShift();
    } catch (e: unknown) {
      if (!isOffline(e)) {
        const res = (e as { response?: { data?: { message?: string } } }).response;
        toast(res?.data?.message || t('Could not complete that sale.'), 'error');
        setBusy(false);
        return;
      }

      /*
       * The line is down and the customer is holding the strips.
       *
       * The bill goes on the queue and the paper comes out without a number,
       * because only the shop can issue one and the shop has not been asked.
       * Everything else carries on exactly as it would have: the sale is made.
       */
      const entry: PendingSale = {
        clientRef: newRef(),
        soldAt: new Date().toISOString(),
        body,
        total,
        items: lines.length,
        customerName: customerName.trim(),
      };
      queueSale(entry);
      setOffline(true);
      remember(lines.map((l) => l.product));
      setPicks(quickPicks());

      const slip = provisionalBill(
        entry,
        shift?.userName ?? '',
        lines.map((l) => ({
          name: `${l.product.name} ${l.product.strength ?? ''}`.trim(),
          batchNo: '',
          qtyPieces: l.qtyPieces,
          pricePerPiece: l.pricePerPiece,
          discount: 0,
          lineTotal: Math.round(l.qtyPieces * l.pricePerPiece * 100) / 100,
        })),
      );
      setLastBill(slip);
      if (settings?.autoPrint !== false) setPrinting(slip);
      toast(`${taka(total)} taken — the bill goes to the shop when the line is back.`);
      clear();
    } finally {
      setBusy(false);
    }
  }, [
    plan,
    lines,
    paid,
    discount,
    redeem,
    customer,
    customerName,
    customerPhone,
    settings,
    shift,
    total,
    clear,
    loadShift,
    toast,
    refreshAlerts,
    t,
  ]);

  /* Anything on the bill can be sold. Whether it is cash or baki is worked out
     when the button is pressed, and refused *with a reason* if it cannot be —
     a button that is dead for a reason nobody can see is the same as a broken
     one. */
  const canSell = lines.length > 0 && !busy;

  /*
   * The pause before a bill is saved.
   *
   * On unless the shop has turned it off: the button takes stock off the shelf
   * and money into the day, and it sits under the same hand that reaches for
   * the search box. It shows the figures rather than asking "are you sure" —
   * what goes wrong at a till is a mis-keyed amount, and a dialog that does not
   * show the amount cannot catch one.
   *
   * The assumption the till makes when the payment boxes are empty — cash, in
   * full — is spelled out on it, because that is the one thing on the bill
   * nobody typed.
   */
  const askFirst = settings?.confirmSale !== false;
  const [confirming, setConfirming] = useState(false);

  const attemptSell = useCallback(() => {
    if (!canSell) return;

    /* F8 twice finishes a bill: the second press is the yes. A counter worked
       from the keyboard should not have to reach for the mouse to agree with
       a dialog it asked for. */
    if (confirming) {
      setConfirming(false);
      void sell();
      return;
    }

    /*
     * No money said, and nobody to owe it.
     *
     * Refused rather than assumed: the amount is the salesman's to state, and
     * software that fills it in for them is software that records a cash sale
     * nobody counted. `Exact cash` is one tap away and puts the figure in the
     * box, which is the same action made explicit.
     */
    if (plan.nothingTaken && !plan.onAccount) {
      toast(t('How much was taken? Type it, or press Exact cash.'), 'error');
      cashRef.current?.focus();
      return;
    }

    if (askFirst) setConfirming(true);
    else void sell();
  }, [askFirst, canSell, confirming, plan, sell, toast, t]);

  /* ---- the function keys ---- */

  useShortcuts(
    {
      F1: () => setKeysOpen((v) => !v),
      F2: () => {
        searchRef.current?.focus();
        searchRef.current?.select();
      },
      F3: () => setCalcOpen((v) => !v),
      F4: () => customerRef.current?.open(),
      'shift+F2': () => setRecentOpen((v) => !v),
      F5: () => discountRef.current?.focus(),
      F6: park,
      F7: () => setHeldOpen((v) => !v),
      /* The till's own key for finishing a bill: it asks first only where the
         shop has said to, exactly like the button. */
      F8: () => {
        if (canSell) attemptSell();
        else cashRef.current?.focus();
      },
      F9: () => setReturning(true),
      F10: () => {
        setPaid({ cash: String(total) });
        searchRef.current?.focus();
      },
      Escape: () => {
        // The calculator first: Escape at it must never reach the bill.
        if (calcOpen) return setCalcOpen(false);
        if (keysOpen) return setKeysOpen(false);
        if (recentOpen) return setRecentOpen(false);
        if (heldOpen) return setHeldOpen(false);
        /* An open list of matches is what Escape is pressed at, nine times in
           ten — and clearing a four-line bill instead of the search box is the
           one mistake a counter cannot take back. */
        if (hits.length > 0 || q) {
          setQ('');
          return searchRef.current?.focus();
        }
        if (lines.length > 0) clear();
      },
      ArrowDown: () => {
        if (hits.length > 0) setHitAt((i) => Math.min(hits.length - 1, i + 1));
        else setLineAt((i) => Math.min(lines.length - 1, i + 1));
      },
      ArrowUp: () => {
        if (hits.length > 0) setHitAt((i) => Math.max(0, i - 1));
        else setLineAt((i) => Math.max(0, i - 1));
      },
      '+': () => bump(lineAt, 1),
      '=': () => bump(lineAt, 1),
      '-': () => bump(lineAt, -1),
      '*': () => wholeStrip(lineAt),
      Delete: () => removeLine(lineAt),
    },
    !loading && !!shift,
  );

  if (loading) return null;
  if (!shift) return <OpenTill onOpened={loadShift} />;

  const stale = waiting.length > 0;

  return (
    /* A counter screen holds still on a desk and scrolls as one page on a
       phone, where the bill and the payment cannot both fit in one height. */
    <div className="shell-min-h lg-shell-h flex flex-col bg-muted/30 lg:overflow-hidden">
      {/* ------------------------------------------------- the status strip -- */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:gap-3 sm:px-3">
        <button
          type="button"
          onClick={() => navigate('/sales')}
          className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm font-semibold hover:bg-muted sm:px-2"
          title={t('Back to the shop')}
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">{t('The shop')}</span>
        </button>

        <span className="flex items-center gap-2 text-sm">
          <ScanLine className="h-4 w-4 text-primary" />
          <strong className="hidden sm:inline">{t('POS')}</strong>
        </span>

        <span className="hidden min-w-0 truncate text-xs text-muted-foreground md:inline">
          {shift.userName}
          {shift.terminal ? ` · ${shift.terminal}` : ''} · {shift.salesCount} {t('bills')} ·{' '}
          {taka(shift.salesTotal)} {t('today')}
        </span>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <span
            className={`pill hidden sm:inline-flex ${offline || stale ? 'danger' : 'info'}`}
            title={offline ? t('The line is down.') : t('Connected')}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                offline || stale ? 'bg-destructive' : 'bg-primary'
              }`}
            />
            {offline ? t('Offline') : stale ? `${waiting.length}` : t('Online')}
          </span>

          {/* Not on a phone, which shows the time already — the bar has no room for it. */}
          <Clock className="mr-1 hidden border-r border-border pr-3 sm:flex" />

          <AlertBell runsTheShop={runsTheShop} />
          <IconButton
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            title={lang === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন'}
            label={t('Switch language')}
          >
            <span className="text-xs font-bold">{lang === 'bn' ? 'EN' : 'বাং'}</span>
          </IconButton>
          {/* Off the till's bar on a phone; the back room's bar keeps it. */}
          <IconButton
            className="hidden sm:grid"
            onClick={toggleTheme}
            title={t(theme === 'dark' ? 'Light mode' : 'Dark mode')}
            label={t(theme === 'dark' ? 'Light mode' : 'Dark mode')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconButton>
          {/* English or Bangla in every text box — amar → আমার. The medicine search stays English. */}
          <TypingModeToggle />
          {/* A customer's name in Bangla, letter by letter — see BanglaKeyboard. */}
          <IconButton
            onClick={keyboard.toggle}
            title={t('Type Bangla letter by letter')}
            label={t('Bangla keyboard')}
            active={keyboard.open}
          >
            <Keyboard className="h-4 w-4" />
          </IconButton>
          {/* Phones barely support fullscreen; the bar needs the room there. */}
          <IconButton
            className="hidden sm:grid"
            onClick={toggleFullscreen}
            title={t(isFullscreen ? 'Leave fullscreen' : 'Fullscreen')}
            label={t(isFullscreen ? 'Leave fullscreen' : 'Fullscreen')}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </IconButton>
          <CloseTill shift={shift} onClosed={loadShift} />
        </div>
      </header>

      {/* -------------------------------------------------- waiting bills -- */}
      {(offline || waiting.length > 0) && (
        <div
          className={`flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2 text-sm ${
            waiting.some((w) => w.error)
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-border bg-muted'
          }`}
        >
          <CloudOff className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <strong className="font-semibold">
              {waiting.length === 0
                ? t('The line is down.')
                : `${waiting.length} ${t('bills waiting to be sent')}`}
            </strong>{' '}
            <span className="text-muted-foreground">
              {waiting.length === 0
                ? t('Carry on selling — the bills will be sent when it comes back.')
                : taka(waiting.reduce((n, w) => n + w.total, 0))}
            </span>
            {waiting.some((w) => w.error) && (
              <span className="ml-2 text-[11px] font-semibold text-destructive">
                {waiting.find((w) => w.error)?.error}
              </span>
            )}
          </div>
          {waiting.some((w) => !w.error) && (
            <button
              type="button"
              className="btn btn-ghost h-8 shrink-0"
              disabled={sending}
              onClick={() => void send(true)}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t('Send now')}
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------ the counter -- */}
      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ---- the bill ---- */}
        <div className="flex flex-col border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="relative shrink-0 border-b border-border bg-card p-3">
            <Search className="pointer-events-none absolute left-6 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              /* Empty, this box hands +, −, *, Del and the arrows to the bill —
                 see pos/useShortcuts.ts. */
              data-shortcut-passthrough=""
              className="input h-14 pl-11 text-lg"
              data-latin
              placeholder={t('Type a brand name — Napa, Seclo, Monas…')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hits.length > 0) addChecked(hits[hitAt] ?? hits[0]);
              }}
              autoFocus
            />
            <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border lg:block border-border px-1 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              F2
            </kbd>

            {hits.length > 0 && (
              <div className="absolute left-3 right-3 top-[4.6rem] z-30 max-h-[24rem] overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {hits.map((p, i) => {
                  const lowStock = p.onHand <= p.piecesPerStrip;
                  const expDays = daysTo(p.nearestExpiry);
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onMouseEnter={() => setHitAt(i)}
                      onClick={() => addChecked(p)}
                      className={`relative flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-0 ${
                        i === hitAt ? 'bg-primary/5' : 'hover:bg-muted'
                      }`}
                    >
                      {i === hitAt && <span className="absolute left-0 top-0 h-full w-1 bg-primary" />}
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                          lowStock ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                        }`}
                        aria-hidden="true"
                      >
                        {p.isMedicine === false ? <ShoppingBag className="h-4 w-4" /> : <Pill className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold">{p.name}</span>
                          <span className="shrink-0 text-sm text-muted-foreground">{p.strength}</span>
                          {p.prescriptionOnly && <span className="pill danger shrink-0 !py-0">Rx</span>}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[
                            p.genericName,
                            p.rack && `${t('Rack')} ${p.rack}`,
                            p.piecesPerStrip > 1 && `${t('strip of')} ${p.piecesPerStrip}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <span className={`pill !py-0 text-[10.5px] tabular-nums ${lowStock ? 'danger' : 'neutral'}`}>
                            {p.onHand} {t('left')}
                          </span>
                          {p.nearestExpiry && (
                            <span
                              className={`pill !py-0 text-[10.5px] tabular-nums ${
                                expDays !== null && expDays <= EXPIRY_WARN_DAYS ? 'pending' : 'neutral'
                              }`}
                            >
                              <CalendarClock className="h-3 w-3" /> {shortExpiry(p.nearestExpiry)}
                            </span>
                          )}
                        </span>
                      </span>
                      {/* The price somebody actually asks for. "Ek pata koto?"
                          is the question at the counter, so the strip's price
                          is the big one and the piece's sits under it. */}
                      <span className="shrink-0 text-right">
                        {p.piecesPerStrip > 1 ? (
                          <>
                            <span className="block text-base font-semibold tabular-nums text-primary">
                              {taka(p.mrpPerPiece * p.piecesPerStrip)}
                              <span className="text-[11px] font-normal text-muted-foreground"> / {t('strip')}</span>
                            </span>
                            <span className="block text-[11px] tabular-nums text-muted-foreground">
                              {taka(p.mrpPerPiece)} / {t('pc')}
                            </span>
                          </>
                        ) : (
                          <span className="block text-base font-semibold tabular-nums text-primary">
                            {taka(p.mrpPerPiece)}
                            <span className="text-[11px] font-normal text-muted-foreground"> / {t('pc')}</span>
                          </span>
                        )}
                        {i === hitAt && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
                            <CornerDownLeft className="h-3 w-3" /> {t('Enter to add')}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-muted/80 px-3 py-1.5 text-[10.5px] text-muted-foreground backdrop-blur">
                  <span><Key>↑</Key> <Key>↓</Key> {t('to move')}</span>
                  <span><Key>Enter</Key> {t('to add')}</span>
                  <span><Key>Esc</Key> {t('to close')}</span>
                </div>
              </div>
            )}
          </div>

          {/* ---- the lines ---- */}
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
            {lines.length === 0 ? (
              /*
                An empty bill is most of a counter's day, and this was a
                sentence in the middle of a large blank. It is the one moment
                somebody has time to learn what else the machine does, so the
                four ways onto a bill are listed where they will be read.
              */
              <div className="grid h-full place-items-center px-4 py-8 text-center lg:p-6">
                <div className="max-w-md">
                  <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-primary/10">
                    <ScanLine className="h-9 w-9 text-primary/70" />
                  </div>
                  <p className="font-semibold">{t('Nothing on the bill yet.')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('Type a name above and press Enter.')}
                  </p>
                  {/* The four ways onto a bill, each one a button — a phone has
                      no F-keys to press. */}
                  <div className="mt-5 grid grid-cols-2 gap-2 text-left text-xs text-muted-foreground">
                    <button type="button" onClick={() => searchRef.current?.focus()} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 hover:border-primary/40 hover:text-foreground">
                      <ScanLine className="h-4 w-4 shrink-0" /> <span className="truncate">{t('Or scan the pack')}</span>
                    </button>
                    <button type="button" onClick={() => customerRef.current?.open()} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 hover:border-primary/40 hover:text-foreground">
                      <BookUser className="h-4 w-4 shrink-0" /> <span className="truncate">{t('Pick the customer')}</span> <Key>F4</Key>
                    </button>
                    <button type="button" onClick={() => setHeldOpen(true)} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 hover:border-primary/40 hover:text-foreground">
                      <Layers className="h-4 w-4 shrink-0" />{' '}
                      <span className="truncate">
                        {t('Held')}
                        {held.length > 0 ? ` (${held.length})` : ''}
                      </span>{' '}
                      <Key>F7</Key>
                    </button>
                    <button type="button" onClick={() => setReturning(true)} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 hover:border-primary/40 hover:text-foreground">
                      <Undo2 className="h-4 w-4 shrink-0" /> <span className="truncate">{t('Take something back')}</span> <Key>F9</Key>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
              {/* A phone gets a card per line: seven columns across 390px left
                  the medicine's name one word to a line, and the name is the
                  thing being read. */}
              <ul className="divide-y divide-border sm:hidden">
                {lines.map((l, i) => {
                  const over = l.qtyPieces > l.product.onHand;
                  return (
                    <li
                      key={l.product._id}
                      onClick={() => setLineAt(i)}
                      className={`px-3 py-2.5 ${i === lineAt ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold">{l.product.name}</span>{' '}
                          <span className="text-muted-foreground">{l.product.strength}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {taka(l.pricePerPiece)} / {t('pc')} · {packOf(l.qtyPieces, l.product)}
                          </span>
                          {over && (
                            <span className="block text-[11px] font-semibold text-destructive">
                              {t('Only')} {l.product.onHand} {t('on the shelf')}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label={t('Remove')}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {stripSize(l) > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => bump(i, -stripSize(l))}
                                aria-label={t('One strip less')}
                                className="h-9 w-9 rounded-lg border border-border text-base font-semibold"
                              >
                                −
                              </button>
                              <span className="min-w-[3.5rem] text-center text-xs tabular-nums">
                                <strong className="block text-sm">{splitQty(l).strips}</strong>
                                {t('Strips')}
                              </span>
                              <button
                                type="button"
                                onClick={() => bump(i, stripSize(l))}
                                aria-label={t('One strip more')}
                                className="h-9 w-9 rounded-lg border border-border text-base font-semibold"
                              >
                                +
                              </button>
                              <span className="mx-1 h-6 w-px bg-border" />
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => bump(i, -1)}
                            aria-label={t('One less')}
                            className="h-9 w-9 rounded-lg border border-border text-base font-semibold"
                          >
                            −
                          </button>
                          <span className="min-w-[3.5rem] text-center text-xs tabular-nums">
                            <strong className="block text-sm">
                              {stripSize(l) > 1 ? splitQty(l).loose : l.qtyPieces}
                            </strong>
                            {t('Pieces')}
                          </span>
                          <button
                            type="button"
                            onClick={() => bump(i, 1)}
                            aria-label={t('One more')}
                            className="h-9 w-9 rounded-lg border border-border text-base font-semibold"
                          >
                            +
                          </button>
                        </div>
                        <strong className="tabular-nums">{taka(l.qtyPieces * l.pricePerPiece)}</strong>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <table className="hidden w-full text-sm sm:table">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <tr className="text-left font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="w-8 py-2 pl-3">#</th>
                    <th className="py-2 pr-2">{t('Item')}</th>
                    {/* Two units, because a customer asks for both: "two pata"
                        and "four tablets" are the same sentence at a counter. */}
                    <th className="w-[7.5rem] py-2 pr-2 text-center">{t('Strips')}</th>
                    <th className="w-[7.5rem] py-2 pr-2 text-center">{t('Pieces')}</th>
                    {/* On a phone the price moves under the name: four columns
                        across 390px squeezes the medicine's name to one letter
                        a line, and the name is the column being read. */}
                    <th className="hidden w-24 py-2 pr-2 text-right sm:table-cell">{t('Price')}</th>
                    <th className="w-24 py-2 pr-2 text-right sm:w-28">{t('Total')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr
                      key={l.product._id}
                      onClick={() => setLineAt(i)}
                      className={`border-b border-border last:border-0 ${
                        i === lineAt ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td
                        className={`py-2 pl-3 text-xs tabular-nums ${
                          i === lineAt ? 'font-bold text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {i + 1}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="font-semibold">{l.product.name}</span>{' '}
                        <span className="text-muted-foreground">{l.product.strength}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          <span className="sm:hidden">{taka(l.pricePerPiece)} · </span>
                          {packOf(l.qtyPieces, l.product)}
                          {l.product.rack ? ` · ${t('Rack')} ${l.product.rack}` : ''}
                          <span
                            className={`hidden sm:inline ${
                              l.qtyPieces > l.product.onHand ? 'font-semibold text-destructive' : ''
                            }`}
                          >
                            {' '}
                            · {l.qtyPieces > l.product.onHand ? `${t('Only')} ` : ''}
                            {l.product.onHand} {t('on the shelf')}
                          </span>
                        </span>
                      </td>
                      {/*
                        Strips.

                        The unit almost every sale is actually counted in — a
                        customer asks for two pata, not twenty tablets — and the
                        one the counter had no control for: whole strips could
                        only be added through a function key, one at a time.
                        The step is this product's own strip size, so a bottle
                        of syrup (a strip of one) behaves like a bottle.
                      */}
                      <td className="py-2 pr-1 sm:pr-2">
                        {stripSize(l) > 1 ? (
                          <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                            <button
                              type="button"
                              onClick={() => bump(i, -stripSize(l))}
                              aria-label={t('One strip less')}
                              className="h-8 w-7 shrink-0 rounded-md border border-border text-base font-semibold hover:bg-muted sm:w-8"
                            >
                              −
                            </button>
                            <input
                              className="input h-8 w-11 px-0.5 text-center tabular-nums sm:w-14 sm:px-1"
                              inputMode="numeric"
                              aria-label={t('Strips')}
                              value={splitQty(l).strips}
                              onFocus={() => setLineAt(i)}
                              onChange={(e) => {
                                const want = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                setLine(i, {
                                  qtyPieces: want * stripSize(l) + splitQty(l).loose,
                                });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => bump(i, stripSize(l))}
                              aria-label={t('One strip more')}
                              className="h-8 w-7 shrink-0 rounded-md border border-border text-base font-semibold hover:bg-muted sm:w-8"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          /* A bottle, a tube, a box of one: the strip box would
                             show the piece count again and mean nothing. */
                          <div className="text-center text-xs text-muted-foreground">—</div>
                        )}
                      </td>
                      <td className="py-2 pr-1 sm:pr-2">
                        <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                          <button
                            type="button"
                            onClick={() => bump(i, -1)}
                            aria-label={t('One less')}
                            className="h-8 w-7 shrink-0 rounded-md border border-border text-base font-semibold hover:bg-muted sm:w-8"
                          >
                            −
                          </button>
                          <input
                            className="input h-8 w-11 px-0.5 text-center tabular-nums sm:w-14 sm:px-1"
                            inputMode="numeric"
                            aria-label={t('Pieces')}
                            /* The loose ones beside the strips, and the whole
                               quantity where there are no strips to speak of. */
                            value={stripSize(l) > 1 ? splitQty(l).loose : l.qtyPieces}
                            onFocus={() => setLineAt(i)}
                            onChange={(e) => {
                              const want = Math.max(0, Math.floor(Number(e.target.value) || 0));
                              setLine(i, {
                                qtyPieces:
                                  stripSize(l) > 1
                                    ? splitQty(l).strips * stripSize(l) + want
                                    : want,
                              });
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => bump(i, 1)}
                            aria-label={t('One more')}
                            className="h-8 w-7 shrink-0 rounded-md border border-border text-base font-semibold hover:bg-muted sm:w-8"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="hidden py-2 pr-2 text-right sm:table-cell">
                        <input
                          className="input h-8 w-20 px-1 text-right tabular-nums"
                          inputMode="decimal"
                          value={l.pricePerPiece}
                          onFocus={() => setLineAt(i)}
                          onChange={(e) =>
                            setLine(i, { pricePerPiece: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                        {taka(l.qtyPieces * l.pricePerPiece)}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label={t('Remove')}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </div>

          {/* ---- what this counter reaches for ---- */}
          {picks.length > 0 && (
            <div className="shrink-0 border-t border-border bg-card p-2">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <Grid3x3 className="h-3 w-3" /> {t('What you sell most')}
              </div>
              {/* One line a tile rather than two, so the same strip of screen
                  carries twenty of them instead of eight — and twenty is closer
                  to what a pharmacy actually reaches for in an evening. The
                  price sits below the name where it still reads; the strip
                  price rides beside it, because "ek pata koto" is the question
                  the counter is asked, and the number quoted is the strip's. */}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-10">
                {picks.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => addChecked(p)}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border border-border px-2 py-1.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
                    title={`${p.name} ${p.strength ?? ''} · ${taka(p.mrpPerPiece)} / ${t('pc')}`}
                  >
                    <span className="truncate text-[11px] font-semibold leading-tight">
                      {p.name}
                    </span>
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="tabular-nums text-[11px] font-semibold text-primary">
                        {taka(p.mrpPerPiece)}
                      </span>
                      {p.piecesPerStrip > 1 && (
                        <span className="truncate text-[9.5px] tabular-nums text-muted-foreground">
                          {taka(p.mrpPerPiece * p.piecesPerStrip)}/{t('strip')}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/*
          ---- the money ----

          The panel does not scroll as a whole any more. The figure at the top
          and the button at the foot are the two things somebody at a counter
          looks for, and a panel that scrolled could hide either of them behind
          a payment box — on the shop's own 768px screen it did. What can grow
          (the payment rows, the customer) scrolls between them instead.
        */}
        <div className="flex flex-col bg-card lg:min-h-0 lg:overflow-hidden">
          <div className="h-0.5 shrink-0 bg-primary/60" />
          <div className="border-b border-border bg-primary/5 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
                {t('To pay')}
              </span>
              <span className="text-xs text-muted-foreground">
                {lines.length} {t(lines.length === 1 ? 'line' : 'lines')} · {pieces} {t(pieces === 1 ? 'piece' : 'pieces')}
              </span>
            </div>
            <div className="text-4xl font-semibold tabular-nums">{taka(total)}</div>
            {(Number(discount) > 0 || vat > 0) && (
              <div className="text-xs text-muted-foreground">
                {taka(subTotal)}
                {Number(discount) > 0 && ` − ${taka(Number(discount))}`}
                {vat > 0 && ` + ${taka(vat)} ${t('VAT')} (${settings?.vatPercent}%)`}
              </div>
            )}
          </div>

          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="till-disc">
              {t('Discount')} <Key>F5</Key>
            </label>
            <input
              id="till-disc"
              ref={discountRef}
              className="input h-9 w-28 text-right tabular-nums"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="border-b border-border px-4 py-3">
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('Taken')}
            </span>
            {/* Two across: four stacked rows pushed the customer and the button
                off a 768px screen, and cash is the only one most evenings. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {METHODS.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-1.5">
                  <label
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    htmlFor={`pay-${m.key}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${m.dot}`} aria-hidden="true" />
                    {t(m.label)}
                  </label>
                  {(m.key === 'bkash' || m.key === 'nagad') && (
                    <button
                      type="button"
                      onClick={() => setWalletOpen(m.key)}
                      title={t('Show the customer a QR')}
                      aria-label={`${t(m.label)} QR`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      {m.key === 'bkash' && wallets?.bkashAuto ? <Zap className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                    </button>
                  )}
                  <input
                    id={`pay-${m.key}`}
                    ref={m.key === 'cash' ? cashRef : undefined}
                    className="input h-9 w-[5.5rem] min-w-[3.5rem] shrink text-right tabular-nums"
                    inputMode="decimal"
                    value={paid[m.key] ?? ''}
                    onChange={(e) => setPaid({ ...paid, [m.key]: e.target.value })}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            {walletOpen && (
              <WalletPanel
                method={walletOpen}
                amount={Math.max(0, total - plan.payments.filter((p) => p.method !== walletOpen).reduce((x, p) => x + p.amount, 0))}
                number={(walletOpen === 'bkash' ? wallets?.bkashNumber : wallets?.nagadNumber) ?? ''}
                auto={!!wallets?.bkashAuto}
                onClose={() => setWalletOpen(null)}
                onDone={(amount, reference) => {
                  setPaid((p) => ({ ...p, [walletOpen]: String(amount) }));
                  if (reference) setRefs((r) => ({ ...r, [walletOpen]: reference }));
                  setWalletOpen(null);
                }}
              />
            )}
            {(refs.bkash || refs.nagad) && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {refs.bkash && <>bKash TrxID <span className="font-mono font-semibold text-foreground">{refs.bkash}</span> </>}
                {refs.nagad && <>Nagad TrxID <span className="font-mono font-semibold text-foreground">{refs.nagad}</span></>}
              </p>
            )}
            {/* The notes somebody actually hands over, so nobody types 500. */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPaid((p) => ({ ...p, cash: String((Number(p.cash) || 0) + n) }))}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold tabular-nums hover:border-primary hover:bg-primary/5"
                >
                  ৳{n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPaid({ ...paid, cash: String(total) })}
                className="rounded-md border border-primary bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary"
              >
                {t('Exact cash')}
              </button>
              {/* For the sums the till does not do — three strips at this price, a part payment. */}
              <button
                type="button"
                onClick={() => setCalcOpen((v) => !v)}
                aria-pressed={calcOpen}
                title={t('Calculator') + ' (F3)'}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  calcOpen ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary hover:bg-primary/5'
                }`}
              >
                <CalculatorIcon className="h-3.5 w-3.5" /> {t('Calculator')}
              </button>
            </div>

            {/*
              What goes back over the counter.

              Loud on purpose: a ৳570 bill paid with a ৳1000 note owes the
              customer ৳430, and the number they are waiting for should not be
              small grey text. The bill records ৳570 taken and ৳430 given, so
              the cash box is credited with what is actually in it.
            */}
            {change > 0 && (
              <div className="mt-2.5 rounded-md border border-primary bg-primary/10 px-3 py-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
                    {t('Give back')}
                  </span>
                  <strong className="text-2xl tabular-nums text-primary">{taka(change)}</strong>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {taka(paidTotal)} {t('given')} · {taka(total)} {t('kept')}
                </p>
              </div>
            )}
          </div>

          <div className="border-b border-border px-4 py-3">
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('Customer')} <Key>F4</Key>
            </span>
            <CustomerPicker
              ref={customerRef}
              customer={customer}
              name={customerName}
              phone={customerPhone}
              /* What the bill will actually owe, not what the boxes hold: with
                 nothing typed it is a cash sale, and asking for a name then is
                 asking for one that should not be on it. */
              required={plan.owing > 0 && lines.length > 0 && (!plan.nothingTaken || plan.onAccount)}
              onPick={(c) => {
                setCustomer(c);
                setUsePoints(false);
              }}
              onType={(patch) => {
                if (patch.name !== undefined) setCustomerName(patch.name);
                if (patch.phone !== undefined) setCustomerPhone(patch.phone);
              }}
            />
            {/*
              Nothing typed yet is not a debt — it is a bill somebody has not
              taken the money for. Saying "on account, needs a name" in red the
              moment the first item goes on read as an error the counter had
              made; the nudge now waits until a part payment is typed.
            */}
            {/* Loyalty points: what the picked customer has, and the switch to spend them. */}
            {loyalty && (customer || customerPhone.trim()) && (
              <LoyaltyRow
                rules={loyalty}
                have={customer ? Math.floor(customer.points ?? 0) : null}
                earns={Math.floor(Math.max(0, total) / loyalty.spendPerPoint)}
                redeem={redeem}
                spendable={spendable.points > 0}
                using={usePoints}
                onToggle={() => setUsePoints((u) => !u)}
              />
            )}
            {lines.length > 0 && plan.nothingTaken && !plan.onAccount && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t('Type what was taken, or press Exact cash. A name here puts it on account.')}</span>
              </p>
            )}
            {plan.owing > 0 && lines.length > 0 && (!plan.nothingTaken || plan.onAccount) && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-destructive">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong className="font-semibold">
                    {taka(plan.owing)} {t('on account')}
                  </strong>{' '}
                  — {t('Baki khata — it needs a name, or nobody can chase it.')}
                </span>
              </p>
            )}
          </div>

          </div>

          {/*
            What the total is made of, in the space the panel had spare.

            A counter checks two things against the customer's own sum: how many
            pieces went in the bag, and what came off. Both were on the bill and
            neither was next to the figure being paid.
          */}
          {lines.length > 0 && (
            <div className="shrink-0 border-t border-border px-4 py-2.5 text-xs">
              <div className="flex items-baseline justify-between text-muted-foreground">
                <span>
                  {lines.length} {lines.length === 1 ? t('item') : t('items')} · {pieces}{' '}
                  {t(pieces === 1 ? 'piece' : 'pieces')}
                </span>
                <span className="tabular-nums">{taka(subTotal)}</span>
              </div>
              {Number(discount) > 0 && (
                <div className="flex items-baseline justify-between text-muted-foreground">
                  <span>{t('Discount')}</span>
                  <span className="tabular-nums">− {taka(Number(discount))}</span>
                </div>
              )}
              {redeem.value > 0 && (
                <div className="flex items-baseline justify-between text-amber-700 dark:text-amber-400">
                  <span>
                    ★ {t('Points')} ({redeem.points})
                  </span>
                  <span className="tabular-nums">− {taka(redeem.value)}</span>
                </div>
              )}
              {vat > 0 && (
                <div className="flex items-baseline justify-between text-muted-foreground">
                  <span>
                    {t('VAT')} {settings?.vatPercent}%
                  </span>
                  <span className="tabular-nums">{taka(vat)}</span>
                </div>
              )}
              {plan.owing > 0 && plan.payments.length > 0 && (
                <div className="flex items-baseline justify-between font-semibold text-destructive">
                  <span>{t('Still to pay')}</span>
                  <span className="tabular-nums">{taka(plan.owing)}</span>
                </div>
              )}
              {plan.overDigital > 0 && (
                <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  {taka(plan.overDigital)} {t('more than the bill came by bKash, Nagad or card. There is no change on those — put the exact amount, or give it back in cash.')}
                </p>
              )}
            </div>
          )}

          <div className="sticky bottom-12 z-10 shrink-0 border-t border-border bg-card p-3 lg:static">
            <button
              type="button"
              className="btn h-14 w-full text-base"
              disabled={!canSell}
              onClick={attemptSell}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Take payment')}
              {lines.length > 0 && (
                <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 tabular-nums">{taka(total)}</span>
              )}
              <Key light>F8</Key>
            </button>

            {lastBill && (
              <div className="mt-2 rounded-lg border border-border p-2.5 text-xs">
                <p className="flex items-center gap-1.5 font-semibold">
                  <ReceiptIcon className="h-3.5 w-3.5" />{' '}
                  {/* A bill the shop has not seen has no number to call it by. */}
                  {lastBill.billNo.startsWith('WAITING')
                    ? `${t('Not sent yet')} · ${lastBill.billNo.replace('WAITING · ', '')}`
                    : `${t('Bill')} ${lastBill.billNo}`}{' '}
                  · {taka(lastBill.total)}
                </p>
                <button
                  type="button"
                  className="mt-1 font-semibold text-primary"
                  onClick={() => setPrinting(lastBill)}
                >
                  {t('Print it again')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ the shortcut bar -- */}
      <footer className="sticky bottom-0 z-20 flex h-12 shrink-0 items-center justify-between gap-0.5 overflow-x-auto border-t border-border bg-card px-1 lg:h-10 lg:justify-start lg:gap-1 lg:px-2">
        <BarKey k="F2" label={t('Find')} onClick={() => searchRef.current?.focus()} icon={Search} />
        <BarKey
          k="F6"
          label={t('Hold')}
          onClick={park}
          icon={PauseCircle}
          disabled={lines.length === 0}
        />
        <BarKey
          k="F7"
          label={`${t('Held')}${held.length ? ` (${held.length})` : ''}`}
          onClick={() => setHeldOpen(true)}
          icon={Layers}
          highlight={held.length > 0}
        />
        <BarKey
          k="⇧F2"
          label={t('Last bills')}
          onClick={() => setRecentOpen(true)}
          icon={History}
        />
        <BarKey k="F9" label={t('Return')} onClick={() => setReturning(true)} icon={Undo2} />
        <BarKey
          k="Esc"
          label={t('Clear')}
          onClick={clear}
          icon={X}
          disabled={lines.length === 0}
        />
        <div className="ml-auto hidden lg:block">
          <BarKey k="F1" label={t('Keys')} onClick={() => setKeysOpen(true)} icon={Keyboard} />
        </div>
      </footer>

      {/* --------------------------------------------------------- overlays -- */}
      {keysOpen && <ShortcutSheet onClose={() => setKeysOpen(false)} />}
      {calcOpen && (
        <CounterCalculator
          billTotal={total}
          onUseAsCash={(amount) => {
            setPaid((p) => ({ ...p, cash: amount }));
            setCalcOpen(false);
            cashRef.current?.focus();
          }}
          onClose={() => {
            setCalcOpen(false);
            searchRef.current?.focus();
          }}
        />
      )}

      {heldOpen && <HeldSheet bills={held} onPick={resume} onClose={() => setHeldOpen(false)} />}

      {recentOpen && (
        <RecentBills
          onClose={() => setRecentOpen(false)}
          onPrint={setPrinting}
          onChanged={() => void loadShift()}
        />
      )}


      {(returning || returnBillNo) && (
        <ReturnBill
          billNo={returnBillNo}
          onClose={() => {
            setReturning(false);
            if (returnBillNo) {
              const next = new URLSearchParams(params);
              next.delete('return');
              setParams(next, { replace: true });
            }
          }}
          onDone={() => void loadShift()}
        />
      )}

      {printing && settings && (
        <Receipt sale={printing} settings={settings} onDone={() => setPrinting(null)} />
      )}

      {/*
        The pause, when the shop has asked for one.

        It shows the figures rather than asking "are you sure": what goes wrong
        at a till is a mis-keyed amount, and a dialog that does not show the
        amount cannot catch one. Enter saves, Escape goes back to the bill.
      */}
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          className="w-full max-w-sm"
          z={70}
          label={t('Save this bill?')}
        >
            <h3 className="mb-1 text-base">{t('Save this bill?')}</h3>
            <p className="text-xs text-muted-foreground">
              {lines.length} {lines.length === 1 ? t('item') : t('items')} · {pieces} {t(pieces === 1 ? 'piece' : 'pieces')}
            </p>

            <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  {t('To pay')}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{taka(total)}</span>
              </div>

              <div className="my-2 border-t border-border" />

              {/* What the bill will actually record — the same plan the save
                  itself follows, so the two cannot say different things. */}
              <div className="flex flex-col gap-1.5">
                {plan.payments.map((p) => (
                  <div key={p.method} className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">
                      {t(METHODS.find((m) => m.key === p.method)?.label ?? p.method)}
                    </span>
                    <span className="tabular-nums">{taka(p.amount)}</span>
                  </div>
                ))}

                {plan.change > 0 && (
                  <div className="flex items-baseline justify-between font-semibold text-primary">
                    <span>{t('Give back')}</span>
                    <span className="tabular-nums">{taka(plan.change)}</span>
                  </div>
                )}

                {plan.owing > 0 && (
                  <div className="flex items-baseline justify-between font-semibold text-destructive">
                    <span>{t('On account')}</span>
                    <span className="tabular-nums">
                      {taka(plan.owing)}
                      {customerName.trim() ? ` · ${customerName.trim()}` : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirming(false)}
                autoFocus
              >
                {t('Back to the bill')}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  void sell();
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Save the bill')}
              </button>
            </div>
        </Modal>
      )}

      <AlertTicker />
    </div>
  );
}

/* ------------------------------------------------------------ small parts -- */

function IconButton({
  onClick,
  title,
  label,
  active,
  className = '',
  children,
}: {
  onClick: () => void;
  title: string;
  label: string;
  /** A toggle that is on — drawn pressed, and announced as pressed. */
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // The field being typed into keeps its focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-muted hover:text-foreground ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** A key cap, printed beside the thing it does. */
function Key({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <kbd
      className={`ml-1.5 hidden rounded border px-1 py-0.5 font-mono text-[10px] font-semibold lg:inline ${
        light
          ? 'border-primary-foreground/30 text-primary-foreground/80'
          : 'border-border text-muted-foreground'
      }`}
    >
      {children}
    </kbd>
  );
}

function BarKey({
  k,
  label,
  onClick,
  icon: Icon,
  disabled,
  highlight,
}: {
  k: string;
  label: string;
  onClick: () => void;
  icon?: typeof FileText;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-0 shrink-0 flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-40 lg:flex-row lg:gap-1.5 lg:px-2 lg:py-1.5 lg:text-xs ${
        highlight ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      <kbd className="hidden rounded border border-border px-1 py-0.5 font-mono text-[10px] lg:inline">{k}</kbd>
      {Icon && <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />}
      <span className="max-w-[4.5rem] truncate leading-none lg:max-w-none">{label}</span>
    </button>
  );
}

/** Every key, once, for whoever is still learning them. */
function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Modal onClose={onClose} className="w-full max-w-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="mb-0 flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" /> {t('The keys')}
          </h3>
        </div>
        <dl className="grid gap-1 sm:grid-cols-2">
          {SHORTCUT_HELP.map((s) => (
            <div key={s.keys} className="flex items-center gap-2 py-1 text-sm">
              <kbd className="w-14 shrink-0 rounded border border-border px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold">
                {s.keys}
              </kbd>
              <span className="text-muted-foreground">{t(s.label)}</span>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t('Every one of these is also a button. Nothing here needs a keyboard.')}
        </p>
    </Modal>
  );
}

/** The bills somebody put aside while they went to the shelf. */
function HeldSheet({
  bills,
  onPick,
  onClose,
}: {
  bills: HeldBill[];
  onPick: (bill: HeldBill) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal onClose={onClose} className="w-full max-w-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="mb-0 flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" /> {t('Bills put aside')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('They live on this machine and are gone by tomorrow.')}
            </p>
          </div>
        </div>

        {bills.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('Nothing put aside. F6 parks the bill you are on.')}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {bills.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5"
                >
                  <span className="font-semibold">{b.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {b.lines.length} {t(b.lines.length === 1 ? 'line' : 'lines')} · {taka(b.total)} ·{' '}
                    {new Date(b.at).toLocaleTimeString('en-GB', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => drop(b.id)}
                  aria-label={t('Remove')}
                  className="rounded p-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
    </Modal>
  );
}

/**
 * Before anything can be sold, the cash is counted.
 *
 * Not a formality: the opening cash is half of the arithmetic that says at the
 * end of the evening whether the money in the box matches the money on screen.
 */
function OpenTill({ onOpened }: { onOpened: () => Promise<void> }) {
  const t = useT();
  const { toast } = useToast();
  const [openingCash, setOpeningCash] = useState('');
  const [terminal, setTerminal] = useState('');
  const [counters, setCounters] = useState<ShopCounter[] | null>(null);
  const [counterId, setCounterId] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * The counters the shop has set up.
   *
   * A shop that has not set any up types a name, as it always did — the feature
   * should not stop somebody selling on their first morning. A shop that has
   * picks from the list, and then every bill, shift and cash count hangs off the
   * same name instead of whatever was typed that day.
   */
  useEffect(() => {
    tillApi
      .counters()
      .then((rows) => {
        setCounters(rows);
        /* The one counter nobody is standing at is the one this person is at. */
        const free = rows.filter((r) => !r.busyWith);
        if (free.length === 1) {
          setCounterId(free[0]._id);
          if (free[0].openingFloat) setOpeningCash(String(free[0].openingFloat));
        }
      })
      .catch(() => setCounters([]));
  }, []);

  const pick = (id: string) => {
    setCounterId(id);
    const chosen = counters?.find((c) => c._id === id);
    /* Filled in, not forced: the box usually starts with the same float and
       nobody should retype it, but this morning might be different. */
    if (chosen?.openingFloat) setOpeningCash(String(chosen.openingFloat));
  };

  const open = async () => {
    setBusy(true);
    try {
      await tillApi.openShift({
        openingFloat: Number(openingCash) || 0,
        counterId: counterId || undefined,
        terminal: counterId ? undefined : terminal.trim() || undefined,
      });
      await onOpened();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not start the day.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell-min-h relative grid place-items-center bg-muted/30 p-4">
      {/* The rest of the shop is still there before the till is open — the
          owner who came to look at a report should not be stuck here. */}
      <Link
        to="/sales"
        className="absolute left-4 top-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <Store className="h-4 w-4" />
        </span>
        {t('Back to the shop')}
      </Link>
      <div className="card w-full max-w-md">
        <h3 className="flex items-center gap-2">
          <DoorOpen className="h-4 w-4" /> {t('Start the day')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'Count the cash in the box before the first sale. At the end of the day the screen says what should be there, and the difference is kept either way.',
          )}
        </p>

        <div className="mt-4 grid gap-3">
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-muted-foreground"
              htmlFor="float"
            >
              {t('Cash in the box now')}
            </label>
            <input
              id="float"
              className="input h-11 text-lg tabular-nums"
              inputMode="decimal"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="500"
              autoFocus
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold text-muted-foreground"
              htmlFor="terminal"
            >
              {t('Which counter')}
            </label>
            {counters && counters.length > 0 ? (
              <select
                id="terminal"
                className="input h-11"
                value={counterId}
                onChange={(e) => pick(e.target.value)}
              >
                <option value="">{t('Pick one…')}</option>
                {counters.map((c) => (
                  <option key={c._id} value={c._id} disabled={!!c.busyWith}>
                    {c.name}
                    {c.busyWith ? ` — ${c.busyWith} ${t('is on it')}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="terminal"
                className="input h-11"
                value={terminal}
                onChange={(e) => setTerminal(e.target.value)}
                placeholder={t('Counter 1')}
              />
            )}
          </div>
          <button type="button" className="btn h-11" disabled={busy} onClick={() => void open()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Start selling')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** And at the end of it, the count. */
function CloseTill({ shift, onClosed }: { shift: Shift; onClosed: () => Promise<void> }) {
  const t = useT();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);

  const close = async () => {
    setBusy(true);
    try {
      const res = await tillApi.closeShift({ countedCash: Number(counted) || 0 });
      toast(
        res.difference === 0
          ? 'The box matches the screen.'
          : res.difference > 0
            ? `${taka(res.difference)} more in the box than expected.`
            : `${taka(Math.abs(res.difference))} short.`,
        res.difference === 0 ? undefined : 'error',
      );
      setOpen(false);
      setCounted('');
      await onClosed();
    } catch (e: unknown) {
      const err = (e as { response?: { data?: { message?: string } } }).response;
      toast(err?.data?.message || 'Could not close the day.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs sm:px-2 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <DoorClosed className="h-4 w-4" />
        <span className="hidden sm:inline">{t('Close the day')}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
            <h3 className="flex items-center gap-2 text-base">
              <DoorClosed className="h-4 w-4" /> {t('Close the day')}
            </h3>

            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t('Cash at the start')}</dt>
              <dd className="text-right tabular-nums">{taka(shift.openingFloat)}</dd>
              <dt className="text-muted-foreground">{t('Cash taken')}</dt>
              <dd className="text-right tabular-nums">{taka(shift.cashTaken)}</dd>
              <dt className="font-semibold">{t('Should be in the box now')}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {taka(shift.openingFloat + shift.cashTaken)}
              </dd>
            </dl>

            <label
              className="mb-1 mt-4 block text-xs font-semibold text-muted-foreground"
              htmlFor="counted"
            >
              {t('Counted in the box')}
            </label>
            <input
              id="counted"
              className="input h-11 text-lg tabular-nums"
              inputMode="decimal"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                {t('Not yet')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void close()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Close the day')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The customer's points under their name: the balance, and spending them on this bill. */
function LoyaltyRow({
  rules,
  have,
  earns,
  redeem,
  spendable,
  using,
  onToggle,
}: {
  rules: LoyaltySettings;
  /** Null for somebody new, known only by the number typed. */
  have: number | null;
  earns: number;
  redeem: { points: number; value: number };
  /** Whether this bill is big enough to spend any on. */
  spendable: boolean;
  using: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const enough = have !== null && have >= rules.minRedeem;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-2 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 text-amber-800 dark:text-amber-300">
        <Star className="h-3.5 w-3.5 shrink-0 fill-current" />
        <span className="truncate">
          {have !== null && (
            <>
              <strong className="tabular-nums">{have}</strong> {t('points')}
            </>
          )}
          {earns > 0 && (
            <span className="text-muted-foreground">
              {have !== null ? ' · ' : ''}+{earns} {t('on this bill')}
            </span>
          )}
        </span>
      </span>
      {enough && !spendable && <span className="shrink-0 text-[11px] text-muted-foreground">{t('For a bigger bill')}</span>}
      {enough && spendable && (
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 rounded-md px-2 py-1 font-semibold ${
            using
              ? 'bg-amber-500 text-white'
              : 'border border-amber-500/50 text-amber-800 hover:bg-amber-500/10 dark:text-amber-300'
          }`}
        >
          {using ? `− ৳${redeem.value}` : t('Use points')}
        </button>
      )}
    </div>
  );
}
