import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Tags, Printer, Loader2, ArrowLeft, Search } from 'lucide-react';
import { shopApi, taka, takaPlain, packOfPlain as packOf, type ShopProduct, type ShopRack } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import Pager from '../components/Pager';

/**
 * Labels for the edge of the shelf.
 *
 * The racks module put a shelf on the screen and left the shelf itself bare, so
 * the label under the box stayed handwritten — which is fine until the price
 * changes, and then half the shelf disagrees with the till and the customer
 * reads the wrong number out loud.
 *
 * So this prints what is already true in the software: the name, the strength,
 * the shelf it belongs on, the price per piece and what a strip comes to. Plain
 * A4 and a grid of cards, because a pharmacy owns an inkjet and nobody is
 * buying a label printer for this.
 *
 * Deliberately no barcode drawn on them. The code on a pack is printed by the
 * manufacturer and is the one the scanner already reads; a code rendered here
 * would be a second one for the same strip, and the shop would have to decide
 * which of the two is real every time one fails to scan.
 */

const PER_PAGE = 24;
/** How many items the list shows at once. */
const SHOW = 60;

export default function Labels() {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number | string) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));
  const { toast } = useToast();
  const [racks, setRacks] = useState<ShopRack[]>([]);
  const [rackId, setRackId] = useState('');
  const [rows, setRows] = useState<ShopProduct[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [shelves, products] = await Promise.all([
        shopApi.racks(),
        /* Every item, not the first two hundred: a shop relabelling the
           whole place wants the whole place. Pulled a page at a time. */
        (async () => {
          const all: ShopProduct[] = [];
          for (let page = 1; page < 50; page++) {
            const got = await shopApi.products({ rackId: rackId || undefined, limit: 200, page });
            all.push(...got.data);
            if (all.length >= got.total || got.data.length === 0) break;
          }
          return { data: all };
        })(),
      ]);
      setRacks(shelves);
      setRows(products.data);
      setPage(1);
      /* Everything on the shelf is ticked to start with: somebody who came here
         to relabel a shelf wants the shelf, and unticking three is less work
         than ticking forty. */
      setPicked(new Set(products.data.map((p) => p._id)));
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not load the shelf.'), 'error');
      setRows([]);
    }
  }, [rackId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = useMemo(
    () => (rows ?? []).filter((p) => picked.has(p._id)),
    [rows, picked],
  );

  /* What the list shows: the search, a page at a time. Ticking and printing
     work on everything ticked, whatever page it is on. */
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((p) =>
      [p.name, p.genericName, p.rackLabel, p.companyName].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [rows, q]);
  const shown = found.slice((page - 1) * SHOW, page * SHOW);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Tags className="h-5 w-5" /> {t('Shelf labels')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('The name, the shelf and the price — printed, so the edge of the shelf agrees with the till.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/racks" className="btn btn-ghost h-9">
            <ArrowLeft className="h-4 w-4" /> {t('Racks')}
          </Link>
          <select
            className="input h-9 w-auto"
            aria-label={t('Rack')}
            value={rackId}
            onChange={(e) => setRackId(e.target.value)}
          >
            <option value="">{t('Every rack')}</option>
            {racks.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
            <option value="none">{t('Not placed yet')}</option>
          </select>
          <button
            type="button"
            className="btn h-9"
            disabled={chosen.length === 0 || printing}
            onClick={() => setPrinting(true)}
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t('Print')} {chosen.length > 0 ? `(${chosen.length})` : ''}
          </button>
        </div>
      </div>

      {!rows ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">{t('Nothing on this shelf yet.')}</div>
        </div>
      ) : (
        <>
          <div className="card mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {n(chosen.length)} / {n(rows.length)} {t('ticked')} · {n(Math.ceil(chosen.length / PER_PAGE))}{' '}
              {t('pages of A4')}
            </span>
            <button
              type="button"
              className="btn btn-ghost ml-auto h-8"
              onClick={() => setPicked(new Set([...picked, ...found.map((p) => p._id)]))}
            >
              {t('Tick them all')}
            </button>
            <button type="button" className="btn btn-ghost h-8" onClick={() => setPicked(new Set())}>
              {t('Clear')}
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9"
              placeholder={t('Name, generic, rack or company…')}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {found.length === 0 && <div className="card empty">{t('Nothing matches that.')}</div>}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <label
                key={p._id}
                className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  picked.has(p._id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.has(p._id)}
                  onChange={() => toggle(p._id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {p.name} {p.strength}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {p.rackLabel ? `${t('rack')} ${p.rackLabel} · ` : ''}
                    {taka(p.mrpPerPiece)} / {t('pc')}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Pager page={page} pageSize={SHOW} total={found.length} onPage={setPage} className="mt-3" />
        </>
      )}

      {printing && <LabelSheet rows={chosen} onDone={() => setPrinting(false)} />}
    </div>
  );
}

/**
 * The sheet itself, portalled to `<body>`.
 *
 * Portalled for the same reason the receipt is: the print rule hides everything
 * that is not the sheet, and a sheet rendered inside the React root would be
 * hidden along with it — which prints a blank page and looks exactly like a
 * broken printer.
 */
function LabelSheet({ rows, onDone }: { rows: ShopProduct[]; onDone: () => void }) {
  useEffect(() => {
    /* One frame, so the browser has laid the grid out before it measures it for
       the printer. */
    const timer = setTimeout(() => {
      window.print();
      onDone();
    }, 150);
    return () => clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <div className="label-sheet">
      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print {
          body > *:not(.label-sheet) { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .label-sheet { position: static !important; }
        }
        .label-sheet {
          position: fixed;
          inset: 0;
          z-index: 60;
          overflow: auto;
          background: #fff;
          color: #000;
          display: grid;
          /* Three across on A4 with an 8mm margin: 62mm a card, which is the
             width of a shelf edge strip in most of these shops. */
          grid-template-columns: repeat(3, 1fr);
          gap: 2mm;
          padding: 4mm;
          font-family: system-ui, sans-serif;
        }
        .label-sheet .label {
          border: 1px solid #999;
          border-radius: 2mm;
          padding: 2.5mm 3mm;
          /* Never split across a page: half a price is worse than no label. */
          break-inside: avoid;
          page-break-inside: avoid;
          height: 26mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .label-sheet .name { font-size: 11pt; font-weight: 700; line-height: 1.15; }
        .label-sheet .sub { font-size: 7.5pt; color: #444; }
        .label-sheet .price { font-size: 14pt; font-weight: 700; }
        .label-sheet .rack {
          font-size: 8pt;
          font-weight: 700;
          border: 1px solid #999;
          border-radius: 1mm;
          padding: 0 1mm;
        }
      `}</style>

      {rows.map((p) => (
        <div className="label" key={p._id}>
          <div>
            <div className="name">
              {p.name} {p.strength}
            </div>
            <div className="sub">{p.genericName || p.companyName || ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div className="price">{takaPlain(p.mrpPerPiece)}</div>
              {/* What a customer actually asks for — one strip, not one
                  tablet — worked out from the same pack rule the till uses. */}
              <div className="sub">
                {packOf(p.piecesPerStrip, p)} · {takaPlain(p.mrpPerPiece * p.piecesPerStrip)}
              </div>
            </div>
            {p.rackLabel && <span className="rack">{p.rackLabel}</span>}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
