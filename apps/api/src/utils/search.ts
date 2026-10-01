/**
 * Search-term helpers.
 *
 * User input must never be fed to `new RegExp` directly: a stray `(` or `[`
 * throws (a 500 on a plain medicine search), and a crafted term is a ReDoS
 * vector against a 25k-document catalog.
 */

const SPECIALS = /[.*+?^${}()|[\]\\]/g;

/** Escapes every regex metacharacter so the term matches literally. */
export function escapeRegex(term: string) {
  return term.replace(SPECIALS, '\\$&');
}

/**
 * Prefix match, anchored so MongoDB can walk the field's index instead of
 * scanning the collection. The counter types the start of a brand or generic name,
 * so anchoring is also the more useful ranking.
 */
export function prefixRegex(term: string) {
  return new RegExp(`^${escapeRegex(term.trim())}`, 'i');
}

/** Unanchored match. Correct but always a collection scan — use sparingly. */
export function containsRegex(term: string) {
  return new RegExp(escapeRegex(term.trim()), 'i');
}
