'use client';

import * as React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Wrench, WifiOff } from 'lucide-react';
import { translate, type Lang } from '@/i18n/dictionary';
import { siteConfig } from '@/lib/site';

type State = 'operational' | 'degraded' | 'maintenance' | 'outage';
interface Incident {
  _id: string;
  title: string;
  titleBn?: string;
  body?: string;
  bodyBn?: string;
  components: string[];
  impact: Exclude<State, 'operational'>;
  state: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  startedAt: string;
  resolvedAt: string | null;
}
interface Status {
  overall: State;
  components: { key: string; label: string; labelBn: string; state: State }[];
  open: Incident[];
  recent: Incident[];
  checkedAt: string;
}

const LOOK: Record<State, { icon: typeof CheckCircle2; cls: string }> = {
  operational: { icon: CheckCircle2, cls: 'text-success' },
  degraded: { icon: AlertTriangle, cls: 'text-amber-500' },
  maintenance: { icon: Wrench, cls: 'text-sky-500' },
  outage: { icon: XCircle, cls: 'text-destructive' },
};

const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
/** Month names and am/pm too, not only digits: "২ Oct" is half of each. */
const BN_WORDS: Record<string, string> = {
  Jan: 'জানু', Feb: 'ফেব্রু', Mar: 'মার্চ', Apr: 'এপ্রিল', May: 'মে', Jun: 'জুন', Jul: 'জুলাই',
  Aug: 'আগস্ট', Sept: 'সেপ্টে', Sep: 'সেপ্টে', Oct: 'অক্টো', Nov: 'নভে', Dec: 'ডিসে', am: 'এএম', pm: 'পিএম',
};
const digits = (s: string, lang: Lang) =>
  lang === 'bn'
    ? s.replace(/\d/g, (d) => BN[Number(d)]).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec|am|pm)\b/g, (w) => BN_WORDS[w] ?? w)
    : s;

/**
 * The live part of the status page: asks the API every minute, and says so
 * plainly when the API itself cannot be reached — that is the outage people
 * open this page to check.
 */
export function StatusBoard({ lang }: { lang: Lang }) {
  const t = (p: string) => translate(lang, p);
  const [data, setData] = React.useState<Status | null>(null);
  const [unreachable, setUnreachable] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    const ask = async () => {
      try {
        const res = await fetch(`${siteConfig.apiUrl.replace(/\/$/, '')}/public/status`, { cache: 'no-store' });
        const json = await res.json();
        if (!live) return;
        setData(json.data);
        setUnreachable(false);
      } catch {
        if (live) setUnreachable(true);
      }
    };
    void ask();
    const tick = window.setInterval(() => void ask(), 60_000);
    return () => {
      live = false;
      window.clearInterval(tick);
    };
  }, []);

  const when = (iso: string) =>
    digits(new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }), lang);
  const words = (i: Incident) => ({ title: lang === 'bn' && i.titleBn ? i.titleBn : i.title, body: lang === 'bn' && i.bodyBn ? i.bodyBn : i.body });

  if (unreachable) {
    return (
      <div className="panel flex items-start gap-3 p-6">
        <WifiOff className="mt-0.5 size-6 shrink-0 text-destructive" />
        <div>
          <p className="text-lg font-semibold">{t('pages.status.overall.unreachable')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('pages.status.offlineNote')}</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="panel h-48 animate-pulse" />;

  const Top = LOOK[data.overall];
  return (
    <div className="flex flex-col gap-5">
      <div className="panel flex items-center gap-3 p-6">
        <Top.icon className={`size-7 shrink-0 ${Top.cls}`} />
        <div>
          <p className="text-lg font-semibold">{t(`pages.status.overall.${data.overall}`)}</p>
          <p className="text-xs text-muted-foreground">
            {t('pages.status.checked')} {when(data.checkedAt)}
          </p>
        </div>
      </div>

      <div className="panel divide-y divide-border p-0">
        {data.components.map((c) => {
          const L = LOOK[c.state];
          return (
            <div key={c.key} className="flex items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1 text-sm font-medium">{lang === 'bn' ? c.labelBn : c.label}</span>
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${L.cls}`}>
                <L.icon className="size-4" /> {t(`pages.status.state.${c.state}`)}
              </span>
            </div>
          );
        })}
      </div>

      {data.open.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('pages.status.open')}</h2>
          {data.open.map((i) => {
            const w = words(i);
            const L = LOOK[i.impact];
            return (
              <div key={i._id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <L.icon className={`size-4 ${L.cls}`} />
                  <span className="font-semibold">{w.title}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{t(`pages.status.incident.${i.state}`)}</span>
                </div>
                {w.body && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{w.body}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('pages.status.started')} {when(i.startedAt)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('pages.status.recent')}</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pages.status.none')}</p>
        ) : (
          data.recent.map((i) => {
            const w = words(i);
            return (
              <div key={i._id} className="panel p-4">
                <p className="text-sm font-semibold">{w.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('pages.status.started')} {when(i.startedAt)}
                  {i.resolvedAt && <> · {t('pages.status.resolvedAt')} {when(i.resolvedAt)}</>}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
