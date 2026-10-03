import { describe, it, expect } from 'vitest';
import { seal, open } from '../src/utils/secretBox.js';

describe('secretBox', () => {
  it('opens what it sealed, and the sealed form does not show the secret', () => {
    const s = seal('bkash-password-123');
    expect(s.startsWith('v1:')).toBe(true);
    expect(s).not.toContain('bkash-password-123');
    expect(open(s)).toBe('bkash-password-123');
  });

  it('seals the same secret differently each time', () => {
    expect(seal('x')).not.toBe(seal('x'));
  });

  it('reads a tampered or foreign value as not set, rather than throwing', () => {
    const [v, iv, tag, data] = seal('secret').split(':');
    expect(open([v, iv, tag, data.slice(0, -2) + 'AA'].join(':'))).toBe('');
    expect(open('plain-text')).toBe('');
    expect(open('')).toBe('');
  });
});
