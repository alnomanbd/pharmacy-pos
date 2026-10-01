import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { siteConfig, type Lang } from '@/lib/site';
import { translate } from '@/i18n/dictionary';
import { Logo, Mark } from '@/components/logo';
import { Orb } from '@/components/motion/primitives';

/**
 * The footer is a dark band on every page, which is what gives the site its
 * pulse: light, light, dark, light, dark. It ends with the counter switched off and the billing screen's glow still
 * on, which is the last thing a shop owner should see before they sleep.
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

  return (
    <footer className="ink-band grain bg-background relative isolate overflow-hidden">
      <div className="aurora-field">
        <Orb className="-end-40 -top-32" color="rgb(16 185 129 / 0.34)" size="42rem" duration={30} />
        <Orb className="-start-32 top-1/3" color="rgb(34 211 238 / 0.22)" size="36rem" duration={24} delay={4} />
      </div>

      <div className="shell relative py-16 sm:py-20">
        {/* The wordmark, set enormous and clipped by the band's bottom edge.
            It is the one piece of pure scale on the site, and it costs nothing
            because it is text. */}
        <div className="pointer-events-none mb-12 select-none overflow-hidden">
          <p
            aria-hidden
            className="whitespace-nowrap text-center font-extrabold leading-[0.78] tracking-[-0.055em] text-white/[0.07]"
            /* Sized from the name's length so a rename never clips it. */
            style={{ fontSize: `min(${(110 / siteConfig.wordmark.length).toFixed(1)}vw, 15rem)` }}
          >
            {siteConfig.wordmark}
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Link href={`/${lang}`} className="inline-block">
              <Logo wordmark={siteConfig.wordmark} product={siteConfig.product} markClassName="size-10" />
            </Link>
            <p className="measure mt-5 text-sm leading-relaxed text-muted-foreground">
              {t('footer.blurb')}
            </p>

            <div className="mt-7 flex flex-col gap-2.5 text-sm text-muted-foreground">
              <a
                href={`mailto:${siteConfig.contactEmail}`}
                className="inline-flex items-center gap-2.5 transition-colors hover:text-foreground"
              >
                <Mail className="size-4 text-primary" />
                {siteConfig.contactEmail}
              </a>
              <span className="inline-flex items-center gap-2.5">
                <MapPin className="size-4 text-primary" />
                {lang === 'bn' ? siteConfig.addressBn : siteConfig.address}
              </span>
            </div>

            <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-2xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              {t('cta.points.1')}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-primary">
                  {col.title}
                </h3>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {col.links.map((link) => {
                    const external = link.href.startsWith('http');
                    return (
                      <li key={link.href}>
                        {external ? (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {link.label}
                            <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-70" />
                          </a>
                        ) : (
                          <Link
                            href={link.href}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {link.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs text-muted-foreground/70">
            © {year} {siteConfig.company}. {t('footer.rights')}
          </p>
          <p className="inline-flex items-center gap-2 text-2xs text-muted-foreground/70">
            <Mark className="size-5" />
            {t('footer.builtFor')}
          </p>
        </div>
      </div>
    </footer>
  );
}
