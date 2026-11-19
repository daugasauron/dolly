# Voxel Flyover: its start, fewer shaders and pipelines asked for

- STATUS: CLOSED
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

## State (2026-11-20)

Three cuts are made, none changing the look. The project's: four kinds of standard material for
six (below), a quarter to two fifths fewer shader modules, the start a second or two sooner in
Firefox and the same in Chrome. Then the one in the program: most of Godot's start was compiling
shaders in Wasm, most of that the SPIR-V to WGSL converter, which inlined every call. It now
inlines only the calls that carry images and samplers (spirv-wgsl's `InlineOpaqueCalls`, below):
half its time over all of the flight's modules, a quarter less WGSL. On a quiet machine the page's
120th frame came at 32 to 39 s for 46 to 49 in Chrome and at 24 to 34 s for 31 to 43 in Firefox
(three cold starts each, below). And the project's worker threads are 8 where they were the 4
processors Dolly reports: another 2 to 2.5 s where the machine has the cores. Closed on
`feature/planet` (`f6bc55601`, the converter; this commit, the threads and the measures);
the image with both is the round's of 20 November. What is left is the engine's and gpu@0's (the
last section).

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

## Compiling in the program (2026-11-19)

Where Godot's time goes between its start and its first frames, by phase and thread:

- One traced start in Chrome (`build/planet/timeline.mjs`, a thread busy unless it waits in the
  futex or for the host): first a CPU phase of some 12 s, Godot's four workers 92 % busy each,
  then some 16 s of gpu@0 waiting for Chrome's pipelines. The four are all Godot has: the
  pool is the processors sysconf reports (4), and shader compiles are high-priority tasks
  (`ShaderRD::_compile_version_start`), one per variant.
- Each variant is glslang (GLSL to SPIR-V) and then spirv-wgsl (SPIR-V to WGSL). Timed in the
  program on one shader (the probe's `--shaderbench`: a fragment shader with
  `terrain.gdshaderinc`): glslang 13 to 15 ms, the converter 443 to 507 ms. The compiling is
  the converter's.
- The converter on every module of the flight, natively (`build/planet/native-spirv`: the
  converter and Tint built for Linux from the package's sources; the modules from Godot
  4.7.2's own Vulkan shader cache of the same flight, 834 of them, and 178 more the editor
  compiles; debug info stripped, which Godot in Dolly does not write), one core: 66.9 s in all.
  Godot's own effects (338 modules: canvas, sky, copy, GI, SSAO, tonemap, ...) 8.8 s, the
  scene shader's 248 fragment modules 44.7 s and 248 vertex modules 10.1 s. The scene shader's
  modules are the materials': the surface pipelines (122) and specializations (67) Godot's
  monitors count at the game's first frame, and each material's ubershader twice that
  (Forward+'s base variants are four, each with and without the ubershader, `shader_rd`;
  Godot 4.7.2 has no setting that leaves the ubershader out).
- Why the converter: its first passes inlined every call (`--inline-entry-points-exhaustive`),
  so a material's helpers, called many times, were copied at each call. The terrain shader
  grew from 9,387 SPIR-V words to 99,801, its WGSL from 28 KB to 333 KB, its translation from
  some 25 ms to 400, and Tint read and lowered every copy.
- Recipe flags: Godot builds as `template_release` (`optimize=speed`, -O3; Dolly's
  `platform/detect.py` does not override it), spirv-wgsl with CMake's Release and -O2 for its
  own file: nothing to fix there.

The converter needs inlined only the calls that carry an image, a sampler or a sampled image:
its passes after the inlining (an array of descriptors indexed by a variable, the depth
twins, storage images) look for each descriptor and its use in one function. That is
SPIRV-Tools' `--inline-entry-points-opaque`, which looked each argument's type up in the
def-use analysis that every inlining invalidates: it rebuilt that for the whole module at each
call, 0.9 s of the 1.3 s one of the scene's fragment modules took. The converter's own
`InlineOpaqueCalls` inlines the same calls, telling them by the function called.

On the 1,012 modules, as built against it, side by side on two cores: 66.9 s to 35.9 s, WGSL
31.0 MB to 22.8 MB; Godot's own 8.8 s to 3.8 s, the scene's fragment modules 44.7 s to 21.8 s,
its vertex modules 10.1 s to 7.5 s. The WGSL is the same as the upstream opaque pass's in every
module, the same three modules fail as before (FSR's 16-bit path, the volumetric fog with
image atomics, VRS with multiview: variants for native Vulkan features that Godot in Dolly does
not pick), and no function takes a pointer outside the function and private address spaces.
The new converter gives the same bytes run to run: three runs over the 1,012 modules (two at
once on two cores, one earlier) gave every module the same WGSL, by length and FNV-1a 64. Its
pass keeps only ordered sets of ids, for membership, and walks the functions in the module's
order and the call tree in SPIRV-Tools' queue order.
Tried and left: no inlining at all (19 s) fails
48 modules whose arrays of textures a callee indexes; inlining only the calls that pass an
element of such an array broke Tint on the shadows' samplers, which reach their texture through
a parameter. Without the optimizer's own validation of its input (Tint validates its output) the
corpus took 7 % less: kept.

Looked at: the same two stills of a flight at a fixed 60 steps a second, before and after, are
the same in Firefox (bit for bit) and in Chrome (105 and 109 dB). One Firefox run first came
out different: the game had stepped its quality down at 0.3 s (its levels follow the GPU
time), which the same build did not do again.

Measured interleaved in the evening (`build/planet/ab-conv.sh`: the Godot package alone, as
built and with the converter changed, on HEAD's project, cold each, one at a time under the
GPU lock), the round building images beside it: Godot's clock to its probe, its first frame
and its 120th, the WGSL gpu@0 was given, its waits for the browser, the load.

| | as built | calls with images and samplers inlined |
| --- | --- | --- |
| Chromium 1 | 14.8, 75.9, 94.7 s; 29.1 MB, waited 48.3 s (load 20.4) | 10.0, 35.0, 61.4 s; 21.9 MB, waited 30.3 s (19.9) |
| Chromium 2 | 18.2, 78.7, 97.8 s; 29.1 MB, waited 48.3 s (20.8) | 11.2, 35.0, 54.0 s; 21.9 MB, waited 22.9 s (21.4) |
| Chromium 3 | 15.5, 71.2, 89.3 s; 29.1 MB, waited 43.8 s (19.5) | 11.6, 34.2, 49.1 s; 21.9 MB, waited 19.1 s (18.2) |
| Firefox 1 | 9.4, 47.4, 52.4 s; 28.9 MB, waited 8.9 s (21.5) | 7.4, 29.4, 34.8 s; 21.8 MB, waited 3.0 s (19.8) |
| Firefox 2 | 9.0, 43.7, 48.3 s; 28.9 MB, waited 8.4 s (18.9) | gpu@0 never started (15.0) |
| Firefox 3 | 7.4, 37.1, 41.2 s; 28.9 MB, waited 7.3 s (15.8) | 5.9, 23.3, 29.1 s; 21.8 MB, waited 3.8 s (17.2) |

The same 843 and 834 shader modules either way. Chrome's waits shrank with the WGSL: it parses
and compiles each module's. Firefox 2 after is Firefox's start-up stall (gpu@0 not started
120 s after Godot), which the build as it was showed the same evening too.

Godot's shader cache off (`shader_compiler/shader_cache/enabled=false`), with the new converter,
interleaved with it on (`build/planet/ab-settings.sh`), load 15 to 24: Godot's 120th frame at
44.3 and 47.3 s for 45.0 and 49.0 in Chrome, 36.0 s for 37.2 in Firefox, the same modules and
waits; the page's 120th frame at 55.8 and 64.7 s for 58.8 and 65.7. A second or so at most, within
the runs' spread: left on (its files are in Dolly's filesystem in memory, which a new page starts
without, so it spares nothing at a start either way). Of the four Firefox starts of that
series, two stalled before gpu@0 started, one each way.

Measured again on a quiet machine on the morning of 20 November (`build/planet/morning.sh`,
`morning2.sh`), interleaved, cold, on the four reserved CPUs as in the evening, now also the page:
the seconds from the page's opening (Dolly's boot, the project fetched, Godot started some 6.5 s
in) to gpu@0's 120th frame (`PAGE` in `measure.mjs`). Godot's clock to its probe, its first frame
and its 120th; the page's to the 120th; gpu@0's waits; the load.

| | as built | calls with images and samplers inlined |
| --- | --- | --- |
| Chromium 1 | 7.1, 30.2, 39.3 s; page 46.2 s; waited 19.4 s (load 2.3) | 5.9, 17.2, 24.8 s; page 31.7 s; waited 9.4 s (2.8) |
| Chromium 2 | 7.2, 32.2, 41.7 s; page 48.6 s; waited 21.6 s (2.3) | 5.9, 17.8, 25.7 s; page 32.6 s; waited 10.1 s (2.5) |
| Chromium 3 | 7.2, 32.4, 42.1 s; page 49.0 s; waited 21.0 s (3.8) | 6.1, 17.9, 26.3 s; page 38.7 s; waited 10.0 s (5.5) |
| Firefox 1 | gpu@0 never started (0.9) | 3.2, 13.7, 17.6 s; page 26.7 s; waited 1.9 s (2.2) |
| Firefox 2 | 4.0, 21.0, 24.3 s; page 31.4 s; waited 4.8 s (2.8) | 3.2, 13.7, 17.2 s; page 24.4 s; waited 1.9 s (2.2) |
| Firefox 3 | 6.1, 29.9, 33.9 s; page 43.1 s; waited 6.1 s (9.5) | 4.3, 18.0, 22.7 s; page 31.9 s; waited 2.3 s (10.0) |
| Firefox 4 | 6.1, 29.3, 33.2 s; page 42.5 s; waited 5.8 s (11.0) | 4.8, 17.9, 22.1 s; page 34.3 s; waited 2.4 s (8.9) |

Three more starts of the new one each, at a load of 1.5 to 2.7, gave the same: Chrome's page at
31.7, 32.2 and 32.7 s, Firefox's at 24.9, 25.0 and 24.9 s. The image as built, on its own route
(9055, `build/planet/startcheck.mjs`), had its 120th frame at 43.4 s in Chrome at a load of 11:
the composed page is a fair stand-in for it.

Worker threads: Godot's pool is the processors sysconf reports, which Dolly makes 4. With
`threading/worker_pool/max_threads=8` (4 more of a process's 32 threads), the new converter, on
all sixteen of the machine's CPUs, interleaved with the default, load 1.6 to 3.2:

| | 4 workers | 8 workers |
| --- | --- | --- |
| Chromium 1 | 17.5 s; page 23.6 s | 15.2 s; page 21.3 s |
| Chromium 2 | 17.1 s; page 23.3 s | 15.5 s; page 21.7 s |
| Firefox 1 | 13.6 s; page 19.7 s | 11.0 s; page 17.1 s |
| Firefox 2 | 13.2 s; page 19.4 s | 11.4 s; page 17.5 s |

(Godot's 120th frame, then the page's.) The same modules and waits, no errors. The project has
it: threads change no pixel, and on a machine of 4 cores the 4 more only wait their turn.

## What is left, and what it would take

- **gpu@0 makes a module for each request, the same code again and again**: 311 of the 834 are
  copies. A cache of modules by their code in gpu@0 would spare them, and in Chrome their parsing
  (not changed here: gpu@0).
- **Chrome's modules and pipelines**: a module's parse is some 20 to 30 ms in Chrome, a render
  pipeline's compile more. Fewer of them take fewer features or fewer shaders: the world's 15 shaders are 6 pipelines
  each (colour, depth with normals for SSAO, shadow, specializations).
- **Godot's own shaders**: 330 modules and 192 compute pipelines at its start, compiled in the
  program from GLSL, whatever the project asks for (now 3.8 s of the converter natively where
  they were 8.8). Godot's shader cache (`user://`) spares that on a second start (48 s to 29 s,
  the Firefox/GPU agent's measure); an image that came with it needs the cache made where the
  image is built, which needs a RenderingDevice there (gpu@0 in builds, which the owner
  declined on 2026-11-20), or Godot's shader baker at export, which needs the same.
- **The converter's rest**: its 31 passes rebuild their analyses each, some 30 ms a pass on the
  largest modules; the optimizer's own validation of its input is 7 %. No inlining at all would
  halve the rest again (19 s natively for the 1,012 modules) if the converter's passes followed an
  image or a sampler through a call's parameter.
- The flyer's meshes come in four vertex formats (with and without colours, one without UVs,
  primitives), each a pipeline of every pass: the same format for all of them (colours added where
  they are missing) would spare some ten. That is Blender's model's code (`model.gd`).
