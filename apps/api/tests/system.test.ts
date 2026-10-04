import { describe, it, expect } from 'vitest';
import { schedulerVerdict, backupVerdict } from '../src/services/system.service.js';

/** The System page's two judgements of time: is the scheduler late, is the backup stale. */
const now = new Date('2026-10-02T10:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60000);

describe('the scheduler', () => {
  const s = { enabled: true, intervalMinutes: 15, uptimeMs: 3 * 3600000 };

  it('is fine when it ran inside two intervals, and worked', () => {
    expect(schedulerVerdict({ ...s, lastRun: { startedAt: minsAgo(20), ok: true } }, now)).toBe('ok');
  });

  it('is late past two intervals, and failing if the last run failed', () => {
    expect(schedulerVerdict({ ...s, lastRun: { startedAt: minsAgo(31), ok: true } }, now)).toBe('critical');
    expect(schedulerVerdict({ ...s, lastRun: { startedAt: minsAgo(5), ok: false } }, now)).toBe('critical');
  });

  it('gets a grace period after the server starts, and is a warning when switched off', () => {
    expect(schedulerVerdict({ ...s, uptimeMs: 10 * 60000, lastRun: null }, now)).toBe('ok');
    expect(schedulerVerdict({ ...s, lastRun: null }, now)).toBe('critical');
    expect(schedulerVerdict({ ...s, enabled: false, lastRun: null }, now)).toBe('warning');
  });
});

describe('backups', () => {
  it('are fine within a day and a half, stale after, and a warning when nobody reports them', () => {
    expect(backupVerdict(minsAgo(20 * 60), now)).toBe('ok');
    expect(backupVerdict(minsAgo(37 * 60), now)).toBe('critical');
    expect(backupVerdict(null, now)).toBe('warning');
  });

  it('are a problem when the last run failed, and a warning when not copied off the server', () => {
    expect(backupVerdict(minsAgo(20 * 60), now, { state: 'failed', offsite: 'none' })).toBe('critical');
    expect(backupVerdict(minsAgo(20 * 60), now, { state: 'ok', offsite: 'failed' })).toBe('warning');
    expect(backupVerdict(minsAgo(20 * 60), now, { state: 'ok', offsite: 'off' })).toBe('warning');
    expect(backupVerdict(minsAgo(20 * 60), now, { state: 'ok', offsite: 'ok' })).toBe('ok');
  });
});
