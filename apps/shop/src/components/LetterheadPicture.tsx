import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { letterheadApi, type LetterheadSlot } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { useT } from '../i18n/ui';

/**
 * One picture on the A4 sheet — the logo, or the shop's letterhead header or
 * footer — with what is there now, and the two things done about it.
 *
 * Uploaded the moment it is chosen rather than with the Save bar: a picture
 * is a file, not a setting, and the preview beside the form shows it at once.
 */
export default function LetterheadPicture({
  slot,
  label,
  hint,
  present,
  onChanged,
}: {
  slot: LetterheadSlot;
  label: string;
  hint?: string;
  /** Whether the shop has one stored. */
  present: boolean;
  onChanged: (present: boolean) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!present) {
      setUrl(null);
      return;
    }
    let live = true;
    let made: string | null = null;
    letterheadApi
      .picture(slot)
      .then((blob) => {
        if (!live || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [slot, present]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast(t('A PNG, JPEG or WebP picture, please.'), 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(t('That picture is over 5 MB — a smaller scan will do.'), 'error');
      return;
    }
    setBusy(true);
    try {
      await letterheadApi.upload(slot, file);
      setUrl(null);
      onChanged(true);
      toast(t('Picture saved.'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg || t('Could not upload that picture.'), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await letterheadApi.remove(slot);
      onChanged(false);
    } catch {
      toast(t('Could not remove that picture.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </div>
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {present && url ? (
        <div className="mb-2 grid h-20 place-items-center overflow-hidden rounded-lg border border-border bg-white">
          <img src={url} alt={label} className="max-h-20 max-w-full object-contain" />
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="mb-2 flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary"
        >
          <ImagePlus className="h-5 w-5" /> {t('Choose a picture')}
        </button>
      )}
      {present && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} className="btn btn-ghost h-8 flex-1 text-xs" onClick={() => input.current?.click()}>
            <RefreshCw className="h-3.5 w-3.5" /> {t('Replace')}
          </button>
          <button type="button" disabled={busy} className="btn btn-ghost h-8 flex-1 text-xs text-destructive" onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" /> {t('Remove')}
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
    </div>
  );
}
