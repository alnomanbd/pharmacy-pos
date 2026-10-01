'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig, type Lang } from '@/lib/site';
import { translate } from '@/i18n/dictionary';
import { num } from '@/i18n/mock';
import { Logo } from '@/components/logo';
import { LangSwitch } from '@/components/lang-switch';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/*
 * The header.
 *
 * A floating pill rather than a bar across the top: it lets the aurora run
 * under it, and on this site the light is the thing doing the work. It is
 * transparent over the hero and becomes glass once the page has scrolled, so
 * the first screen is one continuous image and everything below it is a
 * surface floating on top.
 *
 * The nav underline is a shared `layoutId` between the active link and a
 * background pill, so switching pages slides the highlight across rather than
 * cutting to the new one.
 *
 * It has to fit a 300px phone: the logo, the language and theme switches and
 * the menu button in one row. Below `sm` the gaps tighten, the language switch
 * drops its globe, and below 360px the logo drops its product line. Without
 * that the menu button is pushed off the right edge, and on a phone the menu
 * is the only way around the site.
 */

function navItems(lang: Lang) {
  return [
    { href: `/${lang}/#how`, label: translate(lang, 'nav.how') },
    { href: `/${lang}/demo`, label: translate(lang, 'nav.demo') },
    { href: `/${lang}/#pricing`, label: translate(lang, 'nav.pricing') },
    { href: `/${lang}/#faq`, label: translate(lang, 'nav.faq') },
  ];
}

export function SiteHeader({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? '';
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const items = navItems(lang);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-spring',
          scrolled ? 'py-2.5' : 'pb-4 pt-14 sm:pb-6 sm:pt-16',
        )}
      >
        <div className="shell-wide">
          <div
            className={cn(
              'flex items-center gap-2 rounded-full px-2 py-2 transition-all duration-500 ease-spring sm:gap-3 sm:px-4 sm:py-2.5',
              scrolled
                ? 'border border-border bg-background/80 shadow-lift backdrop-blur-xl'
                : 'border border-transparent bg-transparent',
            )}
          >
            <Link
              href={`/${lang}`}
              className="min-w-0 shrink-0 rounded-full pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={siteConfig.shortName}
            >
              <Logo
                wordmark={siteConfig.wordmark}
                product={siteConfig.product}
                productClassName="hidden min-[360px]:block"
              />
            </Link>

            <nav className="mx-auto hidden items-center gap-1 lg:flex">
              {items.map((item) => {
                const active =
                  item.href.includes('#') === false &&
                  pathname.startsWith(item.href.split('#')[0]);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-muted"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2 lg:ms-0">
              <LangSwitch lang={lang} />
              <ThemeToggle />

              <Button
                asChild
                size="sm"
                variant="ghost"
                className="hidden sm:inline-flex"
              >
                <Link href={`/${lang}/login`}>{translate(lang, 'nav.signIn')}</Link>
              </Button>

              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href={`/${lang}/register`}>
                  {translate(lang, 'nav.getStarted')}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>

              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label={translate(lang, 'nav.menu')}
                    className="grid size-9 place-items-center rounded-full border border-border bg-card/60 backdrop-blur transition-colors hover:border-primary/40 lg:hidden"
                  >
                    <Menu className="size-4" />
                  </button>
                </SheetTrigger>

                <SheetContent closeLabel={translate(lang, 'nav.close')}>
                  <SheetTitle className="sr-only">
                    {translate(lang, 'nav.menu')}
                  </SheetTitle>

                  <div className="border-b border-border px-6 py-5">
                    <Logo wordmark={siteConfig.wordmark} product={siteConfig.product} />
                  </div>

                  <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
                    {items.map((item, i) => (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          className="group flex items-center justify-between rounded-2xl px-4 py-3.5 text-lg font-semibold tracking-tight transition-colors hover:bg-muted"
                        >
                          {item.label}
                          <span className="text-2xs tabular-nums text-muted-foreground/60">
                            {num(lang, `0${i + 1}`)}
                          </span>
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>

                  <div className="flex flex-col gap-2.5 border-t border-border p-4">
                    <SheetClose asChild>
                      <Button asChild size="lg" className="w-full">
                        <Link href={`/${lang}/register`}>{translate(lang, 'nav.getStarted')}</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild size="lg" variant="outline" className="w-full">
                        <Link href={`/${lang}/login`}>{translate(lang, 'nav.signIn')}</Link>
                      </Button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* The announcement rail, above the header, and only on the first screen. */}
      <AnimatePresence>
        {!scrolled && !open && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3 sm:pt-4"
          >
            <Link
              href={`/${lang}/register`}
              className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full border border-white/50 bg-white/70 py-1.5 pl-2 pr-3.5 text-2xs font-semibold shadow-glass backdrop-blur-xl transition-all duration-300 hover:bg-white hover:shadow-lift dark:border-white/10 dark:bg-white/[0.07] dark:hover:bg-white/[0.12]"
            >
              <span className="shrink-0 rounded-full bg-ramp px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider text-white">
                {translate(lang, 'nav.trialBadge')}
              </span>
              <span className="truncate text-foreground/85">{translate(lang, 'announce.0')}</span>
              <ArrowUpRight className="size-3 shrink-0 text-primary" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
