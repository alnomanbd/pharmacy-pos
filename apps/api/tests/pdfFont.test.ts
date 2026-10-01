import { describe, it, expect } from 'vitest';
import { decideFonts, coverage, safeText, resolveFonts } from '../src/services/pdfFont.js';

/**
 * Which font a bill, invoice or register is drawn with.
 *
 * The case these tests exist for cost a real debugging session: the per-script
 * Noto build of Noto Sans Bengali contains 135 characters — Bengali and no
 * Latin at all. Embedded, it draws Bangla beautifully and turns every English
 * document into a page of blank boxes: customer names, strengths, dates, the
 * shop's own address. Nothing raises an error, the PDF is well-formed, and
 * the file size looks normal. Whoever deploys this picks the font, so the app
 * has to refuse that one.
 *
 * `decideFonts` is pure for exactly this reason — the branch is impossible to
 * exercise otherwise without committing a Bengali-only font to the repo.
 */
describe('decideFonts', () => {
  const REG = '/fonts/regular.ttf';
  const BOLD = '/fonts/bold.ttf';

  it('uses the standard fonts when nothing is installed', () => {
    const { fonts, reason } = decideFonts(null, null, null);
    expect(reason).toBe('standard');
    expect(fonts.regular).toBe('Helvetica');
    expect(fonts.unicode).toBe(false);
  });

  it('embeds a font that covers both scripts', () => {
    const { fonts, reason } = decideFonts(REG, BOLD, { latin: true, bengali: true });
    expect(reason).toBe('embedded');
    expect(fonts).toEqual({ regular: REG, bold: BOLD, unicode: true });
  });

  it('refuses a font with no Latin glyphs, even though it can draw Bangla', () => {
    // The important one. Taking it would break every English document to
    // fix Bangla; falling back breaks only Bangla, which is visible and
    // reportable.
    const { fonts, reason } = decideFonts(REG, BOLD, { latin: false, bengali: true });
    expect(reason).toBe('no-latin');
    expect(fonts.regular).toBe('Helvetica');
    expect(fonts.unicode).toBe(false);
  });

  it('accepts a Latin-only font but reports that Bangla will not draw', () => {
    // A shop may simply want its own typeface. `unicode: false` is what makes
    // a Bangla bill fall back to English labels instead of printing
    // blank headings.
    const { fonts, reason } = decideFonts(REG, BOLD, { latin: true, bengali: false });
    expect(reason).toBe('no-bengali');
    expect(fonts.regular).toBe(REG);
    expect(fonts.unicode).toBe(false);
  });

  it('reuses the regular face for bold when no bold file is installed', () => {
    const { fonts } = decideFonts(REG, null, { latin: true, bengali: true });
    expect(fonts.bold).toBe(REG);
  });
});

describe('coverage', () => {
  it('reports nothing for a file that is not a font', () => {
    // A saved HTML error page, which is what a wrong download URL produces.
    expect(coverage('package.json')).toEqual({ latin: false, bengali: false });
  });

  it('reports both scripts for the installed font, when there is one', () => {
    const fonts = resolveFonts();
    if (!fonts.unicode) return; // No font in this checkout; nothing to assert.
    expect(coverage(fonts.regular)).toEqual({ latin: true, bengali: true });
  });
});

describe('safeText', () => {
  const standard = { regular: 'Helvetica', bold: 'Helvetica-Bold', unicode: false };
  const embedded = { regular: '/f.ttf', bold: '/f.ttf', unicode: true };

  it('passes Bangla through an embedded font untouched', () => {
    expect(safeText(embedded, 'সকাল, রাত')).toBe('সকাল, রাত');
  });

  it('drops Bengali rather than drawing the wrong glyph', () => {
    // The standard fonts do not fail on Bengali — they draw something else,
    // which on a bill is worse than a gap.
    expect(safeText(standard, 'Napa সকাল')).toBe('Napa ');
  });

  it('keeps the taka amount readable without a Unicode font', () => {
    expect(safeText(standard, '৳ 500')).toBe('Tk 500');
  });
});
