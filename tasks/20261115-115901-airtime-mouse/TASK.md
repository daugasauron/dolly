# Airtime's mouse look is not checked with a captured mouse

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: godot,0.1.8

## Closed 2026-11-19

The 0.1.8 round (`integrate/0.1.8` at 8d666a4e4, its GPU stage on Xvfb :148) passed the test in
Chrome (`chromium view 19 6`). In Firefox it never started the browser: the test launched the
snap Firefox with Playwright's profile in the host's `/tmp`, which the snap's own `/tmp` hides,
and Playwright's launch timed out after 180 s; so did `godot-flyover-touch-browser.mjs`'s. Every
other Firefox test there launches through `launchInstalledFirefox` (`test/browser.mjs`), which
puts the profile under `build/`. Reproduced on :160 with a launch alone: 60 s and no browser with
the profile in `/tmp`, 1.3 s under `build/firefox-tmp`. Both tests now launch through it
(`fix/rc-browser`). On the round's `godot-airtime` image, in Firefox 159 on the NVIDIA adapter
(:160, under the GPU lock): `firefox view 29 3`, `godot-airtime: firefox passed` (19 and 6
expected, two thirds to five thirds of them in Firefox); the touch test passed in Firefox too.

## State (2026-11-17)

Done on `ws/recipes` (f66240630, d520d600a): Airtime's Q prints `AIRTIME view RIGHT UP`, how far
the mouse turned the view in degrees (`demos/godot/airtime/main.gd`, its manual page), as Voxel Flyover's Q
does, and `demos/godot/test/godot-airtime-browser.mjs` opens `godot-airtime` from the front page,
waits for 120 frames on a hardware adapter, clicks the crosshair (the display's middle), checks
the pointer is captured, moves the mouse 300 pixels right and 100 up, presses Q and asserts 19 and
6 degrees (17 to 21 and 5 to 7 in Chrome; Firefox's reports of Playwright's moves to a captured
pointer vary as in the flyover test, so two thirds to five thirds there), then that the page has
the pointer again. It is a GPU-window test in `demos/run-browser-tests.mjs`'s list, beside the
flyover test. Rebuilds airtime-godot and godot-airtime (on the Godot chain: the round's).

Measured on the way: the stretch to 1280 by 720 scales `event.relative`, so in a 1600-pixel
window 300 pixels of the mouse turned the view 15 degrees and 100 up 5, not the 0.0011 rad a
pixel main.gd's `LOOK` says Airtime turns; the look now reads `event.screen_relative`, the
pointer's own motion (d520d600a), so it is the same at every window size.

Checked on the GPU (Xvfb :148, a hardware adapter, under the GPU lock) without the Godot chain's
rebuild: the released `godot-airtime` of `work/round1113` served, its own editor imports and exports
the branch's `demos/godot/airtime` project in the session as the recipe does, the pack replaces the
shipped one, and a page restoring that session meets the game as the test does
(`work/audit-1116-evidence/recipes/ws-recipes/airtime-check.mjs`). Chrome: the click on the
crosshair captures the pointer, 300 right and 100 up print `AIRTIME view 19 6`, the page has the
pointer back after Q, no page error, and `airtime-godot` started again from the shell captures at
the same click (`logs/airtime-check-chromium.log`). The pack also parses and runs headless
(`logs/airtime-headless-2.log`). Firefox, not confirmed today: of five attempts two met this check's
own faults (a pack whose tabs the terminal had taken for completion, a second page in a context
that allows none); then a second page of the restored session drew nothing in 300 s, the
released game did not draw in 300 s, and the editor's import stalled for 15 minutes, which this
tree stopped so as not to hold the GPU lock (`logs/airtime-check-firefox*.log`). The queue for
the lock was 20 to 60 minutes a run.

Left for the 0.1.8 round, which rebuilds the Godot chain: `node
demos/godot/test/godot-airtime-browser.mjs chromium firefox` in a GPU window, with the snap
Firefox's `TMPDIR`, closes this.

## Done when

A browser test takes the pointer with a click on the crosshair and measures the view turning in
Chrome and Firefox.
