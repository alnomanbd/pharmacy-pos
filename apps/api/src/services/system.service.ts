import mongoose from 'mongoose';
import { stat } from 'node:fs/promises';
import { ClientErrorModel } from './clientError.service.js';
import { createRequire } from 'node:module';
import { JobRunModel, NotificationLogModel } from '../models/index.js';
import { env, isProduction } from '../config/env.js';
import { emailProvider } from '../integrations/email.js';
import { smsProvider } from '../integrations/sms.js';
import { errorReportingActive } from '../integrations/errorReporter.js';

/**
 * Is the platform healthy — the console's System page.
 *
 * Everything an owner would otherwise have to ask a developer: is the API up
 * and since when, does the database answer and how fast, did the scheduled
 * reminders run, are email and SMS actually going out or only being logged,
 * is anybody told about crashes, and when was the last backup.
 *
 * Each answer comes with a verdict (`ok`, `warning`, `critical`) so the page
 * can say "two things need attention" instead of leaving the reader to judge.
 */

export type Verdict = 'ok' | 'warning' | 'critical';
export interface Check {
  key: string;
  label: string;
  verdict: Verdict;
  detail: string;
}

const require = createRequire(import.meta.url);
const VERSION: string = (() => {
  try {
    return (require('../../package.json') as { version?: string }).version ?? '';
  } catch {
    return '';
  }
})();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The scheduler's verdict from its last run. Pure, for the tests: late is more
 * than twice the interval without a run, which allows one slow or skipped tick.
 */
export function schedulerVerdict(
  s: { enabled: boolean; intervalMinutes: number; lastRun: { startedAt: Date; ok: boolean } | null; uptimeMs: number },
  now = new Date(),
): Verdict {
  if (!s.enabled) return 'warning';
  const allowed = 2 * s.intervalMinutes * 60 * 1000;
  // Just started: give it one interval before calling it late.
  if (!s.lastRun) return s.uptimeMs < allowed ? 'ok' : 'critical';
  if (!s.lastRun.ok) return 'critical';
  return now.getTime() - s.lastRun.startedAt.getTime() > allowed ? 'critical' : 'ok';
}

/** A backup older than a day and a half has missed a night. */
export function backupVerdict(lastAt: Date | null, now = new Date()): Verdict {
  if (!lastAt) return 'warning';
  return now.getTime() - lastAt.getTime() > 1.5 * DAY_MS ? 'critical' : 'ok';
}

async function messageCounts(channel: 'email' | 'sms') {
  const since = new Date(Date.now() - DAY_MS);
  const [sent, failed, lastFailure] = await Promise.all([
    NotificationLogModel.countDocuments({ channel, status: 'sent', createdAt: { $gte: since } }),
    NotificationLogModel.countDocuments({ channel, status: 'failed', createdAt: { $gte: since } }),
    NotificationLogModel.findOne({ channel, status: 'failed' }).sort({ createdAt: -1 }).select('createdAt to').lean(),
  ]);
  return { sent24h: sent, failed24h: failed, lastFailureAt: lastFailure?.createdAt ?? null };
}

export async function systemStatus() {
  const now = new Date();
  const uptimeMs = Math.round(process.uptime() * 1000);
  const mem = process.memoryUsage();

  // ---- database
  let db: { up: boolean; pingMs: number | null; version: string; dataSizeMb: number | null; collections: number | null } = {
    up: false,
    pingMs: null,
    version: '',
    dataSizeMb: null,
    collections: null,
  };
  try {
    const admin = mongoose.connection.db!.admin();
    const t0 = Date.now();
    await admin.ping();
    const pingMs = Date.now() - t0;
    const [info, stats] = await Promise.all([admin.serverInfo(), mongoose.connection.db!.stats()]);
    db = {
      up: true,
      pingMs,
      version: String(info.version ?? ''),
      dataSizeMb: Math.round(((stats.dataSize as number) / 1024 / 1024) * 10) / 10,
      collections: Number(stats.collections ?? 0),
    };
  } catch {
    /* Down: reported as such below. */
  }

  // ---- scheduler
  const [lastRun, lastFailure] = db.up
    ? await Promise.all([
        JobRunModel.findOne({ job: 'subscriptionReminders' }).sort({ startedAt: -1 }).lean(),
        JobRunModel.findOne({ job: 'subscriptionReminders', ok: false }).sort({ startedAt: -1 }).lean(),
      ])
    : [null, null];
  const scheduler = {
    enabled: env.scheduler.enabled,
    intervalMinutes: env.scheduler.intervalMinutes,
    lastRun: lastRun
      ? { startedAt: lastRun.startedAt, finishedAt: lastRun.finishedAt, ok: lastRun.ok, error: lastRun.error, result: lastRun.result }
      : null,
    lastFailure: lastFailure ? { startedAt: lastFailure.startedAt, error: lastFailure.error } : null,
  };

  // ---- messages
  const [email, sms] = db.up
    ? await Promise.all([messageCounts('email'), messageCounts('sms')])
    : [null, null];

  // ---- backups: the nightly job touches a file when it finishes (see OPERATIONS.md)
  const markerPath = process.env.BACKUP_MARKER_FILE?.trim() || '';
  let lastBackupAt: Date | null = null;
  if (markerPath) {
    try {
      lastBackupAt = (await stat(markerPath)).mtime;
    } catch {
      lastBackupAt = null;
    }
  }

  // ---- verdicts
  const checks: Check[] = [];
  checks.push({
    key: 'database',
    label: 'Database',
    verdict: !db.up ? 'critical' : (db.pingMs ?? 0) > 250 ? 'warning' : 'ok',
    detail: db.up ? `Answering in ${db.pingMs} ms` : 'Not answering',
  });
  const sv = schedulerVerdict(
    { enabled: scheduler.enabled, intervalMinutes: scheduler.intervalMinutes, lastRun: scheduler.lastRun, uptimeMs },
    now,
  );
  checks.push({
    key: 'scheduler',
    label: 'Scheduled reminders',
    verdict: sv,
    detail: !scheduler.enabled
      ? 'Turned off on this server (SCHEDULER=off) — renewal reminders are not being sent from here'
      : scheduler.lastRun
        ? scheduler.lastRun.ok
          ? sv === 'ok'
            ? 'Running on time'
            : 'Has not run when it should have'
          : `Last run failed: ${scheduler.lastRun.error || 'unknown error'}`
        : 'Has not run yet since the server started',
  });
  const emailLogged = emailProvider.provider === 'log';
  checks.push({
    key: 'email',
    label: 'Email',
    verdict: emailLogged ? (isProduction ? 'critical' : 'warning') : (email?.failed24h ?? 0) > 0 ? 'warning' : 'ok',
    detail: emailLogged
      ? 'Not configured — emails are only written to the log, nobody receives them'
      : `${email?.sent24h ?? 0} sent and ${email?.failed24h ?? 0} failed in the last day`,
  });
  const smsLogged = smsProvider.provider === 'log';
  checks.push({
    key: 'sms',
    label: 'SMS',
    verdict: smsLogged ? 'warning' : (sms?.failed24h ?? 0) > 0 ? 'warning' : 'ok',
    detail: smsLogged
      ? 'No SMS gateway — texts (reset codes, reminders) are only written to the log'
      : `${sms?.sent24h ?? 0} sent and ${sms?.failed24h ?? 0} failed in the last day`,
  });
  checks.push({
    key: 'errors',
    label: 'Crash reports',
    verdict: errorReportingActive() ? 'ok' : isProduction ? 'warning' : 'ok',
    detail: errorReportingActive()
      ? 'Sent to the error tracker'
      : 'Not sent anywhere (SENTRY_DSN is not set) — errors are only in the server log',
  });
  /* Crashes in the shop app and the console, reported by the browsers themselves. */
  const browserErrors = db.up
    ? await ClientErrorModel.countDocuments({ lastAt: { $gte: new Date(now.getTime() - DAY_MS) } })
    : 0;
  checks.push({
    key: 'browser',
    label: 'Browser errors',
    verdict: browserErrors > 10 ? 'warning' : 'ok',
    detail: browserErrors
      ? `${browserErrors} different ${browserErrors === 1 ? 'fault' : 'faults'} in shops' and the console's browsers in the last day — listed below`
      : 'None in the last day',
  });
  const bv = backupVerdict(lastBackupAt, now);
  checks.push({
    key: 'backup',
    label: 'Backups',
    verdict: bv,
    detail: !markerPath
      ? 'Not reported to the app — set BACKUP_MARKER_FILE and have the nightly backup touch it (see OPERATIONS.md)'
      : lastBackupAt
        ? bv === 'ok'
          ? 'Up to date'
          : 'The last one is more than a day and a half old — a night was missed'
        : `No backup has finished yet (${markerPath} does not exist)`,
  });

  const worst: Verdict = checks.some((c) => c.verdict === 'critical')
    ? 'critical'
    : checks.some((c) => c.verdict === 'warning')
      ? 'warning'
      : 'ok';

  return {
    verdict: worst,
    checks,
    api: {
      version: VERSION,
      node: process.version,
      environment: isProduction ? 'production' : 'development',
      startedAt: new Date(now.getTime() - uptimeMs),
      uptimeMs,
      memoryMb: { rss: Math.round(mem.rss / 1024 / 1024), heap: Math.round(mem.heapUsed / 1024 / 1024) },
    },
    database: db,
    scheduler,
    messages: {
      email: { provider: emailProvider.provider, ...(email ?? {}) },
      sms: { provider: smsProvider.provider, ...(sms ?? {}) },
    },
    backup: { configured: Boolean(markerPath), lastAt: lastBackupAt },
    checkedAt: now,
  };
}
