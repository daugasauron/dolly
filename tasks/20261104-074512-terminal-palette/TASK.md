# The terminal's colours come from the page, as the popups' do

- STATUS: OPEN
- PRIORITY: 130
- TAGS: display,page,configuration,npm

The terminal's palette is compiled into `src/ghostty/display.c`, a seed input. `html@0`'s popups
take the page's CSS custom properties (`--dolly-html-background`, `-color`, `-accent`, `-font`,
`-color-scheme`; `docs/embedding.md`). An embedding with a theme gets popups in its colours and a
terminal in Dolly's: two sources for one look (`tasks/20261102-133357-npm-agent-sandbox`'s proposal:
"a file the image holds or a `display@0` setting").

Decided 2026-11-04 (`tasks/20261102-133353-owner-decisions`): yes, as a setting the page gives
`display@0`, not a file in the image. The owner's rule for the popups (2026-11-01) is that the
theme is the page's and not owned by the program side; a file in the image would make the image own
the look. One source: the embedding's properties, read by the page for popups and terminal alike
(the shared ones renamed `--dolly-*`; the popup-only ones keep `--dolly-html-*`). The page side of
`display@0` hands the resident Ghostty plugin the palette (background, foreground, cursor, the 16
colours) at boot and when the properties change. Measure first whether that stays inside the
plugin's internal contract (kernel and page, no round) or reaches `display.h` (a seed round); the
plugin's contract is separate from programs' (AGENTS.md), so the first is expected.

Done when: an embedding that sets the properties gets a terminal and a popup in the same colours,
checked by a browser test that reads a background pixel of the canvas and of the popup, in
Chromium and Firefox; Dolly's own pages look as before (the defaults are today's palette);
`dolly-build init`'s `theme.json` is the one place a sandbox's colours are set; `docs/embedding.md`
lists the properties and `docs/display.md` says where the palette comes from.
