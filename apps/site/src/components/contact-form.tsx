'use client';

import * as React from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { translate, type Lang } from '@/i18n/dictionary';
import { siteConfig } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { postJson, attribution } from '@/lib/api';

/**
 * The contact form. Posts to the Dawai API's enquiry endpoint, which files it
 * for the operator console's Enquiries page; email stays offered on both the
 * success and the error screen, so a message is never lost to a dead form.
 */

export function ContactForm({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [reason, setReason] = React.useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!form.get('email')) return;
    setState('sending');
    const res = await postJson('/public/contact', {
      name: String(form.get('name') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      message: String(form.get('message') ?? '').trim(),
      topic: 'Contact',
      lang,
      trap: String(form.get('website') ?? ''),
      ...attribution(),
    });
    setReason(res.ok ? '' : res.message);
    /* The result replaces a long form with a short card; without this the
       page stays where the button was and the visitor sees only the footer. */
    if (res.ok) requestAnimationFrame(() => document.getElementById('form-result')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    setState(res.ok ? 'sent' : 'error');
  }

  if (state === 'sent') {
    return (
      <div id="form-result" className="glass flex flex-col items-start gap-4 p-8 sm:p-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <h2 className="h-card text-xl">{t('pages.contact.form.success')}</h2>
        <Button asChild variant="outline">
          <a href={`mailto:${siteConfig.contactEmail}`}>{t('pages.contact.form.emailInstead')}</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="glass flex flex-col gap-5 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('pages.contact.form.name')} htmlFor="c-name">
          <Input id="c-name" name="name" autoComplete="name" required />
        </Field>
        <Field label={t('pages.contact.form.email')} htmlFor="c-email">
          <Input id="c-email" name="email" type="email" autoComplete="email" required />
        </Field>
      </div>

      <Field label={t('pages.contact.form.message')} htmlFor="c-message">
        <Textarea id="c-message" name="message" rows={5} required />
      </Field>

      {/* The honeypot: invisible to people, filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      {state === 'error' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {reason || t('pages.contact.form.error')}{' '}
          <a className="underline" href={`mailto:${siteConfig.contactEmail}`}>
            {siteConfig.contactEmail}
          </a>
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
        {state === 'sending' ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('pages.contact.form.sending')}
          </>
        ) : (
          <>
            {t('pages.contact.form.submit')}
            <Send className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}