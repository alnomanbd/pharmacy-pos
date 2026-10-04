import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Server, Database, Clock, Mail } from 'lucide-react';
import { platformApi, type SystemStatus } from '../api';
import { useToast } from '@dawai/shared/components/Toast';
import { LoadingBlock } from '@dawai/shared/components/Spinner';
import { BTN_OUTLINE, errorMessage } from '../lib/ui';
import { lastSeen } from '../lib/lastSeen';
import IncidentsCard from '../components/IncidentsCard';
import BrowserErrorsCard from '../components/BrowserErrorsCard';
import BackupsCard from '../components/BackupsCard';

/**
 * Is the platform healthy.
 *
 * One verdict at the top, then each check with what it found — the database,
 * the scheduled reminders, email, SMS, crash reports and backups — each with an
 * icon and a word as well as a colour, so it reads the same to everyone. The
 * numbers behind them sit underneath for whoever needs them.
 */

const LOOK = {
  ok: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', word: 'OK' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', word: 'Needs attention' },
  critical: { icon: XCircle, cls: 'text-destructive', word: 'Problem' },
} as const;

const HEADLINE = {
  ok: 'Everything is working.',
  warning: 'Working, with something to look at.',
  critical: 'Something is wrong.',
} as const;

function duration(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} days`;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export default function System() {
  const { toast } = useToast();
  const [data, setData] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await platformApi.system());
    } catch (e) {
      toast(errorMessage(e, 'Could not check the system.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  }

  const top = LOOK[data.verdict];
  const attention = data.checks.filter((c) => c.verdict !== 'ok').length;

  return (
    <div className="page">
      <div className="topbar flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> System
          </h1>
          <p className="text-sm text-muted-foreground">Checked {lastSeen(data.checkedAt)}</p>
        </div>
        <button className={BTN_OUTLINE} onClick={() => void load()} disabled={busy}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Check again
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          <top.icon className={`h-7 w-7 shrink-0 ${top.cls}`} />
          <div>
            <div className="text-lg font-semibold">{HEADLINE[data.verdict]}</div>
            {attention > 0 && (
              <div className="text-sm text-muted-foreground">
                {attention} thing{attention === 1 ? '' : 's'} to look at below.
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 divide-y divide-border">
          {data.checks.map((c) => {
            const L = LOOK[c.verdict];
            return (
              <div key={c.key} className="flex items-start gap-3 py-2.5">
                <L.icon className={`mt-0.5 h-4 w-4 shrink-0 ${L.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{c.label}</span>
                    <span className={`text-xs font-semibold ${L.cls}`}>{L.word}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BackupsCard />

      <IncidentsCard />

      <BrowserErrorsCard />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card !mb-0">
          <h3 className="flex items-center gap-2"><Server className="h-4 w-4" /> API</h3>
          <Row k="Version" v={data.api.version || '—'} />
          <Row k="Environment" v={data.api.environment} />
          <Row k="Node" v={data.api.node} />
          <Row k="Up for" v={duration(data.api.uptimeMs)} />
          <Row k="Memory" v={`${data.api.memoryMb.rss} MB (heap ${data.api.memoryMb.heap} MB)`} />
        </div>
        <div className="card !mb-0">
          <h3 className="flex items-center gap-2"><Database className="h-4 w-4" /> Database</h3>
          <Row k="Status" v={data.database.up ? 'Answering' : 'Not answering'} />
          <Row k="Response" v={data.database.pingMs !== null ? `${data.database.pingMs} ms` : '—'} />
          <Row k="MongoDB" v={data.database.version || '—'} />
          <Row k="Data" v={data.database.dataSizeMb !== null ? `${data.database.dataSizeMb} MB in ${data.database.collections} collections` : '—'} />
          <Row k="Last backup" v={data.backup.lastAt ? lastSeen(data.backup.lastAt) : data.backup.configured ? 'none yet' : 'not reported'} />
        </div>
        <div className="card !mb-0">
          <h3 className="flex items-center gap-2"><Clock className="h-4 w-4" /> Scheduled reminders</h3>
          <Row k="Runs" v={data.scheduler.enabled ? `every ${data.scheduler.intervalMinutes} min` : 'off on this server'} />
          <Row k="Last run" v={data.scheduler.lastRun ? `${lastSeen(data.scheduler.lastRun.startedAt)}${data.scheduler.lastRun.ok ? '' : ' — failed'}` : 'not yet'} />
          <Row k="Last run did" v={data.scheduler.lastRun?.result && typeof data.scheduler.lastRun.result === 'object' && 'sent' in data.scheduler.lastRun.result ? `${(data.scheduler.lastRun.result as { sent: number }).sent} reminder(s) sent` : '—'} />
          <Row k="Last failure" v={data.scheduler.lastFailure ? `${lastSeen(data.scheduler.lastFailure.startedAt)} — ${data.scheduler.lastFailure.error}` : 'none in 30 days'} />
        </div>
        <div className="card !mb-0">
          <h3 className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email and SMS</h3>
          <Row k="Email via" v={data.messages.email.provider === 'log' ? 'log only (not configured)' : data.messages.email.provider} />
          <Row k="Email, last day" v={`${data.messages.email.sent24h ?? 0} sent · ${data.messages.email.failed24h ?? 0} failed`} />
          <Row k="SMS via" v={data.messages.sms.provider === 'log' ? 'log only (no gateway)' : data.messages.sms.provider} />
          <Row k="SMS, last day" v={`${data.messages.sms.sent24h ?? 0} sent · ${data.messages.sms.failed24h ?? 0} failed`} />
        </div>
      </div>
    </div>
  );
}
