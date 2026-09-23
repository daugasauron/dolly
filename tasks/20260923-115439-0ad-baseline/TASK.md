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
