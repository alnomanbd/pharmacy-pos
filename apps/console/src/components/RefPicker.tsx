import { useEffect, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { platformApi, type CatalogueRef, type RefKind } from '../api';
import { Spinner } from '@dawai/shared/components/Spinner';
import { useToast } from '@dawai/shared/components/Toast';
import { errorMessage, useDebounced } from '../lib/ui';

/**
 * A company, generic or group, found by typing — there are thousands of each,
 * so a select would be useless — with "Add" for one the catalogue lacks.
 */
export default function RefPicker({
  kind,
  label,
  value,
  onChange,
  allowCreate = false,
  initialQuery = '',
  placeholder = 'Search…',
  compact = false,
}: {
  kind: RefKind;
  label: string;
  value: CatalogueRef | null;
  onChange: (ref: CatalogueRef | null) => void;
  allowCreate?: boolean;
  /** Typed in already, unconfirmed — what a shop asked for, say. */
  initialQuery?: string;
  placeholder?: string;
  /** For a filter bar: no label above it. */
  compact?: boolean;
}) {
  const { toast } = useToast();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value?.name ?? initialQuery);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CatalogueRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Follow a value set from outside (a form reset, a row opened for edit).
  useEffect(() => {
    if (value) setText(value.name);
  }, [value]);

  // While the box still shows the picked name, list everything rather than
  // just that one.
  const query = useDebounced(value && text === value.name ? '' : text.trim(), 250);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    platformApi
      .catalogueRefs(kind, { q: query || undefined, limit: 8 })
      .then((res) => live && setResults(res.data ?? []))
      .catch(() => live && setResults([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [kind, query, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (value) setText(value.name);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, value]);

  const pick = (ref: CatalogueRef) => {
    onChange(ref);
    setText(ref.name);
    setOpen(false);
  };

  const typed = text.trim();
  const exact = results.some((r) => r.name.toLowerCase() === typed.toLowerCase());
  const offerCreate = allowCreate && typed.length > 0 && !exact && !(value && typed === value.name);

  const create = async () => {
    setCreating(true);
    try {
      const ref = await platformApi.createRef(kind, typed);
      toast(`${ref.name} added.`);
      pick(ref);
    } catch (e) {
      toast(errorMessage(e, 'Could not add that.'), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      {!compact && <span className="label">{label}</span>}
      <div className="relative">
        <input
          className="input pr-8"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (!e.target.value && value) onChange(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter') {
              e.preventDefault();
              if (results[0] && typed) pick(results[0]);
            }
          }}
        />
        {(value || text) && (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              setText('');
              onChange(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!compact && !value && typed && !open && (
        <span className="mt-1 block text-[11px] text-orange-600">Not picked — choose one or add it.</span>
      )}
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {loading && results.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Spinner /> Searching…
            </div>
          ) : (
            results.map((r) => (
              <button
                type="button"
                role="option"
                aria-selected={value?._id === r._id}
                key={r._id}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  value?._id === r._id ? 'bg-secondary' : ''
                }`}
                onClick={() => pick(r)}
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {typeof r.count === 'number' && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">{r.count}</span>
                )}
              </button>
            ))
          )}
          {!loading && results.length === 0 && !offerCreate && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No match.</div>
          )}
          {offerCreate && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-primary hover:bg-muted disabled:opacity-50"
              disabled={creating}
              onClick={() => void create()}
            >
              {creating ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
              <span className="min-w-0 truncate">Add “{typed}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
