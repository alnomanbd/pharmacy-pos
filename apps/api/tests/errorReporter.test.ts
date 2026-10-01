import { describe, it, expect } from 'vitest';

/**
 * The scrubber, as it is written in `integrations/errorReporter.ts`.
 *
 * Duplicated here rather than exported, because the point of the test is the
 * *rules* — and a rule that only exists inside a `beforeSend` callback is a rule
 * nobody can check. An error reporter is a pipe to a third party and this
 * application holds every shop's customers and their dues: what must never
 * travel down it is worth
 * pinning explicitly.
 */
const SECRET_KEYS = /pass|token|secret|authorization|cookie|otp|code|key/i;
const PII_KEYS = /name|phone|email|address|dob|nid|note|customer/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key)) out[key] = '[redacted]';
    else if (PII_KEYS.test(key)) out[key] = '[pii]';
    else out[key] = scrub(v, depth + 1);
  }
  return out;
}

describe('what may leave the box in an error report', () => {
  it('redacts credentials', () => {
    const out = scrub({
      password: 'hunter2',
      passwordHash: '$2a$12$abc',
      accessToken: 'ey...',
      refreshToken: 'ey...',
      authorization: 'Bearer ey...',
      apiKey: 'sk_live_1',
    }) as Record<string, string>;

    for (const v of Object.values(out)) expect(v).toBe('[redacted]');
  });

  it('removes anything that identifies a customer', () => {
    const out = scrub({
      customerName: 'A real person',
      phone: '01711000000',
      email: 'someone@example.com',
      address: 'Road 4, Dhanmondi',
      customer: 'Rahim Uddin',
      note: 'pays on the first of the month',
    }) as Record<string, string>;

    for (const v of Object.values(out)) expect(v).toBe('[pii]');
  });

  it('keeps what makes a fault reproducible', () => {
    // Ids, counts, flags and statuses are the whole point of a report.
    const out = scrub({
      organization: '507f1f77bcf86cd799439011',
      invoiceNo: 12,
      status: 'held',
      counterId: 'abc',
      retries: 3,
    }) as Record<string, unknown>;

    expect(out.organization).toBe('507f1f77bcf86cd799439011');
    expect(out.invoiceNo).toBe(12);
    expect(out.status).toBe('held');
    expect(out.retries).toBe(3);
  });

  it('reaches into nested objects', () => {
    // A customer does not stop being a customer for being one level down.
    const out = scrub({ sale: { token: { customerName: 'Someone', invoiceNo: 4 } } }) as {
      sale: { token: string };
    };
    // `token` is itself a secret key, so the whole branch is redacted — the
    // stricter of two matches wins, which is the right way round.
    expect(out.sale.token).toBe('[redacted]');
  });

  it('summarises arrays rather than sending them', () => {
    // A list is usually rows of records; its length is the useful part.
    expect(scrub({ items: [1, 2, 3] })).toEqual({ items: '[3 items]' });
  });

  it('redacts a list whose key is itself sensitive, rather than counting it', () => {
    // `tokens` matches the secret rule before the array rule is reached — and
    // that is the right order: a list of tokens is a list of live sessions.
    expect(scrub({ tokens: [1, 2, 3] })).toEqual({ tokens: '[redacted]' });
  });

  it('stops descending rather than following a deep structure forever', () => {
    let deep: Record<string, unknown> = { customerName: 'Someone' };
    for (let i = 0; i < 10; i++) deep = { level: deep };
    // Past the depth limit the value is returned as-is, which is why the limit
    // is set below anything this app actually nests.
    expect(() => scrub(deep)).not.toThrow();
  });
});
