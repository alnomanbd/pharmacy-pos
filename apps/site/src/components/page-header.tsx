import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig, type Lang } from '@/lib/site';
import { Orb, Reveal } from '@/components/motion/primitives';

/**
 * The header of every page that is not the home page.
 *
 * Compact on purpose. The home page opens on a hero because it is selling; a
 * contact form or a privacy policy is a page somebody came to *use*, and a
 * hero-sized title in front of it pushed the thing they came for below the
 * first screen. So: a breadcrumb that says where this is, an icon and a
 * page-sized title, one line of lede — and the content starts within reach.
 */

export function PageHeader({
  lang,
  kicker,
  title,
  lede,
  icon: Icon,
  children,
  className,
}: {
  lang: Lang;
  /** Shown as the breadcrumb's last step. */
  kicker?: string;
  title: string;
  lede?: string;
  icon?: LucideIcon;
  /** Beside the title on a wide screen, under it on a phone: a date, a status. */
  children?: React.ReactNode;
  className?: string;
}) {
  // The top clears the floating bar and the trial strip over it, with room to breathe.
  return (
    <header className={cn('relative isolate overflow-hidden border-b border-border/60 pt-36 sm:pt-40', className)}>
      <div className="aurora-field">
        <Orb className="-end-32 -top-40" color="rgb(16 185 129 / 0.24)" size="30rem" duration={32} />
        <Orb className="-start-24 -top-24" color="rgb(34 211 238 / 0.16)" size="26rem" duration={26} delay={4} />
      </div>

      <div className="shell relative pb-9 sm:pb-11">
        {/* Where this page is, and the way back. */}
        <Reveal variant="fade">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href={`/${lang}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Home className="size-3.5" />
              {siteConfig.shortName}
            </Link>
            {kicker && (
              <>
                <ChevronRight className="size-3.5 opacity-60" />
                <span className="font-semibold text-primary">{kicker}</span>
              </>
            )}
          </nav>
        </Reveal>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            {Icon && (
              <Reveal variant="fade" delay={0.05} className="shrink-0">
                <span className="grid size-12 place-items-center rounded-2xl bg-ramp text-white shadow-glow sm:size-14">
                  <Icon className="size-6 sm:size-7" />
                </span>
              </Reveal>
            )}
            <div className="min-w-0">
              <Reveal variant="up" delay={0.08}>
                <h1 className="h-page">{title}</h1>
              </Reveal>
              {lede && (
                <Reveal variant="up" delay={0.12}>
                  <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground sm:text-base">{lede}</p>
                </Reveal>
              )}
            </div>
          </div>
          {children && (
            <Reveal variant="fade" delay={0.16} className="shrink-0">
              {children}
            </Reveal>
          )}
        </div>
      </div>
    </header>
  );
}
