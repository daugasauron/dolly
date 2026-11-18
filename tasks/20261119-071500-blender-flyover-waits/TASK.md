# blender-flyover: the window does not follow the page, and the waits

- STATUS: OPEN
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

Left: the round that builds the catalog on input@0's new digest, then Blender's window followed in
both browsers; the flyover's start.
