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

## State (2026-11-04, core/terminal-palette)

Implemented on `core/terminal-palette` (from `core/host-contracts`); verification below.

### Why display.c held the palette

`git log -S` finds the colours in 18a78351e ("Render Ghostty inside the Wasm sandbox",
2026-08-29), the first renderer, and nowhere a reason to keep them there: no task or later
commit touches them. The 16 colours were Dolly's look (all the text's colour but black, the
two yellows and bright black), set once at `initialize` in `configure_theme()`.

### Measured: it reaches display.h, so it is a seed round

- The plugin draws every pixel from its own constants, so `display.c` changes in any design:
  `ghostty-build`, `display` and every image that installs the terminal rebuild.
- The kernel reaches the plugin only through `dolly_display_driver_v5` and the mailbox, both
  in `display.h`, which the seed installs (`REQUIRES HEADER display`); the mailbox words are
  `dolly-display-0.wat`'s constants. No existing channel carries colours. `write` could carry
  them as OSC 4, 10, 11 and 12, but that is a workaround: a program's OSC 104/110/111 or RIS
  would bring back the plugin's own defaults, so the plugin would still own the look, and the
  renderer resolves colours from its own arrays rather than the terminal's effective ones, so
  it would not even show them. A file in the image is what the decision rules out.
- So the palette is a contract change: image inputs `56f681bc` (the branch's base) to
  `ce9f8fe4`; every image rebuilds in the round.

### As built

- `dolly-display-0.wat`: the mailbox grows from 24 to 44 words: `PALETTE_SEQUENCE`, then the
  background, the text (foreground), the cursor and the 16 colours, each 0xRRGGBB, written by
  the page between two steps of the sequence as the surface is.
- `display.h`: `dolly_display_palette`; the driver is v6 with `set_palette`. The kernel's tick
  applies a new palette as it does the surface (`apply_palette`), and `dolly_display_install`
  refuses to install a driver before the page has published one, then gives it before the
  first present. The plugin keeps no colours of its own: `initialize` no longer draws a frame,
  the first waits for the palette; the cursor and selection take the cursor colour.
- `display.mjs`: the page reads `--dolly-background`, `--dolly-color`, `--dolly-accent` and
  `--dolly-display-palette-0`…`-15` from the canvas (which inherits boot()'s element's), any CSS
  colour converted by a 1x1 canvas, an invalid one counting as unset; unset, today's palette,
  the 16 following the three. It hands them to the Worker in its configuration (written before
  `dolly_display_install`) and again when they change: a change ends a 1 ms discrete transition
  of the properties on the canvas (`transition-behavior: allow-discrete`), measured in Chrome
  156 and Firefox 155 for a class on an ancestor, an added style sheet and an inline property;
  and once at `entryStarted`, since a hidden canvas transitions nothing.
- `html@0`: `--dolly-html-background`, `-color` and `-accent` are `--dolly-background`,
  `--dolly-color` and `--dolly-accent`; `--dolly-html-font`, `-font-file` and `-color-scheme`
  stay.
- `dolly-build init`: `theme.json` is the one place of a sandbox's colours. The page writes it
  as Pi's theme and sets its `background`, `text`, `accent` (renamed from `yellow`) and `muted`
  as the terminal's and the popups' (`muted` as bright black); `index.html` keeps the popups'
  font and colour scheme only.
- Docs: `docs/embedding.md` "Colours" lists the properties and their defaults;
  `docs/display.md` says where the palette comes from; `docs/browser-boundary.md`'s display row.

### Measured

- Before (the branch's images, image inputs `56f681bc`), `test/theme-browser.mjs` in Chrome 156
  and Firefox 155: Dolly's own page shows background `#262626`, the text `#e8e3d7` (reverse
  video), the cursor `#f2d45c`, and the 16 colours `#262626`, `#e8e3d7` ×2, `#f2d45c`,
  `#e8e3d7` ×4, `#77736c`, `#e8e3d7` ×2, `#f2d45c`, `#e8e3d7` ×4, read from the frame; the
  canvas's screenshot pixel `#262626`. The embedding's part fails in both: its terminal shows
  that same palette, not the page's colours.
- After (image inputs `ce9f8fe4`; `default`, `system`, `html`, `dolly-docs` and their closure
  rebuilt in 901 s): the same pixels on Dolly's own page, and the test passes in both
  browsers: an embedding's background, text, accent, one colour by `rgb()` and one by a CSS
  name are the terminal's, the canvas and the popup show the same background pixel, and an
  inline change of `--dolly-background` reaches the terminal without output and the next
  popup.
