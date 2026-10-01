import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, ReceiptText, Truck, Boxes, Users, Building2, Tag } from 'lucide-react';
import { tillApi, taka, type ShopHit } from '../api';
import { useT } from '../i18n/ui';

/**
 * One box that finds anything in the shop.
 *
 * A shopkeeper does not think in screens. Somebody rings up about "that Incepta
 * invoice", a customer walks in holding a slip with 0042 on it, the owner wants
 * to know what Napa is selling for — and all three of them start by typing the
 * thing they know. Making them first work out which page it lives on is making
 * them learn our filing system.
 *
 * So it sits in the top bar on every screen, takes anything, and says which
 * shelf the answer came off. `/` focuses it from anywhere, which is the key
 * every search box in every application has trained people to reach for.
 */

const ICONS = {
  bill: ReceiptText,
  purchase: Truck,
  product: Boxes,
  customer: Users,
  supplier: Building2,
  batch: Tag,
} as const;

const WHAT = {
  bill: 'Bill',
  purchase: 'Delivery',
  product: 'Stock',
  customer: 'Customer',
  supplier: 'Supplier',
  batch: 'Batch',
} as const;

export default function FindAnything() {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ShopHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0);
  const boxRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* `/` from anywhere, the way every search box has taught people — but not
     while they are typing into something else. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        boxRef.current?.focus();
      }
      if (e.key === 'Escape') setHits(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* A click anywhere else puts the list away. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setHits(null);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        setHits(await tillApi.searchAll(q.trim()));
        setAt(0);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (hit: ShopHit) => {
    navigate(hit.to);
    setQ('');
    setHits(null);
    boxRef.current?.blur();
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 md:max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={boxRef}
        className="input h-9 pl-8 pr-8"
        placeholder={t('Find a bill, a medicine, a batch, a name…')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && hits === null && setQ(q)}
        onKeyDown={(e) => {
          if (!hits?.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAt((i) => Math.min(hits.length - 1, i + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter') go(hits[at]);
        }}
      />
      {busy ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        !q && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground lg:block">
            /
          </kbd>
        )
      )}

      {hits !== null && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {t('Nothing by that. A bill number, part of a name, or an invoice number.')}
            </p>
          ) : (
            hits.map((h, i) => {
              const Icon = ICONS[h.kind];
              return (
                <button
                  key={`${h.kind}-${h.id}`}
                  type="button"
                  onMouseEnter={() => setAt(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-0 ${
                    i === at ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{h.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {t(WHAT[h.kind])}
                      {h.subtitle ? ` · ${h.subtitle}` : ''}
                    </span>
                  </span>
                  {h.amount !== undefined && (
                    <span className="shrink-0 text-sm tabular-nums">{taka(h.amount)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
