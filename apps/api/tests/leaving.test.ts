import { describe, it, expect } from 'vitest';
import { shouldAsk, LEAVING_REASONS, LEAVING_LABEL } from '../src/services/leaving.service.js';

/** When a shop is asked why it did not renew. */
describe('asking why a shop did not renew', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  it('asks only once the time has run out, and for two months after', () => {
    expect(shouldAsk(daysAgo(-3), now)).toBe(false);
    expect(shouldAsk(daysAgo(1), now)).toBe(true);
    expect(shouldAsk(daysAgo(59), now)).toBe(true);
    expect(shouldAsk(daysAgo(61), now)).toBe(false);
    expect(shouldAsk(null, now)).toBe(false);
  });

  it('has a label for every reason', () => {
    for (const r of LEAVING_REASONS) expect(LEAVING_LABEL[r]).toBeTruthy();
  });
});
