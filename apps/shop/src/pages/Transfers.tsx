import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Search, Loader2, X, MapPin, ArrowRight } from 'lucide-react';
import { shopApi, transfersApi, type ShopProduct, type StockBatch, type StockTransfer } from '../api';
import { fetchBranchSwitcher, useBranchStore, type BranchSwitcherInfo } from '../branch';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Sending stock to another branch.
 *
 * Always from the branch picked at the top, because that is the shelf the box
 * is being packed from. Each line is a lot — its batch and expiry go with it —
 * and the other branch's shelf has it the moment this is saved.
 */

type Line = { batch: StockBatch; product: ShopProduct; pieces: string };

const taka = (n: number) => `৳ ${n.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function Transfers() {
  const t = useT();
  const lang = useUiLang();
  const { toast } = useToast();
  const working = useBranchStore((s) => s.branch);
  const [info, setInfo] = useState<BranchSwitcherInfo | null>(null);
  const [history, setHistory] = useState<StockTransfer[] | null>(null);
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<ShopProduct[]>([]);
  const [picked, setPicked] = useState<{ product: ShopProduct; lots: StockBatch[] } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const money = (v: number) => (lang === 'bn' ? bnNumerals(taka(v)) : taka(v));

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([fetchBranchSwitcher(), transfersApi.list()]);
      setInfo(b);
      setHistory(h);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not load the transfers.'), 'error');
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The list of items, as the name is typed. */
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const tick = window.setTimeout(() => {
      shopApi
        .products({ q: text, limit: 8, sort: 'name' })
        .then((r) => live && setFound(r.data.filter((p) => (p.onHand ?? 0) > 0)))
        .catch(() => undefined);
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(tick);
    };
  }, [q]);

  const open = async (product: ShopProduct) => {
    try {
      const lots = await shopApi.batches(product._id);
      setPicked({ product, lots: lots.filter((l) => l.qtyOnHand > 0) });
    } catch {
      toast(t('Could not load that item’s lots.'), 'error');
    }
  };

  const add = (product: ShopProduct, batch: StockBatch) => {
    if (lines.some((l) => l.batch._id === batch._id)) return;
    // Empty, not the whole lot: how many go across is typed, never assumed.
    setLines([...lines, { product, batch, pieces: '' }]);
    setPicked(null);
    setQ('');
    setFound([]);
  };

  const send = async () => {
    const payload = lines.map((l) => ({ batchId: l.batch._id, pieces: Math.round(Number(l.pieces)) }));
    if (payload.some((l) => !(l.pieces > 0))) {
      toast(t('Every line needs how many pieces are going.'), 'error');
      return;
    }
    setBusy(true);
    try {
      await transfersApi.create({ toBranchId: to, lines: payload, note: note.trim() || undefined });
      toast(t('Sent across. The other branch has it on its shelf now.'));
      setLines([]);
      setNote('');
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not send that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!info || !history) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }

  const here = info.branches.find((b) => b._id === working);
  const others = info.branches.filter((b) => b._id !== working);
  // The branches this person cannot work in still take deliveries; the owner's list has them all.
  const value = lines.reduce((s, l) => s + (Number(l.pieces) || 0) * (l.batch.costPerPiece || 0), 0);

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> {t('Send to a branch')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('Stock leaves the branch picked at the top and is on the other branch’s shelf the moment you send it.')}
          </p>
        </div>
      </div>

      {info.count <= 1 ? (
        <div className="card text-sm">
          {t('Your shop has one branch, so there is nowhere to send stock.')}{' '}
          <Link to="/branches" className="font-semibold text-primary">
            {t('Branches')}
          </Link>
        </div>
      ) : !here ? (
        <div className="card text-sm">{t('Pick the branch the stock is leaving from at the top of the screen.')}</div>
      ) : (
        <div className="card">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div>
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('From')}</span>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-primary" /> {here.name}
              </div>
            </div>
            <ArrowRight className="mx-auto hidden h-5 w-5 text-muted-foreground sm:mb-2.5 sm:block" />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('To')}</span>
              <select className="input h-10" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">{t('Pick a branch')}</option>
                {others.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* ---- what is going ---- */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input h-10 pl-9"
              placeholder={t('Find an item on this branch’s shelf')}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
              }}
            />
            {found.length > 0 && !picked && (
              <div className="absolute inset-x-0 top-11 z-20 max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-lg">
                {found.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => void open(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 truncate">
                      <strong>{p.name}</strong> {p.strength && <span className="text-muted-foreground">{p.strength}</span>}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {n(p.onHand ?? 0)} {t('pcs')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {picked && (
            <div className="mt-2 rounded-lg border border-border p-2">
              <div className="mb-1 flex items-center justify-between px-1 text-sm">
                <strong>{picked.product.name}</strong>
                <button type="button" aria-label={t('Close')} className="rounded p-1 hover:bg-muted" onClick={() => setPicked(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {picked.lots.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t('Nothing of this on the shelf here.')}</p>}
              {picked.lots.map((l) => (
                <button
                  key={l._id}
                  type="button"
                  onClick={() => add(picked.product, l)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {t('Batch')} <span className="font-mono">{l.batchNo || '—'}</span> · {t('expires')} {n(day(l.expiry))}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {n(l.qtyOnHand)} {t('pcs')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {lines.length > 0 && (
            <div className="mt-4 divide-y divide-border rounded-lg border border-border">
              {lines.map((l, i) => (
                <div key={l.batch._id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate">{l.product.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {t('Batch')} <span className="font-mono">{l.batch.batchNo || '—'}</span> · {n(day(l.batch.expiry))} · {t('here')}{' '}
                      {n(l.batch.qtyOnHand)}
                    </span>
                  </div>
                  <input
                    className="input h-9 w-24 text-right tabular-nums"
                    inputMode="numeric"
                    placeholder={t('pcs')}
                    autoFocus={i === lines.length - 1}
                    aria-label={t('Pieces')}
                    value={l.pieces}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, pieces: e.target.value.replace(/[^\d]/g, '') } : x)))}
                  />
                  <button
                    type="button"
                    aria-label={t('Remove')}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              className="input h-10 min-w-0 basis-full sm:basis-0 sm:flex-1"
              maxLength={240}
              placeholder={t('Note — who took it across, what for')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {lines.length > 0 && (
              <span className="ml-auto text-sm text-muted-foreground sm:ml-0">
                {t('At cost')} <strong className="text-foreground">{money(value)}</strong>
              </span>
            )}
            <button type="button" className="btn h-10" disabled={busy || !to || lines.length === 0} onClick={() => void send()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Send')}
            </button>
          </div>
        </div>
      )}

      {/* ---- what has gone before ---- */}
      <div className="card">
        <h3 className="mb-2 text-base">{t('Recent transfers')}</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('Nothing sent between branches yet.')}</p>
        ) : (
          <div className="divide-y divide-border">
            {history.map((h) => (
              <div key={h._id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {h.fromName} <ArrowRight className="inline h-3.5 w-3.5" /> {h.toName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {n(day(h.createdAt))} · {h.createdByName} · {money(h.value)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {h.lines.map((l) => `${l.name} × ${n(l.pieces)}`).join(' · ')}
                  {h.note ? ` — ${h.note}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
