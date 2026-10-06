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
