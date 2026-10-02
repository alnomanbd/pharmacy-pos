import { describe, it, expect } from 'vitest';
import { pileOf, daysUntil, cooldownMessage, REMIND_COOLDOWN_MS } from '../src/services/retention.service.js';

/**
 * The Renewals page: which shop goes in which pile. A mistake here is a
 * customer nobody rang.
 */
const now = new Date('2026-10-02T10:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86400000);

describe('the piles', () => {
  const busy = inDays(-1);

  it('puts a trial ending inside the window in Trials ending', () => {
    expect(pileOf({ trial: true, endsAt: inDays(3), lastActivityAt: busy }, 7, now)).toBe('trialsEnding');
  });

  it('puts paid time ending inside the window in Renewals due', () => {
    expect(pileOf({ trial: false, endsAt: inDays(6.5), lastActivityAt: busy }, 7, now)).toBe('renewalsDue');
  });

  it('leaves a shop with weeks left and recent use alone', () => {
    expect(pileOf({ trial: false, endsAt: inDays(40), lastActivityAt: busy }, 7, now)).toBeNull();
  });

  it('calls an ended subscription lapsed for thirty days, then lets it go', () => {
    expect(pileOf({ trial: false, endsAt: inDays(-2), lastActivityAt: busy }, 7, now)).toBe('lapsed');
    expect(pileOf({ trial: true, endsAt: inDays(-29), lastActivityAt: busy }, 7, now)).toBe('lapsed');
    expect(pileOf({ trial: false, endsAt: inDays(-31), lastActivityAt: busy }, 7, now)).toBeNull();
  });

  it('flags a shop in good standing that has been silent for a week', () => {
    expect(pileOf({ trial: false, endsAt: inDays(40), lastActivityAt: inDays(-8) }, 7, now)).toBe('inactive');
    expect(pileOf({ trial: false, endsAt: inDays(40), lastActivityAt: null }, 7, now)).toBe('inactive');
    expect(pileOf({ trial: false, endsAt: inDays(40), lastActivityAt: inDays(-6) }, 7, now)).toBeNull();
  });

  it('lets an ending date win over silence: the renewal is the call to make', () => {
    expect(pileOf({ trial: true, endsAt: inDays(2), lastActivityAt: inDays(-20) }, 7, now)).toBe('trialsEnding');
  });

  it('ignores a shop with no end date', () => {
    expect(pileOf({ trial: false, endsAt: null, lastActivityAt: null }, 7, now)).toBeNull();
  });
});

describe('days left', () => {
  it('counts today as 0 and rounds part days up', () => {
    expect(daysUntil(inDays(0), now)).toBe(0);
    expect(daysUntil(inDays(0.2), now)).toBe(1);
    expect(daysUntil(inDays(-1.5), now)).toBe(-1);
  });
});

describe('one reminder at a time', () => {
  it('refuses the same reminder again within twelve hours, says when, and allows a different one', () => {
    const last = { at: new Date(now.getTime() - 2 * 3600000), kind: 'renewal' };
    expect(cooldownMessage(last, 'renewal', now)).toMatch(/2 hours ago/);
    expect(cooldownMessage(last, 'inactive', now)).toBeNull();
    expect(cooldownMessage({ at: new Date(now.getTime() - REMIND_COOLDOWN_MS), kind: 'renewal' }, 'renewal', now)).toBeNull();
    expect(cooldownMessage(null, 'renewal', now)).toBeNull();
  });
});
