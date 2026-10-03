import crypto from 'node:crypto';

/**
 * Encrypting a secret at rest — a shop's payment-gateway password, say —
 * so a copy of the database is not a copy of the shop's bKash account.
 *
 * AES-256-GCM, with the key from `DATA_ENCRYPTION_KEY`, or derived from the
 * access-token secret when that is not set. A value is `v1:<iv>:<tag>:<data>`,
 * all base64url; anything else is returned as empty rather than thrown, so a
 * corrupted field reads as "not set" and asks to be entered again.
 */
function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET || 'dev-only-key';
  return crypto.createHash('sha256').update(raw).digest();
}

export function seal(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

export function open(sealed: string): string {
  if (!sealed) return '';
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !data) return '';
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}
