import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Mail, MapPin, MessagesSquare, TimerReset } from 'lucide-react';
import { translate, type Lang } from '@/i18n/dictionary';
import { isLang, DEFAULT_LANG, siteConfig } from '@/lib/site';
import { subpageMetadata } from '@/lib/subpage-meta';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Reveal } from '@/components/motion/primitives';
import { ContactForm } from '@/components/contact-form';

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'bn' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return subpageMetadata(isLang(lang) ? lang : DEFAULT_LANG, 'contact', 'contact');
}

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;

  const t = (p: string) => translate(l, p);

  return (
    <>
      <PageHeader
        lang={l}
        kicker={t('pages.contact.kicker')}
        title={t('pages.contact.title')}
        lede={t('pages.contact.lede')}
        icon={MessagesSquare}
      />

      <Section id="contact" tone="light" orbs={1} className="py-10 sm:py-14">
        <div className="shell grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <div className="flex flex-col gap-4">
            {/* A heading for this column, smaller than the page's own title above it. */}
            <Reveal variant="up">
              <span className="eyebrow">
                <span className="size-1.5 rounded-full bg-current" />
                {t('pages.contact.direct.title')}
              </span>
              <h2 className="mt-3 text-balance text-xl font-bold leading-snug tracking-[-0.02em] sm:text-2xl">
                {t('pages.contact.direct.lede')}
              </h2>
            </Reveal>

            <Reveal variant="up" delay={0.1} className="flex flex-col gap-3.5">
              <a
                href={`mailto:${siteConfig.contactEmail}`}
                className="panel group flex items-start gap-4 p-5 transition-colors hover:border-primary/40"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Mail className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{lang === 'bn' ? 'ইমেইল' : 'Email'}</span>
                  <span className="text-sm text-muted-foreground">{siteConfig.contactEmail}</span>
                </span>
              </a>

              <div className="panel flex items-start gap-4 p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MapPin className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{lang === 'bn' ? 'ঠিকানা' : 'Address'}</span>
                  <span className="text-sm text-muted-foreground">{lang === 'bn' ? siteConfig.addressBn : siteConfig.address}</span>
                </span>
              </div>

              <div className="panel flex items-start gap-4 p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <TimerReset className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{t('pages.contact.response')}</span>
                  <span className="text-sm text-muted-foreground">
                    {t('pages.contact.lede')}
                  </span>
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal variant="up" delay={0.12}>
            <ContactForm lang={l} />
          </Reveal>
        </div>
      </Section>
    </>
  );
}