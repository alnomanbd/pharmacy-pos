import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { shopApi } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';
import { confirmAction } from '@dawai/shared/lib/confirm';

/**
 * What each file holds, said before it is made: an export is the shop's books
 * leaving the app, onto whatever computer this is — a slip of the mouse should
 * not be enough for that.
 */
const WHAT: Record<'sales' | 'stock' | 'suppliers' | 'customers', { title: string; message: string }> = {
  sales: {
    title: 'Export the sales register?',
    message: 'Every bill in the dates on screen — amounts, payments and customers — is saved as a file on this computer.',
  },
  stock: {
    title: 'Export the stock list?',
    message: 'Every item with its stock, cost and price is saved as a file on this computer.',
  },
  suppliers: {
    title: 'Export the supplier accounts?',
    message: 'Every supplier with what you owe them is saved as a file on this computer.',
  },
  customers: {
    title: 'Export the khata?',
    message: "Every customer's name, phone and what they owe is saved as a file on this computer.",
  },
};

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
    const ok = await confirmAction({
      title: t(WHAT[what].title),
      message: t(WHAT[what].message),
      confirmLabel: t('Export'),
      icon: 'export',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await shopApi.exportCsv(what, params);
    } catch (e: unknown) {
      const res = (e as { response?: { data?: { message?: string } } }).response;
      toast(res?.data?.message || t('Could not make that file.'), 'error');
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
