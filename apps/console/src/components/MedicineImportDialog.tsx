import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { platformApi, downloadBlob, type MedicineImportReport } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import Modal from './Modal';
import { BTN_OUTLINE, BTN_SECONDARY, errorMessage } from '../lib/ui';
import {
  MEDICINE_COLUMNS,
  applyMapping,
  guessMapping,
  readSpreadsheet,
  toCsv,
  type MedicineColumn,
  type SheetRow,
} from '../lib/spreadsheet';

/**
 * Loading medicines into the shared catalogue from a spreadsheet.
 *
 * Three deliberate steps, because a bulk write to the catalogue every shop
 * stocks from is not something to do blind:
 *
 *   1. **Map** — the file's columns are matched to ours, by name or by alias;
 *      anything unmatched is picked from a list, so a company's own product
 *      list does not have to be reshaped in Excel first.
 *   2. **Preview** — a dry run over every row says what *would* happen, and
 *      which companies, generics and groups the file would create. Nothing is
 *      written.
 *   3. **Import** — the same rows again, for real, with a progress bar. Rows
 *      that fail come back as a CSV to fix and import on their own.
 *
 * An import never deletes: a medicine missing from the file is left as it is.
 */

/** At most this many rows, and about this many bytes, per request — the API takes 1000 rows and 1 MB. */
const MAX_BATCH_ROWS = 500;
const MAX_BATCH_BYTES = 600_000;

const REQUIRED: MedicineColumn[] = ['brandName', 'genericName'];

const emptyReport = (): MedicineImportReport => ({
  received: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  failed: [],
  newCompanies: [],
  newGenerics: [],
  newGroups: [],
});

function mergeReports(a: MedicineImportReport, b: MedicineImportReport): MedicineImportReport {
  return {
    received: a.received + b.received,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    failed: [...a.failed, ...b.failed],
    // A company named in two batches is still one new company.
    newCompanies: [...new Set([...a.newCompanies, ...b.newCompanies])],
    newGenerics: [...new Set([...a.newGenerics, ...b.newGenerics])],
    newGroups: [...new Set([...a.newGroups, ...b.newGroups])],
  };
}

/** Rows cut into requests the API will take: by count, and by size — indications run long. */
export function batches(rows: SheetRow[]): SheetRow[][] {
  const out: SheetRow[][] = [];
  let current: SheetRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length * 3; // worst case: every character is Bangla
    if (current.length && (current.length >= MAX_BATCH_ROWS || bytes + size > MAX_BATCH_BYTES)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length) out.push(current);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function MedicineImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<MedicineColumn, number> | null>(null);
  const [ignoreIds, setIgnoreIds] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<MedicineImportReport | null>(null);
  const [result, setResult] = useState<MedicineImportReport | null>(null);

  const pick = async (file: File) => {
    setPreview(null);
    setResult(null);
    setBusy(true);
    try {
      const sheet = await readSpreadsheet(file);
      setFileName(file.name);
      setHeaders(sheet.headers);
      setMatrix(sheet.matrix);
      setMapping(guessMapping(sheet.headers));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** The whole file through the API, batch by batch. */
  const run = async (dryRun: boolean) => {
    if (!mapping) return;
    const parts = batches(applyMapping(matrix, mapping));
    setBusy(true);
    setProgress(0);
    let total = emptyReport();
    let done = 0;
    try {
      for (const part of parts) {
        total = mergeReports(total, await platformApi.importMedicines(part, { dryRun, ignoreIds }));
        done += part.length;
        setProgress(Math.round((done / matrix.length) * 100));
      }
      if (dryRun) {
        setPreview(total);
      } else {
        setResult(total);
        toast(`${total.created.toLocaleString()} added, ${total.updated.toLocaleString()} updated.`);
        onImported();
      }
    } catch (e) {
      // A real run that stops part way has written the batches before it.
      toast(
        errorMessage(e, dryRun ? 'The preview failed.' : `The import stopped after ${done.toLocaleString()} rows. Those are saved; import the rest again.`),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const downloadFailures = (report: MedicineImportReport) => {
    const rows = applyMapping(matrix, mapping!);
    const byLine = new Map(rows.map((r) => [r._line, r]));
    const failed = report.failed.map((f) => ({ ...(byLine.get(f.line) ?? { brandName: f.brandName }), error: f.reason }));
    downloadBlob(
      new Blob([toCsv([...MEDICINE_COLUMNS, 'error'], failed as Record<string, unknown>[])], { type: 'text/csv;charset=utf-8' }),
      'import-errors.csv',
    );
  };

  const missingRequired = mapping ? REQUIRED.filter((c) => mapping[c] < 0) : [];
  const idsFailing = (preview?.failed ?? []).filter((f) => /is not in this catalogue/.test(f.reason)).length;
  const reset = () => {
    setMapping(null);
    setPreview(null);
  };

  const footer = result ? (
    <button className="btn" onClick={onClose}>
      Done
    </button>
  ) : mapping ? (
    <>
      <button className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button className={BTN_OUTLINE} onClick={() => void run(true)} disabled={busy || missingRequired.length > 0}>
        Preview
      </button>
      <button
        className="btn"
        onClick={() => void run(false)}
        disabled={busy || missingRequired.length > 0 || !preview}
        title={!preview ? 'Run a preview first' : undefined}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import {plural(matrix.length, 'row')}
      </button>
    </>
  ) : (
    <button className={BTN_SECONDARY} onClick={onClose}>
      Cancel
    </button>
  );

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title="Import medicines" width="max-w-3xl" footer={footer}>
      {/* ---------- 1. the file ---------- */}
      {!mapping && (
        <>
          <button
            type="button"
            className="block w-full rounded-xl border border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin text-muted-foreground" />
            ) : (
              <FileSpreadsheet className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            )}
            <span className="block text-sm font-semibold">Choose a CSV or Excel (.xlsx) file</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Export the catalogue, change or add rows in Excel, and import it back. Medicines already in the catalogue are
              updated, not duplicated, and nothing is deleted.
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            onClick={() =>
              void platformApi
                .medicineTemplate()
                .then((b) => downloadBlob(b, 'medicine-import-template.csv'))
                .catch(() => toast('Could not download the template.', 'error'))
            }
          >
            <Download className="h-4 w-4" /> Download the blank template
          </button>
        </>
      )}

      {/* ---------- 2. columns, and the preview ---------- */}
      {mapping && !result && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <strong className="min-w-0 break-all">{fileName}</strong>
            <span className="text-muted-foreground">{plural(matrix.length, 'row')}</span>
            <button type="button" className="ml-auto text-xs font-semibold text-primary hover:underline" onClick={reset} disabled={busy}>
              Choose another file
            </button>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Which column is which</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MEDICINE_COLUMNS.map((col) => (
                <label key={col} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 text-xs font-semibold">
                    {col}
                    {REQUIRED.includes(col) && <span className="text-destructive"> *</span>}
                  </span>
                  <select
                    className="input min-w-0"
                    value={mapping[col]}
                    onChange={(e) => {
                      setMapping({ ...mapping, [col]: Number(e.target.value) });
                      setPreview(null);
                    }}
                    disabled={busy}
                  >
                    <option value={-1}>— not in file —</option>
                    {headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `(column ${i + 1})`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Choose the {missingRequired.join(' and ')} column before going on.
              </p>
            )}
          </div>

          {mapping.id >= 0 && (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={ignoreIds}
                onChange={(e) => {
                  setIgnoreIds(e.target.checked);
                  setPreview(null);
                }}
                disabled={busy}
              />
              <span>
                This file came from another server
                <span className="block text-xs text-muted-foreground">
                  Its ids mean nothing here, so each row is matched by brand, strength, company and form instead.
                </span>
              </span>
            </label>
          )}

          {busy && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}

          {preview && !busy && (
            <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="mb-2 font-semibold">Nothing has been saved yet. This import would:</p>
              <ul className="space-y-1">
                <li>
                  add <strong>{plural(preview.created, 'new medicine')}</strong>
                </li>
                <li>
                  update <strong>{plural(preview.updated, 'medicine')}</strong> already in the catalogue
                </li>
                <li>
                  leave <strong>{preview.unchanged.toLocaleString()}</strong> unchanged
                </li>
                {preview.failed.length > 0 && (
                  <li className="text-destructive">
                    skip <strong>{plural(preview.failed.length, 'row')}</strong> with errors
                  </li>
                )}
              </ul>
              {(preview.newCompanies.length > 0 || preview.newGenerics.length > 0 || preview.newGroups.length > 0) && (
                <p className="mt-2 break-words text-xs text-muted-foreground">
                  It also adds {plural(preview.newCompanies.length, 'company', 'companies')}, {plural(preview.newGenerics.length, 'generic')}{' '}
                  and {plural(preview.newGroups.length, 'group')}
                  {preview.newCompanies.length > 0 && <> — such as {preview.newCompanies.slice(0, 3).join(', ')}</>}.
                </p>
              )}
              {idsFailing > 0 && !ignoreIds && (
                <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {plural(idsFailing, 'row has', 'rows have')} an id this catalogue does not know. If the file came from another server, tick
                  the box above and preview again.
                </p>
              )}
              {preview.failed.length > 0 && (
                <div className="mt-2">
                  <p className="break-words text-xs text-destructive">
                    First error: line {preview.failed[0].line} — {preview.failed[0].reason}
                  </p>
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    onClick={() => downloadFailures(preview)}
                  >
                    <Download className="h-3.5 w-3.5" /> Download the {plural(preview.failed.length, 'failing row')}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- 3. done ---------- */}
      {result && (
        <div className="text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Import complete
          </p>
          <ul className="space-y-1">
            <li>
              <strong>{plural(result.created, 'medicine')}</strong> added
            </li>
            <li>
              <strong>{result.updated.toLocaleString()}</strong> updated
            </li>
            <li>
              <strong>{result.unchanged.toLocaleString()}</strong> already up to date
            </li>
            {result.failed.length > 0 && (
              <li className="text-destructive">
                <strong>{plural(result.failed.length, 'row')}</strong> skipped
              </li>
            )}
          </ul>
          {result.failed.length > 0 && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              onClick={() => downloadFailures(result)}
            >
              <Download className="h-3.5 w-3.5" /> Download the failing rows to fix and import again
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
