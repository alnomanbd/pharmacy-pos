import { describe, it, expect } from 'vitest';
import { componentStates } from '../src/services/status.service.js';

/** The public status page: each part's state from the open incidents. */
describe('the status page', () => {
  it('is all operational with nothing open and the database up', () => {
    const r = componentStates([], true);
    expect(r.overall).toBe('operational');
    expect(Object.values(r.states).every((s) => s === 'operational')).toBe(true);
  });

  it('marks only the parts an incident names, and the worst impact wins', () => {
    const r = componentStates(
      [
        { components: ['payments'], impact: 'degraded' },
        { components: ['payments', 'messages'], impact: 'outage' },
      ],
      true,
    );
    expect(r.states.payments).toBe('outage');
    expect(r.states.messages).toBe('outage');
    expect(r.states.app).toBe('operational');
    expect(r.overall).toBe('outage');
  });

  it('reads a dead database as an app outage before anybody writes an incident', () => {
    expect(componentStates([], false).states.app).toBe('outage');
  });

  it('ignores a part it does not know', () => {
    expect(componentStates([{ components: ['nonsense'], impact: 'outage' }], true).overall).toBe('operational');
  });
});
