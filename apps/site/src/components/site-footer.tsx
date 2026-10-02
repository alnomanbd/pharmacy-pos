import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { siteConfig, type Lang } from '@/lib/site';
import { translate } from '@/i18n/dictionary';
import { Logo, Mark } from '@/components/logo';
import { Orb } from '@/components/motion/primitives';
import { Button } from '@/components/ui/button';

/**
 * The footer is a dark band on every page, which is what gives the site its
 * pulse: light, light, dark, light, dark.
 *
 * Three rows. The brand with the one action worth taking, then the links,
 * then the small print, and under all of it the name, spread letter by letter
 * across the full width of the band and cut off by its bottom edge, like a
 * sign on a shopfront seen from across the road.
 */
export function SiteFooter({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const year = 2026;

  const columns = [
    {
      title: t('footer.product'),
      links: [
        { label: t('nav.how'), href: `/${lang}/#how` },
        { label: t('screens.kicker'), href: `/${lang}/#screens` },
        { label: t('nav.pricing'), href: `/${lang}/#pricing` },
        { label: t('nav.faq'), href: `/${lang}/#faq` },
      ],
    },
    {
      title: t('footer.resources'),
      links: [
        { label: t('nav.demo'), href: `/${lang}/demo` },
        { label: t('nav.contact'), href: `/${lang}/contact` },
        { label: t('nav.signIn'), href: `/${lang}/login` },
        { label: t('nav.getStarted'), href: `/${lang}/register` },
        { label: t('nav.openApp'), href: siteConfig.appUrl },
      ],
    },
    {
      title: t('footer.legal'),
      links: [
        { label: t('footer.terms'), href: `/${lang}/legal/terms` },
        { label: t('footer.privacy'), href: `/${lang}/legal/privacy` },
        { label: t('footer.refund'), href: `/${lang}/legal/refund` },
      ],
    },
  ];

  // Sized from the name's length, so a rename still spans the band and never clips.
  const letters = Array.from(siteConfig.wordmark);
  const wordSize = `min(${(110 / letters.length).toFixed(1)}vw, 20rem)`;

  return (
    <footer className="ink-band grain bg-background relative isolate overflow-hidden">
      <div className="aurora-field">
        <Orb className="-end-40 -top-32" color="rgb(16 185 129 / 0.34)" size="42rem" duration={30} />
        <Orb className="-start-32 top-1/3" color="rgb(34 211 238 / 0.22)" size="36rem" duration={24} delay={4} />
      </div>

      <div className="shell relative pt-16 sm:pt-20">
        {/* Row one: who we are, and the one thing to do next. */}
        <div className="flex flex-col gap-8 border-b border-white/10 pb-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-md">
            <Link href={`/${lang}`} className="inline-block">
              <Logo wordmark={siteConfig.wordmark} product={siteConfig.product} markClassName="size-10" />
            </Link>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t('footer.blurb')}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href={`/${lang}/register`}>
                {t('nav.getStarted')}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/15 bg-white/[0.04] hover:bg-white/[0.08]">
              <Link href={`/${lang}/demo`}>{t('nav.demo')}</Link>
            </Button>
          </div>
        </div>

        {/* Row two: the links, and how to reach us. Two columns on a phone, so
            the list is half as long to scroll past. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:grid-cols-4">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-primary">{col.title}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => {
                  const external = link.href.startsWith('http');
                  const cls =
                    'group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground';
                  return (
                    <li key={link.href}>
                      {external ? (
                        <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
                          {link.label}
                          <ArrowUpRight className="size-3 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </a>
                      ) : (
                        <Link href={link.href} className={cls}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Full width on a phone: an email address does not break nicely. */}
          <div className="col-span-2 sm:col-span-1">
            <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-primary">{t('footer.company')}</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <a
                href={`mailto:${siteConfig.contactEmail}`}
                className="inline-flex min-w-0 items-start gap-2 transition-colors hover:text-foreground"
              >
                <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
                {siteConfig.contactEmail}
              </a>
              <span className="inline-flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                {lang === 'bn' ? siteConfig.addressBn : siteConfig.address}
              </span>
              <span className="inline-flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                {t('cta.points.1')}
              </span>
            </div>
          </div>
        </div>

        {/* Row three: the small print. */}
        <div className="flex flex-col gap-3 border-t border-white/10 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs text-muted-foreground/70">
            © {year} {siteConfig.company}. {t('footer.rights')}
          </p>
          <p className="inline-flex items-center gap-2 text-2xs text-muted-foreground/70">
            <Mark className="size-5" />
            {/* The name in full colour, the words around it muted, in either
                language's word order. */}
            {t('footer.poweredBy')
              .split(/(\{name\})/)
              .map((part, i) =>
                part === '{name}' ? (
                  <span key={i} className="font-semibold text-foreground/90">
                    {siteConfig.poweredBy}
                  </span>
                ) : (
                  part
                ),
              )}
          </p>
        </div>
      </div>

      {/* The name, letter by letter across the full width, its foot cut by the
          band's edge. Text, not an image, so it costs nothing and a rename in
          lib/site.ts redraws it. */}
      <div aria-hidden className="pointer-events-none relative select-none overflow-hidden px-4 sm:px-8">
        <p
          className="flex justify-between font-extrabold leading-[0.8] tracking-normal"
          style={{ fontSize: wordSize, marginBottom: '-0.1em' }}
        >
          {letters.map((ch, i) => (
            <span
              key={i}
              className="bg-gradient-to-b from-white/[0.2] via-white/[0.09] to-white/[0.02] bg-clip-text text-transparent"
            >
              {ch}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
