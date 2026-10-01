import { useCallback, useEffect, useState } from 'react';
import { Check, X, Link2, Store, User as UserIcon, Clock } from 'lucide-react';
import {
  platformApi,
  type CatalogueMedicine,
  type MedicineInput,
  type MedicineRequest,
  type MedicineRequestStatus,
} from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock, Spinner } from '@dawai/shared/components/Spinner';
import MedicineForm from '../components/MedicineForm';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import {
  BTN_OUTLINE,
  BTN_OUTLINE_DANGER,
  BTN_SECONDARY,
  BTN_DANGER,
  age,
  can,
  errorMessage,
  useAccess,
} from '../lib/ui';
import { medicineLabel, taka } from './Medicines';

/**
 * Medicines shops asked for that the catalogue does not have.
 *
 * Approving is either adding the medicine (the form comes up filled from the
 * request) or noticing it is already there under a slightly different name and
 * linking to that row — which is why the likely matches are shown first.
 */

const PAGE_SIZE = 25;

const STATUSES: { key: MedicineRequestStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'added', label: 'Added' },
  { key: 'rejected', label: 'Rejected' },
];

const nameOf = (v: { name?: string } | string | null | undefined, fallback = '—') =>
  v && typeof v === 'object' ? v.name || fallback : fallback;

export default function MedicineRequests() {
  const { toast } = useToast();
  const access = useAccess();
  const canManage = can(access, 'catalogue.manage');
  const [status, setStatus] = useState<MedicineRequestStatus>('pending');
  const [rows, setRows] = useState<MedicineRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<MedicineRequest | null>(null);
  const [rejecting, setRejecting] = useState<MedicineRequest | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [dosageForms, setDosageForms] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformApi.medicineRequests({ status, page, limit: PAGE_SIZE });
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast(errorMessage(e, 'Could not load the requests.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [status, page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    platformApi
      .dosageForms()
      .then((list) => setDosageForms(list ?? []))
      .catch(() => setDosageForms([]));
  }, []);

  const approve = async (req: MedicineRequest, body: { medicineId: string } | { medicine: MedicineInput }) => {
    await platformApi.approveMedicineRequest(req._id, body);
    toast(`${req.brandName} added — ${nameOf(req.organization, 'the shop')} can stock it now.`);
    setApproving(null);
    await load();
  };

  const reject = async () => {
    if (!rejecting || !reason.trim()) return;
    setBusy(true);
    try {
      await platformApi.rejectMedicineRequest(rejecting._id, reason.trim());
      toast(`${rejecting.brandName} rejected.`);
      setRejecting(null);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Could not reject that request.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1>Medicine requests</h1>
          <p className="text-sm text-muted-foreground">What shops asked to have added.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={status === s.key}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${
              status === s.key ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => {
              setStatus(s.key);
              setPage(1);
            }}
          >
            {s.label}
            {status === s.key && !loading && <span className="ml-1.5 tabular-nums">{total}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        {loading && rows.length === 0 ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <div className="empty">
            {status === 'pending' ? 'Nothing waiting.' : 'None yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <RequestRow
                key={r._id}
                req={r}
                canManage={canManage}
                onApprove={() => setApproving(r)}
                onReject={() => {
                  setRejecting(r);
                  setReason('');
                }}
              />
            ))}
          </div>
        )}
        <Pager page={page} total={total} limit={PAGE_SIZE} onPage={setPage} />
      </div>

      {approving && (
        <MedicineForm
          title={`Add ${approving.brandName}`}
          prefill={approving}
          dosageForms={dosageForms}
          submitLabel="Add & approve"
          onClose={() => setApproving(null)}
          onSubmit={(medicine) => approve(approving, { medicine })}
        >
          <Matches req={approving} onLink={(m) => approve(approving, { medicineId: m._id })} />
        </MedicineForm>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.brandName}?` : 'Reject'}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              disabled={!reason.trim() || busy}
              onClick={() => void reject()}
            >
              {busy ? <Spinner /> : <X className="h-4 w-4" />} Reject
            </button>
          </>
        }
      >
        <label className="label">
          Reason
          <textarea
            className="input mt-1"
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Not registered with DGDA"
            autoFocus
          />
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            The shop is told this.
          </span>
        </label>
      </Modal>
    </div>
  );
}

function RequestRow({
  req,
  canManage,
  onApprove,
  onReject,
}: {
  req: MedicineRequest;
  canManage: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const details: [string, string | undefined][] = [
    ['Generic', req.genericName],
    ['Company', req.companyName],
    ['Strength', req.strength],
    ['Form', req.dosageForm],
    ['Pack', req.packSize],
  ];
  const linked = req.medicine && typeof req.medicine === 'object' ? req.medicine : null;

  return (
    <div className="rounded-lg border border-border p-3" data-testid="request">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <strong className="block break-words">{req.brandName}</strong>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Store className="h-3 w-3" /> {nameOf(req.organization, 'A shop')}
            </span>
            <span className="inline-flex items-center gap-1">
              <UserIcon className="h-3 w-3" /> {nameOf(req.requestedBy)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {age(req.createdAt)}
            </span>
          </div>
        </div>
        {req.status === 'pending' && canManage && (
          <div className="flex shrink-0 gap-1.5">
            <button type="button" className="btn btn-sm" onClick={onApprove}>
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
            <button type="button" className={BTN_OUTLINE_DANGER} onClick={onReject}>
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          </div>
        )}
        {req.status === 'added' && <span className="pill completed">Added</span>}
        {req.status === 'rejected' && <span className="pill noShow">Rejected</span>}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
        {details.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="truncate">{v || '—'}</dd>
          </div>
        ))}
      </dl>

      {req.note && (
        <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">
          <span className="text-muted-foreground">Note: </span>
          {req.note}
        </p>
      )}
      {linked && (
        <p className="mt-2 text-xs text-muted-foreground">
          In the catalogue as <strong className="text-foreground">{medicineLabel(linked)}</strong>
          {req.reviewedAt && ` · ${age(req.reviewedAt)}`}
          {req.reviewedBy && ` · by ${nameOf(req.reviewedBy)}`}
        </p>
      )}
      {req.status === 'rejected' && (
        <p className="mt-2 text-xs text-destructive">
          {req.rejectionReason || 'No reason given'}
          {req.reviewedBy && <span className="text-muted-foreground"> · by {nameOf(req.reviewedBy)}</span>}
        </p>
      )}
    </div>
  );
}

/** Rows already in the catalogue under the brand asked for — link instead of adding a twin. */
function Matches({
  req,
  onLink,
}: {
  req: MedicineRequest;
  onLink: (m: CatalogueMedicine) => Promise<void>;
}) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<CatalogueMedicine[] | null>(null);
  const [linking, setLinking] = useState('');

  useEffect(() => {
    let live = true;
    platformApi
      .catalogueMedicines({ q: req.brandName, limit: 5 })
      .then((res) => live && setMatches(res.data ?? []))
      .catch(() => live && setMatches([]));
    return () => {
      live = false;
    };
  }, [req.brandName]);

  const link = async (m: CatalogueMedicine) => {
    setLinking(m._id);
    try {
      await onLink(m);
    } catch (e) {
      toast(errorMessage(e, 'Could not link that.'), 'error');
      setLinking('');
    }
  };

  return (
    <section className="mb-4 rounded-lg border border-border bg-muted/30 p-3" aria-label="Already in the catalogue">
      <h4 className="mb-2 text-sm font-semibold">Already in the catalogue?</h4>
      {matches === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner /> Looking for “{req.brandName}”…
        </div>
      ) : matches.length === 0 ? (
        <p className="text-xs text-muted-foreground">No match — add it below.</p>
      ) : (
        <ul className="space-y-1.5">
          {matches.map((m) => (
            <li key={m._id} className="flex flex-wrap items-center gap-2 rounded-md bg-card px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{medicineLabel(m)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[m.genericName, m.company?.name, m.packSize, m.price != null ? taka(m.price) : '']
                    .filter(Boolean)
                    .join(' · ')}
                  {!m.isActive && ' · inactive'}
                </span>
              </div>
              <button
                type="button"
                className={BTN_OUTLINE}
                disabled={Boolean(linking)}
                onClick={() => void link(m)}
              >
                {linking === m._id ? <Spinner /> : <Link2 className="h-3.5 w-3.5" />} Link to this
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
