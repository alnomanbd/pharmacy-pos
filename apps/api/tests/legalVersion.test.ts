import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TERMS_VERSION } from '../src/validators/auth.validator.js';

/**
 * The one thing that can quietly invalidate every acceptance record.
 *
 * `TERMS_VERSION` is what gets stamped on the user at signup; the date on the
 * marketing site's legal documents is what the user actually read. If they drift,
 * the account says a shop accepted a version of the terms that no reader was
 * ever shown — and nobody notices, because both halves work perfectly.
 */
describe('terms version', () => {
  it('matches the version of the published documents', () => {
    const docs = readFileSync(
      path.resolve(__dirname, '../../site/src/components/legal-doc.tsx'),
      'utf8',
    );
    const published = /const UPDATED = '([^']+)'/.exec(docs)?.[1];
    expect(published, 'UPDATED not found in site/src/components/legal-doc.tsx').toBeTruthy();
    expect(published).toBe(TERMS_VERSION);
  });
});
