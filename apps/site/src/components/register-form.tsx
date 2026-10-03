'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileBadge2,
  KeyRound,
  Loader2,
  Mail,
  Minus,
  MonitorSmartphone,
  Phone,
  Plus,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';
import { siteConfig } from '@/lib/site';
import { translate, tItems, tList, type Lang } from '@/i18n/dictionary';
import { num } from '@/i18n/mock';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { DISTRICTS, DIVISIONS, findDistrict, type Division } from '@/lib/districts';
import { PasswordInput } from '@/components/ui/password-input';
import { cn } from '@/lib/utils';
import { postJson, attribution, referralCode, agentCode } from '@/lib/api';
import type { Plan } from '@/components/plan-cards';

/**
 * The trial sign-up, in three short steps: the shop, the owner, the password.
 *
 * It creates the shop on the Dawai API in `pending`; an operator approves it
 * (usually with a call to set the counters up) and the owner is emailed when
 * it is open — which is what the success screen says. The server's own
 * sentence is shown when it refuses, and a field it complains about sends the
 * form back to the step that holds that field.
 *
 * The counter count is first-class because it is the number the setup call is
 * about: plenty of shops run five to ten billing screens, and the plan card
 * beside it says what that costs before anybody has to ask. Its prices are
 * read from `pricing.plans`, so the pricing page and this card cannot drift.
 */

type Values = {
  shopName: string;
  counters: number;
  outlets: number;
  licence: string;
  district: string;
  yourName: string;
  phone: string;
  email: string;
  password: string;
  confirm: string;
  terms: boolean;
};

type Key = keyof Values;
type Errors = Partial<Record<Key, string>>;

const STEP_FIELDS: Key[][] = [
  ['shopName', 'counters', 'outlets', 'licence', 'district'],
  ['yourName', 'phone', 'email'],
  ['password', 'confirm', 'terms'],
];

/** The API's names for the fields, back to the form's. */
const SERVER_FIELD: Record<string, Key> = {
  organizationName: 'shopName',
  counters: 'counters',
  outlets: 'outlets',
  licence: 'licence',
  district: 'district',
  name: 'yourName',
  phone: 'phone',
  email: 'email',
  password: 'password',
  acceptTerms: 'terms',
};

const FIRST_FIELD = ['r-shop', 'r-name', 'r-password'];
const FIELD_ID: Partial<Record<Key, string>> = {
  shopName: 'r-shop',
  licence: 'r-licence',
  district: 'r-district',
  yourName: 'r-name',
  phone: 'r-phone',
  email: 'r-email',
  password: 'r-password',
  confirm: 'r-confirm',
};
const STEP_ICONS = [Store, UserRound, KeyRound];

const MAX_COUNTERS = 200;
const MAX_OUTLETS = 100;
const EASE = [0.22, 1, 0.36, 1] as const;
/** A field the form or the server refused goes red until it is touched again. */
const INVALID = 'aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus:ring-destructive/10';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** A Bangla keyboard types Bangla digits; the server wants Latin ones. */
const latinDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** `01XXXXXXXXX`, from whatever the owner typed: spaces, dashes, +880, Bangla digits. */
function normalisePhone(raw: string) {
  const digits = latinDigits(raw).replace(/[^\d]/g, '');
  return digits.startsWith('880') ? digits.slice(2) : digits;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n) || lo));

export function RegisterForm({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const reduce = !!useReducedMotion();
  const formRef = React.useRef<HTMLFormElement>(null);

  const [values, setValues] = React.useState<Values>({
    shopName: '',
    counters: 1,
    outlets: 1,
    licence: '',
    district: '',
    yourName: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
    terms: false,
  });
  const [step, setStep] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [reached, setReached] = React.useState(0);
  const [errors, setErrors] = React.useState<Errors>({});
  const [reason, setReason] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const moved = React.useRef(false);
  /** Set when the server refuses a field, so the cursor lands on that one. */
  const focusId = React.useRef<string | null>(null);

  const set = <K extends Key>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const counterWord = (n: number) =>
    t(n === 1 ? 'auth.register.counterOne' : 'auth.register.counterMany').replace('{n}', num(lang, n));
  const branchWord = (n: number) =>
    t(n === 1 ? 'auth.register.branchOne' : 'auth.register.branchMany').replace('{n}', num(lang, n));

  function validate(i: number): Errors {
    const e: Errors = {};
    const required = t('auth.register.required');
    if (i === 0) {
      if (!values.shopName.trim()) e.shopName = required;
    }
    if (i === 1) {
      if (!values.yourName.trim()) e.yourName = required;
      const phone = normalisePhone(values.phone);
      if (!phone) e.phone = required;
      else if (!/^01[3-9]\d{8}$/.test(phone)) e.phone = t('auth.register.badPhone');
      if (!values.email.trim()) e.email = required;
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) e.email = t('auth.register.badEmail');
    }
    if (i === 2) {
      if (values.password.length < 8) e.password = t('auth.register.passwordHint');
      if (values.confirm !== values.password) e.confirm = t('auth.register.mismatch');
      if (!values.terms) e.terms = t('auth.register.needTerms');
    }
    return e;
  }

  function move(target: number) {
    setDir(target > step ? 1 : -1);
    setStep(target);
    setReached((r) => Math.max(r, target));
    moved.current = true;
  }

  /** Back is free; forward has to pass every step it skips over. */
  function goTo(target: number) {
    if (target === step) return;
    if (target < step) return move(target);
    for (let i = step; i < target; i++) {
      const e = validate(i);
      if (Object.keys(e).length) {
        setErrors(e);
        if (i !== step) move(i);
        return;
      }
    }
    setErrors({});
    move(target);
  }

  /* On entering a step, bring the card's top into view. Nothing moves and
     nothing is focused on first load, which would throw a phone's keyboard
     over the page before the owner has read a word of it. */
  React.useEffect(() => {
    if (!moved.current) return;
    const form = formRef.current;
    if (form) {
      const top = form.getBoundingClientRect().top;
      if (top < 80) window.scrollBy({ top: top - 96, behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [step, reduce]);

  /* The cursor goes in once the step has finished arriving — before then the
     field may not exist yet, because the old step is still on its way out. */
  const focusFirst = (definition: unknown) => {
    if (definition !== 'center' || !moved.current) return;
    const id = focusId.current ?? FIRST_FIELD[step];
    focusId.current = null;
    document.getElementById(id)?.focus({ preventScroll: true });
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === 'sending') return;
    if (step < 2) return goTo(step + 1);

    const own = validate(2);
    setErrors(own);
    if (Object.keys(own).length) return;

    setState('sending');
    setReason('');
    const licence = values.licence.trim().slice(0, 80);
    const res = await postJson('/auth/register', {
      organizationName: values.shopName.trim(),
      name: values.yourName.trim(),
      email: values.email.trim(),
      phone: normalisePhone(values.phone),
      password: values.password,
      acceptTerms: true,
      counters: clamp(values.counters, 1, MAX_COUNTERS),
      outlets: clamp(values.outlets, 1, MAX_OUTLETS),
      ...(licence ? { licence } : {}),
      ...(values.district ? { district: values.district } : {}),
      attribution: { channel: 'website', ...attribution(), referralCode: referralCode(), agentCode: agentCode() },
    });
    if (res.ok) {
      setState('sent');
      requestAnimationFrame(() =>
        document.getElementById('form-result')?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      );
      return;
    }

    setState('idle');
    setReason(res.message || t('auth.register.error'));
    const fieldErrors: Errors = {};
    for (const [name, list] of Object.entries(res.fields ?? {})) {
      const key = SERVER_FIELD[name];
      if (key && list?.[0]) fieldErrors[key] = list[0];
    }
    setErrors(fieldErrors);
    const first = STEP_FIELDS.findIndex((keys) => keys.some((k) => fieldErrors[k]));
    if (first >= 0) {
      const key = STEP_FIELDS[first].find((k) => fieldErrors[k]);
      const id = key ? FIELD_ID[key] : undefined;
      if (first !== step) {
        focusId.current = id ?? null;
        move(first);
      } else if (id) document.getElementById(id)?.focus();
    }
  }

  if (state === 'sent') {
    return <Success lang={lang} email={values.email.trim()} counters={counterWord(values.counters)} />;
  }

  const stepLabels = [t('auth.register.steps.shop'), t('auth.register.steps.you'), t('auth.register.steps.secure')];

  const slide = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 48, filter: 'blur(4px)' }),
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -48, filter: 'blur(4px)' }),
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col">
      <Progress lang={lang} step={step} reached={reached} labels={stepLabels} onPick={goTo} reduce={reduce} />

      <div className="relative mt-7">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.15 : 0.3, ease: EASE }}
            onAnimationComplete={focusFirst}
            className="flex flex-col gap-6"
          >
            {step === 0 && (
              <>
                <Field label={t('auth.register.shopName')} htmlFor="r-shop" error={errors.shopName}>
                  <IconInput icon={Store}>
                    <Input
                      id="r-shop"
                      name="organization"
                      autoComplete="organization"
                      placeholder={t('auth.register.shopPlaceholder')}
                      value={values.shopName}
                      onChange={(e) => set('shopName', e.target.value)}
                      aria-invalid={!!errors.shopName}
                      className={cn('ps-11', INVALID)}
                    />
                  </IconInput>
                </Field>

                <CounterPicker
                  lang={lang}
                  value={values.counters}
                  onChange={(n) => set('counters', n)}
                  error={errors.counters}
                  reduce={reduce}
                />

                <PlanCard lang={lang} counters={values.counters} label={counterWord(values.counters)} reduce={reduce} />

                <div className="grid gap-6 sm:grid-cols-2">
                  <BranchPicker
                    lang={lang}
                    value={values.outlets}
                    onChange={(n) => set('outlets', n)}
                    error={errors.outlets}
                    reduce={reduce}
                  />
                  <Field label={t('auth.register.licence')} htmlFor="r-licence" error={errors.licence}>
                    <IconInput icon={FileBadge2}>
                      <Input
                        id="r-licence"
                        name="licence"
                        maxLength={80}
                        value={values.licence}
                        onChange={(e) => set('licence', e.target.value)}
                        className="ps-11"
                      />
                    </IconInput>
                  </Field>
                </div>

                <Field label={t('auth.register.district')} htmlFor="r-district" error={errors.district}>
                  <Select id="r-district" name="district" value={values.district} onChange={(e) => set('district', e.target.value)}>
                    <option value="">{t('auth.register.districtPick')}</option>
                    {(Object.keys(DIVISIONS) as Division[]).map((div) => (
                      <optgroup key={div} label={lang === 'bn' ? `${DIVISIONS[div]} বিভাগ` : `${div} division`}>
                        {DISTRICTS.filter((d) => d.division === div).map((d) => (
                          <option key={d.name} value={d.name}>
                            {lang === 'bn' ? d.bn : d.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field label={t('auth.register.yourName')} htmlFor="r-name" error={errors.yourName}>
                  <IconInput icon={UserRound}>
                    <Input
                      id="r-name"
                      name="name"
                      autoComplete="name"
                      value={values.yourName}
                      onChange={(e) => set('yourName', e.target.value)}
                      aria-invalid={!!errors.yourName}
                      className={cn('ps-11', INVALID)}
                    />
                  </IconInput>
                </Field>
                <Field label={t('auth.register.phone')} htmlFor="r-phone" error={errors.phone}>
                  <IconInput icon={Phone}>
                    <Input
                      id="r-phone"
                      name="tel"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="01712 345678"
                      value={values.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      aria-invalid={!!errors.phone}
                      className={cn('ps-11 font-mono tracking-wide', INVALID)}
                    />
                  </IconInput>
                  {!errors.phone && <p className="text-xs text-muted-foreground">{t('auth.register.phoneHint')}</p>}
                </Field>
                <Field label={t('auth.register.email')} htmlFor="r-email" error={errors.email}>
                  <IconInput icon={Mail}>
                    <Input
                      id="r-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={values.email}
                      onChange={(e) => set('email', e.target.value)}
                      aria-invalid={!!errors.email}
                      className={cn('ps-11', INVALID)}
                    />
                  </IconInput>
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field
                    label={t('auth.register.password')}
                    htmlFor="r-password"
                    error={errors.password}
                    hint={errors.password ? undefined : t('auth.register.passwordHint')}
                  >
                    <PasswordInput
                      id="r-password"
                      name="new-password"
                      autoComplete="new-password"
                      value={values.password}
                      onChange={(e) => set('password', e.target.value)}
                      aria-invalid={!!errors.password}
                      className={INVALID}
                    />
                  </Field>
                  <Field label={t('auth.register.confirm')} htmlFor="r-confirm" error={errors.confirm}>
                    <PasswordInput
                      id="r-confirm"
                      name="confirm-password"
                      autoComplete="new-password"
                      value={values.confirm}
                      onChange={(e) => set('confirm', e.target.value)}
                      aria-invalid={!!errors.confirm}
                      className={INVALID}
                    />
                  </Field>
                </div>

                <Review
                  title={t('auth.register.review')}
                  edit={t('auth.register.edit')}
                  onEdit={goTo}
                  parts={[
                    {
                      step: 0,
                      icon: Store,
                      label: stepLabels[0],
                      lines: [
                        values.shopName.trim(),
                        `${counterWord(values.counters)} · ${branchWord(values.outlets)}`,
                        values.licence.trim(),
                        values.district ? (lang === 'bn' ? findDistrict(values.district)?.bn ?? values.district : values.district) : '',
                      ],
                    },
                    {
                      step: 1,
                      icon: UserRound,
                      label: stepLabels[1],
                      lines: [values.yourName.trim(), normalisePhone(values.phone), values.email.trim()],
                    },
                  ]}
                />

                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-start gap-3 py-1 text-sm leading-snug text-muted-foreground">
                    <input
                      type="checkbox"
                      name="terms"
                      checked={values.terms}
                      onChange={(e) => set('terms', e.target.checked)}
                      className="mt-px size-5 shrink-0 accent-[hsl(var(--ring))]"
                    />
                    <span>
                      {t('auth.register.terms')}{' '}
                      <Link
                        href={`/${lang}/legal/terms`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {t('footer.terms')}
                      </Link>
                    </span>
                  </label>
                  {errors.terms && (
                    <p role="alert" className="text-xs font-medium text-destructive">
                      {errors.terms}
                    </p>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {reason && (
        <p
          role="alert"
          className="mt-6 break-words rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm font-medium text-destructive"
        >
          {reason}{' '}
          <a className="underline" href={`mailto:${siteConfig.contactEmail}`}>
            {siteConfig.contactEmail}
          </a>
        </p>
      )}

      {/* The action bar. On a phone it rides the bottom of the screen while
          the step scrolls, so Next is always under the thumb. */}
      <div
        className={cn(
          'sticky bottom-0 z-20 -mx-6 mt-7 flex gap-3 border-t border-border/60 bg-card/90 px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl',
          'sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none',
        )}
      >
        <AnimatePresence initial={false}>
          {step > 0 && (
            <motion.div
              key="back"
              initial={reduce ? { opacity: 0 } : { opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, width: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="shrink-0 overflow-hidden"
            >
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => goTo(step - 1)}
                className="w-14 px-0 sm:w-auto sm:px-6"
                aria-label={t('auth.register.back')}
              >
                <ArrowLeft />
                <span className="hidden sm:inline">{t('auth.register.back')}</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Button type="submit" size="lg" className="group min-w-0 flex-1" disabled={state === 'sending'}>
          {state === 'sending' ? (
            <>
              <Loader2 className="animate-spin" />
              {t('auth.register.working')}
            </>
          ) : step < 2 ? (
            <>
              {t('auth.register.next')}
              <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
            </>
          ) : (
            t('auth.register.submit')
          )}
        </Button>
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('auth.register.haveAccount')}{' '}
        <Link
          href={`/${lang}/login`}
          className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('auth.register.signIn')}
        </Link>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------- progress -- */

function Progress({
  lang,
  step,
  reached,
  labels,
  onPick,
  reduce,
}: {
  lang: Lang;
  step: number;
  reached: number;
  labels: string[];
  onPick: (i: number) => void;
  reduce: boolean;
}) {
  const of = translate(lang, 'auth.register.stepOf')
    .replace('{n}', num(lang, step + 1))
    .replace('{total}', num(lang, labels.length));
  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {of}: {labels[step]}
      </p>
      <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {labels.map((label, i) => {
          const Icon = STEP_ICONS[i];
          const done = i < step || (i <= reached && i !== step);
          const current = i === step;
          const open = i <= reached && !current;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(i)}
                disabled={!open}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex min-h-11 w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 text-center transition-colors disabled:cursor-default sm:flex-row sm:gap-2.5 sm:px-2 sm:text-start',
                  open && 'hover:bg-primary/[0.06]',
                )}
              >
                <motion.span
                  animate={{ scale: current && !reduce ? 1.08 : 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full border transition-colors duration-300',
                    current && 'border-transparent bg-ramp text-white shadow-glow',
                    !current && done && 'border-primary/30 bg-primary/10 text-primary',
                    !current && !done && 'border-border bg-card/60 text-muted-foreground',
                  )}
                >
                  {!current && done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </motion.span>
                <span
                  className={cn(
                    'text-[11px] font-medium leading-tight sm:text-xs',
                    current ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full origin-left rounded-full bg-ramp"
          initial={false}
          animate={{ scaleX: (step + 1) / labels.length }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 24 }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pickers -- */

const chipSpring: Transition = { type: 'spring', stiffness: 520, damping: 30 };

function Chip({
  active,
  onClick,
  children,
  className,
  reduce,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  reduce: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileTap={reduce ? undefined : { scale: 0.9 }}
      animate={{ scale: active && !reduce ? 1.04 : 1 }}
      transition={chipSpring}
      className={cn(
        'relative isolate grid h-12 min-w-0 place-items-center whitespace-nowrap rounded-2xl border px-1 text-base font-semibold tabular-nums transition-colors duration-200',
        active
          ? 'border-transparent text-white'
          : 'border-border bg-card/60 text-foreground hover:border-primary/40 hover:bg-primary/[0.04]',
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            key="fill"
            initial={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={chipSpring}
            className="absolute inset-0 -z-10 rounded-2xl bg-ramp shadow-glow"
          />
        )}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

function Stepper({
  id,
  value,
  min,
  max,
  onChange,
  lang,
  label,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  lang: Lang;
  label: string;
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const n = parseInt(latinDigits(raw).replace(/[^\d]/g, ''), 10);
    const next = Number.isFinite(n) ? clamp(n, min, max) : value;
    onChange(next);
    setText(String(next));
  };
  const btn =
    'grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-card/70 text-foreground transition-all hover:border-primary/40 hover:text-primary active:scale-95 disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        onClick={() => onChange(clamp(value - 1, min, max))}
        disabled={value <= min}
        aria-label={translate(lang, 'auth.register.fewer')}
      >
        <Minus className="size-4" />
      </button>
      <input
        id={id}
        inputMode="numeric"
        aria-label={label}
        value={num(lang, text)}
        onChange={(e) => {
          const raw = latinDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 3);
          setText(raw);
          const n = parseInt(raw, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={(e) => commit(e.target.value)}
        className="h-12 w-0 min-w-0 flex-1 rounded-2xl border border-input bg-card/70 text-center font-mono text-xl font-bold tabular-nums shadow-inner transition-all focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/12"
      />
      <button
        type="button"
        className={btn}
        onClick={() => onChange(clamp(value + 1, min, max))}
        disabled={value >= max}
        aria-label={translate(lang, 'auth.register.more')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function Expand({ show, reduce, children }: { show: boolean; reduce: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduce ? 0.12 : 0.28, ease: EASE }}
          className="-mx-1 overflow-hidden px-1"
        >
          <div className="pb-1 pt-3">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CounterPicker({
  lang,
  value,
  onChange,
  error,
  reduce,
}: {
  lang: Lang;
  value: number;
  onChange: (n: number) => void;
  error?: string;
  reduce: boolean;
}) {
  const t = (p: string) => translate(lang, p);
  const [exact, setExact] = React.useState(value > 5);
  const band = value <= 5 ? String(value) : value <= 10 ? '6-10' : '10+';
  const chips: { key: string; label: string; pick: () => void }[] = [
    ...[1, 2, 3, 4, 5].map((n) => ({
      key: String(n),
      label: num(lang, n),
      pick: () => {
        setExact(false);
        onChange(n);
      },
    })),
    {
      key: '6-10',
      label: `${num(lang, 6)}–${num(lang, 10)}`,
      pick: () => {
        setExact(true);
        if (value < 6 || value > 10) onChange(6);
      },
    },
    {
      key: '10+',
      label: `${num(lang, 10)}+`,
      pick: () => {
        setExact(true);
        if (value <= 10) onChange(12);
      },
    },
  ];

  return (
    <fieldset>
      <legend className="flex items-center gap-2 text-sm font-medium">
        <MonitorSmartphone className="size-4 text-primary" />
        {t('auth.register.counters')}
      </legend>
      <p className="mt-1 text-xs text-muted-foreground">{t('auth.register.countersHint')}</p>
      {/* Five equal squares on a phone, then the two ranges as halves of the
          row below; one row of seven once there is room. */}
      <div className="mt-3 grid grid-cols-10 gap-2 sm:grid-cols-7">
        {chips.map((c, i) => (
          <Chip
            key={c.key}
            active={band === c.key}
            onClick={c.pick}
            reduce={reduce}
            className={cn('h-14 text-lg', i < 5 ? 'col-span-2' : 'col-span-5 text-base', 'sm:col-span-1')}
          >
            {c.label}
          </Chip>
        ))}
      </div>
      <Expand show={exact || value > 5} reduce={reduce}>
        <div className="flex flex-col gap-2.5 rounded-2xl border border-primary/20 bg-primary/[0.04] p-3 sm:flex-row sm:items-center sm:gap-4">
          <label htmlFor="r-counters" className="text-sm font-medium sm:flex-1">
            {t('auth.register.exact')}
          </label>
          <div className="sm:w-60">
            <Stepper
              id="r-counters"
              value={value}
              min={1}
              max={MAX_COUNTERS}
              onChange={onChange}
              lang={lang}
              label={t('auth.register.counters')}
            />
          </div>
        </div>
      </Expand>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function BranchPicker({
  lang,
  value,
  onChange,
  error,
  reduce,
}: {
  lang: Lang;
  value: number;
  onChange: (n: number) => void;
  error?: string;
  reduce: boolean;
}) {
  const t = (p: string) => translate(lang, p);
  const many = value >= 4;
  return (
    <fieldset className="min-w-0">
      <legend className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="size-4 text-primary" />
        {t('auth.register.outlets')}
      </legend>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <Chip
            key={n}
            active={n === 4 ? many : value === n}
            onClick={() => onChange(n === 4 ? Math.max(4, value) : n)}
            reduce={reduce}
          >
            {n === 4 ? `${num(lang, 4)}+` : num(lang, n)}
          </Chip>
        ))}
      </div>
      <Expand show={many} reduce={reduce}>
        <Stepper
          id="r-outlets"
          value={value}
          min={1}
          max={MAX_OUTLETS}
          onChange={onChange}
          lang={lang}
          label={t('auth.register.outlets')}
        />
      </Expand>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------- plan card -- */

function PlanCard({
  lang,
  counters,
  label,
  reduce,
}: {
  lang: Lang;
  counters: number;
  label: string;
  reduce: boolean;
}) {
  const t = (p: string) => translate(lang, p);
  const plans = tItems<Plan>(lang, 'pricing.plans');
  const [, basic, plus] = plans;
  const tier = counters <= 1 ? 'basic' : counters <= 5 ? 'plus' : 'custom';
  const plan = tier === 'basic' ? basic : plus;
  const note = t(`auth.register.plan.${tier}`);
  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16, filter: 'blur(4px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -16, filter: 'blur(4px)' },
      };
  const spring: Transition = { type: 'spring', stiffness: 380, damping: 30 };

  return (
    <motion.div
      layout={!reduce}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-card/80 to-card/60 p-5 shadow-glow"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-16 size-44 rounded-full bg-emerald-400/20 blur-3xl"
      />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
          {t('auth.register.plan.kicker')}
        </p>
        <motion.span
          key={counters}
          initial={reduce ? false : { scale: 0.75 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 16 }}
          className="shrink-0 rounded-full border border-primary/25 bg-card/80 px-3 py-1 text-xs font-semibold tabular-nums"
        >
          {label}
        </motion.span>
      </div>

      <div aria-live="polite" className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={tier} {...swap} transition={spring}>
            <p className="h-card mt-2 text-lg">
              {plan.name}
              {tier === 'custom' && <span className="text-primary"> +</span>}
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                {plan.price}
                {tier === 'custom' && <span className="text-primary">+</span>}
              </span>
              <span className="text-xs text-muted-foreground">{plan.period}</span>
            </p>
            <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{note}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="relative mt-4 flex items-center gap-2 rounded-2xl bg-primary/[0.08] px-3 py-2.5 text-sm font-medium">
        <Sparkles className="size-4 shrink-0 text-primary" />
        {t('auth.register.plan.trial')}
      </p>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- review -- */

function Review({
  title,
  edit,
  onEdit,
  parts,
}: {
  title: string;
  edit: string;
  onEdit: (step: number) => void;
  parts: { step: number; icon: typeof Store; label: string; lines: string[] }[];
}) {
  return (
    <section className="rounded-3xl border border-border bg-card/50 px-4 py-3">
      <h3 className="pt-1 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      <ul className="divide-y divide-border/70">
        {parts.map(({ step, icon: Icon, label, lines }) => (
          <li key={step} className="flex items-start gap-3 py-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              {lines.filter(Boolean).map((line, i) => (
                <p key={i} className={cn('break-words text-sm', i === 0 ? 'font-semibold' : 'text-muted-foreground')}>
                  {line}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onEdit(step)}
              className="-me-2 -mt-2 inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.08]"
            >
              {edit}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IconInput({ icon: Icon, children }: { icon: typeof Store; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute start-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- success -- */

function Success({ lang, email, counters }: { lang: Lang; email: string; counters: string }) {
  const t = (p: string) => translate(lang, p);
  const reduce = !!useReducedMotion();
  const steps = tList(lang, 'auth.register.nextSteps').map((s) => s.replace('{n}', counters));
  const [before, after] = t('auth.register.successBody').split('{email}');

  return (
    <motion.div
      id="form-result"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="relative flex flex-col items-center overflow-hidden rounded-3xl border border-success/25 bg-success/[0.05] px-5 py-9 text-center sm:p-10"
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 size-72 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="relative grid size-20 place-items-center">
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-ramp"
            initial={{ scale: 0.7, opacity: 0.45 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3, repeat: 2, repeatDelay: 0.4 }}
          />
        )}
        <motion.span
          className="relative grid size-20 place-items-center rounded-full bg-ramp text-white shadow-glow"
          initial={reduce ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.05 }}
        >
          <svg viewBox="0 0 24 24" className="size-10" fill="none" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }}
            />
          </svg>
        </motion.span>
      </div>

      <h2 className="h-card relative mt-6 text-2xl">{t('auth.register.successTitle')}</h2>
      <p className="relative mt-3 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
        {before}
        {after !== undefined && (
          <>
            <span className="break-words font-medium text-foreground">{email}</span>
            {after}
          </>
        )}
      </p>

      <div className="relative mt-8 w-full max-w-xs text-start">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
          {t('auth.register.nextTitle')}
        </p>
        <ol className="mt-4">
          {steps.map((s, i) => (
            <motion.li
              key={i}
              initial={reduce ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.15, type: 'spring', stiffness: 260, damping: 24 }}
              className="relative flex items-start gap-3 pb-5 last:pb-0"
            >
              {i < steps.length - 1 && (
                <span aria-hidden className="absolute start-4 top-9 h-[calc(100%-2.5rem)] w-px -translate-x-1/2 bg-primary/30" />
              )}
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums',
                  i === 0 ? 'bg-ramp text-white shadow-glow' : 'border border-primary/30 bg-card text-primary',
                )}
              >
                {num(lang, i + 1)}
              </span>
              <span className="pt-1.5 text-sm font-medium leading-snug">{s}</span>
            </motion.li>
          ))}
        </ol>
      </div>

      <Button asChild variant="outline" size="lg" className="relative mt-9 w-full sm:w-auto">
        <Link href={`/${lang}/login`}>{t('auth.register.signIn')}</Link>
      </Button>
    </motion.div>
  );
}
