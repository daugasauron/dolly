# Xonotic: the graphics in game are broken on the deployed v0.1.5

- STATUS: OPEN
- PRIORITY: 400
- TAGS: demo,gpu,bug

Owner (2026-11-07): "I just tested xonotic on the deploy and the graphics in game are completely
broken, create a task to fix that too." Not yet recorded: the browser and system, the domain,
whether the page drew on `gpu@0` or in the engine's software rasterizer (no WebGPU adapter), and
what "broken" looks like (a screenshot settles most of it).

## State (2026-11-13): walls drawn see-through, in Chrome and Firefox

Owner (2026-11-13), after the fix below: "The xonotix bug is not fixed, it looks a bit better (I can
see contours of the walls but they are see through). This is the same on firefox and chrome."
So the fix of 2026-11-12 is not the whole cause: the walls' outlines draw, their surfaces do not
cover what lies behind them. Presumably tested on the local release, 127.0.0.1:9045 (`973b3ad4…`,
main `2b8036055`); not recorded: the preset, the map, and whether the frames came from `gpu@0` or
the engine's software rasterizer. The test's check (lit pixels above 0.2 at ultimate on
space-elevator) passes on such frames, so it does not see this.

Next: the owner's flow on 9045 in both browsers, a screenshot of a wall, and the preset and path
it used; then a check that a wall hides what is behind it.

## State (2026-11-12): the effects presets above high, in any browser

Firefox 159 now gives a WebGPU adapter on the private Xvfb, but does not composite the Worker's
WebGPU canvas there (page screenshots and the X display show nothing, "Failed to get SourceSurface
from DMABufSurface"), so frames were read inside the engine: `screenshot` (dpgpurast reads it back
from `gpu@0`) and `condump`, taken out with `download`, from the system image with the xonotic
application's client, data, shaders and settings copied in
(`work/xonotic-repro/engine-shots.mjs`; `engine-shots-site.mjs` against a served deployment).

- At the image's own settings (low preset), Firefox 159 on `gpu@0` draws correctly, textured:
  stormkeep, space-elevator, implosion, geoplanetary and erbium on v0.1.6, stormkeep on v0.1.5
  (the published deployment). So neither release's WGSL nor Firefox's WebGPU is broken as such.
- The owner's frame is stretched: the crosshair's ring is 61×42 pixels of the 1847×963 picture
  (a 1024×768 frame stretched to it gives 1.35:1). Firefox 159 and Chrome both letterbox a 2D
  canvas a Worker draws through `transferControlToOffscreen` (`object-fit: contain`, headless); a
  WebGPU one cannot be looked at here, where nothing is composited.
- At `effects-ultra.cfg` the frame is black in Chrome and Firefox alike: the engine renders into a
  framebuffer whose textures dpgpurast refused (the shadow map's depth format; the "no texture of
  format" warning is printed once per kind, so only the first showed), whose pixel pointers are
  therefore NULL and size 0; `DPSOFTRAST_SetRenderTargets` took a target that is not a texture's
  token for the screen and replaced the frame buffer with a 0×0 one, which `gpu@0` refuses
  ("Texture descriptor", `0,0,1,1,1,20`), and every later draw names its handle. At `high` both
  browsers draw correctly. With a target without pixels not drawn, `ultra` drew the owner's
  picture in both browsers: the floor and walls missing with the planet showing through, the
  pillars flat. Those surfaces are offset-mapped (`effects-ultra.cfg`: `r_glsl_offsetmapping 1`;
  ultimate adds relief mapping), and their permutations (modes 7 and 11 with 65536, such as
  7:73729 and 11:8464393) had no WGSL, so their draws were skipped.
- Fixed on `fix/xonotic-presets`: `dpgpurast.c` takes a target without pixels for a texture's
  (not drawn), and `xonotic-shaders` translates the lit modes' permutations with offset mapping
  and with relief mapping over it too (576 lit pairs, 11 MB; 88 s to build). `ultra` in Firefox
  and `ultimate` in Chrome then draw space-elevator textured, every wall there, with no missing
  permutation and no refused packet; shadow maps stay undrawn (the lights draw unshadowed).
  `xonotic-browser.mjs` runs `ultimate` on space-elevator on `gpu@0`: no `no WGSL` or refused
  packet in its log, and its screenshot lit (the black frame was lit 0.0, the frame with the
  walls missing 0.665 but with `no WGSL` lines). That block alone passed in Chrome on `gpu@0`
  (lit 0.640, `work/xonotic-repro/ultimate-only.mjs`). The whole test, on the same images, stopped
  earlier, at "the screenshot is a frame the page showed": the menu frames after the screenshot
  match it in the centre (1.2) but not along the top (4.9, the bound is 3). The test cropped its
  page screenshot to `#display`'s box, of another shape than the frame, which the GPU canvas
  centres in it (`object-fit: contain`): the edge columns held letterbox. Cropped to the frame's
  own box, the whole test passed in Chrome on `gpu@0` in 551.7 s (top 0.1; the ultimate preset's
  frame lit 0.459; `build/xonotic-presets-test2.log` in the root).
- Firefox here loses the device (`GPU device lost: Device is lost`, reason `unknown`, no
  uncaptured error before it) when the client's frame has rows that are not a multiple of 256
  bytes: 1700, 1800, 1846 and 1848 pixels wide lose it; 1024, 1280, 1600 and 1792 do not, at any
  height tried; Chrome draws 1846×962. A Worker's bare WebGPU canvas cleared every frame at
  1846×962 is not lost (`wide.mjs` in the session's scratchpad), so it is something gpu@0 or
  dpgpurast does with a frame-wide row; tracing the worker's records slowed it until nothing was
  lost. The image's settings are 1024×768; with nothing composited on this display, whether it
  happens on a hardware display is open.

## State (2026-11-07, later): Firefox's WebGPU

The owner's screenshot (`~/Screenshots/Screenshot from 2026-11-07 22-05-43.png`, Firefox on the
owner's desktop, a match on v0.1.5): whole walls missing, the sky showing through them, and the
rest drawn flat, without textures. Chrome on `gpu@0` draws the same kind of surfaces textured
(below). The owner's Firefox has a hardware GL display, so it has a WebGPU adapter and the client
draws on `gpu@0` through Firefox's WebGPU (wgpu); headless Firefox here has none and drew in
software, which is why it looked right. So Firefox most likely refuses some of the world's shader
modules or pipelines that Chrome (Dawn) takes, and `dpgpurast.c` skips their draws.

Firefox 155 gives no adapter on this machine without the owner's display: headless, and headed
on a private Xvfb, `navigator.gpu.requestAdapter()` resolves to null even with
`dom.webgpu.enabled`, `gfx.webgpu.force-enabled`, `gfx.webgpu.ignore-blocklist` and
`gfx.webrender.all` (`work/xonotic-repro/ff-adapter.mjs`). Next: the engine's console in the
owner's Firefox (Shift+Esc, the `dpgpurast:` lines, which carry each refused batch's WebGPU
message); the xonotic-shaders' WGSL validated with the naga of Firefox 155's wgpu; and a display
with hardware GL for Firefox tests that is not the owner's.

## State (2026-11-07): not reproduced on this machine

The published deployment exported from `work/locks/published` and served by
`test/pages-host.mjs` (as Pages serves it), `/v0.1.5/xonotic/` opened, the menu left to draw, then
`map stormkeep` from the engine's console (`work/xonotic-repro/repro.mjs`, `repro2.mjs`;
screenshots under `work/xonotic-repro/out*`): the menu and the map draw correctly in Chrome with a
WebGPU adapter (`gpu@0`, NVIDIA Blackwell through Vulkan, on Xvfb), in headless Chrome without one
and in headless Firefox (the software rasterizer); `/v0.1.4/xonotic/` the same in Chrome on
`gpu@0`. The frames are behind the server's welcome dialog: the Join click did not register.
Needed from the owner: the browser and system, and a screenshot. Paths not reachable here:
WebGPU on Metal (macOS), D3D12 (Windows) or Android.

## What is deployed

v0.1.5 (`fcfe756f1`) on slopshare.dev and daugasauron.com; `xonotic` is in the domain's catalog
(`config/domain-pages-images.txt:30`) with `xonotic-build`, `xonotic-shaders` (WGSL from the
engine's GLSL through `naga`), `gmqcc`, `sdl2` and the data, all rebuilt by the v0.1.5-rc.0 round.

## It shipped untested

- Last verified: 2026-10-28, `tasks/20261006-122433-xonotic` (closed): `xonotic-browser.mjs` passed
  in Chrome on `gpu@0` (509.2 s: benchmark, menu, screenshot, loading screen, a live bot match,
  timedemo) on `core/npm-packages` `7857c9ad`; in Firefox only through the software rasterizer.
- Since at least 2026-11-02 no round has run it: every round script under `work/` from
  `round-1102.sh` to `round-1106-rc.sh` sets `DOLLY_ROUND_DEMOS` without `xonotic` (the v0.1.5-rc.0
  round's list is `work/round-1106-rc.sh:11`; `wine` is missing from it too), and the GPU stage
  (`work/day-round.sh:85-99`) runs local-llm, three 0 A.D. tests, slopyard and gpu-fluid, not
  Xonotic. So v0.1.5 shipped Xonotic without a single run of its test.
- What did pass in that round on `gpu@0`: 0 A.D.'s graphics test on hardware, slopyard and
  gpu-fluid, so `gpu@0` is not broken in general.

## Changes since the last pass to look at first (not shown to be the cause)

- `gpu@0`'s lease: "The leased-device protocol is written once, in runtime.h and the supervisor
  contract" (`246f0325d`) and "A leased device is a kernel module's device: the four wrappers go"
  (`90c3b89b2`), 2026-11-04.
- The seed compiler, replaced several times (`813eda990`, `a894a435e`, `061a02318`, `4149e5c4c`):
  every binary, the engine and `naga` included, was compiled anew.
- The process contract and memory: a threaded process's memory takes its maximum before its second
  thread starts (the Chrome out-of-bounds fix in v0.1.5's notes); the engine is threaded.
- `xonotic-shaders`' WGSL, regenerated by the rebuilt `naga`.
- The display palette and mailbox constants (`b2686db23`, `ad5cc9538`), for the software path
  through the `sdl2` window.

## How to start

1. Reproduce: `xonotic-browser.mjs` against a local serve of the v0.1.5 release
   (`npm run serve`), and the same page on slopshare.dev, in Chrome with a WebGPU adapter and
   without one, saving the in-game frames; compare with the frames of 2026-10-28 if they are in
   that round's evidence.
2. If the test passes while the game is broken, the test's frame checks (`frame()` in
   `demos/xonotic/test/xonotic-browser.mjs:23-53`: lit fraction, checksum, block means) do not
   tell a correct frame from a garbled one: add a check that would have failed.
3. Bisect between `7857c9ad` and `fcfe756f1` by image rebuild only where the frames point.

## Done when

- In game, Xonotic draws correctly on `gpu@0` in Chrome and in the software rasterizer, checked
  by eye on the frames and by a test assertion that fails on the broken build.
- `xonotic` (and `wine`) are back in the release round's demo list, so a release cannot ship them
  untested again.
- The fix is in a released version, live on both domains.
