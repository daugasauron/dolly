# 0 A.D.

0 A.D. Release 28 runs as an ordinary wasm64 Dolly process with WebGPU graphics,
audio, replay and a relayed two-peer match. The engine is cross-compiled outside
Dolly: an explicit bootstrap exception.

## Images

- `zero-ad`: 0 A.D. Release 28: Athens economy and combat scenarios, audio and replay. Requires WebGPU.
- `openal-build`: OpenAL Soft built for the 0 A.D. audio path.

## Bootstrap

The experimental Release 28 port in `demos/zero-ad/toolchain`
cross-compiles the engine and its C/C++/Rust dependencies outside Dolly. This is
an explicit bootstrap exception. Source/data archives are pinned in
`config/source-pins.sh`, additional dependency archives in
`demos/zero-ad/toolchain/dependencies.tsv`, and SDK ports by the pinned Emscripten image.
SpiderMonkey reuses the compiler seed's Rust bootstrap, std and libc patches.
The executable imports only the exact `dolly-process-0` contract; no Emscripten
JavaScript loader accompanies it.

On Linux x86_64 with an existing Dolly process sysroot, Podman, systemd user
scopes, Python 3, make, m4 and pkg-config:

```sh
bash demos/zero-ad/toolchain/build-engine.sh
bash demos/zero-ad/toolchain/prepare-headless.sh
systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 node demos/zero-ad/test/0ad-engine-browser.mjs
```

Set `DOLLY_PROCESS_SYSROOT` to the project-relative sysroot directory if it is
not `.cache/process-sysroot`. The browser check needs the default runtime/image
built and Chrome installed. Builds use two jobs, a 4 GiB limit and no swap.
For engine-only iterations run `demos/zero-ad/toolchain/engine.sh` inside the pinned SDK
container, then `bash demos/zero-ad/toolchain/link-engine.sh`. Logs and downloaded browser
evidence live under `.cache/0ad/`; generated Wasm/content under `build/0ad/`.

The headless bundle selects the official combat demo, Temperate Roadway (2),
simulation scripts and ICU data. It runs
headlessly with serial tasks, shared JS contexts and separate realms, no native
JIT, and heap-backed fixed-address pools. SDL uses Dolly's existing backend;
curl uses its restrictable HTTP broker. Browser checks exercise real simulation,
serialization, deterministic replay, save/load, guest pipes and process
interruption/recovery, plus house construction, training, gathering and Petra AI.
The save/load check compares 100 subsequent turns against uninterrupted play,
including loading in a fresh process. The small upstream data patch avoids RNG
draws and commands during AI restoration and keeps full and incremental entity
observations consistent.
Graphical content and restricted multiplayer are covered below; measurements are in
[`tasks/20260923-115439-0ad-baseline`](../../tasks/20260923-115439-0ad-baseline/TASK.md).

Multiplayer retains upstream ENet 1.3.18 reliability/fragmentation and replaces
its native socket backend with `enet-dolly.c`, above the existing HTTP ABI.
The guest supplies `DOLLY_ENET_RELAY`; the browser policy must allow POST to that
exact capability URL. `node demos/zero-ad/toolchain/relay.mjs 8090 BROWSER_ORIGIN` starts a
loopback relay and prints two participant URLs and logical addresses. Each
participant gets only its own URL. Start the host with
`-autostart=scenarios/combat_demo -autostart-host -autostart-host-players=2`
and the other participant with `-autostart-client=10.0.0.1`; give them distinct
`-autostart-playername` values. Add `-autostart-nonvisual -nosound -quickstart`
for the verified headless match. These are normal upstream network game paths;
`-dolly-control` remains an offline interface.

The server and client pumps run serially in Wasm, draining at most 64 available
events per frame. Sends to peers already marked disconnected fail before packet
creation. The relay routes only bounded
datagrams within its pre-created room, with no native UDP/TCP forwarding or
arbitrary destination access. Ports and sender addresses are assigned by the
relay; eight socket leases per participant expire after 60 seconds idle, pruned
on the next request. A room supports 2–8 participants; two are browser-tested.
Lobby, STUN, LAN discovery, native-client interoperability and network rejoin
are outside this baseline. Remote deployment requires an explicitly configured
HTTPS relay endpoint; the supplied CLI binds loopback only. Synchronous HTTP
polling is slow: the 29.8-second combat match took 72.3 seconds on the test host.
Both peers recorded all 149 identical turn hashes and the same winner, exited
normally with no engine warnings/errors, and released every relay socket.

`node --test demos/zero-ad/test/0ad-relay.test.mjs` checks routing and quotas.
`demos/zero-ad/test/0ad-enet-browser.mjs` checks reliable fragmented 10 KB echoes, fresh socket
reuse and browser denial of another participant's URL. Link its fixture after
`enet.sh` using `bash demos/zero-ad/toolchain/link.sh build/0ad/enet-check.wasm
.cache/0ad/enet-check.o .cache/0ad/sysroot/lib/static/libenet.a`.
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 node
demos/zero-ad/test/0ad-multiplayer-browser.mjs` exercises the two real engines with the GPU
disabled. The measured process-tree peak was 1,852,792,832 bytes.
The optional `visual` or `visual-client` argument uses the packaged `zero-ad`
image with a graphical host or client, respectively, and a headless peer. Run
on the desktop with a 6 GiB scope; hardware mode rejects fallback adapters.
An explicit second argument, `software`, selects SwiftShader for Xvfb checks.
The test sends a real order to selected units and compares every shared turn's
commands and hashes plus winner metadata. Per-process timestamps are excluded.
Both arrangements passed all 149 shared turns on hardware: 112 seconds with a
graphical client (4.83 GB peak), and 137 seconds with a graphical host (5.19 GB).
The headless host now keeps polling after victory until all connected peers
have simulated the winning turn. Both peers record the winner, exit cleanly
and release their relay sockets.

OpenAL Soft 1.24.3 is checksum-pinned in `config/source-pins.sh`.
`npm run image -- openal-build` builds and installs its static library, headers,
CMake package and licenses inside Dolly, then compiles and runs the stereo
loopback check against that installation. Its loopback mixer runs serially:
`demos/zero-ad/openal-dolly.patch` polls its event queue after rendering and replaces
its internal semaphore with a counter. It does not enable Dolly thread creation
or POSIX semaphores. The external 0 A.D. bootstrap consumes the same prepared
source; `openal.sh` builds its library and mixer fixture. Link the
latter with `bash demos/zero-ad/toolchain/link.sh build/0ad/openal-check.wasm
.cache/0ad/openal-check.o .cache/0ad/sysroot/lib/libopenal.a`, then run
`node demos/zero-ad/test/0ad-openal-browser.mjs`. Two fresh processes each exercise two contexts,
stereo positioning and playback completion. The game uses that mixer, decodes
Vorbis in Wasm and polls sound items between PCM chunks. It keeps up to 32,768
frames (683 ms) queued to tolerate slow render frames. This adds output latency;
frames longer than the cushion can still cause audible gaps. Dolly skips the
unsupported telemetry worker, so sound-enabled launches need no `-quickstart`
option (upstream quickstart also disables sound).

`Dollyfile-audio-sdk` builds the reusable PCM library inside Dolly.
`node test/audio-browser.mjs` links a client against that SDK and verifies
real Web Audio output, bounded queues, fresh processes and Ctrl-C cleanup.
Chrome runs with GPU disabled and muted speaker output; an analyser measures
the rendered signal. The typed `dolly-audio-0` contract and authority limits are
documented in [the sound interface](../../docs/audio.md) and
[the browser review map](../../docs/browser-boundary.md#experimental-audio-provider).

After preparing those official archives, `bash demos/zero-ad/toolchain/prepare-shaders.sh`
builds checksum-pinned Naga 30.0.1 with its locked dependencies and the same
native Rust bootstrap. It translates the release's SPIR-V graphics and buffer-compute variants to
`build/0ad/shaders`, retaining their define indexes, streams and uniform offsets.
Combined samplers become texture/sampler pairs in group 1; push constants become
a uniform buffer in group 2. Group 0 retains material uniforms. Group 3 carries
guest sampler descriptors for clamp-to-border emulation, including filtered
edges and mip levels; this adds no browser capability. Buffer-only compute
shaders use the existing single buffer group, with write-only storage declarations
lowered to WGSL read/write access. Bindless, shadow and texture-compute variants
are excluded from this renderer baseline.
`node demos/zero-ad/test/0ad-shaders-browser.mjs` compiles and links every converted shader in
Chrome's software WebGPU adapter and checks the real upstream canvas shader's
colors, orientation, grayscale uniform and border/mip filtering. Both skinning
variants also check weighted positions, packed normals/tangents and offset/bounds
guards. This validates shader conversion;
it does not by itself establish a playable renderer. The GPU packet path has
its separate guest-compiled check in `test/gpu-render-browser.mjs`.

After the headless bundle and shaders exist, package the complete upstream
content and build the `zero-ad` image:

```sh
python3 demos/zero-ad/toolchain/package-graphics.py .cache/0ad/0ad-0.28.0
node demos/zero-ad/toolchain/prepare-distribution.mjs
systemd-run --user --scope -p MemoryMax=10G -p MemorySwapMax=0 npm run image -- zero-ad
systemd-run --user --scope -p MemoryMax=5G -p MemorySwapMax=0 node demos/zero-ad/test/0ad-graphics-browser.mjs zero-ad hardware
DOLLY_BUILD_IMAGES=zero-ad npm run publish
npm run serve
```

The graphics package contains every upstream map, civilization, texture, model,
animation, sound and music track. Native SPIR-V is omitted; translated WGSL serves
the supported rendering paths. Content stays compressed in bounded ZIP archives, which the upstream VFS
mounts normally. `prepare-distribution.mjs` copies the engine/content and generates
SHA-256-pinned `SOURCE HOST` entries in `demos/zero-ad/zero-ad.dm` and `Dollyfile-zero-ad`.
Assembly inherits the default image and uses Dolly's normal source-download and
snapshot pipeline. The external engine build remains the explicit bootstrap
exception described above; there is no host filesystem shortcut. Upstream
engine/content notices and ICU/OpenAL licenses are retained.

Opening `/zero-ad/` starts the upstream main menu. The `zero-ad` shell command
also opens that menu and forwards explicit engine arguments, for example:

```sh
zero-ad -autostart=scenarios/combat_demo
zero-ad -autostart=skirmishes/temperate_roadway_2p -autostart-civ=1:athen -autostart-civ=2:athen -autostart-ai=2:petra -autostart-aidiff=2:1
```

F10 opens the game menu; Ctrl-F10 exits cleanly to the shell and writes replay
metadata. Ctrl-C interrupts the process; forced termination may leave incomplete
replay metadata. Saves and replays live under `/opt/0ad/data` in the guest
filesystem. Use Dolly's session save/download commands to retain them outside
the current tab. `-version` and `-dolly-control` also work through the wrapper,
which sets ICU's data path.

The Wasm renderer uses bounded GPU packets, an offscreen backbuffer with opaque presentation,
indexed meshes, reflected uniforms and translated upstream shaders. SDL owns
input. Defaults select system cursors and low texture quality, with shadows,
silhouettes, advanced water, postprocessing and antialiasing disabled.
The graphics menu exposes supported controls, including texture quality and
up to 16× anisotropic filtering. Streamed buffers, aligned uniform ranges and
unchanged resource groups are reused. Released resources retain their allocation
charges until GPU work completes.
The binding cache reclaims entries at the admitted object limit, submitting
pending draws and waiting for allocation retirement before reusing that capacity.
Upstream GPU skinning keeps animation outputs on the device, using distinct
storage pools for positions and packed half-float attributes. Providers without
half-float vertex support retain CPU skinning. The normal graphics option can
switch paths during a match; `-conf=gpuskinning:false` selects CPU explicitly.

The browser check rejects fallback adapters by default. It exercises drag
selection, movement recorded in the upstream replay, graphical quick-save/load,
training and completed house construction through the economy UI, Petra progress,
audible data in the browser audio graph, live skinning and texture-quality changes,
fresh processes and shell recovery. Append `auto cpu` after the browser name
to check CPU skinning, or `core` for core WebGPU limits with optional features
disabled. Speaker output is muted during the test. Quick-save uses upstream's
in-memory snapshot. `demos/zero-ad/test/0ad-menu-browser.mjs` exercises graphics options,
ordinary menu save/load across fresh processes, and menu-created matches;
ordinary `.0adsave` persistence also has its headless test below.
For Firefox on the desktop, append `firefox` to the browser-check command. For
software correctness, use `xvfb-run -a node demos/zero-ad/test/0ad-graphics-browser.mjs zero-ad
software` (Xvfb and xauth required). Run hardware checks serially.
On this dual-GPU Linux machine, Firefox 155 presents a black WebGPU canvas when
forced to the AMD Vulkan ICD, including in a standalone canvas test. Chrome on
AMD and Firefox on the default NVIDIA adapter render correctly; details and
reproduction evidence are in the gameplay task below.
Firefox 155 also exits during a standalone device-destruction test with pending
GPU readback, consistent with [Mozilla bug 1976766](https://bugzilla.mozilla.org/show_bug.cgi?id=1976766)
(marked fixed for 157/158). Chrome's injected game-device-loss test preserves
the shell/files and starts a fresh game successfully.

The full installed image is about 2.07 GB. Browser boot streams independently
verified snapshot packs into Wasm memory; it does not retain a second complete
JavaScript copy. Full-content menu, gameplay and resource measurements are kept
in the [gameplay performance task](../../tasks/20260924-115634-0ad-gameplay-performance/TASK.md).
Memory caps above are measured test bounds, not requirements for every map or
a guarantee of performance on another machine.

`pyrogenesis -dolly-control -autostart-nonvisual -autostart=scenarios/combat_demo`
adds a line-oriented guest JSON protocol to the ordinary autostart options.
Each request contains `id` and `op`; each response echoes `id` and contains
`ok` plus `result` or `error`. Engine diagnostics go to stderr. EOF or `quit`
ends the process normally. Use `-quickstart -writableRoot -mod=public` and set
`ICU_DATA` to the bundle's `data/icu` directory, as in the browser check.

| Operation | Additional properties / result |
| --- | --- |
| `observe` | Players, full entity representations, positions, health and simulation time; preserves AI events/caches |
| `step` | `turns` (1–1000, default 1), optional `commands: [{player, command}]`; returns state after stepping |
| `hash` | Full deterministic simulation state hash |
| `save`, `load` | `name`: 1–100 letters, digits, `_` or `-`; uses ordinary `.0adsave` archives in the guest filesystem |
| `reset` | Upstream game `attributes`, optional `player` (default 1); returns initial state |
| `quit` | Clean shutdown |

Commands are upstream simulation command objects, such as
`{"type":"walk","entities":[11],"x":65,"z":140,"queued":false}`.
The control mode currently requires an offline headless game. Requests are
limited to 1 MiB and 1000 commands per step. It is a guest program protocol;
it adds no browser imports or network listeners.

Observations expose all entities and are intended for diagnostics/control, not
fog-of-war competition. `data.patch` lets Petra serialize its saved data while
its deferred restoration is pending and fixes reconstruction side effects and
stale entity observations. Browser checks prove exact saved-state hash restoration,
fresh-process loading, and 100-turn continuations matching uninterrupted play.
Deterministic recorded-command replay is checked separately.

For the smaller SpiderMonkey-only build/check, use
`bash demos/zero-ad/toolchain/build-spidermonkey.sh` and
`systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 node demos/zero-ad/test/0ad-spidermonkey-browser.mjs`.

## Pre-port investigation

The subsequent implementation, browser evidence and remaining limits are in the
[baseline task](../../tasks/20260923-115439-0ad-baseline/TASK.md) and the bootstrap section above.

Investigation: 2026-09-23. **Plausible, but a substantial port; current Dolly cannot run the game.**
The best first result is an offline, nonvisual match using the real engine and
simulation scripts. A playable graphical match additionally needs a new renderer
backend and a substantial, deliberately scoped extension to Dolly's GPU contract.
Slopyard's working GPU path is useful infrastructure, but does not supply that
renderer. The highest uncertainty is SpiderMonkey on wasm64 and its performance
without native JIT compilation. Resolve that before investing in the renderer.

### Checkpoints and evidence

- Dolly branch: `codex/0ad-investigation-20260923`, based on Slopyard checkpoint
  `aa281009978e41323b93bef88de42d633bc63d56`. The user confirmed this base.
  Local and fetched `main` were `e0dc968`, which did not contain Slopyard.
- Upstream target: [0 A.D. Release 28][release], tag `v0.28.0`, commit
  `a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d`. Investigate this release rather than
  an old GitHub mirror or moving development branch.
- Downloaded and inspected the official [source archive][downloads]:
  `0ad-0.28.0-unix-build.tar.xz`, 164,975,536 bytes, SHA-256
  `27e217755ef76a922fe58dbf593d96e54b6ed2375d23f548c35619aa6bd5a42a`.
  It bundles SpiderMonkey 128.13.0; the game applies its `128.13.0+wfg4` patch set.
- The data archive's HTTP Content-Length is **1,415,012,652 bytes**. Only its
  headers and selected upstream text files were fetched; the full data archive
  was not downloaded. This is compressed distribution size, not measured RAM use.

| Probe | Observed result | What it establishes |
| --- | --- | --- |
| Unmodified `source/lib/sysdep/arch.h`, Emscripten 6.0.8 `em++ -m64` | Compilation fails: architecture not correctly detected | The engine needs a real wasm64 target definition |
| Bundled SpiderMonkey configure, `--target=wasm64-unknown-wasi --disable-jit` | Exits 1: `Unknown CPU type: wasm64` | Its existing WASI support does not accept this 64-bit target |
| Actual upstream `maths/Fixed.h`, with architecture-only header overlay | Compiles to a 521-byte standalone memory64 module | This small part of simulation arithmetic is portable without changing the math |
| That module in Chrome 151.0.7922.71 | 18,694 assertions pass; pointers are 8 bytes | Integer multiplication, fraction conversion and negative rounding agree with a BigInt reference over the tested range |
| Dolly ABI, SDL, GPU and upstream renderer/thread/build source review | Gaps described below | Source-level requirements, not a completed link or gameplay test |

[Probe sources, logs and reproduction](../../tasks/20260923-113538-0ad-investigation/TASK.md)
are committed with this investigation. The browser probe used a 1 GiB process-tree
memory limit, no swap, a 45-second timeout and GPU disabled. It imports nothing
and is **not a Dolly executable**: no process ABI stamp, shared-memory import,
libc, full simulation or game assets were tested. The SpiderMonkey check is an
early configuration rejection, not a complete attempted engine build; the nested
source extraction omitted Rust dependencies and large test suites. None of these
results measures game speed, graphics correctness, full memory use or multiplayer.

The search for existing browser work found [hex0ad][hex0ad], a separate tile-based
game using 0 A.D. assets, with an Emscripten build and asset-conversion tooling.
That is useful prior work for content handling, but it does not establish a port
of the full 0 A.D. engine. No working Release 28 wasm64 port was verified in this
investigation.

### What Dolly already contributes

The existing [process model](../../docs/process-model.md) supplies private memory64 programs,
real C/C++ libraries, Wasm exceptions, a kernel-owned filesystem, descriptors,
clocks, entropy, command lifecycle and controlled HTTP. A blocking game loop can
run in its process Worker while the browser remains responsive; an Emscripten
browser-main-loop rewrite is not inherently required. Cancellation and process
restart must still be tested with the game.

| Requirement | At the Slopyard checkpoint | Port consequence |
| --- | --- | --- |
| C++20 and 64-bit pointers | Wasm64 Clang/LLD and libc++ exist | Build against Dolly's exact sysroot, machine contract and exception ABI |
| Files, config, saves, replays | Shared in-Wasm filesystem; private process memory | Reuse guest POSIX operations and upstream VFS |
| SDL window/input | [SDL2 module](../sdl2/sdl2.dm) and Dolly video/input driver | Useful input foundation; no GL/Vulkan context, audio or SDL threads |
| Hardware graphics | [GPU extension](../../docs/gpu.md): buffers, WGSL, render/compute pipelines, draws, capture | Missing sampled textures, samplers, depth, general render targets and indexed draws |
| Native threads | One executing thread per process; pthread fallback | Engine worker pool cannot run unchanged |
| Memory mapping | [Copy-backed mmap](../../src/process/mmap.c) | No native address-space reservation or page protection; audit GC and allocators |
| JavaScript inside the game | Dolly's own JS runtime is a different embedding API | Port the required SpiderMonkey, rather than assume interchangeable engines |
| HTTP | Broker-backed [curl adapter](../../src/libcurl-fetch.c), including a multi API subset | Check requested options and cancellation; no unrestricted native curl |
| UDP, listening sockets, audio | No suitable current browser contracts | Defer networking/audio or design separate explicit support |

The process ABI's imported memory is `shared` so the trusted syscall gate can
copy packets. That does **not** implement pthread creation, per-thread stacks,
TLS or a shared program table. Likewise, using `-pthread`, `-sUSE_SDL=2`,
Emscripten's WebGL glue or arbitrary WASI imports does not create a valid Dolly
binary. The final module must satisfy
[`dolly-process-0.wat`](../../abi/dolly-process-0.wat), the machine/table contract,
layout identities and the exact import allowlist.

### Build and native platform work

[Upstream Premake][premake] requires C++20 and builds several engine libraries.
Its CPU detection assumes native architectures and falls back to x86; its Unix
build also selects pthreads and X11. Running the normal Linux build under `emmake`
would leak those assumptions. Add explicit target/toolchain configuration,
separate host generators from target code, and use target pkg-config metadata.
Keep the source pin and a short, reviewable platform patch series.

The architecture probe only adds `ARCH_WASM64` to the valid target set. A complete
port also needs the sysdep layer: OS detection, executable/data paths, CPU feature
queries, timers, entropy, diagnostics, stack handling and file watching. Do not
claim Linux or AMD64 to pass detection. Native CPUID, RDTSC, `/proc` discovery,
signal recovery and executable page allocation do not acquire meaning in Dolly.
Use existing portable paths and explicit unsupported results.

Upstream already has `CONFIG2_FILE_ENABLE_AIO=0`; its file IO implementation then
uses synchronous read/seek/write. This is a promising fit for Dolly. Disable
native asynchronous IO and hot-reload watchers for the initial packaged game.

| Dependency group | Initial treatment |
| --- | --- |
| SpiderMonkey 128.13.0+wfg4 | Highest-risk new target; detailed below |
| SDL2, zlib, curl | Existing Dolly modules/adapters; verify exact APIs and build settings |
| Boost, fmt, libxml2, libpng, FreeType, ICU, iconv, libsodium, tinygettext | Build the needed components against the same wasm64 sysroot; some code is bundled, but the current image is not a complete 0 A.D. SDK |
| ENet | Present in normal engine linkage even for offline builds; defer runtime sockets and audit initialization/link dependencies |
| FCollada, NVTT | Prefer deterministic asset preprocessing; native shared objects cannot be shipped as guest libraries |
| OpenAL, Ogg/Vorbis | Omit initially with the existing `--without-audio` option |
| Atlas/wxWidgets, DAP, lobby/gloox, UPnP | Existing `--without-atlas`, `--without-dap-interface`, `--without-lobby`, `--without-miniupnpc` options reduce initial scope |
| Premake, Python generators, shader/asset tools | Host bootstrap tools first, clearly recorded in `docs/sources.md`; target builds must not silently execute native subprocesses |

`--without-pch` helps initial cross-compilation. `--without-tests` can omit the
upstream test executables from the distributed game, but selected upstream
simulation/script tests remain essential development checks. This is use of
existing upstream options, not a proposal for a Dolly feature-flag matrix.

`--without-nvtt` is not sufficient by itself: `TextureConverter.cpp` explicitly
fails conversion without NVTT. Ship usable preconverted texture caches and model
caches for the chosen content, or port the converters. Account for cache keys,
endianness and version compatibility; test every asset in the chosen scenario.
Similarly, avoid requiring the native FCollada plugin by preprocessing models,
or build its guest equivalent against Dolly's private-process DSO contract.

The first implementation should establish a reproducible externally built target
binary before attempting all dependencies with the in-sandbox compiler. Record
that bootstrap exception; it is not completion of Dolly's longer-term goal of
building ordinary programs inside the sandbox.

### SpiderMonkey is the first decision point

0 A.D.'s [script interface][scripts] uses SpiderMonkey-specific realms, rooted
values, GC ownership, native callbacks, structured cloning and serialization.
JavaScript drives simulation components, AI, game setup and the GUI. A different
JS engine is a binding/semantics port, not a linker substitution. Running those
objects in the browser's native JS engine would move mutable userspace state
outside Wasm and violate Dolly's model.

[SpiderMonkey documents WASI support][sm], and the bundled source has useful
single-thread/WASI paths. In particular, `js/src/gc/Memory.cpp` can allocate
aligned GC memory with `posix_memalign`, and mozglue has no-thread facilities.
But its `build/moz.configure/init.configure` and CPU bitness tables know wasm32,
not wasm64. The observed configure failure therefore has a concrete cause;
turning on an existing build flag is insufficient.

Required work, in dependency order:

1. Add a real wasm64 target through configure, compiler checks and platform
   constants. Select Dolly's libc adapter without exporting new browser imports.
   Reuse the WASI allocation strategy where appropriate rather than emulating
   native virtual memory. Audit 64-bit tagged values, alignment and pointer casts.
2. Build without native JIT and helper threads. Check engine features that assume
   a JIT, executable memory, signals or large virtual reservations, including the
   embedded engine's own Wasm facilities. Ordinary game scripts do not imply a
   need to expose those facilities.
3. Bring up a tiny embedding test as an actual Dolly process: evaluate scripts,
   invoke native callbacks, create realms, collect repeatedly, clone values and
   round-trip serialized simulation data. Exercise stack limits, OOM, exceptions
   and process exit. The existing game enables Ion/Baseline JIT and off-thread
   compilation in `ScriptContext.cpp`; that setup needs a supported target path.
4. Build the real 0 A.D. script tests and then run real simulation/AI workloads.
   Measure milliseconds per turn and GC pauses before committing to graphics.

A non-JIT interpreter compiled to Wasm is the conservative first target.
Compiling native machine code at runtime does not work inside linear memory.
A new JS-to-Wasm JIT would be a separate major project and is not assumed here.
Whether interpreter performance is adequate remains **unmeasured**.

Do not weaken the wasm64 requirement by quietly embedding a wasm32 game. A
separate 32-bit component would require an explicit cross-memory/ABI design and
would still leave the other blockers. QuickJS replacement is a fallback research
project only if the SpiderMonkey target proves impractical.

### Threads, simulation and determinism

[TaskManager.cpp][tasks] clamps its worker count to **at least three**, even if a
caller asks for zero. Tasks cover work such as pathfinding and texture conversion.
There are other thread users in map generation, reporting, networking, sound and
the HTTP interfaces. A successful C++ link against pthread stubs is not evidence
that any of these systems work.

For the first offline port, prefer a real serial task executor: preserve task
ordering, completion and cancellation, and make progress when code waits for a
result. Audit callbacks holding mutexes before executing work inline; an immediate
executor is not automatically safe. Convert the needed long-running workers to
cooperative work at explicit loading/turn boundaries. Reuse existing upstream
disable paths for optional services.

One easy-to-miss startup case is `CUserReporter::Initialize`: it creates its worker
before applying the user's reporting-enabled setting. Merely declining telemetry
does not remove that thread. The existing quickstart path skips initialization;
the regular Dolly startup path needs an explicit supported arrangement. Profiler
HTTP and RL HTTP servers also cannot be activated unchanged.

The alternative is implementing real guest pthreads: shared process memory/table,
per-thread stack/TLS, worker creation and teardown, futex/condition semantics,
thread-safe syscall admission and cancellation of the complete process. That is
a generic process-platform project and must preserve kernel recovery after a
thread fails. Choose it only if measured simulation needs justify the extra
contract; the current shared-memory transport does not provide it.

The fixed-point probe is encouraging but narrow. Validate deterministic replay
hashes against the same release on native hardware, with identical assets, seeds,
turn counts and commands. Include AI, pathfinding, save/load and serialization.
An interpreter change, altered task ordering or floating-point operation can
still cause desynchronization even when the fixed-point primitives agree.

### Graphics: use the upstream backend boundary

The engine already separates rendering behind [IDevice][device] and
[IDeviceCommandContext][context], with GL, GL_ARB, Vulkan and dummy backends.
This is the right place for a Dolly backend. `VideoMode.cpp` also needs a target
path that uses Dolly's owned surface and SDL input rather than creating a native
GL/Vulkan context. Selecting the dummy backend is useful for bring-up, not a
playable renderer.

| Engine operation | Minimum Dolly work |
| --- | --- |
| Textures, mip levels, cube layers and samplers | Typed creation/upload/binding commands; row/block layout checks; format capabilities; texture memory quotas |
| Depth-tested geometry | Depth attachments and compare/write state; culling, winding and blend state sufficient for selected materials |
| Vertex/index streams | Multiple vertex bindings and required integer/normalized formats; index buffers; indexed and instanced draws |
| Offscreen framebuffer passes | Owned color/depth attachments, load/store/clear operations and explicit pass boundaries |
| Uniforms and material bindings | Shader binding layouts, texture/sampler bindings and correctly aligned per-draw uniform storage |
| Viewport/scissor, GUI and minimap | Dynamic viewport/scissor and correct clipping/blending; font atlas uploads |
| Copies, screenshots, diagnostics | Texture copies/resolves as needed; adapt existing explicit capture/readback; query capabilities honestly |

Do not promise all backend features immediately. Start with ordinary opaque and
alpha-tested terrain/models, GUI and the minimap; use existing low-quality
settings to postpone shadows, advanced water, postprocessing, MSAA and compute
effects. Establish the actual calls needed by that scene before fixing a new ABI.
Unsupported capabilities must be reported accurately so upstream selects its
fallbacks; an unimplemented draw cannot return success.

The current GPU provider permits one vertex buffer with up to eight float32
vector attributes and buffer-only bind groups. Slopyard's custom WGSL scene
does not exercise the game's texture/material pipeline. Adding a few SDL symbols
or translating GL function names cannot fill these gaps.

#### Shader and format conversion

Upstream already has an [offline GLSL-to-SPIR-V build and reflection pipeline][spirv].
Use its shader variants and metadata as input to a tested WGSL build pipeline.
[Naga][naga] supports SPIR-V input and WGSL output, making it a candidate to
evaluate; successful translation of the actual selected shaders has **not** been
demonstrated here. Browser shaders use [WGSL][wgsl].

Specific mismatches to resolve include Vulkan push constants (upstream reflects
up to 128 bytes of `DrawUniforms`), combined image samplers, descriptor set
numbering, uniform layout, coordinate/depth conventions and optional descriptor
indexing. The offline script handles arrays of 16,384 textures in one path;
do not assume that path fits the browser. Use the non-bindless variants and
explicit per-material bindings initially. Validate representative terrain,
animated model, alpha-tested vegetation, GUI/font and minimap shaders in the
real browser before attempting the whole set.

The engine's RGB8/alpha/luminance formats need explicit expansion or swizzling
when there is no direct target equivalent. S3TC/BC compression must be negotiated
and have a decoded fallback for adapters lacking it; account for the much larger
decoded allocation. Choose supported depth formats and verify texture orientation
and sRGB behavior with real content. A shader compiler alone does not fix these
resource semantics.

#### Keep the browser boundary small

Extend the separately versioned [GPU WAT contract](../../abi/dolly-gpu-0.wat), generated
client definitions and scoped provider deliberately. Validate packet spans,
resource ownership, format/usage combinations, dimensions/mips, checked byte
arithmetic, uploads and lifetime after submit. Include texture allocations in
quotas; existing buffer quotas do not bound a new texture API. Preserve packet
batching, backpressure and zero ordinary-frame readback.

Update [the browser boundary review map](../../docs/browser-boundary.md) with each authority
change, and test malformed commands, exhausted budgets, cross-scope handles,
device loss and cancellation under real process compromise assumptions. GPU
objects stay in the trusted provider; engine state, command data and source
assets stay in Wasm. Neither a native Vulkan passthrough nor an ambient JS
`GPUDevice` belongs in the guest.

A WebGL compatibility implementation is another possible renderer strategy, but
would still require a new audited graphics provider, shader/format work and a
large API surface. Upstream labels `--gles` non-working; it is not an existing
ready-made browser target. With Dolly's WebGPU path already present, a backend
over a small extended GPU contract is the more coherent starting point.

### Assets, memory and loading

0 A.D. already has a VFS and ZIP support. Keep archives/files in Dolly's shared
in-Wasm filesystem and let the engine read them through ordinary descriptors.
Start with a fixed scenario and its complete dependency closure: templates,
simulation/setup scripts, civilizations, entities, actor/model/animation data,
textures and required fonts/UI. A map file alone is not a runnable package.

Fetch pinned packages through the existing approved source/HTTP mechanism, then
populate guest files. Serve them with the deployment headers/CORS policy that
Dolly requires. A browser cache can cache immutable distribution bytes, but
must not become the mutable guest filesystem. Savegames and generated replay
files remain guest files, with explicit existing import/export behavior.

Peak memory includes **kernel files + process heap/GC + decompression and upload
staging + GPU resources + transient browser copies**. The 1.415 GB download does
not establish any of those totals. Avoid eagerly expanding a whole distribution
and then duplicating it into process memory. Measure whether the current loaders
retain complete archives or responses; use small packages and ordinary chunked
reads before proposing a new filesystem mechanism.

The current process contract has an 8 GiB maximum-memory ceiling, not a promise
that a browser/device can allocate it. Existing GPU limits include 4,096 objects
per scope, 128 KiB per shader, 1 MiB command packets and 4 GiB aggregate buffer
allocation. Texture-heavy content needs its own measured budgets and capability
fallbacks. No full-game asset count, load time, GPU residency or peak RSS has been
measured in this investigation.

### Sound, multiplayer and agent use

**Sound:** omit it for the first match. Later, mix/decode in Wasm and provide a
small bounded PCM output contract backed by the browser, then adapt OpenAL or a
SDL audio driver. Browser user activation, pause/resume, underruns, queue quotas
and teardown need explicit handling. SDL audio alone does not implement 0 A.D.'s
OpenAL interface; ambient OpenAL-to-WebAudio glue would bypass Dolly's boundary.

**Multiplayer:** ENet uses UDP, while Dolly's selected network edge is HTTP.
There is no transparent native LAN/ENet path. An approved HTTP-broker-mediated
relay and guest transport adaptation would be a separate project, including
reliability, latency, reconnects and native interoperability. Do not add ambient
WebSocket/WebRTC access as an accidental shortcut. XMPP lobby, STUN and UPnP can
wait. Existing nonvisual/offline startup is useful precisely because it need not
host a network match, although native network library initialization remains to
be audited.

**Downloads:** the curl adapter has multi functions, but not every option used by
upstream. For example, `ModIo.cpp` requests redirect/progress controls and
`UserReport.cpp` requests connection timeouts; some are unsupported by the
adapter. Check return values and broker policy, and leave online services out of
the first image. Do not solve compatibility by bypassing the HTTP broker.

**Agents:** upstream already supports `-autostart-nonvisual` with a map, nonvisual
replay, and an [RL interface][rl] for reset/commands/state. Its implementation
starts a Mongoose HTTP server and synchronizes with the main thread, so it is
not usable unchanged. Preserve those simulation operations in a guest driver
using ordinary stdin/stdout, pipes or files. A Dolly agent could step turns,
submit structured commands, inspect permitted state and save replays without a
new agent-specific host API. Make player perspective/fog-of-war explicit; the
existing diagnostic interface is not automatically a fair player observation.

### Implementation order and completion gates

| Stage | Concrete deliverable | Evidence required before moving on |
| --- | --- | --- |
| 1. SpiderMonkey target | Small embedding program running as a real Dolly memory64 process | Exact allowed imports/ABI; GC, realms, callbacks and serialization survive repeated use; no host JS state |
| 2. Engine without visuals | Target dependencies, sysdep support, serial task execution, packaged scenario | Load a real match; run fixed-seed turns with AI; replay hashes match native; save/load and process restart work |
| 3. Agent match | Guest command/pipe interface around the real simulation | An agent can observe, issue legal commands, step, finish a match and retain a replay |
| 4. GPU primitives | Small versioned extension and representative translated shaders | Textured indexed mesh with depth, offscreen pass and GUI; malformed requests denied; abort/restart preserves shell |
| 5. Playable offline game | Dolly backend, selected content, input and low-quality rendering | Start, select, move, build, fight, save/load and finish a match in the browser; measure turn/frame times and memory |
| 6. Broader compatibility | More content/quality, audio, optional network transport | Per-feature browser tests, realistic maps, resource budgets and recovery under load |

Before Stage 2 testing, choose an actual scenario, unit count, AI setup, machine
and browser and record them with the benchmark. A reasonable *proposed* visual
target is 30 fps at 1280×720 for the selected small match; it is not a prediction.
For simulation, compare measured turn time with the configured turn interval,
including AI and GC, and require headroom. Also record initial download/load,
peak process-tree memory, maximum stalls and background-tab behavior.

If Stage 1 cannot support the required API/GC behavior, or Stage 2 cannot keep
pace even on the chosen small match, stop and revisit the JS/thread strategy.
A beautiful rendered frame would not resolve either failure. If an agent-only
environment is useful, Stage 3 is a meaningful deliverable without waiting for
the graphical client.

This is multiple substantial subsystems, not a dependency installation or SDL
shim. A reliable calendar estimate is premature before the SpiderMonkey and
simulation measurements. Renderer/resource/shader work is substantial even if
those gates pass; audio and multiplayer are additional scope.

Expected repository changes after those decisions are target dependency modules
and pinned upstream patches; guest sysdep/task/renderer code; deliberate GPU WAT
and provider changes; a game image/content manifest; and focused process/browser
tests. No runtime or browser authority was changed by this investigation. When
shipping a build, include upstream code/asset license notices and corresponding
source/build instructions; [the project][release] publishes its engine under GPLv2+ and
assets under CC BY-SA 3.0, with bundled dependency notices to preserve.

[release]: https://play0ad.com/
[downloads]: https://play0ad.com/download/source/
[premake]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/build/premake/premake5.lua
[scripts]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/source/scriptinterface
[tasks]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/source/ps/TaskManager.cpp
[device]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/source/renderer/backend/IDevice.h
[context]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/source/renderer/backend/IDeviceCommandContext.h
[spirv]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/source/tools/spirv/compile.py
[rl]: https://gitea.wildfiregames.com/0ad/0ad/src/commit/a2cae4d69f816e9e9d7eecb6bf88f762afc0c90d/source/rlinterface/RLInterface.cpp
[sm]: https://spidermonkey.dev/
[naga]: https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/naga/README.md
[wgsl]: https://www.w3.org/TR/WGSL/
[hex0ad]: https://github.com/matthewlai/hex0ad
