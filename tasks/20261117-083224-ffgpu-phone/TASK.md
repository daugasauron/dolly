# Firefox: at a phone's size with a touchscreen a gpu@0 surface presents one frame and stops

- STATUS: OPEN
- PRIORITY: 150
- TAGS: gpu,firefox,browser,core,0.1.8

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
