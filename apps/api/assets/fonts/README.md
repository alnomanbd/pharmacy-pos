# PDF fonts

Drop a Unicode TrueType font here as `regular.ttf` (and optionally `bold.ttf`)
and generated prescription PDFs will use it.

## Why this is needed

pdfkit's built-in fonts are the 14 standard PDF fonts, all Latin-only. Given
Bengali text they do **not** raise an error — they silently draw the wrong
glyphs, which on a prescription is worse than a failure. Since this app supports
Bangla prescriptions (`RX_LANGUAGE` includes `bn`), a font that actually contains
Bengali has to be embedded.

Without a font here:

- Latin prescriptions render perfectly.
- Bangla text renders incorrectly, and the server logs an error naming this file
  every time it happens.

## Getting a font

[Noto Sans Bengali](https://fonts.google.com/noto/specimen/Noto+Sans+Bengali)
(SIL Open Font License) covers both Bengali and Latin, so one file handles the
whole document:

```bash
cd backend/assets/fonts
BASE=https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansBengali/googlefonts/ttf
curl -L -o regular.ttf "$BASE/NotoSansBengali-Regular.ttf"
curl -L -o bold.ttf    "$BASE/NotoSansBengali-Bold.ttf"
```

`googlefonts/ttf` is the build to take, and the path matters more than it looks.
The sibling `hinted/ttf` build of the *same family* contains 135 characters —
Bengali only, no Latin at all. Embedded, it draws Bangla beautifully and turns
every English prescription into a page of blank boxes: patient names, doses,
dates, the clinic's own address. Nothing complains, because the PDF is perfectly
well-formed. `resolveFonts()` now refuses a font with no Latin glyphs and falls
back to the standard fonts rather than shipping that page, but the right fix is
to install the right file.

Check what you got before trusting it — a wrong path on GitHub answers with an
HTML page rather than a 404, and a saved HTML file is not a font:

```bash
head -c 4 regular.ttf | xxd    # 00010000 (TrueType) or 4f54544f ("OTTO")
```

The server logs which way it went at startup: `PDF: embedded font in use` with
`bengali: true` is the state you want.

The resolver also accepts the original filenames (`NotoSansBengali-Regular.ttf`,
`NotoSans-Regular.ttf`), or an explicit path via `PDF_FONT_PATH` /
`PDF_FONT_BOLD_PATH`.

If only `regular.ttf` is present it is used for bold text too — the document
loses weight contrast but never loses glyphs.

## Why the font is not committed

Two reasons: font licensing is the deployer's call, not something to bake into
every clone, and it is ~400KB of binary per file in a repo where nothing else is
binary. `.gitignore` excludes `*.ttf` in this directory for the same reason.

## Docker

Copy the fonts into the image, or mount them:

```yaml
api:
  volumes:
    - ./backend/assets/fonts:/app/assets/fonts:ro
```

The resolver looks under `assets/fonts` relative to the process working
directory, which is the app root in the provided Dockerfile.
