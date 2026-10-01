import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Search, UserPlus, X, Loader2 } from 'lucide-react';
import { tillApi, taka, type ShopCustomer } from '../api';
import { useT } from '../i18n/ui';
import CustomerForm from '../components/CustomerForm';

/**
 * Who this bill belongs to.
 *
 * Almost every bill belongs to nobody — somebody walks in, pays, leaves — so
 * **walk-in is the default and stays the default**, and the whole control is one
 * line until somebody says otherwise. That matters at a counter: a field asking
 * for a name on every sale is a field that gets a name typed into it badly, and
 * then the baki khata fills up with people who do not owe anything.
 *
 * When it does belong to somebody, it is almost always a regular the shop
 * already has on the book. So this searches the existing ones first and only
 * offers to write a new name when nothing matched — which is what stops one
 * Kabir Bhai from becoming four.
 */
/**
 * What the counter's F4 key reaches.
 *
 * The till holds no state for this control — whether it is open is the
 * picker's own business — so the key is handed a way in rather than a piece of
 * state to set. It was a ref pointing at nothing before: F4 had been bound
 * since the day the counter was written and had never opened anything.
 */
export interface CustomerPickerHandle {
  open: () => void;
}

const CustomerPicker = forwardRef<
  CustomerPickerHandle,
  {
    customer: ShopCustomer | null;
    name: string;
    phone: string;
    onPick: (c: ShopCustomer | null) => void;
    onType: (patch: { name?: string; phone?: string }) => void;
    /** A due forces a name: money owed by nobody cannot be chased. */
    required: boolean;
  }
>(function CustomerPicker({ customer, name, phone, onPick, onType, required }, handle) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ShopCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);

  /*
   * A due with no name is the one case where the counter is not allowed to
   * carry on, so the picker opens itself rather than waiting to be found — and
   * puts itself away again the moment the bill is paid in full, because it
   * opened on the counter's behalf and not because anybody asked for it.
   */
  useEffect(() => {
    if (required && !customer && !name.trim()) setOpen(true);
    else if (!required && !customer && !name.trim()) setOpen(false);
  }, [required, customer, name]);

  useEffect(() => {
    if (!open) return;
    boxRef.current?.focus();
  }, [open]);

  useImperativeHandle(handle, () => ({
    open: () => {
      setOpen(true);
      /* Already open: the key means "put me in the box", not "open it again". */
      boxRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        setHits(await tillApi.customers(q.trim()));
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open]);

  const walkIn = !customer && !name.trim();

  const done = () => {
    setAdding(false);
    setOpen(false);
    setQ('');
  };

  const clear = () => {
    onPick(null);
    onType({ name: '', phone: '' });
    setQ('');
  };

  if (!open) {
    return (
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary"
        >
          <span className="min-w-0 truncate">
            {walkIn ? (
              <span className="text-muted-foreground">{t('Walk-in customer')}</span>
            ) : (
              <>
                <span className="font-semibold">{customer?.name ?? name}</span>
                {(customer?.phone || phone) && (
                  <span className="text-muted-foreground"> · {customer?.phone || phone}</span>
                )}
                {customer && customer.balance > 0 && (
                  <span className="text-destructive"> · {taka(customer.balance)} {t('owed')}</span>
                )}
              </>
            )}
          </span>
          <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {/*
          Taking the name off again, in one tap.
          
          It used to be reachable only by opening the picker, and then only when
          the bill was paid — so a name put on a bill by mistake could not be
          removed while any money was still owing, which is exactly when it is
          put on by mistake. Whether the bill can be *saved* without a name is a
          question for the save button, not for this control.
        */}
        {!walkIn && (
          <button
            type="button"
            onClick={clear}
            aria-label={t('Walk-in customer')}
            title={t('Back to a walk-in customer')}
            className="rounded-md border border-border px-2 text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={boxRef}
            className="input h-9 pl-8"
            placeholder={t('Name or phone…')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQ('');
          }}
          aria-label={t('Close')}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/*
        The default, always in reach.

        Offered even mid-search, because the most common correction at a counter
        is "no, never mind, they are just paying" — and it has to be one tap
        rather than clearing a field.
      */}
      {(!required || !walkIn) && (
        <button
          type="button"
          onClick={() => {
            clear();
            setOpen(false);
          }}
          className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
            walkIn ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted'
          }`}
        >
          {t('Walk-in customer')}
        </button>
      )}

      {hits.map((c) => (
        <button
          key={c._id}
          type="button"
          onClick={() => {
            onPick(c);
            onType({ name: c.name, phone: c.phone ?? '' });
            setOpen(false);
            setQ('');
          }}
          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold">{c.name}</span>
            {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
          </span>
          {c.balance > 0 && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
              {taka(c.balance)}
            </span>
          )}
        </button>
      ))}

      {/*
        A new name, in the same form the baki khata uses.

        Offered below the matches rather than instead of them: two Kabirs on
        one street is ordinary, and the one standing at the counter may not be
        the one already on the book. When nothing matched it says so, because
        that is the moment somebody decides to write a new one.
      */}
      <div className="mt-1 border-t border-border pt-2">
        {q.trim().length >= 2 && hits.length === 0 && !busy && (
          <p className="mb-1.5 px-2 text-[11px] text-muted-foreground">
            {t('Nobody on the book by that name.')}
          </p>
        )}
        <button
          type="button"
          className="btn btn-ghost h-9 w-full justify-start"
          onClick={() => setAdding(true)}
        >
          <UserPlus className="h-4 w-4" /> {t('Add a new customer')}
        </button>
      </div>

      {adding && (
        <CustomerForm
          customer={null}
          /* What was typed into the search is carried over, into whichever
             box it looks like it belongs in. */
          initial={/^[\d+\s-]+$/.test(q.trim()) ? { phone: q.trim() } : { name: q.trim() }}
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            onPick(c);
            onType({ name: c.name, phone: c.phone ?? '' });
            done();
          }}
          onOffline={(draft) => {
            /* No line: the name rides on the bill, and the server puts it on
               the book when the bill syncs — as the counter always has. */
            onPick(null);
            onType(draft);
            done();
          }}
        />
      )}
    </div>
  );
});

export default CustomerPicker;
