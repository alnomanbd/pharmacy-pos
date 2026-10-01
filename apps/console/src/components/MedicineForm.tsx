import { useState, type FormEvent, type ReactNode } from 'react';
import { Save } from 'lucide-react';
import type { CatalogueMedicine, CatalogueRef, MedicineInput } from '../api';
import { Spinner } from '@dawai/shared/components/Spinner';
import Modal from './Modal';
import RefPicker from './RefPicker';
import { BTN_SECONDARY, errorMessage } from '../lib/ui';

/** What a shop's request can fill in before the operator has touched anything. */
export interface MedicinePrefill {
  brandName?: string;
  genericName?: string;
  companyName?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
}

/**
 * One catalogue medicine, added or corrected, in a panel from the right.
 *
 * Mounted only while open, so every opening starts from the row (or the
 * request) it was opened for rather than from whatever was typed last time.
 */
export default function MedicineForm({
  title,
  initial,
  prefill,
  dosageForms,
  submitLabel = 'Save',
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  initial?: CatalogueMedicine | null;
  prefill?: MedicinePrefill;
  dosageForms: string[];
  submitLabel?: string;
  onSubmit: (input: MedicineInput) => Promise<void>;
  onClose: () => void;
  /** Shown above the form — the approve flow puts its catalogue matches here. */
  children?: ReactNode;
}) {
  const [f, setF] = useState({
    brandName: initial?.brandName ?? prefill?.brandName ?? '',
    genericName: initial?.genericName ?? prefill?.genericName ?? '',
    strength: initial?.strength ?? prefill?.strength ?? '',
    dosageForm: initial?.dosageForm ?? prefill?.dosageForm ?? '',
    packSize: initial?.packSize ?? prefill?.packSize ?? '',
    price: initial?.price != null ? String(initial.price) : '',
    dar: initial?.dar ?? '',
    description: initial?.description ?? '',
    indications: initial?.indications ?? '',
    sideEffects: initial?.sideEffects ?? '',
    isActive: initial?.isActive ?? true,
  });
  const [company, setCompany] = useState<CatalogueRef | null>(initial?.company ?? null);
  const [generic, setGeneric] = useState<CatalogueRef | null>(initial?.generic ?? null);
  const [group, setGroup] = useState<CatalogueRef | null>(initial?.group ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const priceValue = f.price.trim() === '' ? null : Number(f.price);
  const priceBad = priceValue !== null && (!Number.isFinite(priceValue) || priceValue < 0);
  const valid = f.brandName.trim().length > 0 && f.genericName.trim().length > 0 && !priceBad;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        brandName: f.brandName.trim(),
        genericName: f.genericName.trim(),
        strength: f.strength.trim(),
        dosageForm: f.dosageForm.trim(),
        packSize: f.packSize.trim(),
        price: priceValue,
        dar: f.dar.trim(),
        description: f.description.trim(),
        indications: f.indications.trim(),
        sideEffects: f.sideEffects.trim(),
        companyId: company?._id ?? null,
        genericId: generic?._id ?? null,
        groupId: group?._id ?? null,
        isActive: f.isActive,
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not save that medicine.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      side
      width="max-w-xl"
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={!valid || busy} onClick={() => void submit()}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} {submitLabel}
          </button>
        </>
      }
    >
      {children}
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => void submit(e)}>
        <label className="label sm:col-span-2">
          Brand name *
          <input
            className="input mt-1"
            value={f.brandName}
            onChange={set('brandName')}
            maxLength={160}
            autoFocus
          />
        </label>

        <div className="sm:col-span-2">
          <RefPicker
            kind="generics"
            label="Generic"
            value={generic}
            allowCreate
            initialQuery={initial ? '' : prefill?.genericName ?? ''}
            onChange={(ref) => {
              // The name follows the generic picked, unless it was typed
              // differently on purpose.
              const untouched =
                !f.genericName.trim() ||
                f.genericName === generic?.name ||
                f.genericName === prefill?.genericName;
              if (ref && untouched) setF((prev) => ({ ...prev, genericName: ref.name }));
              setGeneric(ref);
            }}
          />
        </div>
        <label className="label sm:col-span-2">
          Generic name *
          <input
            className="input mt-1"
            value={f.genericName}
            onChange={set('genericName')}
            maxLength={200}
          />
        </label>

        <label className="label">
          Strength
          <input className="input mt-1" value={f.strength} onChange={set('strength')} placeholder="500 mg" />
        </label>
        <label className="label">
          Dosage form
          <input
            className="input mt-1"
            value={f.dosageForm}
            onChange={set('dosageForm')}
            list="dosage-forms"
            placeholder="Tablet"
          />
          <datalist id="dosage-forms">
            {dosageForms.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className="label">
          Pack size
          <input className="input mt-1" value={f.packSize} onChange={set('packSize')} placeholder="10 x 10" />
        </label>
        <label className="label">
          Price (BDT)
          <input
            className="input mt-1"
            value={f.price}
            onChange={set('price')}
            inputMode="decimal"
            placeholder="Per unit"
            aria-invalid={priceBad}
          />
          {priceBad && <span className="mt-0.5 block text-[11px] text-destructive">Not a price.</span>}
        </label>

        <RefPicker
          kind="companies"
          label="Company"
          value={company}
          allowCreate
          initialQuery={initial ? '' : prefill?.companyName ?? ''}
          onChange={setCompany}
        />
        <RefPicker kind="groups" label="Group" value={group} allowCreate onChange={setGroup} />

        <label className="label sm:col-span-2">
          DAR no.
          <input className="input mt-1" value={f.dar} onChange={set('dar')} />
        </label>
        <label className="label sm:col-span-2">
          Description
          <textarea className="input mt-1" rows={2} value={f.description} onChange={set('description')} />
        </label>
        <label className="label sm:col-span-2">
          Indications
          <textarea className="input mt-1" rows={2} value={f.indications} onChange={set('indications')} />
        </label>
        <label className="label sm:col-span-2">
          Side effects
          <textarea className="input mt-1" rows={2} value={f.sideEffects} onChange={set('sideEffects')} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            style={{ width: 16 }}
            checked={f.isActive}
            onChange={(e) => setF((prev) => ({ ...prev, isActive: e.target.checked }))}
          />
          Active — shops can find it
        </label>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        )}
        {/* Enter in a field submits. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
