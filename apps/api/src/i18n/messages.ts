import { BN_MESSAGES, BN_NOUNS } from './messages.bn.js';

/**
 * The API's refusals, in the language of the screen that asked.
 *
 * Every `badRequest('That bill is already cancelled')` in the services stays
 * as it is — in English, readable in the code and the logs — and is put into
 * Bangla on its way out (middlewares/error) when the shop app's screen is in
 * Bangla (`req.lang`, from its X-UI-Lang header). So a refusal does not arrive
 * as the one English sentence on an otherwise Bangla screen.
 *
 * The dictionary is keyed by the English message. A message built with values
 * — `Type the shop's name exactly ("${name}")` — is keyed by its template,
 * with {0}, {1}… where the values go, and the Bangla puts them wherever its
 * word order wants them. A value that is itself one of the names the API uses
 * ("Customer" in "Customer not found") is translated too. A message with no
 * entry goes out in English, as before — never broken.
 */

export type Lang = 'en' | 'bn';

interface Compiled {
  rx: RegExp;
  bn: string;
  /** How much of the template is fixed text — the most specific match wins. */
  weight: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compiled: Compiled[] = Object.entries(BN_MESSAGES)
  .filter(([en]) => /\{\d+\}/.test(en))
  .map(([en, bn]) => {
    const parts = en.split(/\{\d+\}/);
    const order = [...en.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
    const rx = new RegExp(`^${parts.map(escape).join('(.+?)')}$`, 's');
    return { rx, bn: renumber(bn, order), weight: parts.join('').length };
  })
  .sort((a, b) => b.weight - a.weight);

/** The Bangla's {n} refer to the English's {n}; captures arrive in the English order. */
function renumber(bn: string, order: number[]) {
  return bn.replace(/\{(\d+)\}/g, (_, n: string) => `{@${order.indexOf(Number(n))}}`);
}

const fill = (bn: string, values: string[]) => bn.replace(/\{@(\d+)\}/g, (_, i: string) => noun(values[Number(i)] ?? ''));

/** A value that is one of the API's own names is said in Bangla too. */
function noun(value: string) {
  return own(BN_NOUNS, value) ?? value;
}

/** Only the dictionary's own entries — never "constructor" and friends from Object.prototype. */
function own(dict: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
}

/** A message for the screen that asked — the same message when there is no Bangla for it. */
export function translateMessage(message: string, lang: Lang | undefined): string {
  if (lang !== 'bn' || !message) return message;
  const exact = own(BN_MESSAGES, message);
  if (exact) return exact;
  // "{X} not found" — the one shape every resource shares.
  const missing = /^(.+) not found$/.exec(message);
  const name = missing ? own(BN_NOUNS, missing[1]) : undefined;
  if (name) return `${name} পাওয়া যায়নি।`;
  for (const c of compiled) {
    const m = c.rx.exec(message);
    if (m) return fill(c.bn, m.slice(1));
  }
  return message;
}

/**
 * A rate limit's refusal in the language of the screen that hit it — for
 * express-rate-limit's `message`, which answers before the error handler does.
 */
export function limitReply(message: string) {
  return (req: { lang?: Lang }) => ({ success: false, message: translateMessage(message, req.lang), data: null });
}
