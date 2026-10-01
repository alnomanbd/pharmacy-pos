import { describe, it, expect } from 'vitest';
import { generateSecret, generate, verify, generateURI } from 'otplib';

/**
 * Proves the TOTP wiring actually works, rather than that it compiles.
 *
 * otplib 13 renamed most of this API — `authenticator` is gone, `verify` returns
 * a result object rather than a boolean, and the drift option is
 * `epochTolerance`, not `window`. Every one of those is a change that type-checks
 * fine while silently accepting or rejecting every code, so it is worth a test
 * that generates a real code and checks it.
 */
describe('TOTP', () => {
  it('accepts a code it just generated', async () => {
    const secret = generateSecret();
    const token = await generate({ secret });
    const result = await verify({ secret, token, epochTolerance: 1 });
    expect(result.valid).toBe(true);
  });

  it('rejects a wrong code', async () => {
    const secret = generateSecret();
    const result = await verify({ secret, token: '000000', epochTolerance: 1 });
    // A one-in-a-million false pass is possible in principle; the generated
    // secret makes it not worth guarding against here.
    expect(result.valid).toBe(false);
  });

  it('rejects a code from a different secret', async () => {
    const token = await generate({ secret: generateSecret() });
    const result = await verify({ secret: generateSecret(), token, epochTolerance: 1 });
    expect(result.valid).toBe(false);
  });

  it('builds a URI an authenticator app can read', async () => {
    const secret = generateSecret();
    const uri = generateURI({
      issuer: 'Dawai',
      label: 'operator@example.com',
      secret,
    });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('Dawai');
    expect(uri).toContain(secret);
  });

  it('generates a secret in the base32 form apps expect', () => {
    // A raw or hex secret type-checks and scans, then never matches.
    expect(generateSecret()).toMatch(/^[A-Z2-7]+=*$/);
  });
});
