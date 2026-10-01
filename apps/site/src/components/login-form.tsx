'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, LogIn, ShieldCheck, ExternalLink, Mail } from 'lucide-react';
import { translate, type Lang } from '@/i18n/dictionary';
import { siteConfig } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

/**
 * The sign-in for an existing shop.
 *
 * The actual authentication happens where the shop lives — `siteConfig.appUrl` —
 * and this form is the door that sends a returning owner there. The email goes
 * along so the shop's own sign-in arrives filled in; the password never does —
 * a password in a URL is a password in the browser history.
 */

export function LoginForm({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const [state, setState] = React.useState<'idle' | 'sending'>('idle');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('sending');
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    const to = new URL('/login', siteConfig.appUrl);
    if (email) to.searchParams.set('email', email);
    if (lang === 'bn') to.searchParams.set('lang', 'bn');
    window.location.assign(to.toString());
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field label={t('auth.login.email')} htmlFor="l-email">
        <div className="relative">
          <Mail className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="l-email" name="email" type="email" autoComplete="email" required className="ps-11" />
        </div>
      </Field>
      <Field
        label={t('auth.login.password')}
        htmlFor="l-password"
        hint={
          <a
            href={new URL('/forgot-password', siteConfig.appUrl).toString()}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('auth.login.forgot')}
          </a>
        }
      >
        <PasswordInput id="l-password" name="password" autoComplete="current-password" />
      </Field>

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
          {state === 'sending' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('auth.login.working')}
            </>
          ) : (
            <>
              {t('auth.login.submit')}
              <LogIn className="size-4" />
            </>
          )}
        </Button>

        <a
          href={siteConfig.appUrl}
          className="inline-flex items-center justify-center gap-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
          {t('nav.openApp')}
        </a>
      </div>

      <div className="flex flex-col gap-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
        <p>
          {t('auth.login.noAccount')}{' '}
          <Link href={`/${lang}/register`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('auth.login.startHere')}
          </Link>
        </p>
        <p>
          {t('auth.login.demo')}{' '}
          <Link href={`/${lang}/demo`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('auth.login.bookDemo')}
          </Link>
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-primary/[0.05] px-4 py-3 text-2xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
        {t('auth.login.rights')}
      </p>
    </form>
  );
}