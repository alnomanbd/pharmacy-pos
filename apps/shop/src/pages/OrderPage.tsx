import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bike, Camera, CheckCircle2, Loader2, MapPin, Minus, Phone, Pill, Plus, Search, Store, Trash2, X } from 'lucide-react';
import { useLangStore } from '../i18n/ui';

/**
 * A shop's own order page — the link it shares on WhatsApp and Facebook.
 *
 * For a customer on a phone, with no account and no app: their name and
 * number, what they need — picked from the shop's own list, typed out, or a
 * photo of the prescription, any or all of them — pickup or delivery. Nothing is charged here; the shop confirms and bills it at the
 * counter, and an SMS says when it is confirmed, ready and on its way.
 */

type Shop = {
  name: string;
  nameBn: string;
  address: string;
  phone: string;
  pickup: boolean;
  delivery: boolean;
  deliveryCharge: number;
  freeDeliveryOver: number;
  note: string;
  branches: { id: string; name: string; address: string }[];
};

type Unit = 'piece' | 'strip' | 'box';
type Hit = { id: string; name: string; strength: string; form: string; unit: 'piece' | 'strip'; price: number; inStock: boolean };
type Line = { key: string; productId?: string; name: string; qty: number; unit: Unit; price: number };

const T = {
  en: {
    order: 'Order medicines',
    lede: 'Send what you need — we confirm by SMS and have it ready.',
    name: 'Your name',
    phone: 'Mobile number',
    what: 'What do you need?',
    search: 'Search a medicine — e.g. Napa',
    inStock: 'In stock',
    ask: 'We will check',
    addTyped: (s: string) => `Add “${s}”`,
    none: 'Not on our list — add it as you typed it, and we will check.',
    units: { piece: 'pc', strip: 'strip', box: 'box' } as Record<Unit, string>,
    about: (s: string) => `About ৳${s} — the shop confirms the price`,
    orWrite: 'Or write it out',
    whatHint: 'e.g. Napa Extra — 2 strips, Seclo 20 — 1 box',
    photo: 'Add a photo of the prescription',
    photoMore: 'Add another photo',
    how: 'How do you want it?',
    pickup: 'I will collect it',
    delivery: 'Deliver to me',
    charge: (n: string) => `Delivery ৳${n}`,
    free: (n: string) => `free over ৳${n}`,
    address: 'Delivery address',
    branch: 'Which branch?',
    note: 'Anything else? (optional)',
    send: 'Send the order',
    sending: 'Sending…',
    done: 'Order received!',
    doneText: (n: string) => `Your order number is ${n}. We will send you an SMS when it is confirmed.`,
    call: 'Call the shop',
    another: 'Place another order',
    closed: 'This shop is not taking orders online right now.',
    pay: 'You pay when you collect it, or to the delivery person.',
  },
  bn: {
    order: 'ঔষধ অর্ডার করুন',
    lede: 'যা দরকার পাঠান — আমরা SMS-এ নিশ্চিত করে তৈরি রাখব।',
    name: 'আপনার নাম',
    phone: 'মোবাইল নম্বর',
    what: 'কী কী লাগবে?',
    search: 'ঔষধ খুঁজুন — যেমন নাপা',
    inStock: 'স্টকে আছে',
    ask: 'দেখে জানাব',
    addTyped: (s: string) => `“${s}” যোগ করুন`,
    none: 'আমাদের তালিকায় নেই — যেভাবে লিখেছেন সেভাবেই যোগ করুন, আমরা দেখে জানাব।',
    units: { piece: 'পিস', strip: 'পাতা', box: 'বক্স' } as Record<Unit, string>,
    about: (s: string) => `আনুমানিক ৳${s} — দাম দোকান নিশ্চিত করবে`,
    orWrite: 'অথবা লিখে দিন',
    whatHint: 'যেমন: নাপা এক্সট্রা — ২ পাতা, সেকলো ২০ — ১ বক্স',
    photo: 'প্রেসক্রিপশনের ছবি দিন',
    photoMore: 'আরেকটি ছবি দিন',
    how: 'কীভাবে নিতে চান?',
    pickup: 'দোকান থেকে নেব',
    delivery: 'বাসায় পাঠান',
    charge: (n: string) => `ডেলিভারি ৳${n}`,
    free: (n: string) => `৳${n}-এর বেশিতে ফ্রি`,
    address: 'ডেলিভারির ঠিকানা',
    branch: 'কোন শাখা?',
    note: 'আর কিছু? (ঐচ্ছিক)',
    send: 'অর্ডার পাঠান',
    sending: 'পাঠানো হচ্ছে…',
    done: 'অর্ডার পেয়েছি!',
    doneText: (n: string) => `আপনার অর্ডার নম্বর ${n}। নিশ্চিত হলে SMS পাঠাব।`,
    call: 'দোকানে ফোন করুন',
    another: 'আরেকটি অর্ডার দিন',
    closed: 'এই দোকান এখন অনলাইনে অর্ডার নিচ্ছে না।',
    pay: 'টাকা দেবেন নেওয়ার সময়, বা ডেলিভারিম্যানকে।',
  },
};

const BN = '০১২৩৪৫৬৭৮৯';

export default function OrderPage() {
  const { code = '' } = useParams();
  const lang = useLangStore((s) => s.lang) === 'bn' ? 'bn' : 'en';
  const setLang = useLangStore((s) => s.setLang);
  const t = T[lang];
  const n = (v: number | string) => (lang === 'bn' ? String(v).replace(/[0-9]/g, (d) => BN[+d]) : String(v));
  const [shop, setShop] = useState<Shop | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', items: '', address: '', note: '', mode: 'pickup' as 'pickup' | 'delivery', branchId: '' });
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<{ number: string; phone: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/public/order/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Shop } | null) => {
        if (!j?.data) return setMissing(true);
        setShop(j.data);
        setForm((f) => ({ ...f, mode: j.data!.pickup ? 'pickup' : 'delivery', branchId: j.data!.branches[0]?.id ?? '' }));
      })
      .catch(() => setMissing(true));
  }, [code]);

  const addPhoto = (file?: File) => {
    if (!file || photos.length >= 3) return;
    if (!/^image\//.test(file.type)) return;
    setPhotos([...photos, { file, url: URL.createObjectURL(file) }]);
    if (input.current) input.current.value = '';
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('name', form.name);
      fd.set('phone', form.phone);
      fd.set('mode', form.mode);
      fd.set('items', form.items);
      if (lines.length) {
        fd.set('lines', JSON.stringify(lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, unit: l.unit }))));
      }
      if (form.mode === 'delivery') fd.set('address', form.address);
      if (form.note) fd.set('note', form.note);
      if (form.branchId) fd.set('branchId', form.branchId);
      for (const p of photos) fd.append('photos', p.file);
      const r = await fetch(`/api/public/order/${encodeURIComponent(code)}`, { method: 'POST', body: fd });
      const j = (await r.json()) as { data?: { number: string; phone: string }; message?: string };
      if (!r.ok || !j.data) throw new Error(j.message || 'Could not send the order');
      setPlaced(j.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPlaced(null);
    setPhotos([]);
    setLines([]);
    setForm((f) => ({ ...f, items: '', note: '' }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-background to-background dark:from-emerald-950/30">
      <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
        {/* ---- the shop ---- */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
              <Store className="h-6 w-6" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-lg font-bold">{shop ? (lang === 'bn' && shop.nameBn ? shop.nameBn : shop.name) : '…'}</p>
              {shop?.address && (
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" /> {shop.address}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold"
          >
            {lang === 'bn' ? 'EN' : 'বাং'}
          </button>
        </div>

        {missing ? (
          <div className="mt-10 rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t.closed}</div>
        ) : !shop ? (
          <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-primary" />
        ) : (
          <AnimatePresence mode="wait">
            {placed ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-8 rounded-3xl border border-emerald-500/30 bg-card p-8 text-center shadow-xl"
              >
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
                  className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40"
                >
                  <CheckCircle2 className="h-9 w-9" />
                </motion.span>
                <h1 className="mt-5 text-2xl font-bold">{t.done}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t.doneText(n(placed.number))}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.pay}</p>
                <div className="mt-6 grid gap-2">
                  {placed.phone && (
                    <a href={`tel:${placed.phone}`} className="btn h-11 justify-center">
                      <Phone className="h-4 w-4" /> {t.call}
                    </a>
                  )}
                  <button type="button" onClick={reset} className="h-11 rounded-md border border-border text-sm font-semibold hover:bg-muted">
                    {t.another}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={send}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-xl sm:p-6"
              >
                <h1 className="flex items-center gap-2 text-xl font-bold">
                  <Pill className="h-5 w-5 text-primary" /> {t.order}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t.lede}</p>
                {shop.note && <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">{shop.note}</p>}

                <div className="mt-5 grid gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-semibold">
                      {t.name}
                      <input className="input mt-1 h-11" required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </label>
                    <label className="block text-sm font-semibold">
                      {t.phone}
                      <input className="input mt-1 h-11" required inputMode="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </label>
                  </div>

                  <div>
                    <p className="text-sm font-semibold">{t.what}</p>
                    <MedicinePicker code={code} t={t} n={n} lines={lines} onChange={setLines} />
                    <label className="mt-3 block text-xs font-semibold text-muted-foreground">
                      {t.orWrite}
                      <textarea className="input mt-1 min-h-[72px] py-2.5 text-sm font-normal text-foreground" maxLength={2000} placeholder={t.whatHint} value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
                    </label>
                  </div>

                  {/* ---- the prescription ---- */}
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {photos.map((p, i) => (
                        <span key={p.url} className="relative h-20 w-20 overflow-hidden rounded-xl border border-border">
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      {photos.length < 3 && (
                        <button
                          type="button"
                          onClick={() => input.current?.click()}
                          className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.04] text-sm font-semibold text-primary hover:bg-primary/[0.08] ${photos.length ? 'h-20 w-20 flex-col text-[10px]' : 'h-14 w-full'}`}
                        >
                          <Camera className="h-5 w-5" /> {photos.length ? t.photoMore : t.photo}
                        </button>
                      )}
                    </div>
                    <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhoto(e.target.files?.[0])} />
                  </div>

                  {/* ---- pickup or delivery ---- */}
                  <div>
                    <p className="text-sm font-semibold">{t.how}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {shop.pickup && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, mode: 'pickup' })}
                          className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold transition-colors ${form.mode === 'pickup' ? 'border-primary bg-primary/[0.07] text-primary' : 'border-border'}`}
                        >
                          <Store className="h-5 w-5" /> {t.pickup}
                        </button>
                      )}
                      {shop.delivery && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, mode: 'delivery' })}
                          className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold transition-colors ${form.mode === 'delivery' ? 'border-primary bg-primary/[0.07] text-primary' : 'border-border'}`}
                        >
                          <Bike className="h-5 w-5" /> {t.delivery}
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {t.charge(n(shop.deliveryCharge))}
                            {shop.freeDeliveryOver > 0 ? ` · ${t.free(n(shop.freeDeliveryOver))}` : ''}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {form.mode === 'delivery' && (
                      <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="block overflow-hidden text-sm font-semibold">
                        {t.address}
                        <textarea className="input mt-1 min-h-[70px] py-2.5" required maxLength={300} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                      </motion.label>
                    )}
                  </AnimatePresence>

                  {shop.branches.length > 1 && (
                    <label className="block text-sm font-semibold">
                      {t.branch}
                      <select className="input mt-1 h-11" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                        {shop.branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.address ? ` — ${b.address}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block text-sm font-semibold">
                    {t.note}
                    <input className="input mt-1 h-11" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  </label>

                  {error && (
                    <p role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                      <Trash2 className="h-4 w-4 shrink-0 opacity-0" />
                      {error}
                    </p>
                  )}

                  <button type="submit" disabled={busy} className="btn h-12 justify-center text-base">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Pill className="h-5 w-5" />}
                    {busy ? t.sending : t.send}
                  </button>
                  <p className="text-center text-xs text-muted-foreground">{t.pay}</p>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/**
 * Search the shop's own list, tap to add, set how many. What is not on the
 * list can still be added as typed — the shop checks it either way.
 */
function MedicinePicker({
  code,
  t,
  n,
  lines,
  onChange,
}: {
  code: string;
  t: (typeof T)['en'];
  n: (v: number | string) => string;
  lines: Line[];
  onChange: (l: Line[]) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    setBusy(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/public/order/${encodeURIComponent(code)}/medicines?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { data?: Hit[] } | null) => live && setHits(j?.data ?? []))
        .catch(() => live && setHits([]))
        .finally(() => live && setBusy(false));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, code]);

  const add = (line: Omit<Line, 'key'>) => {
    const same = lines.find((l) => (line.productId ? l.productId === line.productId : !l.productId && l.name.toLowerCase() === line.name.toLowerCase()));
    if (same) onChange(lines.map((l) => (l === same ? { ...l, qty: Math.min(1000, l.qty + 1) } : l)));
    else onChange([...lines, { ...line, key: `${Date.now()}-${Math.random()}` }]);
    setQ('');
    setHits([]);
  };
  const set = (key: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const typed = q.trim();
  const total = lines.reduce((sum, l) => sum + (l.unit === 'box' ? 0 : l.price * l.qty), 0);

  return (
    <div className="mt-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="input h-11 pl-9 pr-9"
          data-latin
          placeholder={t.search}
          value={q}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (hits[0]) add({ productId: hits[0].id, name: [hits[0].name, hits[0].strength].filter(Boolean).join(' '), qty: 1, unit: hits[0].unit, price: hits[0].price });
              else if (typed.length >= 2) add({ name: typed, qty: 1, unit: 'strip', price: 0 });
            }
          }}
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {typed.length >= 2 && !busy && (
        <div className="mt-1.5 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => add({ productId: h.id, name: [h.name, h.strength].filter(Boolean).join(' '), qty: 1, unit: h.unit, price: h.price })}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted"
            >
              <Pill className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {h.name} <span className="font-normal text-muted-foreground">{h.strength}</span>
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {h.form}
                  {h.price > 0 ? `${h.form ? ' · ' : ''}৳${n(h.price)} / ${t.units[h.unit]}` : ''}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${h.inStock ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                {h.inStock ? t.inStock : t.ask}
              </span>
              <Plus className="h-4 w-4 shrink-0 text-primary" />
            </button>
          ))}
          {hits.length === 0 && <p className="px-3 pt-2.5 text-xs text-muted-foreground">{t.none}</p>}
          <button type="button" onClick={() => add({ name: typed, qty: 1, unit: 'strip', price: 0 })} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-muted">
            <Plus className="h-4 w-4" /> {t.addTyped(typed)}
          </button>
        </div>
      )}

      {lines.length > 0 && (
        <ul className="mt-2.5 grid gap-2">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/[0.04] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.name}</span>
              <span className="flex items-center rounded-full border border-border bg-card">
                <button type="button" aria-label="−" onClick={() => (l.qty <= 1 ? onChange(lines.filter((x) => x.key !== l.key)) : set(l.key, { qty: l.qty - 1 }))} className="grid h-8 w-8 place-items-center">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{n(l.qty)}</span>
                <button type="button" aria-label="+" onClick={() => set(l.key, { qty: Math.min(1000, l.qty + 1) })} className="grid h-8 w-8 place-items-center">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </span>
              <select className="h-8 rounded-lg border border-border bg-card px-1.5 text-xs" value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value as Unit })} aria-label="unit">
                {(['strip', 'piece', 'box'] as Unit[]).map((u) => (
                  <option key={u} value={u}>
                    {t.units[u]}
                  </option>
                ))}
              </select>
              <button type="button" aria-label="Remove" onClick={() => onChange(lines.filter((x) => x.key !== l.key))} className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {total > 0 && <li className="px-1 text-xs text-muted-foreground">{t.about(n(Math.round(total)))}</li>}
        </ul>
      )}
    </div>
  );
}
