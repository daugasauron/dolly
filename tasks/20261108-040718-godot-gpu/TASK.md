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
