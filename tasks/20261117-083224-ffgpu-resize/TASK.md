# Firefox: a gpu@0 surface draws no frame once it is sized again

- STATUS: CLOSED
- PRIORITY: 150
- TAGS: gpu,firefox,browser,core,0.1.8

Found on 2026-11-17 by the planet's touch test (`feature/planet`, task
`20261116-223911-planet-day`): with the game sizing its window to the page, `__dolly.gpu`
reported the new size and its frame count stayed at 2, in Firefox 159 (the installed snap, NVIDIA
RTX 5070, driver 580). Chrome draws on. So the planet sizes its window only on a screen held
upright, which a phone needs, and the upright part of its test runs in Chrome.

## Cause

Not the resize: the width. Firefox 159 on NVIDIA's driver loses the device presenting a WebGPU
canvas whose width is not a multiple of 32 pixels, and the kernel logs an `NVRM: Xid 69` (a
graphics engine class error) from Firefox's `CanvasRenderer` thread. A surface opened at 390 by
844 drew no frame at all; one sized from 1920 to 1024, 1600 or back draws on. Outside Dolly too
(`build/ffgpu-evidence/ff/surface.mjs`, an OffscreenCanvas drawn from a Worker nested in another,
cleared frames, 2026-11-17): 1920, 1024, 1600, 1280, 832, 480, 448, 416, 384, 352, 320 and 64
wide drew 30 frames each; 390, 400 and 432 lost the device at their first frame, whatever the
height, the canvas's usage (with or without `COPY_SRC`) or alpha mode. Chrome drew 390 and 400.
The upright phone, 390 by 844 in CSS pixels, is such a width.

## Fix

`host/gpu/worker.mjs` gives the canvas the next width that is a multiple of 32. A frame of another
width is drawn into a texture of the scope's own (the one a covered surface draws into, charged to
the quota) and copied into the canvas's first columns at `SUBMIT`; `host/gpu/gpu.mjs` fits the
frame's columns within the page's box at their own shape, centred, and clips the others
(`docs/gpu.md`).

## Closed 2026-11-17

`build/ffgpu-evidence/probe-surface.mjs` (`surface.c`, a gpu@0 surface drawn at one size, then at
another, in the `system` image with `gpu@0`), on `fix/firefox-gpu`:

- Before: Firefox stalled at 390 by 844, opened there or sized there from 1920 by 1080, with the
  device lost, in each of four runs (`surface-ff-1.log` to `-4.log`).
- After, Firefox: 390x844, 1920x1080 to 390x844, 390x844 to 1920x1080 (each frame waited for),
  800x600 to 1024x768, 1920x1080; and at an upright phone's 390 by 844 with a touchscreen:
  391 to 433 wide, 844x390 to 1180x820, 1170x2304 to 390x844. Every run drew its 120 to 240
  frames, no Xid (`surface-ff-fix-1.log`, `-2.log`).
- After, Chrome: 390x844 and 1920x1080 to 400x844 drew; the page's screenshot shows the 390 by
  844 frame at 370 by 800 CSS pixels in the middle of 1280 by 800, no column of the canvas's
  padding (`shot-chromium-*.png`).
- `test/gpu-render-browser.mjs` and `test/gpu-explicit-browser.mjs` pass in Chrome 156 and
  Firefox 159.

Whether the planet's own test now sizes its window in Firefox is the planet's to see (its task
`20261116-223911-planet-day`, "A phone held upright in Firefox").
