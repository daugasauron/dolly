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

2026-09-24: The real graphical combat scenario runs through Dolly's new guest
renderer, including animated units, water, GUI, minimap and selection overlays.
A complete unattended battle reached the upstream defeat/summary screen at
30 seconds of simulation time; replay metadata records player 2 as the winner.
The checked input run selected 15 units by dragging and issued a real walk
command to `(65.961, 137.708)`, retained in the upstream replay. Graphical
quick-save/load restored an earlier turn, and a second fresh engine process
started and returned to the shell. `test/0ad-graphics-browser.mjs` passes with
zero logged warnings/errors under a 3 GiB process-tree limit.

Chrome 151/SwiftShader at 1024×768: content/engine staging 43,713 ms, first 22
frames 5,973 ms, fresh restart 5,466 ms, sampled frame time 320 ms, device
allocation credits 256,352,728 bytes and peak process-tree memory 2,339,061,760
bytes. These software-rendering measurements establish correctness and a
performance baseline, not a physical-GPU frame-rate claim. A longer exploratory
browser session with repeated large asset replacements/reloads exhausted its
3 GiB limit; the reproducible two-process check with the reduced pack passes.

The 21,695,906-byte engine has SHA-256
`42f523b193e72fa0b5a9b21b396b7fe39667d8d5c67679af68ece6db74162a41`.
The 215,910,400-byte graphics pack has SHA-256
`16b767516ae687f5f1207cff222c01e1c38522b7cbf29d0c63acded0616815d9`.
Packaging follows actor/variant/mesh/animation/texture dependencies and retains
shared UI assets. Native ZIP integrity and pristine reconstruction of all 33
patched engine files pass. Build/run instructions are in `docs/sources.md`.

The renderer uses reflected upstream shaders and existing bounded GPU records;
there are no new browser imports. Guest shader helpers emulate clamp-to-border
with nearest/linear edges, border colors and mip filtering; all 314 shaders and
324 stage pairs pass Chrome checks, including actual border/mip pixel tests.
Real startup exposed short POSIX reads in large ZIP directories, unnecessary
SDL timer-thread initialization, nonportable wide formatting, recursive missing
alphamap fallback and a freed cursor pointer; the port now handles those paths.
WebGPU offscreen texture orientation and browser-sized windows are accounted for.

Evidence: `.cache/0ad/browser-graphics-test.log`, `browser-shaders-border.log`
and `browser/{graphics-game.png,graphics-selection.png,graphics-replay.txt,
graphics-warnings.html,combat-metadata.json,headed-selection.png}`. The latter
summary screenshot belongs to the exploratory full battle. Next: an economy
match with building/training, broader recovery/performance work, audio and the
broker-constrained multiplayer baseline. This issue remains open.

2026-09-24: Added the official Temperate Roadway (2) map, Athens' buildable and
trainable visual dependencies, and low texture quality. The expanded browser
graphics check passes: UI clicks train two civilians, five selected builders
complete a house (population 13, capacity 30), Petra reaches population 14, and
the real replay records those commands. Both combat and economy processes return
to the shell with zero engine warnings/errors. Evidence:
`.cache/0ad/browser-graphics-economy-test.log` and
`browser/graphics-economy{.png,-replay.txt,-metadata.json,-warnings.html}`.

Chrome 151/SwiftShader: staging 65,294 ms, combat startup 5,854 ms, fresh economy
startup 11,023 ms, combat frame sample 316 ms, economy device credits 154,925,208
bytes. Peak process-tree memory was 3,154,923,520 bytes under the 3 GiB limit;
this leaves little headroom for a larger distribution or more retained processes.

The headless check also builds, trains, gathers, runs Petra and restores a save
in fresh processes. Observation now reads entity state without consuming the AI's
pending events or altering proxy caches. Hashes before/after observation and
immediately after save/load match. Petra's upstream `Serialize` previously failed
before deferred restoration created its queue manager; `data.patch` returns its
already saved data during that interval. Two loads produce matching continuations.
An uninterrupted AI run can still diverge from a loaded run: upstream cache
reconstruction consumes RNG and reissues dropsite commands. This remains a known
AI save/rejoin limitation; deterministic recorded-command replay passes separately.
Evidence: `.cache/0ad/browser-engine-economy-test.log`,
`browser/control-economy{,-restored}.{jsonl,log}` and exploratory state dumps.

The 21,696,452-byte module has SHA-256
`0cbc20e68e0506c694617f863d2c89400fced42056be504f826782312a53fa77`;
the 33,843,200-byte headless pack has
`43e47236c5374f8db34facd4dae4d701e64f8b7eafaa181d07286be300c47808`;
the 333,486,080-byte graphics pack has
`414ccbf9b7e3e65f6e39b7545c2d452a55e4aadfac30ac53e83c868d40a5c10b`.
Pristine reconstruction of all 33 engine files and source syntax checks pass.
Next: audio, restricted multiplayer and final packaging; keep this task open.

2026-09-24: OpenAL Soft 1.24.3 builds as a wasm64 loopback mixer. The port polls
events serially and uses a local counter for its internal event semaphore;
Dolly's unsupported POSIX semaphore/thread contract is unchanged. Two fresh
processes each create/destroy two contexts, render a positioned 440 Hz source
and reach AL_STOPPED (29 ms/17 ms). Evidence: `browser-openal-test.log`.

Added the typed `dolly-audio-0` PCM device, process-owned leases and one exact
outer import. Four leases each admit at most 48,000 frames and 64 queued buffers;
packets are copied and independently bounded outside compromised Wasm memory.
The real Chrome 151 browser test compiles its client inside Dolly, measures
left/right RMS peaks 0/0.3546, exercises three completed fresh processes and
Ctrl-C revocation, and returns to the shell with zero scopes/queued buffers.
Direct boundary probes verify frame/buffer/lease quotas, malformed PCM, stale
sequences/revocations, memory growth and forged guest completion denial.
Speaker output is muted during testing. Exact browser-import validation passes.
Evidence: `.cache/0ad/browser-audio-test.log`. Game audio integration and
restricted multiplayer remain next; this task remains open.

2026-09-24: Both graphical scenarios now use the real sound manager, OpenAL
loopback mixer and Vorbis decoder in Wasm. Sound items and mixer events are
polled serially. Packaging follows sound-group references and includes 15 music
tracks (Athens plus shared defaults), GUI audio and the ambient track. Normal
startup enables sound; upstream `-quickstart` disables it. The Dolly port skips
the unsupported telemetry worker directly. OpenAL's license is bundled.

`test/0ad-graphics-browser.mjs` passes with music/effects enabled, nonzero audio
analyser RMS peaks 0.2016/0.1078, all prior selection/movement/quick-save/load and
economy checks, zero engine warnings/errors, and complete output revocation on
both exits. Chrome 151/SwiftShader: staging 78,466 ms, combat startup 6,061 ms,
economy startup 10,919 ms, sampled frame 331 ms, peak memory 3,587,620,864 bytes
under 4 GiB. Increasing the queued audio cushion from 16,384 to 32,768 frames
reduced cumulative underruns from 165 to 4. That cushion adds up to 683 ms of
output latency; longer render stalls can still produce gaps. These measurements
use software rendering and muted speaker output, not a physical GPU.

Engine: 22,988,565 bytes, SHA-256
`b970ded5ad07a39b1d4d5d182eac8560ab5bfc0a03632f32931cc9d7d6dc3f4b`.
Headless pack: 33,863,680 bytes,
`a3891173e72412fe85029f3d6d768c89e090e29b57c7deccdbecfee9c16bf5be`.
Graphics/audio pack: 404,510,720 bytes,
`d9f94e4c0225454f7f93fab6246d76692dd470f3a01d8d0cc038aa98c3730be4`.
All 35 patched engine files reconstruct from the pristine archive; packaged ZIP
CRC checks pass. Evidence: `.cache/0ad/browser-graphics-audio-test.log` and the
prior 16,384-frame comparison in `browser-graphics-audio-16k.log`.
The headless regression also passes: replay hashes remain
`be99497b21b9cb86d3a1478d2e2e09a6`, control snapshot restoration remains exact,
and the AI economy/fresh-process save test takes 19,999 ms. Evidence:
`.cache/0ad/browser-engine-audio-test.log`.
Restricted multiplayer and final distribution remain outstanding.

2026-09-24: Upstream ENet now runs through a bounded room relay using Dolly's
existing HTTP broker. Its Wasm platform backend replaces native sockets while
retaining reliable packets and fragmentation. The real game server/client pump
serially; no network worker threads or browser imports were added. The relay
assigns participant addresses and confines routes to its pre-created room, with
fixed datagram/queue/socket/request bounds and idle lease expiry.

`test/0ad-enet-browser.mjs` passes two fresh 10 KB fragmented reliable echoes
and rejects another participant's capability at the browser boundary. Relay
source tests verify routing, stale/cross-participant leases, FIFO data copies,
queue/socket/request quotas and abandoned-lease expiry. Two real headless game
instances finish the official combat scenario: statuses `[0,0]`, 149 identical
turn hashes, final `f3dd66c38dd8ab65aafdbdfe020a56d9`, matching winner metadata,
zero engine warnings/errors, zero remaining sockets and working shells.
The 29.8-second simulation took 72,290 ms; peak browser process-tree memory was
1,852,792,832 bytes under the 4 GiB limit. Synchronous HTTP polling remains a
performance limitation. One intermediate run exceeded the original 90-second
test deadline near turn 142; the checked test now allows 150 seconds.

Evidence: `.cache/0ad/browser-{enet,multiplayer}-test.log` and
`browser/multiplayer-{1,2}{.log,.html,-replay.txt,-metadata.json}`.
`docs/sources.md` covers explicit endpoint setup and baseline limits: no lobby,
STUN/LAN discovery, native-peer transport or verified rejoin. All 40 patched
engine files reconstruct exactly from the verified pristine release archive.
Engine: 22,985,836 bytes, SHA-256
`1b0c7735c10b418adffe807feb810179583c05d548b0a745a21461243d259d9e`.
Content hashes remain those of the audio milestone. Final image packaging and
verification remain outstanding.
