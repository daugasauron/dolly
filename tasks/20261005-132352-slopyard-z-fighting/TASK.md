# Slopyard: coplanar ground surfaces flicker (z-fighting)

- STATUS: CLOSED
- PRIORITY: 40
- TAGS: game,slopyard,rendering

Owner (2026-10-05): "in slopyard when two surfaces are on the same 'plane' like
some ground have dirt and tiles, they flicker between the two. This is a low
priority task for now."

Two surfaces at the same height fight for the depth buffer. Fix where the
world places them (one surface per patch of ground) or give decals a defined
order in the renderer (`demos/slopyard/src/render.c`); a depth bias tuned by
eye is the last resort.

## Done when

- A capture of a dirt-and-tile patch is stable from frame to frame while the
  camera moves, shown by a test or recorded evidence.

## Cause (2026-10-06)

The renderer ray-traces boxes through a tree rebuilt every frame. Terrain 8
turns rubble boxes into paving pads 0.2 m thick whose tops lie exactly on the
ground slab's top (y = 0), e.g. the renewal pad at (45.5, 19.5) and the pads
at x 64-72, z 77-87. Both faces return the same hit distance, and `trace` kept
whichever box it visited first; moving machines reorder the tree, so strips of
a pad switched between dirt and tile from frame to frame. The ground won most
pixels, so the pads were mostly hidden.

## Fix

`scene.wgsl` treats faces within rounding of one distance as coplanar and
draws the smaller box (the pad), whatever the traversal order. Physics and
world data are unchanged.

## Evidence

`build/slopyard-zfight-evidence/probe.mjs` runs the image's `slopyard` with
each shader and a check script that captures the renewal pad while the world
runs three frames between captures (machines move, so the tree is rebuilt):

| capture series | before | after |
| --- | --- | --- |
| fixed camera, pixels changed between consecutive captures | 880, 5, 3, 39, 869 | 51, 2, 1, 39, 0 (FPS counter) |
| fixed camera, paving pixels per capture | 139, 141, 141, 141, 141, 139 | 5452 in all six |
| camera moving 2 cm per capture, paving pixels | 129-139 | 5452-5537, rising steadily |

Before, two of five pairs flipped whole pad strips (~870 px); after, the pad
does not change while machines move, and with a moving camera the pad changes
only with the view.

Verified on the rebuilt `slopyard` image (only it rebuilt, 75 s; `gamedev-sdk`
reused): `slopyard-browser.mjs` passes (17 fixtures, driving, world restore, no
page errors), `npm run -s test:source` 357/357, `npm run -s lint:dollyfiles`.
Closed by `174d9837`.
