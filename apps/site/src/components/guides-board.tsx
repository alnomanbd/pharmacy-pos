'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Boxes, ChevronRight, Loader2, PlayCircle, Rocket, ScanBarcode, Search, UserCog, Wallet } from 'lucide-react';
import { siteConfig, type Lang } from '@/lib/site';
import { Button } from '@/components/ui/button';

/**
 * The guides list and one guide, from the API's published help articles.
 * The site is static, so the chosen guide is `?a=<slug>` rather than a path.
 */
type Row = { slug: string; category: string; title: string; titleBn: string };
type Article = Row & { body: string; bodyBn: string; videoUrl: string };

const CATS: Record<string, { icon: typeof Rocket; en: string; bn: string }> = {
  'getting-started': { icon: Rocket, en: 'Getting started', bn: 'শুরু করা' },
  selling: { icon: ScanBarcode, en: 'Selling', bn: 'বিক্রি' },
  stock: { icon: Boxes, en: 'Stock', bn: 'স্টক' },
  money: { icon: Wallet, en: 'Money', bn: 'টাকা-পয়সা' },
  account: { icon: UserCog, en: 'Account', bn: 'অ্যাকাউন্ট' },
};

/** Plain text: paragraphs, and lines starting "1." become numbered steps — the same rule as in the app. */
function Body({ text }: { text: string }) {
  /* Lines in runs: numbered lines become one list, everything else a paragraph. */
  const runs: { steps: boolean; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      runs.push({ steps: false, lines: [] });
      continue;
    }
    const steps = /^\d+[.)]\s/.test(line);
    const last = runs[runs.length - 1];
    if (last && last.steps === steps && (steps || last.lines.length)) last.lines.push(line);
    else runs.push({ steps, lines: [line] });
  }
  return (
    <div className="flex flex-col gap-4 text-[0.98rem] leading-relaxed text-foreground/85">
      {runs
        .filter((r) => r.lines.length)
        .map((r, i) =>
          r.steps ? (
            <ol key={i} className="flex flex-col gap-2.5">
              {r.lines.map((l, k) => (
                <li key={k} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ramp text-xs font-bold text-white">{k + 1}</span>
                  <span className="pt-0.5">{l.replace(/^\d+[.)]\s*/, '')}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p key={i}>{r.lines.join(' ')}</p>
          ),
        )}
    </div>
  );
}

export function GuidesBoard({ lang }: { lang: Lang }) {
  const bn = lang === 'bn';
  const params = useSearchParams();
  const slug = params.get('a');
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [article, setArticle] = React.useState<Article | null>(null);
  const [q, setQ] = React.useState('');

  React.useEffect(() => {
    fetch(`${siteConfig.apiUrl}/public/guides`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Row[] } | null) => setRows(j?.data ?? []))
      .catch(() => setRows([]));
  }, []);

  React.useEffect(() => {
    setArticle(null);
    if (!slug) return;
    fetch(`${siteConfig.apiUrl}/public/guides/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Article } | null) => setArticle(j?.data ?? null))
      .catch(() => undefined);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug]);

  const title = (r: Row) => (bn && r.titleBn ? r.titleBn : r.title);

  if (slug) {
    if (!article) return <Loader2 className="mx-auto size-6 animate-spin text-primary" />;
    const body = bn && article.bodyBn ? article.bodyBn : article.body;
    const cat = CATS[article.category];
    return (
      <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass p-6 sm:p-9">
        <Link href={`/${lang}/guides`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="size-4" /> {bn ? 'সব গাইড' : 'All guides'}
        </Link>
        {cat && (
          <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <cat.icon className="size-3.5" /> {bn ? cat.bn : cat.en}
          </p>
        )}
        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{title(article)}</h2>
        <div className="mt-6">
          <Body text={body} />
        </div>
        {article.videoUrl && (
          <a href={article.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <PlayCircle className="size-5" /> {bn ? 'ভিডিওতে দেখুন' : 'Watch it on video'}
          </a>
        )}
        <div className="mt-8 flex flex-wrap gap-3 border-t border-border pt-6">
          <Button asChild>
            <Link href={`/${lang}/register`}>{bn ? 'ফ্রি শুরু করুন' : 'Start free'}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${lang}/contact`}>{bn ? 'প্রশ্ন আছে?' : 'Still stuck? Ask us'}</Link>
          </Button>
        </div>
      </motion.article>
    );
  }

  if (!rows) return <Loader2 className="mx-auto size-6 animate-spin text-primary" />;
  if (rows.length === 0) {
    return <p className="glass p-8 text-center text-muted-foreground">{bn ? 'এখনো কোনো গাইড নেই।' : 'No guides here yet.'}</p>;
  }

  const text = q.trim().toLowerCase();
  const shown = rows.filter((r) => !text || title(r).toLowerCase().includes(text) || r.title.toLowerCase().includes(text));
  const groups = Object.keys(CATS)
    .map((k) => ({ k, rows: shown.filter((r) => r.category === k) }))
    .filter((g) => g.rows.length);

  return (
    <div>
      <div className="relative mb-8">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={bn ? 'খুঁজুন — যেমন: বাকি, মেয়াদ, প্রিন্টার' : 'Search — e.g. baki, expiry, printer'}
          className="h-12 w-full rounded-2xl border border-border bg-card/80 pe-4 ps-11 text-sm shadow-glass outline-none backdrop-blur focus:border-primary/50"
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <AnimatePresence>
          {groups.map((g, gi) => {
            const cat = CATS[g.k];
            return (
              <motion.section key={g.k} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.06 }} className="glass p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <cat.icon className="size-4" />
                  </span>
                  {bn ? cat.bn : cat.en}
                </h3>
                <ul className="mt-3 flex flex-col">
                  {g.rows.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/${lang}/guides?a=${r.slug}`}
                        className="group flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-primary/[0.06]"
                      >
                        <span className="flex items-center gap-2">
                          <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                          {title(r)}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </motion.section>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
