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
