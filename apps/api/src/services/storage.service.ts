import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Where uploaded files live.
 *
 * The layout is **tenant-first**, because the two operations that matter most
 * are per-tenant: exporting a shop's data, and deleting it when they leave.
 * Both become a single directory move or removal instead of a query across
 * scattered files, and no path can accidentally cross from one shop into
 * another.
 *
 *   uploads/
 *     org/<organizationId>/
 *       logo/<uuid>.png
 *       users/<userId>/photo/<uuid>.jpg
 *       payments/<paymentId>/<uuid>.jpg
 *     platform/
 *       <uuid>.<ext>              anything not owned by a shop
 *
 * The path a file is stored at is its **key**, and the key is what goes in the
 * database. Nothing is served from a static directory: these are shop logos,
 * staff photos and payment screenshots, and a public `/uploads`
 * would hand them to anyone who guessed a filename. Reads go through
 * `routes/file.routes.ts`, which checks the key's organization against the
 * caller before it opens anything.
 */

const ROOT = path.resolve(process.env.UPLOAD_DIR || 'uploads');

/** What each kind of upload is allowed to be, and how large. */
export const UPLOAD_RULES = {
  image: {
    mime: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    label: 'a PNG, JPEG or WebP image under 5 MB',
  },
  document: {
    mime: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    maxBytes: 15 * 1024 * 1024,
    label: 'an image or PDF under 15 MB',
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_RULES;

const EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/**
 * One path segment, validated rather than sanitised.
 *
 * Stripping the unsafe characters out would be safe from traversal but silently
 * wrong: `a/../../b` would become `ab`, and the file would be written under an
 * id nobody asked for and later looked for in vain. These are ids from a URL —
 * if one is not already a plain id, the request is a mistake or an attack, and
 * either deserves a refusal.
 */
const segment = (value: string) => {
  const raw = String(value);
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) throw badRequest('Invalid upload path');
  return raw;
};

export const keys = {
  orgLogo: (orgId: string) => `org/${segment(orgId)}/logo`,
  userPhoto: (orgId: string, userId: string) => `org/${segment(orgId)}/users/${segment(userId)}/photo`,
  payment: (orgId: string, paymentId: string) =>
    `org/${segment(orgId)}/payments/${segment(paymentId)}`,
  platform: () => 'platform',
};

/**
 * The organization a key belongs to, or null for platform-owned files.
 *
 * This is what the download route authorises against — the key carries its own
 * tenancy, so a file cannot be served to the wrong shop by forgetting a check
 * somewhere else.
 */
export function organizationOfKey(key: string): string | null {
  const match = /^org\/([a-zA-Z0-9_-]+)\//.exec(key);
  return match ? match[1] : null;
}

/** Resolves a key to a path inside the root, refusing anything that escapes. */
function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (!full.startsWith(rootWithSep)) throw badRequest('Invalid file path');
  return full;
}

/* ------------------------------------------------------------------ */
/* The provider                                                        */
/* ------------------------------------------------------------------ */

export interface StoredFile {
  key: string;
  size: number;
  mimeType: string;
  /** SHA-256, so a re-upload of the same bytes is recognisable. */
  checksum: string;
}

export interface StorageProvider {
  readonly driver: string;
  save(folder: string, file: { buffer: Buffer; mimetype: string }): Promise<StoredFile>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Everything under a prefix — offboarding a shop removes a whole folder. */
  removeFolder(prefix: string): Promise<void>;
}

class LocalDiskProvider implements StorageProvider {
  readonly driver = 'local';

  async save(folder: string, file: { buffer: Buffer; mimetype: string }): Promise<StoredFile> {
    const extension = EXTENSION[file.mimetype] ?? '';
    // A generated name, never the client's: an uploaded filename is attacker
    // input, and it is also how two staff photos called "me.jpg" would
    // overwrite each other.
    const key = `${folder}/${randomUUID()}${extension}`;
    const full = resolveKey(key);

    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, file.buffer);

    return {
      key,
      size: file.buffer.byteLength,
      mimeType: file.mimetype,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async read(key: string): Promise<Buffer> {
    const full = resolveKey(key);
    try {
      await stat(full);
    } catch {
      throw notFound('File');
    }
    return readFile(full);
  }

  async remove(key: string): Promise<void> {
    await rm(resolveKey(key), { force: true });
  }

  async removeFolder(prefix: string): Promise<void> {
    await rm(resolveKey(prefix), { recursive: true, force: true });
  }
}

/**
 * Chosen by `STORAGE_DRIVER`. Local disk is the default and is what a
 * single-server deployment wants; an S3 provider slots in here without any
 * caller changing, because they only ever see keys.
 */
function createProvider(): StorageProvider {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver !== 'local') {
    logger.warn({ driver }, 'Unknown STORAGE_DRIVER, falling back to local disk');
  }
  return new LocalDiskProvider();
}

export const storage = createProvider();

/** Validates an upload against its kind before it is written anywhere. */
export function assertAllowed(kind: UploadKind, file: { mimetype: string; size: number }) {
  const rule = UPLOAD_RULES[kind];
  if (!(rule.mime as readonly string[]).includes(file.mimetype)) {
    throw badRequest(`That file type is not accepted here — upload ${rule.label}.`);
  }
  if (file.size > rule.maxBytes) {
    throw badRequest(`That file is too large — upload ${rule.label}.`);
  }
}

export const mimeTypeOfKey = (key: string) =>
  Object.entries(EXTENSION).find(([, ext]) => key.endsWith(ext))?.[0] ?? 'application/octet-stream';
