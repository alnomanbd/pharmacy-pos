import { describe, it, expect } from 'vitest';
import { stateOf, isFor } from '../src/services/announcement.service.js';

/** Which announcements a shop sees, and what the console calls each one. */
const now = new Date('2026-10-02T10:00:00Z');
const at = (h: number) => new Date(now.getTime() + h * 3600000);

describe('where an announcement stands', () => {
  it('is live between its start and its end', () => {
    expect(stateOf({ active: true, startsAt: at(-1), endsAt: at(5) }, now)).toBe('live');
    expect(stateOf({ active: true, startsAt: at(-1), endsAt: null }, now)).toBe('live');
  });

  it('is scheduled before it starts, and ended once its end has passed', () => {
    expect(stateOf({ active: true, startsAt: at(2), endsAt: null }, now)).toBe('scheduled');
    expect(stateOf({ active: true, startsAt: at(-5), endsAt: at(-1) }, now)).toBe('ended');
  });

  it('is off when taken down, whatever its dates say', () => {
    expect(stateOf({ active: false, startsAt: at(-1), endsAt: null }, now)).toBe('off');
  });
});

describe('who it is for', () => {
  it('reaches every shop when no plan is chosen', () => {
    expect(isFor({ plans: [] }, 'basic')).toBe(true);
    expect(isFor({}, 'trial')).toBe(true);
  });

  it('reaches only the chosen plans otherwise', () => {
    expect(isFor({ plans: ['trial'] }, 'trial')).toBe(true);
    expect(isFor({ plans: ['trial'] }, 'plus')).toBe(false);
  });
});
