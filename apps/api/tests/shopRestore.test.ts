import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { RESTORED, KEPT, stageRequest, stampOfArchive } from '../src/services/shopRestore.service.js';
// Models defined beside their services, so that every one is registered here.
import '../src/services/leaving.service.js';
import '../src/services/push.service.js';

/** Putting one shop back from a backup. */
describe('what a restore covers', () => {
  it('decides for every collection that carries a shop, whether to put it back or leave it', () => {
    expect(mongoose.modelNames().length).toBeGreaterThan(30);
    const restored = new Set(RESTORED.map((r) => r.model.modelName));
    const undecided = mongoose
      .modelNames()
      .filter((name) => mongoose.model(name).schema.path('organization'))
      .filter((name) => !restored.has(name) && !KEPT.includes(name));
    expect(undecided).toEqual([]);
  });

  it('never puts back logins, the subscription or the audit trail', () => {
    const restored = RESTORED.map((r) => r.model.modelName);
    for (const name of ['User', 'Organization', 'Payment', 'AuditLog']) expect(restored).not.toContain(name);
    expect(restored.filter((n) => KEPT.includes(n))).toEqual([]);
  });
});

describe('asking the backup service to load a backup', () => {
  it('writes one setting per line, with a name that cannot add a line of its own', () => {
    const req = stageRequest('dawai-2026-10-03_0200.archive.gz', 'Noman\ncollection=users', ['sales', 'shopproducts']);
    expect(req.split('\n')).toEqual([
      'archive=dawai-2026-10-03_0200.archive.gz',
      'by=Noman collection=users',
      'collection=sales',
      'collection=shopproducts',
      '',
    ]);
  });

  it('asks only for plain collection names', () => {
    for (const r of RESTORED) expect(r.model.collection.collectionName).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('reads the night from the file name', () => {
    expect(stampOfArchive('dawai-2026-10-03_0200.archive.gz')).toBe('2026-10-03_0200');
  });
});
