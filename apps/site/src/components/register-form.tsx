'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, Store, Building2, Users, Mail, Phone, FileBadge2, Hash } from 'lucide-react';
import { siteConfig } from '@/lib/site';
import { translate, type Lang } from '@/i18n/dictionary';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { cn } from '@/lib/utils';
import { postJson, attribution } from '@/lib/api';

/**
 * The trial sign-up. Creates the shop on the Dawai API in `pending`; an
 * operator approves it (usually with a call to set the counter up) and the
 * owner is emailed when it is open — which is what the success screen says.
 * The server's own sentence is shown when it refuses, because those are
 * written for the person at the form ("Email already registered").
 */

export function RegisterForm({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next: Record<string, string> = {};
    const required = ['shopName', 'yourName', 'email', 'phone', 'password', 'confirm'];
    for (const key of required) {
      const value = String(form.get(key) ?? '').trim();
      if (!value && key !== 'confirm') next[key] = t('auth.register.error');
    }
    if (String(form.get('password') ?? '').length < 8) next.password = t('auth.register.passwordHint');
    if (String(form.get('confirm') ?? '') !== String(form.get('password') ?? '')) {
      next.confirm = t('auth.register.mismatch');
    }
    if (!form.get('terms')) next.terms = t('auth.register.needTerms');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setState('sending');
    setReason('');
    const get = (k: string) => String(form.get(k) ?? '').trim();
    const res = await postJson('/auth/register', {
      organizationName: get('shopName'),
      name: get('yourName'),
      email: get('email'),
      phone: get('phone'),
      password: String(form.get('password') ?? ''),
      acceptTerms: true,
      counters: get('type') === 'typeMany' ? 2 : 1,
      attribution: { channel: 'website', ...attribution() },
    });
    if (res.ok) {
      setState('sent');
      requestAnimationFrame(() =>
        document.getElementById('form-result')?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      );
      return;
    }
    setReason(res.message || t('auth.register.error'));
    setState('idle');
  }

  if (state === 'sent') {
    return (
      <div id="form-result" className="flex h-full flex-col items-center justify-center gap-5 rounded-3xl border border-success/25 bg-success/[0.05] p-8 text-center sm:p-12">
        <span className="grid size-16 place-items-center rounded-full bg-ramp text-white shadow-glow">
          <CheckCircle2 className="size-8" />
        </span>
        <h2 className="h-card text-xl">{t('auth.register.successTitle')}</h2>
        <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
          {t('auth.register.successBody')}
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link href={`/${lang}/login`}>{t('auth.register.signIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('auth.register.shopName')} htmlFor="r-shop" error={errors.shopName}>
          <div className="relative">
            <Store className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="r-shop" name="shopName" autoComplete="organization" required className="ps-11" />
          </div>
        </Field>
        <Field label={t('auth.register.yourName')} htmlFor="r-name" error={errors.yourName}>
          <div className="relative">
            <Users className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="r-name" name="yourName" autoComplete="name" required className="ps-11" />
          </div>
        </Field>
        <Field label={t('auth.register.email')} htmlFor="r-email" error={errors.email}>
          <div className="relative">
            <Mail className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="r-email" name="email" type="email" autoComplete="email" required className="ps-11" />
          </div>
        </Field>
        <Field label={t('auth.register.phone')} htmlFor="r-phone" error={errors.phone}>
          <div className="relative">
            <Phone className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="r-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              className="ps-11"
            />
          </div>
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">{t('auth.register.type')}</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['typeOne', Store],
                ['typeMany', Building2],
              ] as const
            ).map(([key, Icon]) => (
              <label
                key={key}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3.5 transition-all',
                  'has-[:checked]:border-primary/60 has-[:checked]:bg-primary/[0.06] hover:border-primary/40',
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={key}
                  defaultChecked={key === 'typeOne'}
                  className="peer sr-only"
                />
                <Icon className="size-4 shrink-0 text-primary" />
                <span className="text-sm font-medium">{t(`auth.register.${key}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={t('auth.register.size')} htmlFor="r-size">
          <div className="relative">
            <Hash className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="r-size" name="size" inputMode="numeric" placeholder="3" className="ps-11" />
          </div>
        </Field>
        <Field label={t('auth.register.licence')} htmlFor="r-licence">
          <div className="relative">
            <FileBadge2 className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="r-licence" name="licence" className="ps-11" />
          </div>
        </Field>

        <Field label={t('auth.register.password')} htmlFor="r-password" error={errors.password}>
          <PasswordInput id="r-password" name="password" autoComplete="new-password" required />
        </Field>
        <Field label={t('auth.register.confirm')} htmlFor="r-confirm" error={errors.confirm}>
          <PasswordInput id="r-confirm" name="confirm" autoComplete="new-password" required />
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-muted-foreground">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[hsl(var(--ring))]" />
        <span>
          {t('auth.register.terms')}{' '}
          <Link href={`/${lang}/legal/terms`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('footer.terms')}
          </Link>
        </span>
      </label>
      {errors.terms && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {errors.terms}
        </p>
      )}
      {reason && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm font-medium text-destructive">
          {reason}{' '}
          <a className="underline" href={`mailto:${siteConfig.contactEmail}`}>
            {siteConfig.contactEmail}
          </a>
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
          {state === 'sending' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('auth.register.working')}
            </>
          ) : (
            t('auth.register.submit')
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.register.haveAccount')}{' '}
          <Link href={`/${lang}/login`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('auth.register.signIn')}
          </Link>
        </p>
      </div>
    </form>
  );
}