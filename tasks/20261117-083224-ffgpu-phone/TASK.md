# Firefox: at a phone's size with a touchscreen a gpu@0 surface presents one frame and stops

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: gpu,firefox,browser,core,0.1.8

## Closed 2026-11-19

Not the phone's size, nor the touchscreen: Playwright 1.63 drives the installed Firefox through
WebDriver BiDi, which sets a context's viewport, screen size and orientation and nothing for
`hasTouch` (its BiDi context code sends no touch override; `test/touch-browser.mjs`'s task found a
`hasTouch` page there reporting a fine pointer), so the page with one at 844 by 390 is the page
without. A start that drew one frame and no more fits Godot's start stopping the runtime Worker
(`tasks/20261117-122407-godot-firefox-start`: a thread's Worker made there, while others ended,
waited for good), fixed on `fix/rc-browser` (216d093a8); the upright screen's resized surface
was `20261117-083224-ffgpu-resize`'s width.

`demos/godot/test/godot-flyover-touch-browser.mjs` now flies at a phone's sizes in Firefox too:
844 by 390 sideways and 390 by 844 upright, in both browsers. On the round's
`godot-voxel-flyover` image with the fix, Firefox 159 on the NVIDIA adapter (Xvfb :160, the
machine's load 15 to 20): `firefox sideways: high 207 pitch 29 zoom 0.45 touches 4; upright:
touches 2`, `godot-flyover-touch: firefox passed`.

## Found

Found on 2026-11-17 by the planet's touch test (`feature/planet`, task
`20261116-223911-planet-day`, its probe `build/planet/ffprobe.mjs` in `work/planet`): in
Playwright's Firefox (the installed snap 159) with a touchscreen (`hasTouch`) at 844 by 390, the
game presents one frame and no more, its window left at 1920 by 1080. Without a touchscreen at
that size it draws, and with one at 1600 by 900 and at 1180 by 820 too.

## State 2026-11-17

Not reproduced without the planet's image, which `fix/firefox-gpu` does not hold:

- A gpu@0 surface of 1920 by 1080 (`build/ffgpu-evidence/surface.c` in the `system` image with
  `gpu@0`) draws on in Firefox at 844 by 390 with a touchscreen: 240 frames, and 120 more each
  waited for (`surface-ff-5.log`, before the fix of `20261117-083224-ffgpu-resize`). So does a
  WebGPU canvas outside Dolly at that size, with or without one (`ff/surface.mjs`).
- The planet's logs of that day (`build/planet/out-ffprobe-a.log`, `-b.log`, 13:49 and 13:50,
  each the game at 10 s intervals) show its frame count at 1 for the first 20 s, then 131 to
  1,498 frames by 70 s: a game that drew on after a long first frame. Which run stopped is not
  recorded.
- The width Firefox fails to present (the task above) is not 1920; if the game sized anything it
  presents to the page's 844, the fix of that task covers it.

Done when the planet's probe at 844 by 390 with a touchscreen, run on a branch with
`fix/firefox-gpu`, draws on, or shows where it stops (`__dolly.gpu`, the kernel's `NVRM: Xid`
lines in `journalctl -k`).
