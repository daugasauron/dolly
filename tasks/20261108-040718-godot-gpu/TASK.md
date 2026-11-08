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
