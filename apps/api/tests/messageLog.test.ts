import { describe, it, expect } from 'vitest';
import { recordMessage } from '../src/services/messageLog.service.js';
import { maskSmsBody } from '../src/utils/redact.js';

/** The message log must never get in the way of sending, and never keep a credential. */
describe('the message log', () => {
  it('does nothing, and does not throw, with no database to write to', () => {
    expect(() => recordMessage({ channel: 'sms', to: '01700000000', body: 'x', success: true, provider: 'log' })).not.toThrow();
  });

  it('masks what it keeps of an SMS: codes and links', () => {
    const kept = maskSmsBody('Dawai: reset — https://shop.dawai.com.bd/reset?token=abc code 482913', true);
    expect(kept).not.toMatch(/482913|token=abc/);
  });
});
