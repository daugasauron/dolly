# Godot's RenderingDevice on gpu@0: a WebGPU driver for its Mobile and Forward+ renderers

- STATUS: OPEN
- PRIORITY: 400
- TAGS: godot,gpu,port

Owner (2026-11-08), after trying Godot on 0.1.6 (`tasks/20261107-131836-godot`): "The editor is not
snappy at all, I expect native like speed", and of a rendering backend for `gpu@0`: "This is the
main priority of the project right now. I want to do everything by the book, no cutting corners or
shortcuts." Then: "extend gpu@0", the order below, "Do not release 0.1.6 first", "do not use
subagents".

## Baseline (2026-11-08): the editor on Mesa's softpipe

Godot's editor on Dodge the Creeps' project, in `default` on `integrate/0.1.6` (`30f7cfda7`),
headless Chrome, a 1600 by 1000 page, the editor's frame 1152 by 648. Files under
`work/godot/build/gpu-baseline/`.

- **Where its time goes.** A 30 s Chrome trace with V8's sampling profiler while the editor
  switched between its 2D and 3D views every 3 s (`editor-trace.json.gz`; `profile.mjs`,
  `profile-parents.mjs`). Its main thread was never idle:

  | | time | share |
  | --- | --- | --- |
  | Mesa's softpipe: the shader interpreter, texture filtering, pixel-format conversion | 21.2 s | 71% |
  | Waiting on the kernel (`awaitHost`: the page's frame, sleeps) | 7.8 s | 26% |
  | Godot's own code | 0.6 s | 2% |

  - The top functions are softpipe's (`editor-main-functions.txt`): `fetch_src_file_channel`,
    `tgsi_exec_machine_run`, `exec_vector_binary`, `img_filter_2d_linear`. Conversions of the
    editor's 10-bit render targets (`util_format_r10g10b10a2_unorm_*`) take 2%. Presenting a frame
    (`DisplayServerDolly::swap_buffers`, `dolly_display_present`) takes under 0.1%.
  - Godot's other threads waited all the time.
- **What a person feels.** From a click on the 2D or 3D tab to the new view on the page
  (`latency.sh`, timed from 0.3 s before the click): 2D 2.25, 1.02 and 0.97 s; 3D 1.90, 1.73 and
  2.08 s. The page received 23 frames in those six switches, about one second of rendering each.
- **What it means.** Godot's work is 2% of the time: the editor waits on its renderer. A driver
  that draws on the GPU removes the 71%; the measure of success is the click-to-view latency and
  the frame time above, measured the same way.

## Shader translation (measured 2026-11-08)

Every renderer shader Godot's editor compiled for two projects (a 3D scene with lights, shadows,
fog, particles, a custom shader and text; Dodge the Creeps), in Mobile and Forward+, from its shader
cache: 1,122 SPIR-V modules (`work/godot/build/gpu-corpus-13`, `tint-measure`). The corpus is SPIR-V
1.3 (Vulkan 1.1), from Godot built natively with its Vulkan container asking for 1.3 instead of
1.4: Tint reads at most 1.3, and the driver's container picks the version.

| Path | Translated | Validates in Chrome / Firefox |
| --- | --- | --- |
| naga 30.0.1 (Dolly's package, in Dolly), SPIR-V 1.4 | 594 of 1,106 | not measured |
| Tint (Dawn `d61d3434d`, native), as it is | 242 of 1,122 | — |
| SPIRV-Tools passes, then Tint | 946 of 1,122 | 682 / 225 of 946 |

- naga's SPIR-V front end fails on what Godot's shaders are made of: `OpCopyLogical`, spec
  constant operations, `IsNan`, point size, unresolved ids. Tint's needs arrays of textures
  scalarized, which SPIRV-Tools' standard passes do (`--split-combined-image-sampler`,
  `--merge-return`, `--inline-entry-points-exhaustive`, `--replace-desc-array-access-using-var-index`,
  `--descriptor-scalar-replacement`, dead-code elimination).
- Of the 946, Chrome rejects only `enable f16` (Godot compiled for lavapipe's half floats; the
  driver reports none), Firefox only Tint's `var<immediate>` push constants (the container makes
  them a storage buffer). Each of the other 176 fails on one construct, each with a rewrite: push
  constants, point size, `IsNan`/`IsInf`, infinite constants, a memory barrier before a control
  barrier, a fetch from a multisampled texture through a sampler, input attachments, subgroups
  (reported absent), helper invocations, an image without a format.
- **Decided: Tint with SPIRV-Tools**, both linked into Godot's container, plus passes of the
  driver's own for the constructs above.
- **The translator** (`demos/godot/spirv-wgsl`, native harness in `tint-measure`): SPIRV-Tools'
  standard passes and 13 of its own, then Tint. 775 of the 1,122 modules translate, and all 775
  validate in Chrome and Firefox. Of the other 347, 330 are variants for f16 or subgroups that
  Godot compiled because lavapipe has them; the driver reports neither, so Godot does not compile
  them. The 16 left are Forward+'s optional effects (SSIL and the 2D SDF want `r16snorm` and
  `rgba16unorm` storage, which only Chrome's `texture-formats-tier1` has; SSR's filter writes an
  image without a format; an SDFGI step; volumetric fog's image atomics) and one multisampled
  variant of Mobile's tonemapper.

- Since then (2026-11-08): SPIRV-Tools' duplicate-type removal after the input-attachment pass
  translates the multisampled tonemapper and 11 more: 787 of 1,122. The rest beyond f16 and
  subgroups: a subgroup ballot (Forward+ clustering), `Int16` (FSR), SSR's formatless image,
  SDFGI's descriptor array ("invalid index" in the scalarization), volumetric fog's image atomics.
  Float textures no sampler reads are `unfilterable-float`, where depth textures bind as well.

## First light (2026-11-08)

The debug template, built inside Dolly in 6.4 minutes (2D modules and glslang), draws a 2D scene
on the Mobile renderer through the driver in Chrome and Firefox (`work/godot-dev`): the scene of
`godot-browser.mjs`, which reads its own frame back. Both draw what the Compatibility renderer
does (background `193366`, the sprite's middle `80807f`) and the label's text; on Firefox its
font atlas comes through a swizzle shadow. 59.7 frames a second in Firefox over the first 120
frames, 46.7 in Chrome, startup included. What the first runs taught:

- Godot's copies, clears, resolves and layouts index a view's image, as Vulkan's driver does; the
  driver had added the view's base mip and layer again.
- One refused batch loses every object queued after the refused record, and each later batch
  that names one fails too: the driver refuses up front what the device cannot do (a storage
  texture of a format or access it lacks refuses its shader).
- Firefox has neither `texture-formats-tier1` nor `tier2`: Godot's 2D signed distance field
  (`CanvasSdfShaderRD`, rg16sint and r8 storage) and its default VRS texture (R8_UINT storage)
  are refused there, explicitly, with an error each at startup. Chrome has both tiers.

## 3D on the Mobile renderer (2026-11-08)

The editor, built inside Dolly in 15 minutes, runs a 3D scene on the Mobile renderer in Chrome:
a procedural sky, a lit box on a floor and the sun's soft shadow (frame read back: sky `88919c`,
box `cb2c30`, floor `bcc1c8`, shadow `525e6e`), 52.2 frames a second over frames 60 to 300. The
shadow atlas is compared and filtered: the comparison reads the depth binding, the filtering a
float twin. What it took:

- The blend state's attachment *i* is colour slot *i*, as Vulkan's driver reads it; Godot's
  `p_color_attachments` names the render pass's attachment or `ATTACHMENT_UNUSED`. The tonemap
  subpass had no write mask.
- Tint gives the overrides it derives (no `@id`) ids of its own; only Godot's specialization
  constants, with explicit ids, are a pipeline's constants.

## The editor (2026-11-08)

Godot's editor, built inside Dolly in 15 minutes, opens the 3D project above through the driver
in Chrome and Firefox: its docks, inspector and 3D view with the box, grid and gizmos. A plugin
reads the editor's 1152 by 648 frame back, the same in both (1,915 red and 89 light pixels in a
sample of a quarter). It held 9,502 gpu@0 objects at its peak, beyond the 4,096 a scope held:
a scope now holds 65,536. Under Xvfb, Firefox shows no WebGPU canvas at all, its own or ours, so
its checks read frames back. Test: `demos/godot/test/godot-gpu-browser.mjs`, on a display with
a hardware adapter. It passes in Chrome and Firefox with the godot and godot-editor packages
built by their recipes (2D 48.0 and 59.0 frames a second, 3D 49.3 and 59.0, Chrome then
Firefox), and so do `godot-browser.mjs` and `godot-editor-browser.mjs`, where no adapter is
granted and Godot falls back to its Compatibility renderer.

## Against the baseline (2026-11-08)

The editor on Dodge the Creeps' project, as the baseline measured it, on the Mobile renderer
through the driver (`--rendering-method mobile`; the project asks for Compatibility):

- **What a person feels**, from a click on the 2D or 3D tab to the new view on the page, in
  Chrome (a session endpoint clicks, then reads the frame's (700, 450) from screenshots;
  `work/godot/build/gpu-baseline/session-switch.mjs`): 2D 251, 96 and 97 ms; 3D 172, 166 and
  183 ms. The baseline's 0.97 to 2.25 s counted from 0.3 s before the click: about 0.7 s for 2D
  and 1.6 s for 3D once settled, so 7 and 9 times faster. The page received 326 frames in six
  switches, where it had 23. Firefox under Xvfb shows no WebGPU canvas, so it is not measured
  this way.
- **The editor's own time**, from switching its main screen to the end of the next frame it
  draws, six switches 3 s apart (`latency-plugin.gd`), the same build on the same project:

  | | 2D | 3D |
  | --- | --- | --- |
  | Chrome, driver | 61, 6, 6 ms | 33, 33, 35 ms |
  | Chrome, softpipe | 572, 554, 560 ms | 1,039, 1,053, 1,041 ms |
  | Firefox, driver | 32, 9, 10 ms | 19, 18, 9 ms |
  | Firefox, softpipe | 511, 512, 494 ms | 940, 940, 927 ms |

## Forward+ (2026-11-08)

The 3D scene with a green omni light on Forward+ in Chrome: sky, box, shadow, and the light's
pool on the floor (`c1ffcd`), so its clusters are built; 48.2 frames a second. What it took:

- Subgroups of one invocation: Godot's Forward+ uses subgroup ballots and reductions without
  asking (its clustering, its light loops); a subgroup of size one is one by the specification,
  and Godot's algorithms keep their results with it. The translator lowers the six operations
  Godot uses and refuses any other. 829 of the 1,122 modules translate.
- Forward+ draws its light clusters into storage in a subpass with no attachments, at four
  samples: WebGPU's passes need one, so such a pass gets a depth attachment of the first
  pipeline's sample count, never written and always passing.
- A shader binding more than the device allows a stage is refused before its records, as an
  unsupported storage format already is.

Refused, with an error each when Godot compiles them: volumetric fog (image atomics, which WGSL
lacks, and a `Volatile` member), SSR's filter (an image without a format), FSR 1's upscaler
(`Int16`), SDFGI's preprocessing (an array the translator does not scalarize; 15 storage
textures where Chrome allows 8), and the GI shaders whose storage the device lacks. In Firefox,
which has neither format tier, the scene drew dark (below).

## Firefox's Forward+, Chrome's frame rate, SDFGI (2026-11-08, night)

- Firefox has neither texture format tier, so shaders cannot store into r8unorm and other small
  formats there. Such a texture is created without storage usage and shadowed by one of a wider
  format that compute shaders bind; each mip and layer they wrote is drawn back before the texture
  is next read (`ccbadd82a`). Forward+ in Firefox: the 3D scene reads sky `88919c`, box `cb2f31`,
  floor `bec2c9`, shadow `535e6f` (Mobile's within 3), 58.8 frames a second.
- Godot ran at 48 to 49 frames a second in Chrome and 59 in Firefox. An instrumented provider
  (served in place of `host/gpu/worker.mjs`) measured five batches a frame for the 2D scene, 1.3 ms
  in Godot between them, and 18.1 ms of each 20 ms frame in `popErrorScope`, which Chrome answers
  after a round trip to its GPU process (3.6 ms). A batch is now answered once encoded, and
  WebGPU's validation errors reach the page's console and fail the scope's next `WAIT`
  (`1892487c0`, docs/gpu.md): Chrome 60.1 and 60.2 (2D, 3D), Firefox 59.0.
- Truck Town at 1920x1080: 41 frames a second in Chrome, 59 in Firefox. Its frames finish 69 ms
  after submission in Chrome and 16 ms in Firefox, and 15 ms in Chrome at 960x540 (60 frames a
  second). A bare WebGPU clear of a 1080p canvas runs at 54 in the same Chrome on Xvfb (60 at
  1152x648), and Firefox on Xvfb presents no canvas: Chrome's presentation on Xvfb, not Godot's
  work, holds it there. Not measured on a display with a GPU.
- Ticking SDFGI in Truck Town's menu left it on its loading screen: Godot compiled the scene
  shader's SDFGI voxelization variants for each material, and each failed, as they take image
  atomics; SDFGI also views a texture as R4G4B4A4 and binds 15 storage textures in one stage.
  `godot-dolly.patch` now has Forward+ start SDFGI only where the device has 32-bit image atomics
  (`8922daffc`); Truck Town then loads and drives with the box ticked.
- The translator (`8922daffc`): storage images get the access their uses need (Godot declares
  many neither readonly nor writeonly); one without a format takes a placeholder the driver's
  storage variants replace (SSR's filter); `Volatile` goes from fog's no-atomics buffers; a write
  to a descriptor array indexed by a variable, which SPIRV-Tools copies into a switch but keeps,
  is removed (SDFGI's occlusion). Corpus: 830 of 1,122; the rest are f16 variants (288), FSR's
  half variant and fog's image-atomics variant, neither of which Godot picks here.

## Forward+'s effects (2026-11-09)

A 3D scene with SSR, SSAO, SSIL, glow, volumetric fog, depth of field and FSR 1 scaling on drew
nothing in either browser. Fixed in `7abbef59d`, and now in the hardware test (box `c53b3d`, mirror
floor `62738a`, the same in both browsers):

- Godot keeps no variant of a shader if one fails, and FSR's half-precision variant (16-bit
  integers, which WGSL lacks) failed, so FSR's fallback went too, and `fsr.cpp` returned with its
  compute list open, failing every later frame. A variant the translator or the device refuses is
  now kept without modules, as Vulkan keeps a module it could not pipeline, and its pipelines are
  refused. (Refusing the shader instead makes `bokeh_dof.cpp` return with its compute list open.)
- A depth shadow read a depth-stencil texture through a depth-only view of the combined format.
- Volumetric fog clears 3D textures, which gpu@0's view passes cannot attach: a zero clear is a
  copy from a buffer the GPU clears.
- A view copied its texture's storage shadow, so freeing a view in Firefox released the texture's
  shadow under it (two refused batches at exit).

In Firefox, SSIL, the depth-of-field blur, VoxelGI and 2D SDFs store formats it lacks (tier 1 and
2). Refusing their pipelines made Godot's release builds end on an integer divide by zero
(`compute_list_dispatch_threads` divides by the bound pipeline's workgroup size; debug builds stop
at a check and print it each frame). Such a variant's compute pipeline now binds nothing and does
nothing (`b63f12dfe`), reported once as Godot makes it: the effect is absent, the game runs. SDFGI's
three pipelines are reported so at startup in both browsers (Godot makes them though SDFGI never
runs here).

Firefox's Mobile scene then drew black: the provider timed every pass of an encoder with a pair of
timestamps, past its query set's 2,048 once a frame (one continued encoder) had more than 1,024
passes, and WebGPU refused the frame's command buffer. They were that many because the storage
shadows drew every mip and layer back after any store. `1ecd66489`: later passes go untimed, and
only the subresources a storage view covered are drawn back (sky `88919c`, box `cb2c2e` again).

## Truck Town's video (2026-11-08)

For the demos page: `work/videos-2026-11-08/cuts/truck-town.mp4` (1:36, Chrome on this machine's
GPU), its poster and README, and a preview of the page with it (`site-agents-preview/`). Not in
git, like v0.1.5's videos: the release that publishes the page takes it from there.

## Tests (2026-11-09, `754c062b5`)

Godot's hardware test (2D, Mobile, Forward+, the effects scene, the editor, Truck Town's menu),
the GPU contract tests (explicit records, rendering), godot-browser and the editor test pass in
Chrome and Firefox on this machine's GPU. Frame rates in the hardware test (2D, Mobile, Forward+,
effects): Chrome 60.1, 60.0, 59.8, 56.0; Firefox 59.0, 59.0, 59.0, 59.0.

## Against the baseline again (2026-11-09, Chrome)

The same measures on Dodge the Creeps' project after `1892487c0` (batches no longer wait for
WebGPU's validation), in a session with the driver of `754c062b5`:

- The editor's own time, switch to drawn frame (2D, 3D alternating, three runs): 123, 31, 5, 10,
  6, 20; 119, 15, 5, 25, 5, 13; 119, 31, 4, 4, 4, 7 ms. Before: 2D 61, 6, 6 and 3D 33, 33, 35 ms.
  The first switch, cold, is slower than before (119 to 123 against 61); with the provider of
  before `1892487c0` it is too (121 to 124, and 3D 32 to 36 again), and with the driver of
  `e80a9c916` (122 to 127): neither tonight's provider nor its driver; the translator package and
  the build remain, untested.
- Click to view on the page: 2D 315 (cold), 128, 128 ms; 3D 80, 80, 89 ms. Before: 2D 251, 96, 97
  and 3D 172, 166, 183 ms.

## The editor's input latency (2026-11-09)

Owner (2026-11-09): "The editor itself is still not snappy. Neither in firefox or chrome. Just
hovering over a button should highlight it immediately, and clicking buttons feels incredibly
sluggish as well." Measured on the editor's toolbar (an empty project, 1600 by 1000 page, Xvfb
`:148` at 5000 by 3000 so the X pointer is off the window), each step on one clock: the page's
event, the record sent, Godot's hovered control (an editor plugin), Godot's `frame_post_draw`, the
provider's present, and, in Chrome, the first change of the button's pixels in an ffmpeg
`x11grab` at 250 frames a second (`-vsync passthrough`; Playwright screenshots make headed Chrome
repaint its window white for 50 to 80 ms, so the probe takes none).

- A bare WebGPU canvas in a Worker that recolours on a posted move shows on screen 17 to 21 ms
  after the move; 32 to 37 while the page runs `requestAnimationFrame` every frame, as Dolly's does
  while a program holds the display: Chrome then holds `pointermove` for the next frame.
  `pointerrawupdate` (Chrome, Firefox 157, secure pages) is not held: 17 to 20 with the loop.
  `COPY_SRC` usage, `object-fit` scaling, a second frame in the same task and a non-passive
  `pointermove` listener change nothing; a delay before drawing adds itself.
- Before, in Chrome: the move reached the Worker 15 to 17 ms after it, Godot 18 to 24 (its
  low-processor sleep, 6.9 ms in the editor), its present 22 to 28, the screen 39 to 47; a click
  30 to 63. In Firefox, Godot saw a hover 4 to 24 ms after it and presented it at 10 to 30.
- Now the page sends a mouse's motion from `pointerrawupdate` where the browser has it, the
  first move after a quiet frame at once and the rest of that frame at the next animation frame;
  and in low-processor mode Godot's frame sleep ends at the next input record
  (`OS_Dolly::add_frame_delay`, as Godot's Windows and macOS platforms end it for a screen
  reader). Chrome: Godot sees a hover 1 to 2 ms after it, presents it at 4 to 7, the screen
  shows it at 25 to 31; a click at 26 to 30. Firefox: Godot 2 to 3 ms, present 8 to 9. What is
  left above the bare canvas is Godot's own frame, 3 to 6 ms from the hover to its present.
- A drag (the 3D view's orbit) with a raw update every 2 ms: sending the first move after each
  frame at once as well as the frame's sample made Godot draw ahead and wait on the provider's
  three frames for 3.7 of 3 s in Chrome (2.0 s in Firefox), its input as old when shown (p50 16
  to 17 ms). The page now sends at once only after a frame without motion: one sample a frame,
  waits 0.09 s in Chrome and none in Firefox, input as old.
- Firefox settles `onSubmittedWorkDone` 1 to 137 ms after a submission (p50 8, p90 83), but no
  editor action waited on it: frames rarely queue behind it.
- Clicks that do work, on a scene of a box, a camera, a light and a label: their last frame
  comes, in both browsers, in ms after the press: a menu 11 to 14; the Script or 3D view
  10 to 13; Add Node 29 to 48; selecting a node 56 to 142 (142 to 238 the first time). Selecting
  rebuilds the Inspector in one frame, Godot's own work at about half native speed
  (`tasks/20261109-131500-wasm-cpu-speed`). A hover's frame is 3 to 6 ms of Godot's, its canvas and
  the 3D view, and 7% of it sorts the scene tree's process list, as natively.
- First-time clicks wait on pipelines: Godot compiles a specialized pipeline on a worker thread and
  draws with its ubershader until it is made, but the driver queues the creation and returns at
  once, so the next frame's batch creates and uses it. The provider awaited each
  `createRenderPipelineAsync` in turn, and Chrome compiles them one after another so: the first
  selection's batch of 10 pipelines took 87.6 ms (Firefox 7.5). Ten heavy synthetic pipelines in a
  Worker: Chrome 726 to 743 ms awaited in turn, 137 to 152 created together; Firefox about 600
  either way. A batch's pipelines are now created together and awaited before it first sets one
  and at its end: that batch 39.4 ms, the first selection settled at 50 ms (99 before). Firefox
  unchanged.
- In Firefox a buffer read waits on the 100 ms timer too: 0.65 s after the first selection of a
  mesh, Godot's preview of it maps a buffer, a one-record batch of 83 to 103 ms that the editor's
  frames queue behind (one request at a time per scope).
- Firefox settles a submission when its queue next submits, otherwise on its 100 ms timer: empty
  submissions after each frame brought the editor's completions from p50 12.7 and p90 73.7 ms to
  2.5 and 10.4, a menu click's frame from 124 to 24. The provider now submits nothing at 2, 5, 10,
  20 and 40 ms while a presented frame, a `WAIT` or a map is pending: completions p50 2.4, p90 5.5,
  max 34 ms; the preview's map 5.5 ms. Whether Firefox shows a WebGPU canvas through a readback
  that waits the same way is not known here: under Xvfb it shows none.
- Wheel: Chrome holds a wheel event a frame while the page animates, 48 to 54 ms against 31 to 35
  on a bare canvas. The page animates while a program holds the display because display@0 counts
  its animation frames then; only the kernel knows when a program waits for one, so counting on
  demand needs a mailbox word from the kernel, and a kernel change rebuilds every image.

## Plan

1. Profile the editor as it is (done: Baseline, above).
2. A design, for the owner's review before any contract code ([DESIGN.md](DESIGN.md), written
   2026-11-08, awaiting that review):
   - every method of Godot's `RenderingDeviceDriver` and `RenderingContextDriver` mapped to WebGPU
     and to gpu@0;
   - what gpu@0 lacks, as additions to gpu@0 itself (owner: extend it, no new version), each with
     its quota and its line in `docs/browser-boundary.md`;
   - how SPIR-V, which Godot compiles its shaders to while it runs, becomes WGSL inside Dolly;
   - WebGPU's gaps against Godot's renderers, and the renderer to bring up first (Mobile);
   - the one change to Godot itself (its renderers' driver names in `main/main.cpp`);
   - the cost of a gpu@0 batch, measured, against the commands Godot records a frame.
3. The approved contract additions: WAT, kernel, client, GPU Worker, quotas, tests.
4. Shader translation inside Dolly, with tests.
5. The driver in `demos/godot/platform`: a clear screen, Godot's 2D renderer, the editor, 3D on
   the Mobile renderer, then Forward+.
6. Tests in Chromium and Firefox on real adapters (Firefox through Playwright's installed
   Firefox, `docs/gpu.md`), and the editor's and a 3D scene's frame times against step 1.

Done when Godot's editor and a 3D project draw through the driver on `gpu@0` in Chromium and
Firefox, their tests pass on real adapters there, and the editor's frame times are measured and
recorded against the baseline of step 1.
