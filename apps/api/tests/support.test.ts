import { describe, it, expect } from 'vitest';
import { preview, openCapMessage, MAX_OPEN_PER_SHOP } from '../src/services/support.service.js';

/**
 * Support threads: the list line, and how many one shop may keep open.
 */
describe('the preview line', () => {
  it('folds a message onto one line', () => {
    expect(preview('Printer\n\n  stopped   working')).toBe('Printer stopped working');
  });

  it('never carries the whole of a long message', () => {
    expect(preview('x'.repeat(500))).toHaveLength(120);
  });
});

describe('the open cap', () => {
  it('lets a shop open conversations until twenty are open', () => {
    expect(MAX_OPEN_PER_SHOP).toBe(20);
    expect(openCapMessage(0)).toBeNull();
    expect(openCapMessage(19)).toBeNull();
    expect(openCapMessage(20)).toMatch(/20 conversations open/);
  });
});
