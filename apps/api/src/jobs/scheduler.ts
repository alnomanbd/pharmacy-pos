import { sendSubscriptionReminders } from '../services/subscriptionReminder.service.js';
import { sendDigests } from '../services/push.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { JobRunModel } from '../models/index.js';

/**
 * Background scheduler.
 *
 * Two jobs: warning a shop before its trial or subscription runs out, and
 * the morning and evening digests to owners' phones (push.service).
 * A plain interval rather than a cron library — the job is idempotent (each
 * threshold is remembered per shop once it is sent) and a missed tick is picked
 * up by the next, so precision is not worth a dependency. `SCHEDULER=off`
 * turns it off on an instance that should not send mail.
 */

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  // Skip rather than overlap: a slow mail server must not stack up runs.
  if (running) {
    logger.warn('Scheduler: previous run still in progress, skipping tick');
    return;
  }
  running = true;
  // Recorded, so the console's System page can say when it last ran and how.
  const startedAt = new Date();
  let ok = false;
  let error = '';
  let result: unknown = null;
  try {
    result = { sent: await sendSubscriptionReminders() };
    /* The phone digests ride on the same tick; a failure there is logged, not fatal. */
    const pushed = await sendDigests().catch((err) => {
      logger.warn({ err }, 'Push digests failed');
      return 0;
    });
    result = { ...(result as object), pushed };
    ok = true;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Subscription reminder tick failed');
  } finally {
    running = false;
    await JobRunModel.create({ job: 'subscriptionReminders', startedAt, finishedAt: new Date(), ok, error, result }).catch(
      (err) => logger.warn({ err }, 'Could not record the scheduler run'),
    );
  }
}

export function startScheduler() {
  if (!env.scheduler.enabled) {
    logger.info('Scheduler disabled (SCHEDULER=off)');
    return;
  }
  const intervalMs = env.scheduler.intervalMinutes * 60 * 1000;
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  logger.info({ everyMinutes: env.scheduler.intervalMinutes }, 'Scheduler started');
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  logger.info('Scheduler stopped');
}
