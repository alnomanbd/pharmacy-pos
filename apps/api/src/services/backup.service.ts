import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { badRequest } from '../utils/AppError.js';

/**
 * Backups, as the console sees them.
 *
 * The work is done by the `backup` service beside the API (ops/backup): it
 * dumps the database and packs the uploads every night, and whenever it finds
 * a request file in the folder they share. This side only reads that folder —
 * what is there, how the last run went — and leaves the request. The API
 * never runs mongodump itself, so a slow dump cannot hold up a shop's sale.
 *
 * Restoring is deliberately not here: putting the whole database back rolls
 * every shop back at once, and is done on the server (docs/OPERATIONS.md).
 */

/** The folder shared with the backup service. Unset: backups are not run by this deployment. */
export function backupDir(): string {
  return process.env.BACKUP_DIR?.trim() || '';
}

/** Exactly the names the backup service writes — and so the only names a download may ask for. */
export const BACKUP_FILE_RX = /^(dawai-\d{4}-\d{2}-\d{2}_\d{4}\.archive\.gz|uploads-\d{4}-\d{2}-\d{2}_\d{4}\.tgz)$/;

export interface BackupFile {
  name: string;
  kind: 'database' | 'uploads';
  size: number;
  at: Date;
}

export interface BackupRun {
  state: 'running' | 'ok' | 'failed';
  reason: string;
  by: string;
  startedAt: string;
  finishedAt: string;
  database: string;
  uploads: string;
  remote: string;
  offsite: 'ok' | 'failed' | 'off' | 'none';
  error: string;
}

/** One run's two files, under the timestamp they share. Newest first. */
export interface BackupSet {
  stamp: string;
  at: Date;
  database: BackupFile | null;
  uploads: BackupFile | null;
}

/** `2026-10-04_0200` from either file's name. */
function stampOf(name: string) {
  return name.replace(/^(dawai|uploads)-/, '').replace(/\.(archive\.gz|tgz)$/, '');
}

export function groupBackups(files: BackupFile[]): BackupSet[] {
  const sets = new Map<string, BackupSet>();
  for (const f of files) {
    const stamp = stampOf(f.name);
    const set = sets.get(stamp) ?? { stamp, at: f.at, database: null, uploads: null };
    set[f.kind] = f;
    if (f.at < set.at) set.at = f.at;
    sets.set(stamp, set);
  }
  return [...sets.values()].sort((a, b) => b.stamp.localeCompare(a.stamp));
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function backupState(dir = backupDir()) {
  if (!dir) return { configured: false as const };

  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    /* Not mounted yet: reported as nothing there. */
  }
  const files: BackupFile[] = [];
  for (const name of names) {
    if (!BACKUP_FILE_RX.test(name)) continue;
    try {
      const s = await stat(path.join(dir, name));
      files.push({ name, kind: name.startsWith('dawai-') ? 'database' : 'uploads', size: s.size, at: s.mtime });
    } catch {
      /* Removed between the listing and the look — the cleanup got there first. */
    }
  }

  const last = await readJson<BackupRun>(path.join(dir, '.status.json'));
  const pending = await readJson<{ by: string; at: string }>(path.join(dir, '.request'));

  return {
    configured: true as const,
    last,
    pending,
    sets: groupBackups(files),
  };
}

/**
 * Ask the backup service for one now. It looks every fifteen seconds; the
 * request is a file so the API needs nothing more than the shared folder.
 */
export async function requestBackup(by: string, dir = backupDir()) {
  if (!dir) throw badRequest('Backups are not set up on this server (BACKUP_DIR is not set).');
  const state = await backupState(dir);
  if (state.configured && (state.pending || state.last?.state === 'running')) {
    return { alreadyQueued: true as const };
  }
  await writeForBackupService(dir, '.request', JSON.stringify({ by: by.replace(/["\\\n\r]/g, ' '), at: new Date().toISOString() }));
  return { alreadyQueued: false as const };
}

/**
 * Leave a file for the backup service. The folder is the backup service's
 * volume; when it is not there, say so rather than fail as an internal error.
 */
export async function writeForBackupService(dir: string, name: string, content: string) {
  try {
    await writeFile(path.join(dir, name), content);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw badRequest(`The backup folder (${dir}) is not on this server. Is the backup service running? See docs/OPERATIONS.md, "Backups".`);
    }
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
      throw badRequest(`The API cannot write to the backup folder (${dir}). Check that the volume is mounted read-write.`);
    }
    throw err;
  }
}

/** The path of a backup to send, or null — never anything outside the folder. */
export async function backupFile(name: string, dir = backupDir()) {
  if (!dir || !BACKUP_FILE_RX.test(name)) return null;
  const full = path.join(dir, name);
  try {
    const s = await stat(full);
    return s.isFile() ? { path: full, size: s.size } : null;
  } catch {
    return null;
  }
}
