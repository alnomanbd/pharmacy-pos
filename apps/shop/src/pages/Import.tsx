import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
  Users,
} from 'lucide-react';
import { importApi, taka, type ImportResult } from '../api';
import { FIELDS, guessMapping, readFile, rowsFor, templateCsv, type Cell, type Kind } from '../import/sheet';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';

/**
 * Moving in: the shop's stock list or its customer book, from a spreadsheet.
 *
 * Four steps on one page, each visible only once the one before it is done:
 * the file, which column is which, what would happen, and doing it. The
 * check runs the whole file through the server without writing anything, so
 * the shop sees "1,840 new, 12 already on your list, 3 with a problem" — and
 * which three, and why — before a single product is added.
 */

const CHUNK = 1000;

type Stage = 'file' | 'map' | 'checked' | 'importing' | 'done';

export default function Import() {
  const t = useT();
  const lang = useUiLang();
  const n = (v: number) => (lang === 'bn' ? bnNumerals(v.toLocaleString('en-IN')) : v.toLocaleString('en-IN'));
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get('what') === 'customers' ? 'customers' : 'stock';
  const fields = FIELDS[kind];

  const [stage, setStage] = useState<Stage>('file');
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<Cell[][]>([]);
  const [headerAt, setHeaderAt] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const headers = data[headerAt] ?? [];
  const body = useMemo(() => data.slice(headerAt + 1), [data, headerAt]);
  const rows = useMemo(() => rowsFor(body, mapping), [body, mapping]);

  const reset = (k: Kind = kind) => {
    setStage('file');
    setFileName('');
    setData([]);
    setMapping({});
    setResult(null);
    setError('');
    setProgress(0);
    if (k !== kind) setParams({ what: k });
  };

  const load = async (file: File) => {
    setError('');
    try {
      const d = await readFile(file);
      if (d.length < 2) throw new Error('empty');
      /* The header is the first row that names a column we know; a title row above it is skipped. */
      let at = 0;
      for (let i = 0; i < Math.min(10, d.length); i++) {
        if (Object.keys(guessMapping(kind, d[i])).length >= 2) {
          at = i;
          break;
        }
      }
      setFileName(file.name);
      setData(d);
      setHeaderAt(at);
      setMapping(guessMapping(kind, d[at]));
      setResult(null);
      setStage('map');
    } catch (e) {
      setError(
        (e as Error).message === 'old-excel'
          ? t('That is an old Excel file (.xls). Open it in Excel and save it as .xlsx or .csv.')
          : (e as Error).message === 'empty'
            ? t('That file has no rows under the header.')
            : t('Could not read that file. Save it as .xlsx or .csv and try again.'),
      );
    }
  };

  /** The whole file, a thousand rows at a time, with the row numbers kept in step. */
  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError('');
    setProgress(0);
    if (!dryRun) setStage('importing');
    const total: ImportResult = { dryRun, summary: { new: 0, existing: 0, errors: 0, lots: 0, pieces: 0, value: 0, owed: 0 }, rows: [] };
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await importApi.run(kind, rows.slice(i, i + CHUNK), dryRun);
        for (const [k, v] of Object.entries(r.summary)) {
          const key = k as keyof ImportResult['summary'];
          total.summary[key] = Math.round(((total.summary[key] ?? 0) + (v ?? 0)) * 100) / 100;
        }
        total.rows.push(...r.rows.map((x) => ({ ...x, row: x.row + i + headerAt + 1 })));
        setProgress(Math.min(rows.length, i + CHUNK));
      }
      setResult(total);
      setStage(dryRun ? 'checked' : 'done');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } }).response?.data?.message || t('Could not reach the shop. Nothing after the last part was saved — check and run it again.'));
      setStage(dryRun ? 'map' : 'checked');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([templateCsv(kind)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = kind === 'stock' ? 'dawai-stock-template.csv' : 'dawai-customers-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const missing = fields.filter((f) => f.required && mapping[f.key] === undefined);
  const problems = result?.rows.filter((r) => r.status === 'error') ?? [];
  /* Left out on purpose — already in stock, or the same row twice — so the shelf is not doubled. */
  const skipped = result?.rows.filter((r) => r.status === 'skipped') ?? [];
  const s = result?.summary;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> {t('Bring your data in')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('Your stock list or customer book, from Excel or a CSV your old software made.')}</p>
        </div>
        <Link to={kind === 'stock' ? '/stock' : '/customers'} className="btn btn-ghost h-9">
          <ArrowLeft className="h-4 w-4" /> {t(kind === 'stock' ? 'Stock' : 'Customers')}
        </Link>
      </div>

      {/* ---- what ---- */}
      <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1">
        {(
          [
            ['stock', 'Stock', Boxes],
            ['customers', 'Customers', Users],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            onClick={() => reset(k)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              kind === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" /> {t(label)}
          </button>
        ))}
      </div>

      {/* ---- 1. the file ---- */}
      {stage === 'file' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void load(f);
            }}
            className={`flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              drag ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'
            }`}
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Upload className="h-7 w-7" />
            </span>
            <span className="text-base font-semibold">{t('Drop the file here, or click to choose')}</span>
            <span className="text-sm text-muted-foreground">.xlsx · .csv</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
              e.target.value = '';
            }}
          />
          <div className="card mb-0 text-sm">
            <h3 className="mb-2">{t('How it works')}</h3>
            <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
              <li>{t('Use the file you already have — the columns can be in any order, with any names.')}</li>
              <li>{t('Check which column is which. Most are matched for you.')}</li>
              <li>{t('See what will happen, row by row, before anything is saved.')}</li>
              <li>{t(kind === 'stock' ? 'Import. Items already on your list get the stock as a new lot — nothing is overwritten.' : 'Import. A number already on your book is left as it is.')}</li>
            </ol>
            <button type="button" onClick={download} className="btn btn-ghost mt-4 h-9 w-full justify-center border border-border">
              <Download className="h-4 w-4" /> {t('Download a template')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* ---- 2. which column is which ---- */}
      {stage !== 'file' && (
        <div className="card mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="mb-0 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> {fileName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {n(rows.length)} {t('rows')} · {t('header on row')} {n(headerAt + 1)}
              </p>
            </div>
            <button type="button" className="btn btn-ghost h-9" disabled={busy} onClick={() => reset()}>
              <RotateCcw className="h-4 w-4" /> {t('Another file')}
            </button>
          </div>
          <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((f) => {
              const i = mapping[f.key];
              const sample = i !== undefined ? body.find((r) => r[i] !== null && r[i] !== '')?.[i] : undefined;
              return (
                <label key={f.key} className="block text-sm">
                  <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>
                      {t(f.label)}
                      {f.required && <span className="text-destructive"> *</span>}
                    </span>
                    {sample !== undefined && sample !== null && (
                      <span className="truncate font-mono font-normal text-foreground/70">
                        {sample instanceof Date ? sample.toISOString().slice(0, 10) : String(sample).slice(0, 24)}
                      </span>
                    )}
                  </span>
                  <select
                    className={`input h-10 ${i !== undefined ? 'border-primary/40 bg-primary/[0.03]' : ''}`}
                    value={i ?? -1}
                    disabled={busy || stage === 'importing' || stage === 'done'}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const next = { ...mapping };
                      if (v < 0) delete next[f.key];
                      else next[f.key] = v;
                      setMapping(next);
                      if (stage === 'checked') setStage('map');
                    }}
                  >
                    <option value={-1}>— {t('not in this file')} —</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {String(h ?? '').trim() || `${t('Column')} ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          {kind === 'stock' && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('Prices can be per piece or per strip, and stock in pieces, strips or boxes — whichever your file has.')}
            </p>
          )}
          {stage === 'map' && (
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn h-10" disabled={busy || missing.length > 0 || rows.length === 0} onClick={() => void run(true)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {missing.length ? `${t('Choose the column for')} ${t(missing[0].label)}` : t('Check the file')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- 3 and 4. what would happen, and what did ---- */}
      {(stage === 'checked' || stage === 'importing' || stage === 'done') && s && (
        <div className="card">
          <h3 className="mb-3 flex items-center gap-2">
            {stage === 'done' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> {t('Done')}
              </>
            ) : (
              t('What will happen')
            )}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t(kind === 'stock' ? 'New items' : 'New customers')} value={n(s.new)} tone="text-emerald-600" />
            <Tile label={t(kind === 'stock' ? 'Already on your list' : 'Already on your book')} value={n(s.existing)} tone="text-sky-600" />
            {kind === 'stock' ? (
              <Tile label={t('Opening stock value')} value={taka(s.value ?? 0)} sub={`${n(s.pieces ?? 0)} ${t('pieces')} · ${n(s.lots ?? 0)} ${t('lots')}`} />
            ) : (
              <Tile label={t('Owed to you')} value={taka(s.owed ?? 0)} />
            )}
            <Tile label={t('With a problem')} value={n(s.errors)} tone={s.errors ? 'text-destructive' : 'text-muted-foreground'} />
          </div>

          {problems.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">
                {stage === 'done' ? t('These rows were not imported:') : t('These rows will be left out — fix them in the file, or carry on without them:')}
              </p>
              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {problems.slice(0, 200).map((p) => (
                      <tr key={p.row} className="border-b border-border last:border-0">
                        <td className="w-16 px-3 py-1.5 font-mono text-xs text-muted-foreground">#{p.row}</td>
                        <td className="px-3 py-1.5 font-medium">{p.name || '—'}</td>
                        <td className="px-3 py-1.5 text-destructive">{p.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">{t('Left out, so nothing is counted twice:')}</p>
              <div className="max-h-48 overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {skipped.slice(0, 200).map((p) => (
                      <tr key={p.row} className="border-b border-border last:border-0">
                        <td className="w-16 px-3 py-1.5 font-mono text-xs text-muted-foreground">#{p.row}</td>
                        <td className="px-3 py-1.5 font-medium">{p.name || '—'}</td>
                        <td className="px-3 py-1.5 text-amber-700 dark:text-amber-400">{p.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stage === 'importing' && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress / Math.max(1, rows.length)) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {n(progress)} / {n(rows.length)}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {stage === 'checked' && (
              <button type="button" className="btn h-10" disabled={busy || s.new + s.existing === 0} onClick={() => void run(false)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t('Import')} {n(s.new + s.existing)} {t('rows')}
              </button>
            )}
            {stage === 'done' && (
              <>
                <button type="button" className="btn btn-ghost h-10 border border-border" onClick={() => reset()}>
                  <RotateCcw className="h-4 w-4" /> {t('Import another file')}
                </button>
                <Link to={kind === 'stock' ? '/stock' : '/customers'} className="btn h-10">
                  {t(kind === 'stock' ? 'See the stock' : 'See the customers')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
