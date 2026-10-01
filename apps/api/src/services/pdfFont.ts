import fs from 'node:fs';
import path from 'node:path';
// pdfkit's own font engine, and therefore already a dependency. No types are
// published for it, hence the local declaration in `src/types/fontkit.d.ts`.
// A namespace import, not a default one: fontkit is ESM and exports no default,
// so `import fontkit from 'fontkit'` type-checks and then throws at runtime.
import * as fontkit from 'fontkit';
import { logger } from '../utils/logger.js';

/**
 * Font resolution for generated PDFs.
 *
 * pdfkit's built-in fonts are the 14 standard PDF fonts, all Latin-only. Given
 * Bengali text they do **not** throw — they silently render the wrong glyphs,
 * which on a bill is worse than an error. Since this app prints Bangla bills,
 * invoices and registers, a Unicode TTF has to be embedded.
 *
 * The font is not committed to the repo (licensing, and ~400KB of binary in
 * every clone). Provide one of:
 *   - `PDF_FONT_PATH` / `PDF_FONT_BOLD_PATH` pointing at .ttf files, or
 *   - drop `regular.ttf` / `bold.ttf` into `backend/assets/fonts/`.
 *
 * The font has to cover **both** scripts, and this is worth stating precisely
 * because getting it wrong is silent: the per-script Noto build of Noto Sans
 * Bengali holds 135 characters and no Latin, and embedding it blanks out every
 * English document while making Bangla look perfect. `coverage()` below
 * refuses such a font. The `googlefonts` build of the same family covers both.
 *
 * With no font at all, Latin documents are perfect and Bengali characters
 * are dropped rather than mis-drawn — `warnIfUnsupported` logs that loudly
 * rather than letting it pass unnoticed.
 */

export interface PdfFonts {
  regular: string;
  bold: string;
  /** True when the fonts can render Bengali (i.e. an embedded TTF is in use). */
  unicode: boolean;
}

const ASSET_DIR = path.resolve(process.cwd(), 'assets/fonts');
const CANDIDATES = {
  regular: ['regular.ttf', 'NotoSansBengali-Regular.ttf', 'NotoSans-Regular.ttf'],
  bold: ['bold.ttf', 'NotoSansBengali-Bold.ttf', 'NotoSans-Bold.ttf'],
};

/**
 * Whether a font file can draw both alphabets this app prints.
 *
 * This check is not defensive tidiness — it is the fix for a font that looked
 * right and was not. The per-script Noto build
 * (`notofonts.github.io/fonts/NotoSansBengali/hinted/ttf`) contains 135
 * characters: Bengali and nothing else, no Latin at all. Embedded, it renders
 * Bangla beautifully and turns every English document — every customer name,
 * every strength, every date — into a page of blank `.notdef` boxes. Nothing in
 * the app noticed: pdfkit does not complain, the PDF is well-formed, and the
 * file size looks normal.
 *
 * So a candidate font has to prove it covers Latin as well as Bengali before it
 * is trusted with the document. The one that does is the `googlefonts/ttf`
 * build of the same family (457 characters).
 */
export function coverage(file: string): FontCoverage {
  try {
    const font = fontkit.openSync(file) as unknown as {
      glyphForCodePoint(cp: number): { id: number };
    };
    const covers = (sample: string) =>
      [...sample].every((ch) => font.glyphForCodePoint(ch.codePointAt(0)!).id !== 0);
    return {
      // Digits and punctuation as well as letters: a strength is "500 mg/5 ml".
      latin: covers('ABCabc0123456789 .,-/()+'),
      bengali: covers('সকালদুপুরবিকালরাতখাবারেরপরেরোগীরনাম'),
    };
  } catch {
    return { latin: false, bengali: false };
  }
}

function firstExisting(explicit: string | undefined, names: string[]) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  for (const name of names) {
    const candidate = path.join(ASSET_DIR, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export interface FontCoverage {
  latin: boolean;
  bengali: boolean;
}

const STANDARD: PdfFonts = { regular: 'Helvetica', bold: 'Helvetica-Bold', unicode: false };

/**
 * Which fonts to use, given what is installed and what it covers.
 *
 * Pure, and separate from the filesystem, because the branch that matters most
 * is the hardest to set up: a font that draws Bengali and no Latin. That case
 * cannot be covered by a test without committing such a font to the repo, so
 * the decision is tested here and the file lookup is left to `resolveFonts`.
 */
export function decideFonts(
  regularPath: string | null,
  boldPath: string | null,
  cov: FontCoverage | null,
): { fonts: PdfFonts; reason: 'standard' | 'embedded' | 'no-latin' | 'no-bengali' } {
  if (!regularPath || !cov) return { fonts: STANDARD, reason: 'standard' };

  if (!cov.latin) {
    /*
     * A Bengali-only font. Refused, and this is the important branch.
     *
     * Taking it would trade a real problem for a much worse one: Bangla text
     * would draw, and every Latin character in the document — names, doses,
     * dates, the shop's own address — would come out as an empty box. Falling
     * back to the standard fonts keeps every English document correct and
     * loses only Bangla, which is the failure a shop can see and report.
     */
    return { fonts: STANDARD, reason: 'no-latin' };
  }

  const fonts: PdfFonts = {
    regular: regularPath,
    // A bold face is optional; the regular one is reused if absent, which
    // loses weight contrast but never breaks the glyphs.
    bold: boldPath ?? regularPath,
    unicode: cov.bengali,
  };
  // A Latin-only TTF is a legitimate choice — a shop may simply want its own
  // typeface — but it cannot render a Bangla bill, and `unicode` is
  // what tells the rest of the app that.
  return { fonts, reason: cov.bengali ? 'embedded' : 'no-bengali' };
}

let cached: PdfFonts | null = null;

export function resolveFonts(): PdfFonts {
  if (cached) return cached;

  const regularPath = firstExisting(process.env.PDF_FONT_PATH, CANDIDATES.regular);
  const boldPath = firstExisting(process.env.PDF_FONT_BOLD_PATH, CANDIDATES.bold);
  const cov = regularPath ? coverage(regularPath) : null;

  const { fonts, reason } = decideFonts(regularPath, boldPath, cov);
  cached = fonts;

  if (reason === 'no-latin') {
    logger.error(
      { regular: regularPath, bengali: cov?.bengali },
      'PDF: the configured font has no Latin glyphs, so it would blank out every ' +
        'English document — ignoring it and using the standard fonts. Use a font ' +
        'covering both scripts (see assets/fonts/README.md).',
    );
  } else if (reason === 'no-bengali') {
    logger.warn(
      { regular: regularPath },
      'PDF: the configured font has no Bengali glyphs — Bangla documents will ' +
        'fall back to English labels.',
    );
  } else if (reason === 'embedded') {
    logger.info({ regular: fonts.regular, bold: fonts.bold }, 'PDF: embedded font in use');
  } else {
    logger.warn(
      { assetDir: ASSET_DIR },
      'PDF: no Unicode font found — Latin renders correctly, Bangla will not. ' +
        'Set PDF_FONT_PATH or add assets/fonts/regular.ttf (a build covering Latin and Bengali).',
    );
  }

  return cached;
}

/** Test seam — lets a test point the resolver at a different font. */
export function resetFontCache() {
  cached = null;
}

/** Bengali block (U+0980–U+09FF). */
const BENGALI = /[ঀ-৿]/;

export function containsBengali(...values: (string | undefined | null)[]) {
  return values.some((v) => typeof v === 'string' && BENGALI.test(v));
}

/**
 * Logs when a document carries Bengali text that the active fonts cannot draw.
 * The PDF is still produced: a shop with a customer waiting is better served by
 * a document with one unreadable line than by a refused download, and the problem is
 * immediately visible on the page.
 */
export function warnIfUnsupported(fonts: PdfFonts, context: string, ...values: (string | undefined | null)[]) {
  if (fonts.unicode) return false;
  if (!containsBengali(...values)) return false;
  logger.error(
    { context },
    'PDF: document contains Bangla text but no font that can draw Bengali is configured — ' +
      'that text will be dropped from the page. Set PDF_FONT_PATH or add ' +
      'assets/fonts/regular.ttf (a build covering Latin *and* Bengali).',
  );
  return true;
}

/**
 * Characters outside WinAnsi that this app actually emits, with ASCII stand-ins.
 *
 * pdfkit encodes the standard fonts as WinAnsi, and a character outside it is
 * dropped or mapped to something else entirely — the taka sign vanished from
 * a day's totals and a star turned into an ampersand next to a customer's
 * name. Both failures were silent, which is the dangerous part.
 */
const WINANSI_FALLBACKS: [RegExp, string][] = [
  [/\u09f3/g, 'Tk'], // taka sign
  [/[\u2605\u2606]/g, '*'], // priority star
  [/\u2264/g, '<='],
  [/\u2265/g, '>='],
  [/\u2192/g, '->'],
  [/\u2026/g, '...'],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
];

/** Anything still outside what WinAnsi can encode after the swaps above. */
const NON_WINANSI = /[^\u0020-\u00ff\u2013\u2014\u20ac\u2022]/g;

/**
 * Makes a string safe for the active fonts.
 *
 * With an embedded Unicode font the text passes through untouched — Bangla
 * and all. Without one, characters the standard fonts cannot encode are swapped
 * for ASCII equivalents where a sensible one exists and dropped otherwise, so a
 * page never carries a silently wrong glyph.
 */
export function safeText(fonts: PdfFonts, value: string) {
  if (fonts.unicode) return value;
  let out = value;
  for (const [pattern, replacement] of WINANSI_FALLBACKS) out = out.replace(pattern, replacement);
  return out.replace(NON_WINANSI, '');
}

/** The currency prefix that will actually render with the active fonts. */
export function currencyPrefix(fonts: PdfFonts, currency = 'BDT') {
  if (currency !== 'BDT') return `${currency} `;
  return fonts.unicode ? '\u09f3' : 'Tk ';
}
