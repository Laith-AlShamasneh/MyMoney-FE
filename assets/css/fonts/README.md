# Inter font — self-host scaffold (FH3)

The app currently loads Inter from the Google Fonts CDN via `@import` in
`app.css`. **SRI can't be applied to a CSS `@import`** (no `integrity` attribute,
and Google's response varies by browser User-Agent), so the only meaningful
hardening for the font is to self-host it. This folder is the drop-in scaffold.

## Files here

- `inter.css` — ready to use. It's the Google Fonts CSS with every
  `https://fonts.gstatic.com/...woff2` rewritten to a local `./files/<name>.woff2`.
- `download-inter.sh` — fetches the 14 woff2 files into `./files/`.
- `files/` — where the woff2 files land (empty except `.gitkeep` until you run the script).

## To self-host (drop the Google CDN entirely)

1. Download the font files:

   ```bash
   bash assets/css/fonts/download-inter.sh
   ```

2. In `app.css`, replace the Google `@import` (line ~7) with:

   ```css
   @import url('./fonts/inter.css');
   ```

3. Remove `https://fonts.googleapis.com` (from `style-src`) and
   `https://fonts.gstatic.com` (from `font-src`) in the CSP `<meta>` of every
   page head.

## Trimming (optional but recommended)

This app is Arabic-primary (Arabic renders in Segoe UI / Tahoma via `rtl.css`);
Inter only covers the Latin / English glyphs. The scaffold includes all 7
unicode subsets (latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext,
vietnamese). You can safely delete the cyrillic / greek / vietnamese
`@font-face` blocks from `inter.css` and their matching files to cut weight —
keep `latin` (and `latin-ext` for accented characters).
