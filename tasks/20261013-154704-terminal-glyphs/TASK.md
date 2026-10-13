# CJK text and emoji are boxes in the terminal: its font has no glyphs for them

- STATUS: OPEN
- PRIORITY: 90
- TAGS: core,display,terminal

Found by [tmux in use](../20261013-133111-tmux-use/TASK.md) (2026-10-14), not fixed there.

Done when: it is measured what a font with those glyphs costs (bytes in every
image that draws a terminal, or a file fetched once) and the owner has said
whether the terminal gets one; or the limit is in `docs/display.md`.

## As filed (2026-10-14, `integrate/round-1013` `0155af64`)

- Reproduce: `default`, `echo 日本語 🙂`. Each character is a box, two cells
  wide as it should be. The same in tmux and out of it, in both browsers.
- The terminal draws from one font, `/usr/share/fonts/IosevkaTerm-SemiBold.ttf`
  of the `display` package (`Dollyfile-display`); it has no fallback and
  takes none from the browser (the page shows pixels the library made).
- Not known: the size of a font that covers CJK (several megabytes for the
  usual ones), and whether the owner wants that in the base at all.
