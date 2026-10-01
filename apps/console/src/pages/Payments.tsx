import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  X,
  Receipt,
  Building2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { platformApi, fileObjectUrl, downloadBlob } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import type { Payment } from '@dawai/shared/types';

/**
 * Money the shops say they have sent.
 *
 * Verifying is a human act on purpose — somebody opens the receiving account,
 * finds the transaction, and accepts it. So the row carries everything needed to
 * do that without leaving the page: the amount, the number it came from, the
 * transaction id and the screenshot. Accepting extends the subscription.
 */

const PAGE_SIZE = 25;

const STATUS_CLS: Record<Payment['status'], string> = {
  pending: 'waiting',
  verified: 'completed',
  rejected: 'cancelled',
};

const taka = (n: number) => `৳ ${n.toLocaleString('en-BD')}`;
const nameOf = (v: Payment['organization'] | Payment['submittedBy']) =>
  typeof v === 'object' && v ? (v as { name: string }).name : '—';

/** The screenshot is authorised, so it is fetched and shown as an object URL. */
function ReceiptImage({ storageKey }: { storageKey: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let revoked = '';
    void fileObjectUrl(storageKey)
      .then((u) => {
        revoked = u;
        setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [storageKey]);

  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" /> loading receipt...
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="Payment receipt"
        className="mt-2 max-h-48 rounded-lg border border-border"
      />
    </a>
  );
}

export default function Payments() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'pending' | 'verified' | 'rejected' | ''>('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [invoiceBusy, setInvoiceBusy] = useState('');

  const getInvoice = async (id: string) => {
    setInvoiceBusy(id);
    try {
      downloadBlob(await platformApi.paymentInvoice(id), `invoice-${id}.pdf`);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not produce that invoice.', 'error');
    } finally {
      setInvoiceBusy('');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformApi.payments({
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.data);
      setTotal(res.total);
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not load payments.', 'error');
    } finally {
      setLoading(false);
    }
  }, [status, page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const act = async (p: Payment, verify: boolean) => {
    setBusyId(p._id);
    try {
      if (verify) {
        await platformApi.verifyPayment(p._id);
        toast(`${taka(p.amount)} accepted — ${nameOf(p.organization)} extended.`);
      } else {
        await platformApi.rejectPayment(p._id, 'Could not be matched to a received payment');
        toast('Payment rejected.');
      }
      await load();
    } catch (e: any) {
      toast(e?.response?.data?.message || 'Could not update that payment.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>Payments</h1>
          <p className="text-sm text-muted-foreground">
            Check each one against the receiving account before accepting it.
          </p>
        </div>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      <div className="card">
        <h3 className="mb-3">
          {total.toLocaleString()} payment{total === 1 ? '' : 's'}
        </h3>

        {loading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">
            <Receipt className="mx-auto mb-2 h-5 w-5 opacity-60" />
            Nothing waiting.
          </div>
        ) : (
          rows.map((p) => (
            <div className="mt-3 rounded-lg border border-border p-3" key={p._id}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base">{taka(p.amount)}</strong>
                    <span className="text-xs uppercase text-muted-foreground">{p.method}</span>
                    <span className={`pill ${STATUS_CLS[p.status]}`}>{p.status}</span>
                    <span className="pill booked">
                      {p.plan} · {p.months}m
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {nameOf(p.organization)}
                    </span>
                    <span>{nameOf(p.submittedBy)}</span>
                    <span>{new Date(p.createdAt).toLocaleString()}</span>
                  </div>

                  {/* What an operator needs to find it in the account. */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {p.senderNumber && (
                      <span>
                        From <strong className="font-mono">{p.senderNumber}</strong>
                      </span>
                    )}
                    {p.trxId && (
                      <span>
                        TrxID <strong className="font-mono">{p.trxId}</strong>
                      </span>
                    )}
                  </div>
                  {p.note && <div className="mt-1 text-xs italic text-muted-foreground">{p.note}</div>}
                  {p.receipt && <ReceiptImage storageKey={p.receipt} />}
                </div>

                {p.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="btn btn-sm"
                      disabled={busyId === p._id}
                      onClick={() => void act(p, true)}
                    >
                      <Check className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      disabled={busyId === p._id}
                      onClick={() => void act(p, false)}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}

                {/* Once accepted, the row's useful action is the receipt: a
                    shop asking for its invoice asks us, not the app. */}
                {p.status === 'verified' && (
                  <button
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                    disabled={invoiceBusy === p._id}
                    onClick={() => void getInvoice(p._id)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {invoiceBusy === p._id ? 'Preparing...' : p.invoiceNo || 'Invoice'}
                  </button>
                )}
              </div>

              {p.status === 'verified' && p.coversUntil && (
                <div className="mt-2 text-xs text-primary">
                  Paid up to {new Date(p.coversUntil).toLocaleDateString()}
                </div>
              )}
              {p.status === 'rejected' && p.rejectionReason && (
                <div className="mt-2 text-xs text-destructive">{p.rejectionReason}</div>
              )}
            </div>
          ))
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pages}
            </span>
            <div className="flex gap-1">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
