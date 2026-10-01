import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { translate, tList, tItems, type Lang } from '@/i18n/dictionary';
import { isLang, DEFAULT_LANG } from '@/lib/site';
import { subpageMetadata } from '@/lib/subpage-meta';
import { PageHeader } from '@/components/page-header';
import { Section, SectionHead } from '@/components/section';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives';
import { DemoForm } from '@/components/demo-form';
import { PosScreen, PrintedBillNote } from '@/components/pos-screen';

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'bn' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return subpageMetadata(isLang(lang) ? lang : DEFAULT_LANG, 'demo', 'demo');
}

type Step = { n: string; title: string; body: string };

export default async function DemoPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;

  const t = (p: string) => translate(l, p);
  const steps = tItems<Step>(l, 'demo.steps.item');
  const rights = tList(l, 'demo.book.rights');

  return (
    <>
      <PageHeader
        lang={l}
        kicker={t('nav.demo')}
        title={t('demo.title')}
        lede={t('demo.lede')}
      />

      {/* The proof: the actual billing screen, running — not a picture of it. */}
      <Section tone="dark" orbs={2} bordered={false} className="py-20 sm:py-28">
        <div className="shell relative grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="flex flex-col items-start gap-5">
            <Reveal variant="fade">
              <span className="eyebrow">{t('demo.screen.kicker')}</span>
            </Reveal>
            <Reveal variant="up">
              <h2 className="h-section text-white">{t('demo.screen.title')}</h2>
            </Reveal>
            <Reveal variant="up" delay={0.1}>
              <p className="measure text-pretty leading-relaxed text-white/60">
                {t('demo.screen.body')}
              </p>
            </Reveal>
            <Reveal variant="fade" delay={0.18}>
              <div className="mt-1">
                <PrintedBillNote lang={lang} />
              </div>
            </Reveal>
          </div>

          <Reveal variant="up" delay={0.12}>
            <PosScreen className="w-full" lang={lang} />
          </Reveal>
        </div>
      </Section>

      {/* How the call goes: four steps, numbered. */}
      <Section tone="light" className="py-20 sm:py-28">
        <div className="shell">
          <SectionHead eyebrow={t('demo.steps.eyebrow')} title={t('demo.steps.title')} />
          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2" step={0.07}>
            {steps.map((s) => (
              <StaggerItem key={s.n}>
                <article className="glass panel-lift flex h-full flex-col gap-3 p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xs tabular-nums text-primary">{s.n}</span>
                    <span className="size-1.5 rounded-full bg-primary/40" />
                  </div>
                  <h3 className="h-card text-lg">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>

      {/* The booking: what you get, and the form. */}
      <Section tone="light" className="py-20 sm:py-28">
        <div className="shell grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28">
            <Reveal variant="fade">
              <span className="eyebrow">{t('demo.book.eyebrow')}</span>
            </Reveal>
            <Reveal variant="up">
              <h2 className="h-section">{t('demo.book.title')}</h2>
            </Reveal>
            <Reveal variant="up" delay={0.08}>
              <p className="lede measure">{t('demo.book.lede')}</p>
            </Reveal>

            <ul className="mt-1 flex flex-col gap-3">
              {rights.map((r) => (
                <li key={r} className="glass flex items-start gap-3 p-4">
                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-primary" />
                  <span className="text-sm leading-relaxed text-foreground/90">{r}</span>
                </li>
              ))}
            </ul>

            <Link
              href={`/${l}/register`}
              className="group mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              {t('demo.book.trialLink')}
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>

          <Reveal variant="up" delay={0.1}>
            <DemoForm lang={l} />
          </Reveal>
        </div>
      </Section>
    </>
  );
}