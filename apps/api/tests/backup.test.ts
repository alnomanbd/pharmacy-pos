import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BACKUP_FILE_RX, backupFile, backupState, requestBackup } from '../src/services/backup.service.js';

/** The console's view of the backup folder it shares with the backup service. */
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'dawai-backups-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('backup names', () => {
  it('admits only what the backup service writes', () => {
    expect(BACKUP_FILE_RX.test('dawai-2026-10-04_0200.archive.gz')).toBe(true);
    expect(BACKUP_FILE_RX.test('uploads-2026-10-04_0200.tgz')).toBe(true);
    expect(BACKUP_FILE_RX.test('../.env')).toBe(false);
    expect(BACKUP_FILE_RX.test('dawai-2026-10-04_0200.archive.gz.part')).toBe(false);
    expect(BACKUP_FILE_RX.test('.status.json')).toBe(false);
  });

  it('never hands out a file outside the folder, or one half written', async () => {
    await writeFile(path.join(dir, 'dawai-2026-10-04_0200.archive.gz.part'), 'x');
    expect(await backupFile('../../etc/passwd', dir)).toBeNull();
    expect(await backupFile('dawai-2026-10-04_0200.archive.gz.part', dir)).toBeNull();
    expect(await backupFile('dawai-2026-10-03_0200.archive.gz', dir)).toBeNull();
  });
});

describe('the folder', () => {
  it('pairs each night’s database and uploads, newest first, with the last run', async () => {
    await writeFile(path.join(dir, 'dawai-2026-10-03_0200.archive.gz'), 'aa');
    await writeFile(path.join(dir, 'uploads-2026-10-03_0200.tgz'), 'b');
    await writeFile(path.join(dir, 'dawai-2026-10-04_0200.archive.gz'), 'ccc');
    await writeFile(path.join(dir, '.status.json'), JSON.stringify({ state: 'ok', offsite: 'ok' }));
    const s = await backupState(dir);
    if (!s.configured) throw new Error('configured');
    expect(s.sets.map((x) => x.stamp)).toEqual(['2026-10-04_0200', '2026-10-03_0200']);
    expect(s.sets[0].database?.size).toBe(3);
    expect(s.sets[0].uploads).toBeNull();
    expect(s.sets[1].uploads?.size).toBe(1);
    expect(s.last?.state).toBe('ok');
    expect(s.pending).toBeNull();
  });

  it('is reported as not set up without a folder', async () => {
    expect((await backupState('')).configured).toBe(false);
  });
});

describe('asking for one', () => {
  it('leaves a request once, and not again while one is waiting or running', async () => {
    expect((await requestBackup('Noman', dir)).alreadyQueued).toBe(false);
    expect(JSON.parse(await readFile(path.join(dir, '.request'), 'utf8')).by).toBe('Noman');
    expect((await requestBackup('Noman', dir)).alreadyQueued).toBe(true);
    await rm(path.join(dir, '.request'));
    await writeFile(path.join(dir, '.status.json'), JSON.stringify({ state: 'running' }));
    expect((await requestBackup('Noman', dir)).alreadyQueued).toBe(true);
  });

  it('keeps a quote in a name from breaking the request file', async () => {
    await requestBackup('A "B"\n', dir);
    expect(JSON.parse(await readFile(path.join(dir, '.request'), 'utf8')).by).toBe('A  B  ');
  });
});
