# ClassiCube: the bottom bar is plain white

- STATUS: OPEN
- PRIORITY: 200
- TAGS: demo,classicube,display,ux

Owner (2026-10-07, on the night round's candidate served from `work/next` on
:9007): "The classicube 'bottom bar' is just white, I think it should be
transparent or something?.. It doesn't display nicely".

## What is known

- Not yet looked at; no screenshot is recorded. Start by taking one: open
  `/classicube/` in Chromium and in Firefox at the owner's window size and at
  the test's 1280x960, docked and with the interface hidden.
- The docked layout draws the game at 880x660 below a 150-pixel offset and
  the agent panel beside it
  (`demos/classicube/test/fixtures/classicube-agent-browser.mjs:105-115`
  samples it that way). One of the three pixels that test reads is
  (243, 249, 255), almost white, so a white area in the docked page is at
  least partly intended by the current design; whether the bar the owner
  means is that panel, the strip under the game, or the page behind a canvas
  that no longer fills its box is the first thing to find out.
- Candidates for a regression in this round, to check and not to believe: the
  corner indicators now hide after ten seconds (`src/page-indicators.mjs`),
  which may uncover an area they used to sit on; the page-ending and
  explicit-runtime changes touched the page's layout code; the kernel no
  longer loads through Emscripten's JavaScript.
- Compare with the 18:00 candidate of 2026-10-06 (tag `rc-2026-10-06-pm`,
  served on :9003 until it is replaced): if the bar is white there too it is
  the design, not a regression.

## Findings (2026-10-07, `fix/visible`)

- Screenshots before, under `build/visible-evidence/` of `work/visible`:
  `classicube-before-9007-{chromium,firefox}-1280x960-docked.png`,
  `-1280x960-hidden.png`, `-1920x1080-docked.png`, and
  `classicube-before-9003-{chromium,firefox}-1280x960-docked.png`. The
  white bar is the game's own hotbar (nine block slots on a plain white
  box at the bottom of the game area), the same in both browsers, at both
  sizes, docked and hidden, and on :9003: the design of the texture pack,
  not a regression of this round. The dark strip under the game and the
  panel are the viewer's own colours and look deliberate.
- Cause: ClassiCube reads `nostalgia-classicgui` as true by default and
  binds `gui_classic.png` for the hotbar and the menu buttons
  (`src/Gui.c` LoadOptions, `src/Widgets.c`); Dolly's pack
  (`demos/classicube/textures.mjs`) ships `gui.png` only, so texture 0 is
  bound and the software renderer draws the quads white. The pause-menu
  buttons took the launcher theme's purple through the same path
  (`ButtonWidget_BackColor`, "Avoid white button background").
- Fix: the pack ships the same image as `gui.png` and `gui_classic.png`,
  with the three button faces (disabled, plain, hovered) in the viewer's
  colours, so the hotbar is the dark translucent bar the pack always
  meant and the menu buttons are drawn from the pack. One zip entry and
  one line of texels; `classicube-build` and `classicube` rebuilt.
- After, from the rebuilt image served from `work/visible`:
  `classicube-after-9142-{chromium,firefox}-1280x960-docked.png`,
  `-1280x960-hidden.png`, `-1920x1080-docked.png`: the hotbar is a dark
  translucent bar with dark slot dividers and a white frame on the chosen
  slot, over the game. The page pixel at the bar's top border read
  (40,40,40) in all six shots (`shots-after.log`). The pause menu's
  buttons were not screenshotted (a key under pointer lock does not reach
  the game from a plain Playwright or CDP key event); the suite's own
  Escape/Enter path runs over them.
- Test: `gamePixels` in the agent fixture reads a fourth point, the
  hotbar's top border at (320,438) of the 640x480 frame, and asserts it is
  the pack's (40,40,40) in the frame and on the page, docked and hidden.
  Without the fix the frame holds white there.
- The one-level mismatch: measured on :9007 with the game standing
  still (`classicube-frame-compare.log`): every frame pixel has alpha 255,
  and all 880x660 docked pixels equal the frame through SDL's nearest
  mapping (`posx = incx/2`), 0 mismatches in three rounds, so the pipeline
  from frame to canvas is exact. But the frame itself keeps changing: the
  water pixel at (20,460) read (87,77,178), (85,86,188) and (86,79,180)
  about a second apart with nobody at the controls (the player floats).
  The fixture compares a snapshot of the frame file with a canvas read
  taken later, so with a slowly changing pixel all twelve tries can miss
  by a level or two and the last pair is reported. The fixture now keeps
  the twelve exact tries and then accepts a match within 16 levels, which
  still proves the game, not the panel (12,19,26), is at those points.

## Related

The same suite failed once in the night round with one colour level of
difference in one docked pixel ("panel does not cover the game edges") and
passed on rerun; unexplained. It reads the same docked layout, so look at
both together.

## Done when

The owner has seen a before and after screenshot and the docked ClassiCube
page has no plain white bar: the area shows the game, a panel that looks
deliberate, or the page background, in Chromium and Firefox; the demo suite
asserts whatever was decided.
