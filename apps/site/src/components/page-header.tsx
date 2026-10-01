import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { siteConfig, type Lang } from '@/lib/site';
import { Orb, Reveal } from '@/components/motion/primitives';

/**
 * The header of every page that is not the home page.
 *
 * The home page does its own thing with a billing screen in the shot; a
 * subpage does not have that luxury, so its header has to carry the aurora and
 * the scale on its own — and it does it with the same two props the sections
 * use, kicker and title and lede, so a pricing page and a legal page and a
 * sign-in page all open with the same shape the site has already taught its
 * reader to expect.
 */

export function PageHeader({
  lang,
  kicker,
  title,
  lede,
  children,
  className,
}: {
  lang: Lang;
  kicker?: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('relative isolate overflow-hidden pt-36 sm:pt-44', className)}>
      <div className="aurora-field">
        <Orb className="-end-40 -top-32" color="rgb(16 185 129 / 0.28)" size="42rem" duration={32} />
        <Orb className="-start-32 top-1/4" color="rgb(34 211 238 / 0.2)" size="36rem" duration={26} delay={4} />
      </div>

      <div className="shell relative pb-14 sm:pb-20">
        <Reveal variant="fade" className="mb-8 inline-flex">
          <Link
            href={`/${lang}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-2xs font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>{siteConfig.shortName}</span>
          </Link>
        </Reveal>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className={cn('max-w-3xl', children && 'flex-1')}>
            {kicker && (
              <Reveal variant="fade" delay={0.05}>
                <span className="eyebrow">{kicker}</span>
              </Reveal>
            )}
            <Reveal variant="up" delay={0.08}>
              <h1 className="h-display mt-5">{title}</h1>
            </Reveal>
            {lede && (
              <Reveal variant="up" delay={0.14}>
                <p className="lede measure mt-6">{lede}</p>
              </Reveal>
            )}
          </div>
          {children && (
            <Reveal variant="fade" delay={0.2} className="shrink-0">
              {children}
            </Reveal>
          )}
        </div>
      </div>
    </header>
  );
}