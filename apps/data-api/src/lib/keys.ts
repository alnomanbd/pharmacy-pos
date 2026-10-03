import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * API keys: `dwk_` and 40 random characters. Only a SHA-256 of the key is
 * stored — a key is long and random, so a slow hash buys nothing and every
 * request would pay for it. The first 12 characters are kept to tell keys
 * apart on screen.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function newKey() {
  const bytes = randomBytes(40);
  let body = '';
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  const key = `dwk_${body}`;
  return { key, prefix: key.slice(0, 12), hash: hashKey(key) };
}

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** The key a request carries: `Authorization: Bearer dwk_…`, or `X-API-Key`. */
export function keyFrom(headers: Record<string, string | string[] | undefined>) {
  const auth = String(headers.authorization ?? '');
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  const raw = bearer ?? (typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : '');
  return /^dwk_[A-Za-z0-9]{40}$/.test(raw) ? raw : null;
}

/** Comparing secrets without telling the caller, by timing, how much was right. */
export function sameSecret(a: string, b: string) {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y) && a.length === b.length;
}
