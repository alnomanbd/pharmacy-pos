import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bike, Camera, CheckCircle2, Loader2, MapPin, Phone, Pill, Store, Trash2, X } from 'lucide-react';
import { useLangStore } from '../i18n/ui';

/**
 * A shop's own order page — the link it shares on WhatsApp and Facebook.
 *
 * For a customer on a phone, with no account and no app: their name and
 * number, what they need (typed, or a photo of the prescription), pickup or
 * delivery. Nothing is charged here; the shop confirms and bills it at the
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

const T = {
  en: {
    order: 'Order medicines',
    lede: 'Send what you need — we confirm by SMS and have it ready.',
    name: 'Your name',
    phone: 'Mobile number',
    what: 'What do you need?',
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

                  <label className="block text-sm font-semibold">
                    {t.what}
                    <textarea className="input mt-1 min-h-[96px] py-2.5" maxLength={2000} placeholder={t.whatHint} value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
                  </label>

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
