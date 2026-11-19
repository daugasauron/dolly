# Voxel Flyover: its start, fewer shaders and pipelines asked for

- STATUS: OPEN
- PRIORITY: 280
- TAGS: godot,demo,planet,performance,0.1.8

The owner (2026-11-19, on blender-flyover and Godot): "verrry slow ... kinda snappy but a lot of
loading times". Measured by the Firefox/GPU agent on round 018k's image at a load of 3 to 5, the
page to gpu@0's 120th frame: Chrome 33 to 35 s (the first frame at 6 s, then gpu@0's pipeline
batches 19 to 20 s), Firefox 21 s (batches 6.6 s); some 1,450 render pipelines and 1,050 shader
modules before the first steady frame (`tasks/20261119-071500-blender-flyover-waits`, on
`feature/blender-anim`); gpu@0 compiling in the background gave nothing in Chrome. The coordinator:
without changing Dolly's contracts, Godot's engine or gpu@0, the project asks for fewer.

Done when: what the flyover compiles before its first steady frame is known by shader and cost,
the cuts that do not change the look are made, and the page to the 120th frame is measured before
and after in both browsers, three cold starts each.

## State (2026-11-19)

Measured, and the one cut the project could make without a change to the look is made: four kinds
of standard material for six (below). It spares a quarter to two fifths of the shader modules and
every module the flight made once under way, but the start only a second or two in Firefox and
nothing in Chrome, whose waits are its pipelines. What is left is the engine's and gpu@0's (the last
section): a cache of modules by code in gpu@0, Godot's own shaders and its shader cache, Chrome's
compiling. Fewer pipelines from the project would take fewer features (SSAO's depth with normals
is one pipeline a material and vertex format) or fewer of the world's 15 shaders.

## What is made (2026-11-19)

`build/planet/measure.mjs --pipelines` logs each shader module, render and compute pipeline gpu@0
makes and the frames it presents, on the GPU Worker's clock; `build/planet/made.py` and
`waits.py` group them (by the material's uniforms in a module's code, which name the Godot shader it
comes from) and split them by the presented frames; the probe's `--pipelines 1` prints Godot's own
pipeline monitors. One start of `feature/planet` (`1f1964bb6`) in Firefox (`start-b2-firefox`), the
machine's load 10 to 17:

- Before the first presented frame (Godot's boot splash, 12 s after the page): 330 shader modules
  and 192 compute pipelines, Godot's own effects at its start.
- From it to the game's first frame (29.6 s): 552 shader modules and 198 render pipelines; gpu@0
  waited 7.7 s of it for the browser. Godot's monitors: 122 surface pipelines and 67
  specializations. The rest of the 29.6 s is Godot compiling shaders in the program (glslang in
  Wasm): headless, with the dummy renderer, which compiles none, the game's first frame comes 1.7 s
  after Godot starts.
- Then 208 more modules to the 120th frame and 320 in the minute after: the standard materials of
  what the flight builds (landmarks, towns), each made anew.
- In all 1,410 shader modules of 527 distinct codes; render pipelines by the shader they draw: the
  world's shaders (those that include terrain.gdshaderinc) 91, the standard material 40, Godot's
  own 37, the cape 16, the fur 14, the rest 2 to 8 each.
- The standard material, in six kinds of features at the start (Blender's flyer, the coats' skins,
  `Parts.paint`, the burst's flash): 480 of the modules. Each kind is a shader of its own to Godot,
  with its variants, made again for each.
- Chrome compiles far slower: the same start waited 45.5 s for the browser in Chrome (37.4 s of it
  between the splash and the game's first frame), 8.8 s in Firefox. In Chrome the batches that hold
  only shader modules wait most, 13.6 to 17.2 s of a start (`build/planet/batches.py`): gpu@0 waits
  for each module's `getCompilationInfo`, and Chrome parses and checks each module's WGSL, 41.7 MB
  of it in all, 15.5 MB the world's 170 modules, 11.7 MB 44 fragment modules of the standard
  material (265 KB each), 5.1 MB Godot's own 548.

## The cut: four kinds of standard material for six

`Parts.lit` gives the lit standard materials of Blender's flyer and of the painted parts
(`Parts.paint`: the landmarks, the jets, the dolphins) the same features: cull disabled (the
flyer's are double-sided, the painted parts closed primitives), the mesh's vertex colours (Godot
gives a mesh without them white ones: `mesh_storage.cpp`), emission (black where there was none).
They are one shader to the engine where they were three; the coats' skins and the unshaded beams
and flash keep theirs. One start each in Firefox (`start-kinds2-firefox`) and Chrome
(`ab-fewer2-chromium-1`): 834 shader modules for 1,410 (523 distinct codes for 527), 29.1 MB of WGSL
for 41.7 (the standard material's fragment modules 12 for 44), the same 212 render pipelines, and
none made after the game's first frame where 528 were (the standard materials of what the flight
builds, landmarks and towns, each made anew). Looked at: the same still before and after
(`look-headcopy`, `look-fewer2`) differs nowhere that is seen (51 to 58 dB, the fur's shiver, which
runs on the clock). Tried first with every lit material and the flash in one kind each (six
kinds to two): 786 shader modules for 1,410, none made after the game's first frame, Godot's 120th
frame 3.2 s sooner in Firefox and 4.4 s in Chrome; but the corgi turned dark brown
(`build/planet/out/look-diff.png`): a coat's skin drawn with its back faces shows through the
fur, which a still with the cull left alone showed (`look-variants1.png`). So the skins keep theirs.

## Measured (2026-11-19)

The page on 9055 to gpu@0's 120th presented frame, cold starts in a fresh browser each
(`build/planet/startcheck.mjs`), seconds and the machine's load: before on the image of `1f1964bb6`,
after on the image with the four kinds. The load moved between 5 and 16 with other agents' work,
which moves the time more than the change does.

| | before | after |
| --- | --- | --- |
| Chromium | 62.6 (15.8), 56.5 (12.2), 40.3 (6.2) | 36.7 (6.4), 40.1 (5.6), 43.2 (10.8) |
| Firefox | 37.2 (14.4), 28.3 (9.9), 32.7 (9.8) | 24.1 (6.7), 28.0 (8.5), 30.4 (11.8) |

Interleaved, the same conditions for both (`build/planet/ab-start.sh`: the project as it was and with
the four kinds run by the dev harness in turn): Godot's clock from its start to its 120th frame, the
shader modules made, and gpu@0's waits for the browser.

| | as it was | four kinds |
| --- | --- | --- |
| Chromium 1 | 53.5 s, 1099 modules, waited 28.2 s (load 7.3) | 56.6 s, 843 modules, waited 29.7 s (load 9.7) |
| Chromium 2 | 48.0 s, 1099 modules, waited 22.9 s (load 7.5) | 48.8 s, 843 modules, waited 23.7 s (load 10.2) |
| Chromium 3 | 53.9 s, 1099 modules, waited 29.1 s (load 8.7) | 50.2 s, 843 modules, waited 29.0 s (load 5.6) |
| Firefox 1 | 34.8 s, 1090 modules, waited 7.6 s (load 10.5) | 33.1 s, 834 modules, waited 6.0 s (load 13.1) |
| Firefox 2 | 30.5 s, 1090 modules, waited 6.9 s (load 8.2) | 29.6 s, 834 modules, waited 5.6 s (load 10.1) |

(A third pair in Firefox was left: the run with the four kinds stalled after its first frame, the
start-up stall Firefox has shown before.) So the cut spares a quarter of the modules at the start
(834 to 843 of 1,090 to 1,099 in these runs of 8 s; 41 % in a minute's flight) and a third of the
WGSL, and every module the flight made once under way; the start is a second or two sooner in Firefox and the same in Chrome, where the waits are the
pipelines' (the module-only batches wait behind the pipelines the browser is still compiling), which
the cut leaves as they were. The four tests passed on the image with it.

## What is left, and what it would take

- **gpu@0 makes a module for each request, the same code again and again**: 311 of the 834 are
  copies. A cache of modules by their code in gpu@0 would spare them, and in Chrome their parsing
  (not changed here: gpu@0).
- **Chrome's modules and pipelines**: a module's parse is some 20 to 30 ms in Chrome, a render
  pipeline's compile more. Fewer of them take fewer features or fewer shaders: the world's 15 shaders are 6 pipelines
  each (colour, depth with normals for SSAO, shadow, specializations).
- **Godot's own shaders**: 330 modules and 192 compute pipelines at its start, compiled in the
  program from GLSL, whatever the project asks for. Godot's shader cache (`user://`) spares that on
  a second start (48 s to 29 s, the Firefox/GPU agent's measure); an image that came with it needs
  the cache made where the image is built, which needs a RenderingDevice there (gpu@0 in builds),
  or Godot's shader baker at export, which needs the same.
- The flyer's meshes come in four vertex formats (with and without colours, one without UVs,
  primitives), each a pipeline of every pass: the same format for all of them (colours added where
  they are missing) would spare some ten. That is Blender's model's code (`model.gd`).
