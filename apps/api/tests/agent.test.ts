import { describe, it, expect } from 'vitest';
import { commissionOn, normaliseAgentCode, AGENT_CODE_RX } from '../src/services/agent.service.js';

/** What a field agent earns, and the codes on their links. */
describe('commission', () => {
  it('is the agent’s percent of the payment, to the whole taka', () => {
    expect(commissionOn(3000, 10)).toBe(300);
    expect(commissionOn(1500, 12.5)).toBe(188);
  });

  it('is nothing on nothing, and never more than half', () => {
    expect(commissionOn(0, 10)).toBe(0);
    expect(commissionOn(3000, 0)).toBe(0);
    expect(commissionOn(1000, 80)).toBe(500);
  });
});

describe('agent codes', () => {
  it('reads a typed code the way it is stored', () => {
    expect(normaliseAgentCode(' rahim mirpur ')).toBe('RAHIMMIRPUR');
    expect(AGENT_CODE_RX.test('RAHIM-10')).toBe(true);
    expect(AGENT_CODE_RX.test('AB')).toBe(false);
  });
});
