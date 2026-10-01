import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { shopApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';

/**
 * The button that hands a screen over as a file.
 *
 * On four screens rather than on a page of its own, because the export nobody
 * can find is the export somebody does by hand into a spreadsheet instead. It
 * always exports what is being looked at — the register carries the range the
 * screen is showing — so the file matches the screen it came from, which is the
 * only way somebody can check one against the other.
 */
export default function ExportCsv({
  what,
  params,
  label,
}: {
  what: 'sales' | 'stock' | 'suppliers' | 'customers';
  params?: Record<string, string>;
  label?: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await shopApi.exportCsv(what, params);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || 'Could not make that file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-ghost h-9"
      disabled={busy}
      onClick={() => void run()}
      title={t('Opens in Excel')}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {t(label ?? 'Export')}
    </button>
  );
}
