import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, Info } from 'lucide-react';
import api, { getData } from '@dawai/shared/api/client';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT } from '../i18n/ui';

type Info = {
  medicine: { brand: string; strength: string; form: string; packSize: string; price: number | null; dar: string; company: string } | null;
  generic: { name: string; drugClass: string; sections: Record<string, string>; source: string } | null;
} | null;

/** In the order a pharmacist reaches for them; the first four open. */
const SECTIONS: { key: string; label: string; open?: boolean }[] = [
  { key: 'indications', label: 'What it is for', open: true },
  { key: 'dosage', label: 'Dose', open: true },
  { key: 'sideEffects', label: 'Side effects', open: true },
  { key: 'contraindications', label: 'Who should not take it', open: true },
  { key: 'interactions', label: 'With other medicines' },
  { key: 'pregnancy', label: 'Pregnancy and breastfeeding' },
  { key: 'precautions', label: 'Precautions' },
  { key: 'pediatric', label: 'Children' },
  { key: 'administration', label: 'How to take it' },
  { key: 'overdose', label: 'Overdose' },
  { key: 'storage', label: 'Storage' },
  { key: 'reconstitution', label: 'Mixing before use' },
  { key: 'pharmacology', label: 'How it works' },
  { key: 'therapeuticClass', label: 'Drug group' },
];

/**
 * A product as a medicine: what it is for, the dose, side effects, who should
 * not take it — its generic's write-up from the catalogue, for answering a
 * customer at the counter. The text is the source's own, in English.
 */
export default function MedicineInfo({ productId }: { productId: string }) {
  const t = useT();
  const [info, setInfo] = useState<Info | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getData<Info>(api.get(`/shop/products/${productId}/medicine-info`))
      .then((d) => live && setInfo(d))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [productId]);

  if (info === undefined) return <LoadingBlock />;
  const sections = SECTIONS.filter((s) => info?.generic?.sections[s.key]);
  if (!info || (!info.medicine && !sections.length)) {
    return (
      <div className="empty">
        <Info className="h-5 w-5" />
        <p>{t('No medicine information for this item. Link it to the catalogue from Edit to see it.')}</p>
      </div>
    );
  }

  const m = info.medicine;
  const g = info.generic;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        {m && (
          <div className="font-semibold">
            {m.brand} {m.strength} <span className="font-normal text-muted-foreground">{m.form}</span>
          </div>
        )}
        {g && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span>{g.name}</span>
            {g.drugClass && <span className="pill">{g.drugClass}</span>}
          </div>
        )}
        {m && (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            {m.company && <span>{m.company}</span>}
            {m.packSize && <span>{m.packSize}</span>}
            {m.dar && (
              <span>
                {t('DAR')} {m.dar}
              </span>
            )}
          </div>
        )}
      </div>

      {sections.length > 0 ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {sections.map((s) => (
            <details key={s.key} open={s.open} className="group px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
                {t(s.label)}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/90" lang="en">
                {g!.sections[s.key]}
              </p>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('The catalogue has no write-up for this generic yet.')}</p>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <BookOpen className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          {t('For reference at the counter — check the pack insert, and send the customer to a doctor when unsure.')}
          {g?.source ? ` ${t('Source')}: ${g.source}.` : ''} {t('The text is in English, as published.')}
        </span>
      </p>
    </div>
  );
}
