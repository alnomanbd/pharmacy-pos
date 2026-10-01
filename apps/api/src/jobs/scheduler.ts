import { sendSubscriptionReminders } from '../services/subscriptionReminder.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Background scheduler.
 *
 * One job today: warning a shop before its trial or subscription runs out.
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
  try {
    await sendSubscriptionReminders();
  } catch (err) {
    logger.error({ err }, 'Subscription reminder tick failed');
  } finally {
    running = false;
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
