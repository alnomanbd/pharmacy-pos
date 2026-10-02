import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LifeBuoy, Search, ArrowLeft, PlayCircle, Headset, ListChecks, CheckCircle2, Circle } from 'lucide-react';
import { helpApi, onboardingApi, type HelpArticle, type HelpArticleSummary, type ShopSetup } from '../api';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { useT, useUiLang, bnNumerals } from '../i18n/ui';
import { useAuthStore } from '@dawai/shared/store/auth.store';

/**
 * How-tos, in Bangla and English — the answer at nine at night when nobody is
 * at our desk.
 *
 * A list grouped by what the shop is trying to do, a search across the titles,
 * and each article as short paragraphs and numbered steps. Shown in Bangla
 * when the shop reads in Bangla and the article has it, English otherwise.
 */

const CATEGORY: Record<string, string> = {
  'getting-started': 'Getting started',
  selling: 'Selling',
  stock: 'Stock',
  money: 'Money and baki',
  account: 'Your account',
};
const ORDER = ['getting-started', 'selling', 'stock', 'money', 'account'];

/** Paragraphs, and runs of "1." lines as a numbered list. Text only — never HTML. */
function Body({ text, bn }: { text: string; bn: boolean }) {
  const blocks: ({ kind: 'p'; text: string } | { kind: 'ol'; items: string[] })[] = [];
  for (const line of text.split('\n')) {
    const step = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (step) {
      if (last?.kind === 'ol') last.items.push(step[1]);
      else blocks.push({ kind: 'ol', items: [step[1]] });
    } else if (line.trim()) {
      blocks.push({ kind: 'p', text: line.trim() });
    }
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ol key={i} className="space-y-2">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{bn ? bnNumerals(String(j + 1)) : j + 1}</span>
                <span className="min-w-0 flex-1">{it}</span>
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

/**
 * The getting-started checklist, where it can always be found again — the
 * top bar's copy can be hidden, and a hidden list has to come back from
 * somewhere. The owner's alone, like the top bar's.
 */
function SetupCard() {
  const t = useT();
  const lang = useUiLang();
  const role = useAuthStore((s) => s.user?.role);
  const [setup, setSetup] = useState<ShopSetup | null>(null);
  const runsTheShop = role === 'admin';

  useEffect(() => {
    if (!runsTheShop) return;
    onboardingApi
      .get()
      .then(setSetup)
      .catch(() => undefined);
  }, [runsTheShop]);

  if (!setup || setup.done >= setup.total) return null;
  const n = (v: number) => (lang === 'bn' ? bnNumerals(String(v)) : String(v));

  return (
    <div className="card mb-4 border-primary/40">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="mb-0 flex flex-1 items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" /> {t('Getting started')}
          <span className="pill waiting">
            {n(setup.done)}/{n(setup.total)}
          </span>
        </h3>
        {setup.dismissed && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              void onboardingApi
                .show()
                .then(setSetup)
                .catch(() => undefined)
            }
          >
            {t('Show it in the top bar again')}
          </button>
        )}
      </div>
      <ol className="grid gap-0.5 sm:grid-cols-2">
        {setup.steps.map((s) => (
          <li key={s.key}>
            <Link to={s.href} className={`flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted ${s.done ? 'text-muted-foreground' : ''}`}>
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className={s.done ? 'line-through' : ''}>{t(s.label)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Help() {
  const t = useT();
  const lang = useUiLang();
  const { slug } = useParams();
  const [list, setList] = useState<HelpArticleSummary[] | null>(null);
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [missing, setMissing] = useState(false);
  const [q, setQ] = useState('');

  const title = (a: { title: string; titleBn?: string }) => (lang === 'bn' && a.titleBn ? a.titleBn : a.title);

  useEffect(() => {
    helpApi
      .list()
      .then(setList)
      .catch(() => setList([]));
  }, []);

  useEffect(() => {
    setArticle(null);
    setMissing(false);
    if (!slug) return;
    helpApi
      .get(slug)
      .then(setArticle)
      .catch(() => setMissing(true));
  }, [slug]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (list ?? []).filter((a) => !needle || a.title.toLowerCase().includes(needle) || (a.titleBn ?? '').includes(q.trim()));
    return ORDER.map((c) => ({ key: c, rows: rows.filter((r) => r.category === c) })).filter((g) => g.rows.length);
  }, [list, q]);

  if (slug) {
    return (
      <div className="page mx-auto max-w-2xl">
        <Link to="/help" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t('All help')}
        </Link>
        {missing ? (
          <div className="card text-sm text-muted-foreground">{t('That article is not here any more.')}</div>
        ) : !article ? (
          <LoadingBlock />
        ) : (
          <div className="card">
            <h1 className="mb-4 text-xl font-bold">{title(article)}</h1>
            <Body text={lang === 'bn' && article.bodyBn ? article.bodyBn : article.body} bn={lang === 'bn'} />
            {article.videoUrl && (
              <a href={article.videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-5 inline-flex border border-border">
                <PlayCircle className="h-4 w-4" /> {t('Watch the video')}
              </a>
            )}
            <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
              {t('Still stuck?')}{' '}
              <Link to="/support" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <Headset className="h-4 w-4" /> {t('Ask us in Support')}
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page mx-auto max-w-3xl">
      <div className="topbar">
        <div>
          <h1 className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5" /> {t('Help')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('How to do things in Dawai, step by step.')}</p>
        </div>
      </div>
      <SetupCard />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="input h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('What do you want to do?')} aria-label={t('Search help')} />
      </div>
      {list === null ? (
        <LoadingBlock />
      ) : groups.length === 0 ? (
        <div className="card text-sm text-muted-foreground">
          {q ? t('Nothing matches that. Try another word, or ask us in Support.') : t('No articles yet.')}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="card mb-0">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t(CATEGORY[g.key] ?? g.key)}</h3>
              <ul className="divide-y divide-border">
                {g.rows.map((a) => (
                  <li key={a.slug}>
                    <Link to={`/help/${a.slug}`} className="block py-2.5 text-[15px] font-medium hover:text-primary">
                      {title(a)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
