# blender-flyover: the window does not follow the page, and the waits

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: blender,godot,display,input,0.1.8

The owner (2026-11-19, 07:03, on blender-flyover): "the window doesn't resize after load, and it's
verrry slow. kinda snappy but a lot of loading times".

## State (2026-11-19)

**The window.** No program on the page followed a resize: display@0's contract said a lease
holder "is not told when the page's surface changes", so Blender's GHOST, Godot's display server,
SDL and Wine kept the size they started at and the page fitted it, letterboxed (godot-voxel-flyover
and the X workbench alike). Branch `feature/page-resize` (`5f76dae53`): the page sends the holder
of the input lease an input@0 `SURFACE` record, the canvas's size in device pixels, whenever it
resizes the canvas; Blender's GHOST makes it its windows' size and its WebGPU context draws a frame
of that size; a resizable SDL window gets SDL's resize event. Godot keeps the size its game picks
(the flyover's 1920 by 1080, which the page fits). `test/pointer-browser.mjs` checks the program
reads the canvas's size after each change: it passes in Chromium and Firefox with `system` built
again. The constant changes input@0's ABI digest, so every program linking `libdolly-input`, and
`system`, which installs it, is built again: the whole catalog, in a round. Blender's following is
not seen yet (its build waits for that round); its sources pass a syntax check against Blender's.
The X workbench's server (xsdl) has no RandR resize: it keeps its size.

**The waits**, the owner's flow timed phase by phase (`build/measure-flow.mjs` in
`work/blender-anim`, not kept), Chrome and Firefox on the NVIDIA adapter, the machine at load
20 to 30 under the overnight round, seconds:

| Phase | Chrome before | Chrome after | Firefox before | Firefox after |
| --- | --- | --- | --- | --- |
| page to Blender's first frame | 8.3 | 7.1 | 10.7 | 12.0 |
| first frame to the flyer made | 12.0 | 10.8 | 17.4 | 10.3 |
| a menu, a workspace, first time | 0.1, 0.5 | 0.1, 0.5 | 0.1, 0.6 | 0.1, 0.5 |
| Alt+P on flyer.py, until Blender answers | 30 | 8 | 12 | 7 |
| voxel-flyover to its first frame | 10.4 | 10.7 | 4.1 | 6.6 |
| godot-voxel-flyover's page to a steady game | 48 | not changed | 40 | not changed |

- Alt+P and the flyer at start: flyer.py's export took 12 of its 13 s natively, the glTF
  exporter sampling by NLA track each of the 105 animated objects by itself, a scene evaluation a
  frame each (16,800). Now an animation is one action with a slot per object, exported by action
  and sampled for all its objects at once, and only what moves is keyed: 13.2 s to 2.4 s natively,
  the same channels (141, 23, 6).
- Blender's start: of the page's 7 to 11 s to its window, 2.5 s boot the image and 2.3 s start
  Blender (its 142 MB program compiled by the browser: a second `blender -b` takes 1.0 s);
  the rest draws the window, compiling some 300 shaders.
- The flyover's start, left: about 1,450 render pipelines and 1,050 shader modules before the
  first steady frame. gpu@0's worker waits 24.5 s of it for the browser to compile pipelines;
  most of the rest is Godot compiling its shaders in the program: with its shader cache (5.9 MB
  in `user://` after a start) a second start in the same page was steady after 29 s instead of 48.
  Godot compiles its pipelines ahead for every surface and the variants it may need, on four
  threads. A fix wants the shaders compiled once, where the image is built (Godot's shader baker
  needs a RenderingDevice there: gpu@0 in builds), or fewer pipelines asked for at start.
- The flyover's start on a quieter machine (`fix/rc-browser`, 2026-11-19, the 0.1.8 round's
  `godot-voxel-flyover`, Xvfb :160 under the GPU lock, load 3 to 6; `build/start-probe.mjs`
  there: the page loaded in a new context, the seconds to gpu@0's first frame and its 120th,
  and how long its batches took, 3 starts each): Chrome 33 to 35 s (first frame 6.0 s, batches
  19 to 20 s of it), Firefox 21 s (first frame 5.1 s, batches 6.6 s). Firefox on two loaded
  cores (CPUs 6, 7, 14 and 15 beside two busy loops, load 16 to 24): 49 to 71 s (first frame 9
  to 15 s, batches 11 to 15 s). A second and third start in the same Chrome were no faster than
  the first: Chrome kept no compiled pipeline between them.
- Tried and dropped: gpu@0's worker awaiting a pipeline only where a batch sets it, the rest
  compiling on beside the next batches (their failures reported at the next WAIT). Chrome: 32 to
  37 s, batches 17 to 19.5 s, as before: what Godot draws needs nearly all it makes, so the
  browser's compiling stays in the way, and the contract kept its error at the batch that
  makes the pipeline.
- Next: the planet agent takes fewer pipelines at start; the shader baker at build time (gpu@0
  in builds, which AGENTS.md's "the build's four" rules out) is the owner's to decide.

**A program's start size after a resize (round 018m, 2026-11-20).** The round built the catalog
on input@0's new digest and passed its suites; its GPU stage failed `test/pointer-browser.mjs` in
Chrome only, 4 of 4 runs alone. In display mode, run after gpu mode narrowed the page to 700 and
the test set it back to 1000, the first click landed on 500,350 of the program's frame where the
test computed 350,350 from the canvas. Logged around that click in three runs: the program's
first frame was 700 wide in one and 1000 in two, though in each the terminal's frame and the
canvas had been 1000 wide before the program started; the SURFACE record then told it 1000. A
click is mapped on the canvas's size, the terminal's frame's until the program's first frame is
painted, so a click in that moment lands on the other size. The test now clicks first on the
program's first frame (pointer.c's colour, the canvas at its size): 4 of 4 in Chrome, Firefox
passes.

What was left then is done or closed elsewhere (below).

## Closed (2026-11-20)

**The start size after a resize.** The 700 was the page's size before Chrome reported the change.
The page sent its canvas's size from a ResizeObserver, which Chrome runs at its next frame: 3 to
17 ms after Playwright's `setViewportSize` returned, in three runs of the pointer test logged on
the page and the Worker. The test started the program at once (`clear` and the command took 13
ms), and a lease starts at the frame on screen, the terminal's for the size the page sent last:
where the program's `dolly_display_acquire` came first, that was still 700 (the terminal had not
drawn at 1000), and the new size came after it, as the `SURFACE` record. Firefox's
`setViewportSize` returns after its observer ran. The fix is the page's (`fix/lease-size`,
`8ecff154a`): a message the page sends goes after what a module would report only at the page's
next frame (each module's `beforeSend`, `host/modules.mjs`), and display@0's sends the canvas's
size when it changed. A command typed or submitted right after a resize, and a lease it takes,
start at the page's size. No contract, runtime or image is built again: page code only, and
`scripts/update-recipe-pins.mjs` pins no Dollyfile anew. A program the guest starts by itself
within a frame of a resize (on a timer, not the page's input) still starts at the size sent
last and then reads the `SURFACE` record.

Measured with a probe (`build/start-size-probe.mjs` in `work/lease-size`, not kept) that draws
the terminal 700 wide, widens the page to 1000 and starts `test/fixtures/pointer.c` at once, 20
times in one page, Xvfb :159 under the GPU lock: the program's first frame was 700 wide in 9 of
20 in Chrome before and 0 of 20 after; Firefox 0 of 20 before and after.
`test/pointer-browser.mjs` now checks that display mode's first frame, after gpu mode's narrower
page and the wider one, has the canvas's size: 3 of 3 runs pass in Chrome and in Firefox. On
the same tree `test/display-`, `terminal-`, `touch-` and `display-cursor-browser.mjs` pass
headless in both, and the source tests (477).

**Blender's window follows the page**, on round 018m's catalog (input@0's new digest), in Chrome
and Firefox on the NVIDIA adapter (`build/blender-resize-probe.mjs`, not kept: Blender on
`system` as `demos/blender/test/blender-gpu-browser.mjs` composes it, a timer in its Python
printing its window's size). The page 1600 by 1000, then 1200 by 800, then 1600 by 1000: within
0.1 s of each change gpu@0's presented frame had the canvas's size in device pixels, the gpu
canvas sat at 0,0 with its box's size (the columns it has beyond the frame, to a multiple of 32,
clipped), so no letterbox, and Blender's window was 1600 by 1000, 1200 by 800 and 1600 by 1000.
Chrome's screenshots show its interface edge to edge at each size. The owner's page,
`/blender-flyover/`, Blender with the flyer made, the same in both browsers
(`build/flyover-resize-probe.mjs`): the presented frame the canvas's size within 0.1 s of each
change, no letterbox.

**The flyover's start** is closed in its own task, `tasks/20261119-140500-flyover-start`, on
`feature/planet` (`53869a6d4`).
