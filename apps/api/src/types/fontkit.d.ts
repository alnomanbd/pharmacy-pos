/**
 * Minimal typings for `fontkit`, which ships none.
 *
 * Only what `pdfFont.ts` uses to check a candidate font's script coverage: a
 * glyph id of 0 is `.notdef`, i.e. the font cannot draw that character.
 */
declare module 'fontkit' {
  interface FontkitGlyph {
    id: number;
  }
  interface FontkitFont {
    postscriptName: string;
    characterSet: number[];
    glyphForCodePoint(codePoint: number): FontkitGlyph;
  }
  export function openSync(path: string): FontkitFont;
}
