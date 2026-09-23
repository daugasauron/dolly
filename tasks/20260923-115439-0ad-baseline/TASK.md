# Implement the 0 A.D. baseline in Dolly

- STATUS: OPEN
- PRIORITY: 200
- TAGS: wasm64,gpu,gamedev,port

User objective: implement the investigated baseline on a separate branch without
interrupting the main agent. Branch `codex/0ad-baseline-20260923`, worktree
`work/0ad-baseline`, starts at research commit `6b60ffc` over the user-confirmed
Blockwalker checkpoint `aa28100`.

The [investigation](../../docs/0ad-feasibility.md) remains the requirements map.
Success requires the real Release 28 engine and content, not a replacement game
or an arithmetic-only demo. Keep the complete baseline scope while implementing
the dependency chain:

- Reproducible wasm64 dependencies and SpiderMonkey embedding inside a real
  Dolly process, preserving GC/realms/callbacks and exact ABI/import checks.
- Real simulation, task execution, deterministic replay/save/load, headless
  scenario and guest command/pipe interface for agent observations/actions.
- Extended bounded GPU contract, shader/material/texture conversion, renderer,
  input, UI and content sufficient to play and finish an offline match.
- Audio and broker-constrained multiplayer transport/integration, with supported
  behavior exercised rather than silently accepting unsupported calls.
- Pinned content distribution, guest filesystem ownership and measured memory,
  startup, simulation/frame performance, process termination/restart recovery.
- Real browser verification and reproducible build/run instructions. Record
  bootstrap exceptions and browser-boundary changes alongside implementation.

Implementation uses its own extracted sources, build outputs and toolchain
caches. Other worktrees are read only. Builds/browser runs use process-tree
memory limits and bounded job counts after the earlier host freezes.

## Progress

2026-09-23: SpiderMonkey 128.13.0 with WFG's fixes compiles as wasm64 and runs in
a Dolly process in Chrome with the GPU disabled. The embedding checks separate
realms, native callbacks that trigger GC, Unicode, BigInt, Map, typed arrays,
cyclic structured cloning and JSON. Two fresh process executions passed in
201 ms and 171 ms, measured through shell submission, followed by a successful
shell filesystem command. The 7,950,622-byte module passes the current exact
`dolly-process-0` contract (only shared memory64 and the typed process call).
The shell/kernel and JS runtime are all Wasm; the browser supplies no JS engine
shortcut to the guest.

The port retains Emscripten's libc target definitions while selecting
SpiderMonkey's serial WASI paths. It adds wasm64 CPU detection, an explicit Rust
target, static mozglue linkage, process entropy and aligned GC allocation without
native address probing. The matching Rust std must contain LLVM bitcode because
SpiderMonkey enables Rust LTO. Native JIT and extra JS helper threads are disabled.

Build: `bash toolchain/0ad/build-spidermonkey.sh`; browser check and prerequisites
are in `docs/sources.md`. Build scratch/evidence: `.cache/0ad/`, notably
`prepare.log`, `build-sm.log`, `link-sm.log` and `browser-sm.log`. The tracked
pipeline passed after downloading/reinstalling all four pinned native Rust
bootstrap packages and rebuilding std; the rebuilt embedding passed two more
Chrome runs in 221 ms and 177 ms. Downloaded archives and private caches are not
committed.

Both official archives are checksum verified. `public.zip` contains 52,829 files,
3,508,827,314 bytes stored and 3,497,330,785 bytes expanded, including DDS textures,
PMD/PSA models/animations, XMB documents and SPIR-V shaders. Asset conversion and
resident memory still need verification; this is not yet a playable game.

2026-09-23: The complete engine compiles and links as a 21,603,191-byte wasm64
process. SHA-256: `40a1b2faf7fd8585a31108f34b06ae935a47c8b3700aea9f4f26c22b7acb2a56`.
Its exact process ABI passes, and Chrome executes two fresh `-version` runs.
The bounded browser check then loaded the official combat demo, reached 20 turns
in 684 ms, interrupted it with status 130 and retained its replay in the kernel
filesystem. Replaying those 20 turns with upstream serialization checks took
4,800 ms; a second fresh replay took 463 ms. Both produced state hash
`be99497b21b9cb86d3a1478d2e2e09a6`, with no replay errors and a working shell.
Evidence: `.cache/0ad/browser-engine-test.log` and `.cache/0ad/browser/`.
These timings include command submission/download and are not renderer benchmarks.

The 33,699,840-byte headless content bundle has SHA-256
`003d3492dda541f57818df1ec246dba323456ee1f1c555cd7480deec0f882d9a`.
Its initial missing victory-condition scripts were found in engine logs and
added before the passing test. It is a selected official scenario distribution,
not the complete graphical asset pack.

`engine.patch` reproduces every changed engine source from the verified release
archive (checked by applying it to pristine files and comparing their digests).
Platform changes cover wasm64 identification, serial tasks and JS context
sharing, heap-backed fixed-address pools, POSIX helper selection and explicit
failure for unsupported native HTTP listeners/desktop operations. Cached
PMD/PSA assets avoid building the native Collada conversion DLL. Audio remains
disabled at this checkpoint. Libsodium uses process getrandom, and curl version
reporting now identifies the Dolly Fetch adapter.

A real browser caught legacy EH instructions in the SDK's libpng port despite a
successful Wasm link. The tracked dependency build now recompiles libpng and
FreeType with Dolly's modern Wasm exception/longjmp flags. All tracked engine
preparation/dependency/compile/link stages have run successfully. Shell/Node
syntax checks and patch reconstruction pass. Next: a guest stdin/stdout control
interface, save/load, then the graphical renderer/content, audio and multiplayer.

2026-09-23: Added `-dolly-control` with JSON requests/responses over ordinary
guest stdin/stdout; diagnostics use stderr. It exposes observe, step/actions,
hash, save/load, reset and quit. The real combat scenario reports 69 entities.
Browser verification submitted a walk action through `cat | pyrogenesis | cat`
and measured unit 11 moving. It saved state hash
`ff2fbc7d000708ab8b70ed0eaec257df`, advanced the simulation to a different hash,
restored the exact original hash, and loaded that save in a fresh process.
Reset reproduced the initial map hash; invalid operations/turn bounds returned
structured errors followed by successful requests. Both explicit quit and EOF
completed normally. Upstream save metadata now omits camera data when no view
exists, enabling real headless `.0adsave` files.

The updated module is 21,621,318 bytes, SHA-256
`3df9e670795360414fffcad8405f33768a9dd46bbe08e6a4b2c489bdd2281193`.
The expanded browser suite also rechecked replay/serialization and interruption;
it passes under the same 3 GiB scope. Evidence includes
`.cache/0ad/browser/control-{files,pipes}.{jsonl,log}`. Pristine-source patch
reconstruction and the updated prepare stage pass. Next: graphics, selected
visual assets and UI, followed by audio/multiplayer and complete packaging.

2026-09-23: The GPU contract now has additive texture/depth/indexed rendering
records, advertised by capability bit 64. The existing record layouts and outer
imports are unchanged. New resources remain scope owned, quota counted and
explicitly retired. The browser review map and WAT wire specification are updated.
`node test/gpu-render-browser.mjs` passes in Chrome 151.0.7922.71 using SwiftShader
under a 3 GiB process-tree limit. It compiles the C fixture inside Dolly, verifies
four texture colors after offscreen rendering, near/far depth occlusion, indexed
meshes, two vertex streams, three shader groups, mip uploads and viewport bounds.
It checks malformed upload spans, allocation refusal, invalid pass sequencing,
three fresh executions and Ctrl-C/restart with allocation credits returned to zero.
The original compute/capture/boundary proof also passes. Evidence:
`.cache/0ad/browser-gpu-render.log`.

The test caught and fixed overflow in the new upload-length rounding before
allocation. Initial software shader compilation succeeded but canvas creation
failed with an incomplete Chrome launch configuration; enabling software Vulkan
presentation fixed it. No physical GPU workload was used. This is the rendering
substrate milestone; the 0 A.D. device backend and playable graphical match are
still pending, followed by audio, multiplayer and complete packaging.

2026-09-23: Added a pinned native Naga 30.0.1 shader preparation stage. It
translates 1,190 release graphics variants into 314 distinct WGSL files, retaining
upstream define indexes and reflection metadata. Descriptor indexing, compute
and shadow variants are explicitly excluded. Combined image samplers split into
texture/sampler pairs; Vulkan push constants become group-2 uniform buffers.
Chrome found derivative-uniformity errors after upstream alpha-test discards;
the converter now carries WGSL's derivative diagnostic setting for that existing
shader behavior. Naga validates every converted module.

`node test/0ad-shaders-browser.mjs` passes with 314 compiled modules and 324 linked
vertex/fragment pairs. It also renders the real upstream canvas shader and reads
four expected colors with correct orientation, then checks its grayscale uniform
using upstream reflection offsets. Chrome 151/SwiftShader took 1,744 ms for this
shader test (compilation/linking included). This is a direct WebGPU shader test,
separate from the guest GPU packet proof; the game device backend remains next.
Evidence: `.cache/0ad/shaders-build.log`, `.cache/0ad/browser-shaders.log` and the
generated hash manifest in `build/0ad/shaders/manifest.json`.
