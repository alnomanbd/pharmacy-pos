/**
 * Phonetic Banglish → Bangla, so a salesman can type Bangla on the keyboard they
 * already have.
 *
 * The app can print Bangla labels, but a customer's name, a note on their
 * account and the "take it with warm water" line are the shop's own words — and
 * almost no counter PC has a Bangla keyboard layout installed. Told to write
 * Bangla with an English keyboard, a salesman writes English.
 * So: type `sokal e ekbar` and get `সকাল এ একবার`, the way Avro Phonetic works,
 * which is the scheme every Bangladeshi typist already knows.
 *
 * ## How it converts
 *
 * One pass, longest-match-first, over a word:
 *
 * - A consonant emits its letter. A consonant *immediately* after another
 *   consonant is a conjunct, so a virama (`্`) goes between them: `sasthyo` →
 *   `স্বাস্থ্য`-shaped clusters fall out of this rule rather than a list.
 * - A vowel after a consonant emits its **matra** (`ি`, `া`, …); the same vowel
 *   elsewhere emits the standalone letter (`ই`, `আ`, …).
 * - `o` after a consonant emits *nothing*: Bengali consonants carry an inherent
 *   `অ`. This one rule is what makes `sokal` → `সকাল` and not `সোকাল`, and it is
 *   why the whole word has to be converted at once rather than key by key.
 *
 * ## What it is not
 *
 * Not a spell-checker and not a dictionary. It transliterates sounds, so a
 * misspelt `Banglish` word produces a misspelt Bangla one — the typist reads
 * what they typed, in the field, before it is printed. Nothing here touches
 * text that is already Bangla, and digits and punctuation pass through, because
 * identifiers — bill numbers, batches, phone numbers — stay Latin.
 */

import { BANGLA_WORDS } from './banglaWords';

/** Independent vowels, and the matra each becomes after a consonant. */
const VOWELS: [pattern: string, letter: string, matra: string][] = [
  // Longest first — `ou` must beat `o`, `oi` must beat `o`, `rri` must beat `r`.
  ['OI', 'ঐ', 'ৈ'],
  ['OU', 'ঔ', 'ৌ'],
  ['oi', 'ঐ', 'ৈ'],
  ['ou', 'ঔ', 'ৌ'],
  ['rri', 'ঋ', 'ৃ'],
  ['ee', 'ঈ', 'ী'],
  ['oo', 'ঊ', 'ূ'],
  ['aa', 'আ', 'া'],
  ['I', 'ঈ', 'ী'],
  ['U', 'ঊ', 'ূ'],
  ['O', 'ও', 'ো'],
  ['A', 'আ', 'া'],
  ['a', 'আ', 'া'],
  ['i', 'ই', 'ি'],
  ['u', 'উ', 'ু'],
  ['e', 'এ', 'ে'],
  // `o` last, and its matra is empty: a consonant already carries this vowel.
  ['o', 'অ', ''],
];

/**
 * Consonants, longest pattern first.
 *
 * Capitals are the retroflex/alternate series, as in Avro: `T` is ট and `t` is
 * ত, `D` is ড and `d` is দ, `S` is ষ. That convention is not arbitrary — it is
 * the one a Bangladeshi typist's fingers already know.
 */
const CONSONANTS: [pattern: string, letter: string][] = [
  ['kkh', 'ক্ষ'],
  ['NGG', 'ঞ্জ'],
  ['ngo', 'ঙ্গ'],
  ['chh', 'ছ'],
  ['jhh', 'ঝ'],
  ['Dh', 'ঢ'],
  ['Th', 'ঠ'],
  ['bh', 'ভ'],
  ['ch', 'চ'],
  ['dh', 'ধ'],
  ['gh', 'ঘ'],
  ['jh', 'ঝ'],
  ['kh', 'খ'],
  ['ph', 'ফ'],
  ['sh', 'শ'],
  ['th', 'থ'],
  ['Ng', 'ঙ'],
  ['NG', 'ঞ'],
  ['ng', 'ং'],
  ['Rh', 'ঢ়'],
  ['ss', 'ষ'],
  ['k', 'ক'],
  ['g', 'গ'],
  ['c', 'চ'],
  ['j', 'জ'],
  ['T', 'ট'],
  ['D', 'ড'],
  ['N', 'ণ'],
  ['t', 'ত'],
  ['d', 'দ'],
  ['n', 'ন'],
  ['p', 'প'],
  ['f', 'ফ'],
  ['b', 'ব'],
  ['v', 'ভ'],
  ['m', 'ম'],
  ['z', 'য'],
  ['r', 'র'],
  ['l', 'ল'],
  ['S', 'ষ'],
  ['s', 'স'],
  ['h', 'হ'],
  ['R', 'ড়'],
  ['y', 'য়'],
  ['Y', 'য়'],
  ['w', 'ও'],
  ['W', 'ও'],
  ['x', 'ক্স'],
  ['q', 'ক'],
];

/** What `y` and `w` become when they attach to the consonant before them. */
const PHALA: Record<string, string> = { y: 'য', Y: 'য', w: 'ব', W: 'ব' };

/** `t/` → ৎ, `:` → ঃ, `^` → ঁ — the marks with no letter of their own. */
const MARKS: [pattern: string, output: string][] = [
  ['t/', 'ৎ'],
  ['^^', 'ঁ'],
  ['^', 'ঁ'],
  [':', 'ঃ'],
  ['.', '।'],
];

const VIRAMA = '্';

function matchAt(table: [string, ...string[]][], input: string, at: number) {
  for (const entry of table) {
    if (input.startsWith(entry[0], at)) return entry;
  }
  return null;
}

/**
 * Converts one run of Latin letters to Bangla.
 *
 * Anything that is not a letter — spaces, digits, `/`, `+`, existing Bangla — is
 * copied through untouched, so `Napa 500 mg sokale` keeps its brand and its
 * dose and converts only the word that was typed phonetically.
 *
 * A word in `BANGLA_WORDS` is spelled from that list instead of being
 * transliterated, because the two are not the same job: the rules below produce
 * the *sound*, and Bengali spelling is not always phonetic. `jor` sounds like
 * জর and is written জ্বর; `ekbar` transliterates to এক্বার because two adjacent
 * consonants make a conjunct. See `banglaWords.ts`.
 */
export function toBangla(input: string): string {
  const listed = BANGLA_WORDS[input.toLowerCase()];
  if (listed) return listed;
  /*
   * A capital means something only where the scheme gives it a meaning — `O`
   * is ও-কার, `T` is ট. Anywhere else it is just a name typed with a capital,
   * as Avro reads it: `Karim` is `karim`. Left alone it came out as `Kআরিম`.
   */
  //
  // `R` (ড়) and `N` (ণ) do mean something — but no Bangla word starts with
  // either, so at the start of a word they are a name's capital: `Rahim` is
  // রাহিম, not ড়াহিম, and `Nasrin` is নাসরিন.
  const named = input.replace(/^[RN]/, (c) => c.toLowerCase());
  return toBanglaRaw(named.replace(/[A-Z]/g, (c) => (convertsAsCapital(c) ? c : c.toLowerCase())));
}

/** The letter rules alone, capitals taken as written. */
function toBanglaRaw(input: string): string {

  let out = '';
  let i = 0;

  /**
   * Whether the last thing emitted was a bare consonant, i.e. whether the next
   * vowel is a matra and the next consonant needs a virama. Tracked rather than
   * read back off `out`, because a matra of `''` (the inherent vowel) leaves no
   * trace in the string: after `so` the text is just `স`, and `sokal` and `skal`
   * would otherwise be indistinguishable.
   */
  let pendingConsonant = false;

  while (i < input.length) {
    const mark = matchAt(MARKS, input, i);
    if (mark) {
      /*
       * `.` becomes `।` only where a sentence actually ends: after Bangla text,
       * and with nothing but whitespace after it. Both halves are load-bearing
       * — the first keeps `2.5 ml` intact, the second keeps
       * `owner@demo.com` from becoming `demo।com`.
       */
      const endsSentence =
        /[ঀ-৿]$/.test(out) && (i + 1 >= input.length || /\s/.test(input[i + 1]));
      out += mark[0] === '.' && !endsSentence ? '.' : mark[1];
      i += mark[0].length;
      pendingConsonant = false;
      continue;
    }

    const consonant = matchAt(CONSONANTS, input, i);
    if (consonant) {
      if (pendingConsonant) out += VIRAMA;
      /*
       * `y` and `w` are two letters each, and which one depends on position.
       *
       * Standing alone they are য় and ও (`oy` → অয়). Attached to a consonant
       * they are the phalas: `thy` is থ্য, not থ্য়, and `sw` is স্ব — the forms
       * that appear in `স্বাস্থ্য`, which is a word a medicine counter
       * genuinely needs.
       */
      const phala = pendingConsonant ? PHALA[consonant[0]] : undefined;
      out += phala ?? consonant[1];
      i += consonant[0].length;
      // `ং` and `ঁ` are marks on the previous letter, not consonants a virama
      // can hang off.
      pendingConsonant = !['ং', 'ঃ', 'ঁ'].includes(consonant[1]);
      continue;
    }

    const vowel = matchAt(VOWELS, input, i);
    if (vowel) {
      out += pendingConsonant ? vowel[2] : vowel[1];
      i += vowel[0].length;
      pendingConsonant = false;
      continue;
    }

    out += input[i];
    i += 1;
    pendingConsonant = false;
  }

  return out;
}

/** The characters `toBangla` treats as part of one word. */
export const isBanglishLetter = (ch: string) => /^[A-Za-z^:/]$/.test(ch);

/** Whether the scheme gives this capital a meaning of its own (memoised: 26 letters at most). */
const capitalMeans = new Map<string, boolean>();
function convertsAsCapital(c: string): boolean {
  let known = capitalMeans.get(c);
  if (known === undefined) {
    // A capital with no rule of its own is copied through unconverted; one with
    // a rule (`O`, `T`, `D`…) comes out differently from its lowercase.
    const asIs = toBanglaRaw(c);
    known = asIs !== c && asIs !== toBanglaRaw(c.toLowerCase());
    capitalMeans.set(c, known);
  }
  return known;
}
