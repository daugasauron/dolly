# Voxel Flyover: a striking look, a better frame rate, and its video again

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: godot,demo,0.1.6

Owner (2026-11-14): "I like the videos you created so far, but not the voxel-flyover one. I want it to
be a lot more visually striking, current one looks like minecraft or something I'm thinking 3d
shaders etc. [...] Also I want better fps I feel like there is room to improve." And: "Feel free to
reuse open source shaders from the web or research how to do this to compose something cool."

Branch `feature/flyover-2` (`work/flyover`), on the compiler round `round/0.1.6-compiler` with
`feature/videos-0.1.6` merged. Brief: `work/briefs-2026-11-14/flyover.md`. The first version and its
video are `tasks/20261114-011009-videos-0.1.6`.

## Version 3 (2026-11-14, 20:00)

Owner, on version 2: "The second video is better but you can do a lot better. I want the mountains
to look less blocky, and the trees as well. I want a version 3 that is LESS blocky". And for the
flyer, after the integrator ruled out Nyan Cat (a character whose author enforces it) and a rubber
duck was passed over: "A corgi with a cape and sunglasses on a surfing board with some jet engines
that makes it fly."

Done, on `feature/flyover-3` (from `feature/flyover-2`): `5fcbc314d`, `5877a0fe5`, `3b0cf2df6` and `23da19ede` for the
game, and the commit that closes this task for the video, poster, section and README.

- **Land.** The columns are gone. Three grids of points (1.5, 6 and 24 units apart, to 2.3 km) are
  raised to heights that a pass draws into textures when the grids step; a grid blends into the
  coarser one's heights toward its edge, so they meet without a step, and the coarser lies 0.6 of
  a cell lower under the finer. The fragment stage takes the slope from the same textures: rock
  in strata where steep, snow where high and flat, meadow, heath or desert below, mottled, with
  flowers near by. The ranges' function has crests, spurs on the crests and gullies on the spurs
  (`terrain_height`, mirrored in `terrain.gd`), to about 140 units over the sea.
- **Trees.** A trunk and a ball of 12 or 5 rings, which the vertex stage shapes: firs with tiers,
  broad lumpy crowns, desert spires. 2,500 plots near the flyer draw the finer ball, 16,384 the
  coarser. No tree stands on steep ground.
- **Flyer.** An original character, built from Godot's primitives in `build_flyer`: a corgi with
  mirrored sunglasses and a red cape (a cloth the vertex stage flutters), on a teal surfboard with
  two jets, their flames, and a wake (a ribbon the vertex stage lays along the last 64 places of
  the board). The board banks 0.6 rad at full turn. The camera's four views were set to show it:
  behind and to the side, close alongside, high and wide, and ahead looking back at its face.
- **Start.** `build/flyover-evidence/sim.mjs` flies main.gd's autopilot in JavaScript (it lit the
  same 4 beacons in 30 s as the game) over every start of a grid and four headings, and scores a
  flight's 95 s for mountains near, forest, some sea and no desert. The start is its second best,
  (2250, 4750) heading east.
- **Kept**: the sky, clouds and their shade, the sea, the shafts, veins, groves and rings at night
  (veins now thin and unseen by day), the beacons.

Measured on the RTX 5070, Chrome 156 and the installed Firefox, by the game's test
(1600 by 900 page, 1920 by 1080 frames, Chrome copying its frames):

| | Chrome | Firefox |
| --- | --- | --- |
| Version 2 | 59.9, 5.1 ms GPU | 59.0, 5.8 ms GPU |
| Version 3, quiet machine (`3b0cf2df6`) | 60.0, 4.6 ms | 59.0, 4.7 ms |
| Version 3 at `23da19ede`, load 3.5 | 58.8, 4.6 ms | 59.0, 4.7 ms |
| Version 3 at `23da19ede`, load 9 | 60.0, 4.5 ms | 56.1, 4.6 ms (renderer 1.1 ms) |
| Version 3 while recorded, load 3.5 | 59.1, 4.6 ms | not recorded |
| Version 3 while recorded, load 2 (take 2) | 60.0, 4.5 ms | |

GPU a frame by step, Chrome: the land with two cascades over 170 units 3.2 ms; four cascades over
420 units 4.3; 4x MSAA in place of FXAA 4.6. The land has 0.3 million triangles where the columns
had 3.4. The loads are the owner's desktop (a video player on the takes, among others) and other
agents' builds and GPU runs, which share the GPU lock: the game was never the only thing running.
Not measured: a display the GPU drives, another GPU, Firefox's picture (no WebGPU canvas on Xvfb).

Found on the way: version 2 could print Godot's "2 ObjectDB instances were leaked at exit" after a
flight by itself. With `--verbose` and the streams' ids printed it was a bell: a beacon lit in the
0.3 s between the report and the exit. No beacon rings once the game is leaving; three runs of the
flight that showed it are clean.

The video: `sites/slopshare.dev/agents/videos/voxel-flyover.mp4` (2:07, 1920 by 1080, 60 frames a
second, 23.92 MiB), its poster and section replace version 2's; it plays from the page in headless
Chrome 156 and Firefox 155. `work/videos-2026-11-14/voxel-flyover-3/README.md`.

## Version 2: state (2026-11-14, 17:50)

Done, on `feature/flyover-2`: the look and the frame rate (`0524efbe6`, `db8d7a746`, `a3d2abee8`),
and the video, poster and section on the demos page (the commit that closes this task).
`godot-voxel-flyover` builds on the round's seed in 40 to 50 s, and
`demos/godot/test/godot-flyover-browser.mjs` passes on the RTX 5070 at `a3d2abee8`: Chrome 156 at
59.9 frames a second (5.1 ms of GPU a frame), the installed Firefox at 59.0 (5.8 ms). Nothing
changed the seed, `host/gpu` or Godot's platform: the game's package and application are the only
images to rebuild.

| | Chrome 156 | Firefox |
| --- | --- | --- |
| First version, its test (1600 by 900 page, swapchain) | 42.3 | 59.0 |
| First version while recorded (1920 by 1080, swapchain) | 33.9 | not recorded |
| First version, Chrome copying its frames (1920 by 1000 page) | 60.0 | |
| This version, its test (1600 by 900 page, Chrome copying) | 59.9, 5.1 ms GPU | 59.0, 5.8 ms GPU |
| This version while recorded (1920 by 1080, Chrome copying) | 59.9, 6.5 ms GPU | not recorded |
| This version on the swapchain (1920 by 1000 page) | 30.3, 6.6 ms GPU | |

Both browsers are at the display's rate, so what is left is the GPU's 5 to 7 ms of the 16.7 it
has. Not measured: a display the GPU drives (the owner's `:1` is not ours to use), another GPU,
Firefox's picture (it shows no WebGPU canvas on Xvfb, so only the game's own report of its frame
was read: sky along the top, 320 to 344 colours).

Left for the integrator: `--disable-vulkan-surface` is in this game's test alone. The other GPU
window tests (`demos/browser.mjs`'s `gpuWindow` and the tests that spell the flags out) still
present through the swapchain, so any frame rate they report at full screen on Xvfb is the
swapchain's. They were not run with the flag.

## The video

`sites/slopshare.dev/agents/videos/voxel-flyover.mp4` (1:58, 1920 by 1080, 60 frames a second,
h264, 23.96 MiB) and its poster replace the first version's, with the section's text. It plays
from the page in headless Chrome 156 and Playwright's Firefox 155 (`plays.mjs`, `plays.log`). How
it was made, the take and the cut: `work/videos-2026-11-14/voxel-flyover-2/README.md`. Pages'
25 MiB a file bounds it: at 60 frames a second the forests are softer in the video than in the
game, and the flight is cut to 81 s of the take's 91.

## The look

How it works is in `demos/godot/README.md` ("Voxel Flyover"). Decisions:

- The world stays a function and stays cells, but hexagonal columns of basalt with bevelled tops in
  place of textured cubes, and trees of faceted cones in place of block trees: nothing in it is a
  cube with a texture. The palette is its own (jade, heath, coral, slate, snow).
- Light does the work: a low sun's shafts in volumetric fog, haze that pools toward the sea, a sea
  that mirrors the sky with glitter, a cloud layer in the sky's shader whose shade the ground's
  shader lays on the land, veins of crystal and groves that glow at night, shores that glow, and
  rings of light that run out over land and sea from every lit beacon (the game's one mechanic,
  now seen from afar).
- The camera glides between four views while the airship flies itself; at the helm it trails.
- All shaders are written here. Nothing was taken from elsewhere, so there is no licence row to add.
- Not used, measured or tried: SDFGI (Godot's Dolly patch leaves it out: WebGPU has no image
  atomics), SSIL and depth of field (Firefox draws neither). SSR ran in Chrome at 0.2 ms but was not
  looked at over water, so it is off.

## The frame rate

Two separate things held it back.

1. The rig, not the game. On Xvfb, Chrome's Vulkan swapchain shows a full-screen page at 27 to 35
   frames a second whatever it draws: an empty WebGPU canvas of 1920 by 1080 ran at 28.6, and at
   59.9 in a 1280 by 720 window (`build/flyover-evidence/raf.mjs`, a capture of the screen at 60
   frames a second counting the frames that changed: 109 of 240). With `--disable-vulkan-surface`
   Chrome copies frames to the X server itself: 59.9, and 237 of 240 on the screen. The first
   version of the game, unchanged, drew 60.0 so. `--disable-gpu-vsync` shows 14 frames of 240,
   `--disable-gpu-compositing` shows none of the canvas, ANGLE on Vulkan without the Vulkan feature
   gets SwiftShader. The flag is in the game's test; the other GPU tests still run on the swapchain.
2. The game. Godot's own measure of a 1920 by 1080 frame, Chrome 156, over the forest at the start:

   | Step | GPU ms a frame |
   | --- | --- |
   | First version (boxes, 4 cascades) | 4.9 |
   | Hexagonal columns, the terrain's function in every vertex | 15.6 |
   | The function drawn once a step into a texture of cells (`ground.gdshader`) | 9.1 |
   | Column sides that end at the lowest neighbour, 2 cascades over 170 units | 6.6 |

   At 9.1 ms, by leaving one thing out: shadows 4.9, the finest grid 5.4, the trees 0.9, the two
   coarser grids 0.9, SSAO 0.5, the sky 0.2, volumetric fog 0.1, glow and FXAA 0.3; half the
   resolution saved 0.7, so it was geometry, not pixels. The renderer's thread takes 0.5 to 0.8 ms.
3. The processor is not the bound. A Chrome trace with V8 sampling of a 25 s flight (40 s with
   Godot's start; `build/flyover-evidence/profile.mjs` reads it): the game's main thread was in the
   kernel's call, waiting for the page's next frame, in 76% of its samples and in a futex wait in
   14%; the renderer's and the pool's threads waited in 86 to 100%; the GPU Worker was busy 4% and
   the page's main thread 1%. A run beside an x264 encode on all cores drew 33 frames a second
   with the renderer's thread at 1.5 ms: recordings and measurements want a quiet machine.

## Found on the way

- `node --test 'test/*.test.mjs'`: 393 of 394 pass. `process-sysroot.test.mjs` fails in this tree
  with "no module exports for -rdynamic: build/rdynamic.exports", which `npm run build:runtime`
  writes and this tree's brief says not to run.
- `feature/videos-0.1.6`'s two flyover recipes carried pins of the old seed's Godot recipe;
  `update-recipe-pins.mjs` repinned them on this round's.
- A snap's Firefox needs `TMPDIR` under `$HOME` (docs/gpu.md), and shows no WebGPU canvas on Xvfb:
  its numbers are the game's own report, its frames were not looked at.

## Done when

The game reads as its own, not as blocks; its test passes in Chrome and Firefox on gpu@0 with the
before and after frame rates here; the new video, poster and section are on the demos page and play
from it in headless Chrome and Firefox; the source suite passes but for the test above.
