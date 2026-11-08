# Godot's RenderingDevice on gpu@0: a WebGPU driver for its Mobile and Forward+ renderers

- STATUS: OPEN
- PRIORITY: 400
- TAGS: godot,gpu,port

Owner (2026-11-08), after trying Godot on 0.1.6 (`tasks/20261107-131836-godot`): "The editor is not
snappy at all, I expect native like speed", and of a rendering backend for `gpu@0`: "This is the
main priority of the project right now. I want to do everything by the book, no cutting corners or
shortcuts." Then: "extend gpu@0", the order below, "Do not release 0.1.6 first", "do not use
subagents".

## Plan

1. Profile the editor as it is: what its frames spend on rendering (Mesa's softpipe), on Godot's
   own work, and on presenting them. The baseline the driver is measured against.
2. A design, for the owner's review before any contract code:
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
