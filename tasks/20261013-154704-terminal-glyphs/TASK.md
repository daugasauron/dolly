# CJK text and emoji are boxes in the terminal: its font has no glyphs for them

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: core,display,terminal,0.1.4

Found by [tmux in use](../20261013-133111-tmux-use/TASK.md) (2026-10-14), not fixed there.

Done when: it is measured what a font with those glyphs costs (bytes in every
image that draws a terminal, or a file fetched once) and the owner has said
whether the terminal gets one; or the limit is in `docs/display.md`.

## Closed (2026-10-23, `da393e43`)

Integrator's decision 2026-10-23: the fallback fonts stay. "4.35 MB in
memory, 2.2 MB compressed, downloaded once, is a fair price for a terminal
that agents fill with emoji and CJK." The done-when holds: the cost is
measured below and the decision is made.

- What draws: the display library tries IosevkaTerm first, then Droid Sans
  Fallback (CJK unified ideographs 20,902 of the basic block's 20,992, kana
  181 of 192, all 11,172 Hangul syllables; not Extension A or B), then Noto
  Emoji (monochrome, all 80 emoticons, 637 of 768 symbols and pictographs).
  A character two cells wide is taken from a fallback font first, so 🙂
  is Noto's and not IosevkaTerm's narrow face; ☺, one cell, stays
  IosevkaTerm's. A fallback glyph is scaled to IosevkaTerm's em and at most
  to the cells it takes, and centred in them (wide glyphs were centred on
  their first cell). A grapheme's later codepoints are drawn only from
  IosevkaTerm (combining marks; a variation selector draws nothing, joined
  emoji show their first). A character no font has is the box, as before.
  Glyphs are in the text's colour; there is no colour emoji (stb_truetype
  draws outlines only, and Noto Color Emoji is 10.7 MB of bitmaps).
- Budget, measured: `DroidSansFallback.ttf` 3,451,744 bytes (1,651,798
  gzip -9) and `NotoEmoji-Regular.ttf` 880,860 (575,193), 4,332,604 bytes
  (2,226,991) together, against IosevkaTerm's 7,699,492 (2,163,123). The
  `display` package's snapshot went from about 9.63 MB to 13,984,910 bytes and
  `system`'s from 168,981,030 to 173,334,304: every image that draws a
  terminal holds 4.35 MB more in its in-memory filesystem. Packs are
  content-addressed, so a site serves and a browser caches the two files
  once. The kernel reads a fallback font into its memory only when a glyph
  first needs it.
- Rendering cost: non-ASCII glyphs are rasterized every frame, as before
  (only ASCII is cached). 40 lines of 50 CJK characters (100 columns, the
  screen full) printed 300 times: Chromium published 194 frames in 3.1 s against 165 in 2.6 s
  for ASCII; Firefox 398 to 407 in 8.1 to 8.4 s against 381 to 393 in 7.9
  to 8.2 s. Frames keep the 16 ms tick, so no glyph cache was added. Native
  stb_truetype draws 3,000 CJK glyphs at 17 px in 17 ms.
- Sources: Droid Sans Fallback from AOSP `platform/frameworks/base` at
  `android-6.0.1_r16` (`28c94330`, the file Debian packages as
  `fonts-droid-fallback`), Apache-2.0 with its `NOTICE`; Noto Emoji is the
  static instance in Ghostty's pinned tree (`src/font/res`, OFL-1.1, the
  same file Ghostty embeds as its text-emoji fallback), so it adds no pin.
  Rows in `config/upstreams.json`, `config/source-pins.sh` and
  `docs/licences.md`; `docs/display.md` says what draws.
- Considered and not taken: Noto Sans CJK (19.5 MB as a collection, 16 MB
  a region), Unifont (12.3 MB plus 2.1 MB for plane 1, pixel glyphs that
  blur at 20 px), Droid Sans Fallback Full (4.0 MB, no Hangul), Noto Emoji
  from google/fonts (the variable font, 2.0 MB).
- Test: `test/terminal-browser.mjs` prints 日本가あ🙂😀 and U+20000 and needs
  seven different cells; on the previous display there were two (the box
  and IosevkaTerm's 🙂). Passes in Chromium and Firefox.

## As filed (2026-10-14, `integrate/round-1013` `0155af64`)

- Reproduce: `default`, `echo 日本語 🙂`. Each character is a box, two cells
  wide as it should be. The same in tmux and out of it, in both browsers.
- The terminal draws from one font, `/usr/share/fonts/IosevkaTerm-SemiBold.ttf`
  of the `display` package (`Dollyfile-display`); it has no fallback and
  takes none from the browser (the page shows pixels the library made).
- Not known: the size of a font that covers CJK (several megabytes for the
  usual ones), and whether the owner wants that in the base at all.
