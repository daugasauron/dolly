# Sources and reproducibility

Dolly separates the common machine seed from image inputs.

The experimental `Dollyfile-gpu-fluid` fetches the SHA-256-pinned, unmodified
`fluid_simulation.c` from webgpu-native-examples at
`9a7c30753d6f44630564a8316eb9c44211ff0ecc` and compiles it with Dolly's `cc`.
Its official WebGPU header and the needed cglm headers are individually pinned
URL inputs; individual raw files avoid the unavailable archive endpoint.
The recipe installs upstream licenses. `scripts/prepare-gpu-fluid.mjs` packages
only the local platform adapter, GPU client and replacement controls; it does
not compile native code or patch the downloaded solver/shaders.

`scripts/prepare-image-sources.sh` prepares the selected catalog's inputs without
compiling the kernel. `npm run image -- IMAGE` invokes it before refreshing the
image: edits to a staged command or runtime become new `SOURCE HOST` pins, not
silently reused old bytes. Upstream pins and explicit `SOURCE URL` hashes remain
independent. Adding a module means referencing it from a source-visible Dollyfile;
arbitrary local files do not become browser-readable inputs.

## Build flow

```text
config/source-pins.sh
        |
        v
fetch/prepare scripts --> verified .cache checkouts and build/generated trees
        |
        +--> external bootstrap of wasm64 Clang/LLD and Zig commands
        |
        +--> deterministic independent dist/static inputs and ustar archives
        |
        v
toolchain/CMakeLists.txt --> kernel + separate root-build seed bundle
        |
        v
Dollyfile/module rows --> browser broker --> exact SHA-256-checked files in WasmFS
        |
        v
/bin/dollyfile executes SLOP synchronously and seals declared retention roots
        |
        v
/<image>/rebuild captures a recipe-bound opaque snapshot
        |
        v
/<image>/ validates metadata and restores without fetching image sources
```

The Emscripten data file contains the bootstrap seed: process sysroot and Clang
headers, Dolly headers and ABI schemas, Slop/Dollyfile/core-command source, and
the private compiler executable. Base headers come from a fresh SDK sysroot;
ports previously installed in the shared Emscripten cache are excluded.
Emscripten's standalone `dolly-seed.mjs` loader
mounts it at `/seed` only for a root rebuild without a `FROM` base;
`src/dolly.c` installs those inputs into `/usr` before compilation. Prebuilt
images and builds with a base already contain their compiler and do not fetch
the seed. The small kernel does not link the compiler. No permission or
executable-bit policy is added to Dolly.

`dolly-image-build-id.mjs` identifies that seed, its loader/file map, and the
compiled process, DSO, kernel-plugin and snapshot contracts. Images and their
cache use this identity, so a compatible kernel implementation change does not
recompile userspace. `dolly-build-id.mjs` additionally hashes the kernel bytes;
packaged images record that runtime as provenance and sessions require it for
exact restoration. A seed or contract change invalidates the image cache.

Other inputs appear as `SOURCE HOST location destination HASH` or `SOURCE URL`
rows in the selected Dollyfile/module graph. HOST pins the prepared release
bytes; URL fetches its independently pinned upstream bytes during a rebuild.
`scripts/verify-static-sources.mjs` checks
the actual served byte sequence for every row. There is no aggregate `.assets`
filesystem image and no JavaScript recipe compiler.

## Pin authority

External versions, revisions, URLs, archive digests, npm integrity values, and
the Emscripten container digest live in `config/source-pins.sh` or the npm lock
file. Fetch and prepare scripts consume those pins directly. Dollyfiles pin the
final browser-served form, because preparation and archive layout can change
bytes without changing an upstream commit.

The deterministic ustar writer in `scripts/build-source-tar.mjs`:

- accepts explicit input-to-absolute-Dolly-path mappings;
- rejects symlinks and unsafe paths;
- sorts records using a fixed locale;
- emits regular files only with fixed owner, mode, and timestamp fields;
- writes no host paths or ambient metadata;
- gzip-compresses `.tar.gz` outputs deterministically and reports the final archive SHA-256.

The small `/bin/tar` extractor is inline in `modules/tar.dm` and compiled inside
Dolly before any archive row executes. It accepts only regular files and
directories, rejects absolute/traversal names, and writes solely to WasmFS.

## Component roles

| Component | Outside-browser preparation | Inside-Dolly result |
| --- | --- | --- |
| Emscripten 6.0.8 | Digest-pinned container links the small wasm64 kernel, process libc/sysroot, process gate, and packaged seed | Kernel-owned WasmFS plus private process executables; the seed explicitly excludes the C++ header tree |
| LLVM/Clang/LLD 24 | Wasm64 libraries are built once into a stamped private compiler executable | `/bin/cc`, `/bin/c++`, `/bin/ld`, `/bin/ar` spawn a fresh compiler process that reads and publishes files through the typed kernel gate |
| Dolly C++ SDK | Pinned Emscripten libc++/libc++abi process archives are part of the external compiler SDK; their matching headers are archived separately | `cpp.dm` installs `/usr/include/c++/v1` and exports the genuine archives in `/usr/lib/dolly/process`; no handwritten standard-library substitutes |
| GNU Make 4.4.1 | Pinned release is configured and a reviewed serial Dolly adapter is applied | `/usr/bin/make`; recipes run synchronously through `/bin/slop` |
| Samurai 1.3 | A pinned source tree receives a small serial Dolly scheduler patch and is compiled as its ordinary 13 C translation units | `/usr/bin/ninja` executes Ninja manifests through Dolly's in-Wasm command lifecycle |
| sbase | Exact source/helper subset is archived | separate `grep`, `sed`, `head`, `wc`, and `printf` executables |
| One True Awk | Pinned Bison generates parser C/header; sources are archived | target `maketab` runs, then `/bin/awk` is compiled |
| curl | Official headers/license plus Dolly Fetch implementation are served | `/usr/lib/libcurl.a` and `/usr/bin/curl` over the broker |
| zlib | Selected pinned upstream C tree is archived | `/usr/lib/libz.a` and public headers |
| Git | Generated config/version files, tracked C sources, templates, and reviewed target patch are archived | `/usr/bin/git`, `libgit.a`, and HTTP helpers |
| CPython 3.14 | A pinned upstream tree is configured for Dolly's wasm64 target; matching frozen headers and generated build files are archived | The `cpython.dm` leaf compiles every target object and `/usr/bin/python`; entropy uses Dolly's in-Wasm source, while Python `Thread` targets execute serially and never create host or browser threads |
| Bonnie | Dolly C source is served independently | The later `bonnie.dm` leaf builds `/usr/bin/bonnie` against libcurl and the already sealed CPython layer, so installer changes do not rebuild the interpreter |
| raylib 6.0 + Box3D 0.1.0 | Exact pinned upstream source trees are archived; no host target objects are kept | GNU Make compiles raylib's `PLATFORM_MEMORY` modules and Box3D's portable C17 objects into static libraries; Dolly's small adapter presents RGBA and semantic input |
| Slopyard | Dolly C game and target build configuration | Compiles the game and a private SIMD/pthread Box3D library inside Dolly from the gamedev SDK’s retained upstream source, including its unchanged POSIX thread/semaphore implementation; a Clang target-attribute wrapper selects the SSE2/Wasm SIMD path |
| SDL2 2.32.10 | Pinned release plus a Dolly video backend and target configuration | `sdl2-build` compiles the static software renderer with in-Wasm input/framebuffers; audio and thread creation are explicitly unavailable |
| ClassiCube `df93681952f8` | Pinned C source and bundled texture pack, manual target configuration, POSIX/logger wrappers and SDL fixes for optional controllers and pixel formats | `classicube-build` compiles the game and screenshot/input adapter inside Dolly; `classicube` adds a Pi agent, OpenRouter setup and source-built viewer and zlib map packer over software-rendered clients sharing an in-Wasm Classic protocol room |
| Seven Kingdoms 2.15.7 | Pinned GPL source and game data, without separately distributed music; a local multiplayer patch routes the existing protocol through pipes | `rts-build` compiles the game and player-view/input adapter; `rts-arena` adds two Pi RPC sessions and a source-built spectator display |
| Zig 0.16 | Official host Zig builds the frontend object; LLVM/LLD links into the ABI-validated standalone `zig.wasm`, without Clang; `config/zig-sdk-files.txt` selects the target SDK archive | The `ghostty-build` image installs `/usr/bin/zig`; it emits wasm64 objects as an ordinary private process without adding kernel imports |
| Ghostty + uucode | Pinned source and generated configuration/tables are archived | The `ghostty-build` image uses Zig to build Ghostty VT and its static library; Dolly cc builds the resident display plugin. System images copy the plugin, font and licenses, not the build SDK |
| QuickJS-ng | Exact engine source is archived; ambient `quickjs-libc.c` is excluded | `/usr/lib/libdolly-js.a`, `qjs`, Janis, and Pi frontend |
| Pi | Pinned Git TypeScript sources, published generated model data, and locked external npm dependencies are archived | TypeScript runs under Janis inside Dolly and emits the seven Pi workspace packages; `/usr/bin/pi` loads the unbundled module graph |
| stb_truetype + Iosevka | Commit/digest-pinned header and fonts are served independently | display rasterizer and runtime terminal font |

Host-side preparation is allowed to make pinned upstream trees buildable, but
it must be deterministic and reviewable. It must not compile the ordinary final
commands that a Dolly rebuild claims to build. The explicit exceptions are the
machine/compiler seed and ABI-validated bootstrap compiler inputs such as
native Zig.

Preparation scripts own their scratch state. Downloads, extracted trees,
configured build directories, generated packages, and intermediate Wasm files
are created under uniquely named staging paths with exit cleanup. A completed
artifact is moved into its stable cache or output path only after verification;
completion stamps are published last. Prepared CPython, Git, GNU Make, Samurai,
and zlib trees use immutable upstream-and-recipe-addressed directory names, so an
unchanged build reuses them without configuration or destructive replacement.
Those directories are intentional build caches; the hidden staging siblings
are temporary state and are always removed. An interrupted script may leave an
older valid cache entry in place, but must not leave a temporary tree or make a
partial replacement look complete.

## Runtime layout

```text
/seed/          packaged compiler input, installed only during root rebuilds
/usr/src/       fetched and extracted target source
/usr/include/   mutable compiler and library headers
/usr/lib/       source-built libraries and retained runtimes
/bin/           core commands and Slop
/usr/bin/       optional tools, runtimes, Pi, Zig, and Ghostty probes
/usr/libexec/   command helpers
/etc/           image identity and system configuration
/home/dolly/    writable HOME and global Git configuration
/workspace/     disposable interactive working tree
/tmp/           disposable downloads, objects, and staged links
```

All of these paths are WasmFS memory state. None maps to a browser or native-host
filesystem.

## Generated files

Generated outputs are divided by authority:

- `build/generated/` contains deterministic host preparation such as Awk parser
  output and selected Git/Make trees. The pinned generated Unicode tables are
  tracked separately under `src/ghostty/generated/` with their provenance README.
- `dist/static/` contains exactly the bytes named by `SOURCE HOST` rows.
- `dist/dolly-images.mjs` is disposable JavaScript route/policy metadata derived
  from visible recipes; it is not an ABI or recipe source.
- `dist/dolly-<image>-system.snapshot` and matching metadata are products of an
  actual browser rebuild.

`node scripts/verify-static-sources.mjs` is the cheap integrity check.
`npm run snapshot` is the expensive proof that selected recipes execute in a real
browser and that the resulting retained files can be serialized.

## Remaining reproducibility limits

- Under the pinned toolchain and browser, target compiler scratch names,
  single-threaded LLD section merging, and CPython build metadata are fixed so
  cold, packaged-prefix, and cached-image builds produce identical snapshot
  bytes. Cross-kernel and cross-browser bit reproducibility is not yet claimed;
  logical identity and every input byte remain sealed and verified there.
- Prepared Git/Ghostty/Zig trees contain reviewed target adaptations; reducing
  patches in favor of upstream target configuration remains preferred.
- The common seed is still large because it includes current Clang/LLVM and
  complete compiler headers.

## 0 A.D. bootstrap

The experimental Release 28 port in `toolchain/0ad`
cross-compiles the engine and its C/C++/Rust dependencies outside Dolly. This is
an explicit bootstrap exception. Source/data archives are pinned in
`config/source-pins.sh`, additional dependency archives in
`toolchain/0ad/dependencies.tsv`, and SDK ports by the pinned Emscripten image.
SpiderMonkey reuses the compiler seed's Rust bootstrap, std and libc patches.
The executable imports only the exact `dolly-process-0` contract; no Emscripten
JavaScript loader accompanies it.

On Linux x86_64 with an existing Dolly process sysroot, Podman, systemd user
scopes, Python 3, make, m4 and pkg-config:

```sh
bash toolchain/0ad/build-engine.sh
bash toolchain/0ad/prepare-headless.sh
systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 node test/0ad-engine-browser.mjs
```

Set `DOLLY_PROCESS_SYSROOT` to the project-relative sysroot directory if it is
not `.cache/process-sysroot`. The browser check needs the default runtime/image
built and Chrome installed. Builds use two jobs, a 4 GiB limit and no swap.
For engine-only iterations run `toolchain/0ad/engine.sh` inside the pinned SDK
container, then `bash toolchain/0ad/link-engine.sh`. Logs and downloaded browser
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
[`tasks/20260923-115439-0ad-baseline`](../tasks/20260923-115439-0ad-baseline/TASK.md).

Multiplayer retains upstream ENet 1.3.18 reliability/fragmentation and replaces
its native socket backend with `enet-dolly.c`, above the existing HTTP ABI.
The guest supplies `DOLLY_ENET_RELAY`; the browser policy must allow POST to that
exact capability URL. `node toolchain/0ad/relay.mjs 8090 BROWSER_ORIGIN` starts a
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

`node --test test/0ad-relay.test.mjs` checks routing and quotas.
`test/0ad-enet-browser.mjs` checks reliable fragmented 10 KB echoes, fresh socket
reuse and browser denial of another participant's URL. Link its fixture after
`enet.sh` using `bash toolchain/0ad/link.sh build/0ad/enet-check.wasm
.cache/0ad/enet-check.o .cache/0ad/sysroot/lib/static/libenet.a`.
`systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 node
test/0ad-multiplayer-browser.mjs` exercises the two real engines with the GPU
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
`config/openal-dolly.patch` polls its event queue after rendering and replaces
its internal semaphore with a counter. It does not enable Dolly thread creation
or POSIX semaphores. The external 0 A.D. bootstrap consumes the same prepared
source; `openal.sh` builds its library and mixer fixture. Link the
latter with `bash toolchain/0ad/link.sh build/0ad/openal-check.wasm
.cache/0ad/openal-check.o .cache/0ad/sysroot/lib/libopenal.a`, then run
`node test/0ad-openal-browser.mjs`. Two fresh processes each exercise two contexts,
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
documented in [the sound interface](audio.md) and
[the browser review map](browser-boundary.md#experimental-audio-provider).

After preparing those official archives, `bash toolchain/0ad/prepare-shaders.sh`
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
`node test/0ad-shaders-browser.mjs` compiles and links every converted shader in
Chrome's software WebGPU adapter and checks the real upstream canvas shader's
colors, orientation, grayscale uniform and border/mip filtering. Both skinning
variants also check weighted positions, packed normals/tangents and offset/bounds
guards. This validates shader conversion;
it does not by itself establish a playable renderer. The GPU packet path has
its separate guest-compiled check in `test/gpu-render-browser.mjs`.

After the headless bundle and shaders exist, package the complete upstream
content and build the `zero-ad` image:

```sh
python3 toolchain/0ad/package-graphics.py .cache/0ad/0ad-0.28.0
node toolchain/0ad/prepare-distribution.mjs
systemd-run --user --scope -p MemoryMax=10G -p MemorySwapMax=0 npm run image -- zero-ad
systemd-run --user --scope -p MemoryMax=5G -p MemorySwapMax=0 node test/0ad-graphics-browser.mjs zero-ad hardware
DOLLY_BUILD_IMAGES=zero-ad npm run publish
npm run serve
```

The graphics package contains every upstream map, civilization, texture, model,
animation, sound and music track. Native SPIR-V is omitted; translated WGSL serves
the supported rendering paths. Content stays compressed in bounded ZIP archives, which the upstream VFS
mounts normally. `prepare-distribution.mjs` copies the engine/content and generates
SHA-256-pinned `SOURCE HOST` entries in `modules/zero-ad.dm` and `Dollyfile-zero-ad`.
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
in-memory snapshot. `test/0ad-menu-browser.mjs` exercises graphics options,
ordinary menu save/load across fresh processes, and menu-created matches;
ordinary `.0adsave` persistence also has its headless test below.
For Firefox on the desktop, append `firefox` to the browser-check command. For
software correctness, use `xvfb-run -a node test/0ad-graphics-browser.mjs zero-ad
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
in the [gameplay performance task](../tasks/20260924-115634-0ad-gameplay-performance/TASK.md).
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
`bash toolchain/0ad/build-spidermonkey.sh` and
`systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 node test/0ad-spidermonkey-browser.mjs`.

## Rust compiler seed and source-built tools

`npm run build:rust-seed` explicitly builds the external Rust 1.98.1 / LLVM
22.1.8 seed after the C runtime. It requires Linux x86_64, Podman, Python 3.12+
(`tarfile` data filters and `tomllib`), curl and patch. Native bootstrap archive
hashes are in `toolchain/rust/bootstrap-sources.json`; compiler/library patches
and target configuration live beside them. The completed SDK contains rustc,
std, proc_macro, the target libc source and the small POSIX spawn archive.
Its final Wasm executable is validated against `dolly-process-0` before packing.
Changed preparation inputs invalidate prepared source; the seed cache verifies
its recorded input key and artifact checksum. Run this command again after
changing Rust bootstrap sources or target inputs. Ordinary image preparation
stages a checksum-verified completed seed, or the existing HOST artifact pinned
in `modules/rust-sdk.dm`; it never starts an external Rust/LLVM build. A missing
or corrupt seed fails before fetching image sources. The image loader still
checks the compiler against the current process ABI.

The HTTP body staging addition (operation 83) preserves every earlier operation,
packet layout, constant and import type. For this additive transition, the pinned
Rust compiler seed's process stamp was migrated after validating it against the
old contract and comparing the complete earlier C layout. Only that custom
section changed; executable bytes remained identical. The migrated compiler is
validated against the new contract and exercised by the ripgrep/fd source builds.
A fresh compiler seed build writes the current stamp directly.

The [Rust SDK image](../Dollyfile-rust-sdk) imports that seed and compiles its
C linker adapter in Dolly. [Rust build](../Dollyfile-rust-build) adds curl and C Patti;
[Rust tools](../Dollyfile-rust-tools) combines these artifacts with the interactive system.
[Ripgrep](../Dollyfile-ripgrep), [fd](../Dollyfile-fd-build) and
[Protox](../Dollyfile-protox-build) compile locked upstream sources with Patti
inside the browser. The shared `system` image copies `rg` and `fd` from their build
images, so Pi, Studio and other application images inherit both tools. The Rust SDK
starts from the C/C++ [compiler base](../Dollyfile-system-build), adding zlib and
gzip. Git, the display and application startup are not compiler inputs. Build command records remain under
`/usr/share/dolly/builds`; the Rust compiler stays in the build images.

`config/rust/sources.json` pins upstream tool archives. Host preparation stages
source and lockfile-checksummed crate archives, allowing the image recipes to
build offline without registry Git or CORS dependencies. It compiles no
application code. Ripgrep and fd's libc lock entries explicitly select the SDK's
patched 0.2.186 source; their other dependency pins are unchanged. fd's target
patch uses the serial ignore walker, preserving its existing filters and output
buffering; a small ignore patch exposes directory pruning. Exec jobs run serially,
requests for multiple workers fail explicitly, and SIGINT uses normal process
termination instead of ctrlc's helper thread. The nix patch excludes its unsupported
`sethostname` function, and Jiff uses its Unix timezone implementation instead of
calling browser JavaScript. These patches live under
`config/rust/patches` and apply only to the Emscripten target.

This remains an experimental Emscripten-based Rust target with serial compiler
execution and panic-abort. Cargo, incremental compilation, file locking and
application threads are not provided. Compiler bootstrapping inside Dolly and
byte-identical Rust seeds across different host checkout paths are not claimed.

The [Codex port](codex.md) builds on these stages and keeps its runtime setup
separate from the compiler seed and reusable Rust library adaptations.

The [local LLM build](../Dollyfile-llama-build) compiles pinned, unchanged
llama.cpp sources and WGSL inside Dolly. Host preparation packages its source
and official Dawn headers; it does not compile model code or import Dawn's JS
runtime. A small in-image C API adapter targets the [GPU ABI](gpu.md).
The separate [command build](../Dollyfile-local-llm-build) reuses those libraries;
Pi copies the executable, provider and licenses. Source and header pins are
in `config/source-pins.sh`, and GGUF weight pins are in
`src/local-llm/models.json`. `prepare-local-llm-weights.mjs` fetches the verified
0.8B GGUF and splits it into pinned 256 MiB inputs. The weights module assembles
and SHA-256 checks the complete file inside Dolly. The included Qwen license is
from upstream revision `2fc06364715b967f1860aea9cf38778875588b17`.
Optional larger models download through ordinary sandbox HTTP.

Pi-local also rebuilds the canonical `src/dollyfile.c` through
`modules/dollyfile.dm`, using the existing in-image compiler. Its file-backed
reader accepts image inputs up to 2 GiB without copying all payloads into the
builder process, allowing Studio and custom images to inherit larger bases.
The pinned weight chunks remain readable by the running original 512 MiB
bootstrap executor. This updates the tool without replacing the compiler seed
or invalidating its cached descendants; future seed builds use the same source.
