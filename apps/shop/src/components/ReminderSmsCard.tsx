import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquareText, RotateCcw, Save } from 'lucide-react';
import { useToast } from '@dawai/shared/components/Toast';
import { confirmAction } from '@dawai/shared/lib/confirm';
import { settingsApi } from '../api';
import { useT, useNumerals } from '../i18n/ui';
import { REMINDER_FIELDS, SAMPLE_REMINDER, reminderMessage, smsParts } from '../lib/reminderSms';

/**
 * The baki reminder SMS, in the shop's own words — Settings.
 *
 * The reminder went out in one fixed line for every shop, and the first thing a
 * shopkeeper asked was where to change it: they know how they speak to their
 * own customers. So they write it here, with blanks for the customer's name and
 * what they owe, and see it filled in for a real-looking customer as they type —
 * with what it costs: how many SMS it takes, and the warning that Bangla script
 * doubles that.
 */

const MAX = 480;
/** Who the preview is written to. */
const SAMPLE = { name: 'Rahim', amount: 1250 };

export default function ReminderSmsCard() {
  const t = useT();
  const { num } = useNumerals();
  const { toast } = useToast();
  const box = useRef<HTMLTextAreaElement>(null);
  const [shop, setShop] = useState<{ name: string; phone: string } | null>(null);
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((s) => {
        setShop({ name: s.shopName ?? '', phone: s.phone ?? '' });
        setSaved(s.reminderTemplate ?? '');
        setText(s.reminderTemplate ?? '');
      })
      .catch(() => setShop({ name: '', phone: '' }));
  }, []);

  const preview = reminderMessage(text, { ...SAMPLE, shop: shop?.name, phone: shop?.phone });
  const cost = smsParts(preview);
  const changed = text.trim() !== saved.trim();

  /** A blank goes in where the cursor is, so the shop can write around it. */
  const insert = (field: string) => {
    const el = box.current;
    const from = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? from;
    const next = (text.slice(0, from) + field + text.slice(to)).slice(0, MAX);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from + field.length, from + field.length);
    });
  };

  const save = async (value: string) => {
    setBusy(true);
    try {
      const s = await settingsApi.save({ reminderTemplate: value.trim() });
      setSaved(s.reminderTemplate ?? '');
      setText(s.reminderTemplate ?? '');
      toast(t('Saved'));
    } catch {
      toast(t('Could not save that.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const useStandard = async () => {
    if (
      saved.trim() &&
      !(await confirmAction({
        title: t('Go back to the standard message?'),
        message: t('What you wrote is removed, and reminders go out in the standard wording again.'),
        confirmLabel: t('Use the standard message'),
        tone: 'danger',
        icon: 'warning',
      }))
    )
      return;
    await save('');
  };

  return (
    <section id="set-reminder" className="card mb-0 scroll-mt-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="mb-0 text-[15px]">{t('Reminder SMS')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('What a customer who owes you gets from “Send a reminder” and “Remind them all” on Customers.')}
          </p>
        </div>
      </div>

      {!shop ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <label className="block text-sm">
            <span className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
              <span>{t('Your message')}</span>
              {!text.trim() && <span className="font-normal">{t('Empty: the standard message goes.')}</span>}
            </span>
            <textarea
              ref={box}
              className="input min-h-[96px] py-2 leading-relaxed"
              value={text}
              maxLength={MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder={SAMPLE_REMINDER}
              aria-describedby="reminder-cost"
            />
          </label>

          {/* The blanks, a tap each — where the cursor is. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">{t('Put in')}:</span>
            {REMINDER_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(f.key)}
                className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold hover:border-primary hover:text-primary"
                title={f.key}
              >
                {t(f.label)} <span className="font-mono text-muted-foreground">{f.key}</span>
              </button>
            ))}
            {!text.trim() && (
              <button
                type="button"
                onClick={() => setText(SAMPLE_REMINDER)}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {t('Start from an example')}
              </button>
            )}
          </div>

          {/* The message as a customer gets it. */}
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {t('How it reads')} — {t('for a customer called')} {SAMPLE.name}, {t('owing')} ৳{num(SAMPLE.amount)}
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/50 px-3.5 py-2.5 text-sm leading-relaxed">
              {preview}
            </div>
            <p id="reminder-cost" className="mt-1.5 text-[11px] text-muted-foreground">
              {num(cost.chars)} {t('characters')} ·{' '}
              <strong className={cost.parts > 1 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'}>
                {num(cost.parts)} SMS
              </strong>{' '}
              {t('for each customer')}
            </p>
            {cost.unicode && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('Bangla letters make it a Unicode SMS: 70 characters each instead of 160, so it costs more — and some keypad phones show boxes. Bangla written in English letters (apnar baki…) avoids both.')}
                </span>
              </p>
            )}
            {!cost.unicode && cost.parts > 1 && (
              <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                {t('Over 160 characters, so every reminder is sent as more than one SMS. Shorter is cheaper.')}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {saved.trim() && (
              <button type="button" className="btn btn-ghost h-9" onClick={() => void useStandard()} disabled={busy}>
                <RotateCcw className="h-4 w-4" /> {t('Use the standard message')}
              </button>
            )}
            <button type="button" className="btn h-9" onClick={() => void save(text)} disabled={busy || !changed}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('Save')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
