import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ClipboardCheck,
  Loader2,
  ArrowLeft,
  Check,
  X,
  Search,
  TriangleAlert,
} from 'lucide-react';
import {
  shopApi,
  taka,
  type ShopRack,
  type StockCount,
  type StockCountLine,
  type StockCountSummary,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';
import Modal from '../components/Modal';
import { LoadingBlock } from '@dawai/shared/components/Spinner';

/**
 * Counting the shelf.
 *
 * The one screen in the shop where somebody types a number that came from
 * looking rather than from a document, so it is built for the way that is
 * actually done: one person, one phone, one rack at a time, over an evening,
 * while the shop keeps selling.
 *
 * Three things follow from that:
 *
 * - **A blank is not a zero.** A lot nobody reached is left alone; a lot
 *   counted as zero is written off. The screen keeps them visibly apart,
 *   because the difference between them is a rack's worth of stock.
 * - **It saves as you go.** The sheet is written back after each entry, so a
 *   phone that loses its signal halfway down an aisle loses nothing.
 * - **The difference is shown before it is applied**, in pieces and in money.
 *   Pieces that are not there were paid for, and the person pressing the button
 *   should see the size of what they are agreeing to.
 */
export default function CountStock() {
  const t = useT();
  const { toast } = useToast();
  const [sheet, setSheet] = useState<StockCount | null>(null);
  const [history, setHistory] = useState<StockCountSummary[]>([]);
  const [racks, setRacks] = useState<ShopRack[]>([]);
  /* The racks page links here with a shelf already chosen: "count R2". */
  const [params] = useSearchParams();
  const [rackId, setRackId] = useState(() => params.get('rack') ?? '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [open, past, shelves] = await Promise.all([
        shopApi.openCount(),
        shopApi.counts(),
        shopApi.racks().catch(() => []),
      ]);
      setSheet(open.count);
      setHistory(past);
      setRacks(shelves);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      setSheet(await shopApi.startCount(rackId || undefined));
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not start a count.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** One line, written back on its own so nothing is held in the page. */
  const setCounted = async (line: StockCountLine, value: string) => {
    if (!sheet) return;
    const counted = value.trim() === '' ? null : Math.max(0, Math.round(Number(value) || 0));
    setSheet({
      ...sheet,
      lines: sheet.lines.map((l) => (l._id === line._id ? { ...l, counted } : l)),
    });
    try {
      await shopApi.saveCount(sheet._id, [{ lineId: line._id, counted }]);
    } catch {
      toast('That one did not save — check the connection before you finish.', 'error');
    }
  };

  const totals = useMemo(() => {
    const lines = sheet?.lines ?? [];
    let short = 0;
    let extra = 0;
    let value = 0;
    let counted = 0;
    for (const l of lines) {
      if (l.counted === null) continue;
      counted++;
      const delta = l.counted - l.expected;
      if (delta < 0) short += -delta;
      else extra += delta;
      value += delta * l.costPerPiece;
    }
    return { short, extra, value: Math.round(value * 100) / 100, counted, of: lines.length };
  }, [sheet]);

  const apply = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const done = await shopApi.applyCount(sheet._id, note.trim() || undefined);
      toast(
        done.shortPieces || done.extraPieces
          ? `Stock updated — ${done.shortPieces} short, ${done.extraPieces} extra.`
          : 'Stock updated — the shelf and the screen agreed.',
      );
      setConfirming(false);
      setNote('');
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not apply that count.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const drop = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await shopApi.abandonCount(sheet._id);
      toast('Count dropped. Nothing on the shelf was changed.');
      await load();
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not drop that count.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => {
    const lines = sheet?.lines ?? [];
    const text = q.trim().toLowerCase();
    if (!text) return lines;
    return lines.filter(
      (l) =>
        l.name.toLowerCase().includes(text) ||
        l.batchNo.toLowerCase().includes(text) ||
        l.rackLabel.toLowerCase().includes(text),
    );
  }, [sheet, q]);

  if (loading) return <LoadingBlock />;

  /* ------------------------------------------------- nothing going on yet -- */
  if (!sheet) {
    return (
      <div className="page">
        <div className="topbar">
          <div>
            <h1 className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" /> {t('Count the shelf')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('What is really there, against what the screen thinks.')}
            </p>
          </div>
          <Link to="/stock" className="btn btn-ghost h-9">
            <ArrowLeft className="h-4 w-4" /> {t('Stock')}
          </Link>
        </div>

        <div className="card">
          <h2 className="mb-1 text-base">{t('Start a count')}</h2>
          <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
            {t(
              'One rack at a time is the way it is done — a whole shop in one evening is a count nobody finishes. Keep selling while you count: what is rung up in the middle is added on top of the difference, not swallowed by it.',
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input h-10 w-auto"
              aria-label={t('Which rack')}
              value={rackId}
              onChange={(e) => setRackId(e.target.value)}
            >
              <option value="">{t('The whole shop')}</option>
              {racks.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn h-10" disabled={busy} onClick={() => void start()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Start counting')}
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="card mt-4">
            <h2 className="mb-3 text-base">{t('Counts before this')}</h2>
            {/* A phone reads each count as a line of its own. */}
            <ul className="divide-y divide-border sm:hidden">
              {history.map((h) => (
                <li key={h._id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {h.rackLabel || t('The whole shop')}
                      {h.status !== 'applied' && (
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          ({t(h.status === 'open' ? 'still going' : 'dropped')})
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(h.appliedAt ?? h.startedAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}{' '}
                      · {h.appliedByName || h.startedByName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    <p className={`text-sm ${h.valueDelta < 0 ? 'font-semibold text-destructive' : 'text-foreground'}`}>
                      {h.valueDelta ? taka(h.valueDelta) : '—'}
                    </p>
                    {t('Short')} {h.shortPieces || 0} · {t('Extra')} {h.extraPieces || 0}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="table w-full text-sm">
                <thead>
                  <tr>
                    <th>{t('When')}</th>
                    <th>{t('Where')}</th>
                    <th>{t('Who')}</th>
                    <th className="text-right">{t('Short')}</th>
                    <th className="text-right">{t('Extra')}</th>
                    <th className="text-right">{t('Difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h._id}>
                      <td>
                        {new Date(h.appliedAt ?? h.startedAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })}
                        {h.status !== 'applied' && (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            ({t(h.status === 'open' ? 'still going' : 'dropped')})
                          </span>
                        )}
                      </td>
                      <td>{h.rackLabel || t('The whole shop')}</td>
                      <td className="text-muted-foreground">
                        {h.appliedByName || h.startedByName}
                      </td>
                      <td className="text-right tabular-nums">{h.shortPieces || '—'}</td>
                      <td className="text-right tabular-nums">{h.extraPieces || '—'}</td>
                      <td
                        className={`text-right tabular-nums ${
                          h.valueDelta < 0 ? 'font-semibold text-destructive' : ''
                        }`}
                      >
                        {h.valueDelta ? taka(h.valueDelta) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------ the sheet -- */
  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> {sheet.rackLabel || t('The whole shop')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {totals.counted} / {totals.of} {t('counted')} · {t('started')}{' '}
            {new Date(sheet.startedAt).toLocaleString('en-GB', {
              day: '2-digit',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}{' '}
            · {sheet.startedByName}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost h-9" disabled={busy} onClick={() => void drop()}>
            <X className="h-4 w-4" /> {t('Drop it')}
          </button>
          <button
            type="button"
            className="btn h-9"
            disabled={totals.counted === 0}
            onClick={() => setConfirming(true)}
          >
            <Check className="h-4 w-4" /> {t('Finish')}
          </button>
        </div>
      </div>

      {/* Three across even on a phone: counting is done standing up with one
          hand, and three stacked tiles push the sheet itself off the screen. */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="stat px-3 py-3 sm:px-[18px] sm:py-4">
          <div className="value text-[22px] sm:text-[30px]">{totals.short}</div>
          <div className="label">{t('Missing')}</div>
          <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
            {t('pieces the shelf does not have')}
          </p>
        </div>
        <div className="stat px-3 py-3 sm:px-[18px] sm:py-4">
          <div className="value text-[22px] sm:text-[30px]">{totals.extra}</div>
          <div className="label">{t('More than expected')}</div>
          <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">{t('pieces nobody rang up')}</p>
        </div>
        <div className="stat px-3 py-3 sm:px-[18px] sm:py-4">
          <div
            className={`value text-[22px] sm:text-[30px] ${
              totals.value < 0 ? 'text-destructive' : ''
            }`}
          >
            {taka(totals.value)}
          </div>
          <div className="label">{t('What it comes to')}</div>
          <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">{t('at what the shop paid')}</p>
        </div>
      </div>

      <div className="card">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input input-search h-10"
            placeholder={t('Jump to a name, a batch, or a rack…')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>{t('Item')}</th>
                <th className="hidden sm:table-cell">{t('Rack')}</th>
                <th className="text-right">{t('Screen says')}</th>
                <th className="w-24 text-right sm:w-28 sm:pr-3">{t('On the shelf')}</th>
                {/* The difference moves under the name on a phone: three words
                    of "not counted" in a column of its own leaves nothing for
                    the medicine's name, which is the column being read. */}
                <th className="hidden text-right sm:table-cell">{t('Difference')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const delta = l.counted === null ? null : l.counted - l.expected;
                return (
                  <tr key={l._id}>
                    <td>
                      <span className="font-semibold">{l.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {[l.batchNo && `${t('Batch')} ${l.batchNo}`, l.expiry && exp(l.expiry)]
                          .filter(Boolean)
                          .join(' · ') || t('no batch recorded')}
                      </span>
                      {delta !== null && delta !== 0 && (
                        <span
                          className={`block text-[11px] font-semibold sm:hidden ${
                            delta < 0 ? 'text-destructive' : ''
                          }`}
                        >
                          {delta > 0 ? `+${delta}` : delta} against the screen
                        </span>
                      )}
                    </td>
                    <td className="hidden text-muted-foreground sm:table-cell">
                      {l.rackLabel || '—'}
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">
                      {l.expected}
                    </td>
                    <td className="sm:pr-3">
                      <input
                        className="input h-9 w-full text-right tabular-nums"
                        inputMode="numeric"
                        placeholder="—"
                        defaultValue={l.counted ?? ''}
                        onBlur={(e) => void setCounted(l, e.target.value)}
                      />
                    </td>
                    <td
                      className={`hidden text-right tabular-nums sm:table-cell ${
                        delta === null
                          ? 'text-muted-foreground'
                          : delta < 0
                            ? 'font-semibold text-destructive'
                            : delta > 0
                              ? 'font-semibold'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {delta === null ? 'not counted' : delta === 0 ? 'agrees' : delta > 0 ? `+${delta}` : delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirming && (
        <Modal onClose={() => setConfirming(false)} className="w-full max-w-md">
            <h3 className="mb-1 flex items-center gap-2 text-base">
              <TriangleAlert className="h-4 w-4" /> {t('Put this into the stock')}
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              {totals.short > 0 && `${totals.short} ${t('pieces will be written off.')} `}
              {totals.extra > 0 && `${totals.extra} ${t('pieces will be added.')} `}
              {totals.of - totals.counted > 0 && (
                <>
                  {totals.of - totals.counted} {t('lots nobody counted are left exactly as they are.')}{' '}
                </>
              )}
              {t('It cannot be undone, but every line of it stays in the stock record with your name on it.')}
            </p>
            <input
              className="input mb-4 h-10"
              placeholder={t('Why — kept with the count')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                {t('Not yet')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void apply()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('Update the stock')}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}

const exp = (iso: string) =>
  `exp ${new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`;
