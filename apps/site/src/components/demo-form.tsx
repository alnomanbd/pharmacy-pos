'use client';

import * as React from 'react';
import {
  Loader2,
  CheckCircle2,
  Send,
  CalendarClock,
  User,
  Mail,
  Phone,
  Store,
  Users,
  ReceiptText,
  MessageSquare,
} from 'lucide-react';
import { translate, tList, type Lang } from '@/i18n/dictionary';
import { siteConfig } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { postJson, attribution } from '@/lib/api';

/**
 * The demo booking form. Files an enquiry with the Dawai API (the operator
 * console's Enquiries page) carrying the shop, the staff count and the bills a
 * day, which is what the person calling back needs before they ring.
 */

export function DemoForm({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [reason, setReason] = React.useState('');
  const staffOptions = tList(lang, 'demo.form.options.staff');
  const sizeOptions = tList(lang, 'demo.form.options.size');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!form.get('email')) return;
    setState('sending');
    const get = (k: string) => String(form.get(k) ?? '').trim();
    /* The API wants a line or two in `message`; a demo request often has none,
       so the shop's particulars make up the message the caller-back reads. */
    const message = [
      get('message'),
      `Shop: ${get('shop')}`,
      get('staff') && `Staff: ${get('staff')}`,
      get('size') && `Bills a day: ${get('size')}`,
    ]
      .filter(Boolean)
      .join('\n');
    const res = await postJson('/public/contact', {
      name: get('name'),
      email: get('email'),
      phone: get('phone') || undefined,
      shop: get('shop') || undefined,
      topic: 'Demo request',
      message,
      lang,
      trap: get('website'),
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
      <div id="form-result" className="glass flex flex-col items-center gap-4 p-8 text-center sm:p-10">
        <span className="grid size-14 place-items-center rounded-2xl bg-ramp text-white shadow-glow">
          <CheckCircle2 className="size-7" />
        </span>
        <h2 className="h-card text-xl">{t('demo.form.success')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('pricing.ctaNote')}</p>
        <Button asChild variant="outline" size="lg" className="mt-1">
          <a href={`mailto:${siteConfig.contactEmail}`}>{t('pages.contact.form.emailInstead')}</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="glass flex flex-col gap-5 p-6 sm:p-8">
      <div className="flex items-center gap-3 border-b border-border/60 pb-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <CalendarClock className="size-5" />
        </span>
        <div className="flex flex-col">
          <p className="h-card text-base">{t('demo.book.eyebrow')}</p>
          <p className="text-xs text-muted-foreground">{t('pricing.ctaNote')}</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('demo.form.name')} htmlFor="d-name">
          <div className="relative">
            <User className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="d-name" name="name" autoComplete="name" required className="ps-11" />
          </div>
        </Field>
        <Field label={t('demo.form.email')} htmlFor="d-email">
          <div className="relative">
            <Mail className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="d-email" name="email" type="email" autoComplete="email" required className="ps-11" />
          </div>
        </Field>
        <Field label={t('demo.form.phone')} htmlFor="d-phone">
          <div className="relative">
            <Phone className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="d-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="ps-11" />
          </div>
        </Field>
        <Field label={t('demo.form.shop')} htmlFor="d-shop">
          <div className="relative">
            <Store className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="d-shop" name="shop" autoComplete="organization" required className="ps-11" />
          </div>
        </Field>
        <Field label={t('demo.form.staff')} htmlFor="d-staff">
          <div className="relative">
            <Users className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Select id="d-staff" name="staff" defaultValue="" className="ps-11">
              <option value="" disabled>
                —
              </option>
              {staffOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label={t('demo.form.size')} htmlFor="d-size">
          <div className="relative">
            <ReceiptText className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Select id="d-size" name="size" defaultValue="" className="ps-11">
              <option value="" disabled>
                —
              </option>
              {sizeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </div>

      <Field label={t('demo.form.message')} htmlFor="d-message">
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute start-4 top-3.5 size-4 text-muted-foreground" />
          <Textarea id="d-message" name="message" rows={3} className="ps-11" />
        </div>
      </Field>

      {state === 'error' && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t('demo.form.error')}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
        {state === 'sending' ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('demo.form.sending')}
          </>
        ) : (
          <>
            {t('demo.form.submit')}
            <Send className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}