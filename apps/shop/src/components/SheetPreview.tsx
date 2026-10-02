import { useEffect, useRef, useState } from 'react';
import { Loader2, Maximize2 } from 'lucide-react';
import { api } from '../api';
import { useLangStore } from '@dawai/shared/i18n/lang';
import type { ShopSettings } from '../api';
import { useT } from '../i18n/ui';

/**
 * The A4 sheet, beside the form, as it will print.
 *
 * Not an HTML copy of it: the sheet is drawn by the server, and a copy here
 * would drift from it the first time either changed. So the server draws it
 * from what is typed — saved or not — and pdf.js paints the first page onto a
 * canvas, which works the same on a phone, where a PDF in a frame does not.
 * Redrawn a moment after typing stops, with the old page kept on screen
 * meanwhile so it never flashes blank.
 */

type Draft = Pick<ShopSettings, 'shopName' | 'address' | 'phone' | 'drugLicenceNo' | 'vatBin' | 'printBangla' | 'invoice'>;

/* Loaded on first use only: pdf.js is the heaviest thing the shop app carries,
   and only this screen needs it. */
let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null;
const loadPdfjs = () =>
  (pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  }));

/** What the server draws the sheet from: the typed shop details and the letterhead's look. */
export const draftBody = (draft: Draft) => ({
  shopName: draft.shopName ?? '',
  address: draft.address ?? '',
  phone: draft.phone ?? '',
  drugLicenceNo: draft.drugLicenceNo ?? '',
  vatBin: draft.vatBin ?? '',
  printBangla: !!draft.printBangla,
  ...(draft.invoice ? { invoice: draft.invoice } : {}),
});

/**
 * The alignment page for a pre-printed pad: the printable area outlined, with
 * its measurements, opened to print on plain paper and hold against a pad.
 */
export async function openAlignmentPage(draft: Draft, lang: string) {
  const tab = window.open('', '_blank');
  try {
    const res = await api.post('/shop/invoice/preview.pdf', draftBody(draft), {
      responseType: 'blob',
      params: { lang, align: '1' },
    });
    const url = URL.createObjectURL(res.data as Blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

export default function SheetPreview({ draft, version = 0 }: { draft: Draft; version?: number }) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paper, setPaper] = useState<'A4' | 'A5'>(draft.invoice?.paper ?? 'A4');

  const key = JSON.stringify(draft);
  useEffect(() => {
    /* Half a colour code while somebody types it is not a colour; wait for the rest. */
    const accent = draft.invoice?.accent;
    if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) return;
    let live = true;
    const tick = window.setTimeout(async () => {
      setBusy(true);
      try {
        const body = draftBody(draft);
        const res = await api.post('/shop/invoice/preview.pdf', body, { responseType: 'arraybuffer', params: { lang } });
        if (!live) return;
        const bytes = new Uint8Array(res.data as ArrayBuffer);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

        const lib = await loadPdfjs();
        const doc = await lib.getDocument({ data: bytes.slice() }).promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        const box = boxRef.current;
        if (!live || !canvas || !box) return;
        const base = page.getViewport({ scale: 1 });
        /* Sharp on a phone's screen: drawn at the device's pixel density. */
        const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
        const scale = (box.clientWidth / base.width) * ratio;
        const vp = page.getViewport({ scale });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        setPaper(draft.invoice?.paper ?? 'A4');
        setFailed(false);
        void doc.destroy();
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setBusy(false);
      }
    }, 500);
    return () => {
      live = false;
      window.clearTimeout(tick);
    };
    // `key` stands for the whole draft; `version` changes when a picture does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang, version]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return (
    <div>
      <div ref={boxRef} className="relative mx-auto w-full max-w-[420px]">
        <canvas
          ref={canvasRef}
          className={`block h-auto w-full rounded-sm bg-white shadow-md transition-opacity ${busy ? 'opacity-60' : ''}`}
          style={{ aspectRatio: paper === 'A5' ? '148 / 210' : '210 / 297' }}
          aria-label={t('The A4 sheet, as it will print')}
        />
        {busy && (
          <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-card shadow">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </span>
        )}
        {failed && !busy && (
          <p className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-lg bg-card p-3 text-center text-xs text-muted-foreground shadow">
            {t('Could not draw the sheet just now.')}
          </p>
        )}
      </div>
      <button
        type="button"
        className="btn btn-ghost mt-3 h-9 w-full"
        disabled={busy || failed}
        onClick={() => urlRef.current && window.open(urlRef.current, '_blank')}
      >
        <Maximize2 className="h-4 w-4" /> {t('Open full size')}
      </button>
    </div>
  );
}
