# Source and build inventory

This is the structural map of Dolly's external inputs and where each build
actually happens. The canonical non-npm revisions, URLs, container digest, and
archive checksums live in `config/source-pins.sh`. Fetch and build scripts source
that file directly; this document explains the roles rather than duplicating
the hashes.

## Build flow

```text
config/source-pins.sh
        |
        v
fetch scripts --> .cache/ checkouts and verified archives
        |
        +--> host source generation --> build/generated/
        |
        +--> external seed compilation --> build/*.wasm
        |
        v
toolchain/CMakeLists.txt packages sources/sysroot --> dist/dolly.data
        |
        v
minimal C bootstrap compiles Slop and seed commands in WasmFS
        |
        v
/etc/dolly/startup.slop --> GNU Make --> /usr/src/dolly/startup.mk
        |
        +--> /usr/lib/*.a
        +--> /bin/*
        +--> /usr/bin/*
        +--> /usr/libexec/*
        |
        v
headless /rebuild captures versioned system snapshot
        |
        v
dist/dolly-system.snapshot + verified metadata
        |
        v
/ restores the same image for every browser in seconds
```

Packaging a source file is not the same as packaging an executable. Except for
the explicitly identified bootstrap modules below, command and library machine
code is produced by Clang/LLD inside the browser and written to WasmFS.

## External components

| Component | Host/build-time role | What enters Dolly | Browser-time result |
| --- | --- | --- | --- |
| Emscripten SDK | Digest-pinned container builds the main wasm64 runtime and bootstrap modules | Emscripten sysroot, libc/libc++, WasmFS, and loader output | Main `dolly.wasm` and the shared runtime ABI |
| LLVM/Clang/LLD | Host TableGen tools generate LLVM tables; a wasm64 LLVM build is linked into the main runtime | Clang frontend, Wasm LLD, archive writer, headers, and libraries | In-Wasm `cc`, `c++`, `ld`, and `ar` services |
| sbase | Pinned checkout is packaged as selected unchanged sources and helpers | `grep`, `sed`, `head`, and `wc` sources | Separate executables under `/bin` |
| One True Awk | Pinned Bison generates parser C/header files on the host; the upstream `maketab` generator remains target-side | Upstream sources plus generated parser | `maketab` runs inside Wasm; final `/bin/awk` compiles afterward |
| curl | Official pinned public headers and license are packaged; curl's native socket engine is not | Headers plus Dolly's `src/libcurl-fetch.c` | `/usr/lib/libcurl.a` and `/usr/bin/curl` over the one Fetch broker |
| zlib | A selected pinned source tree is copied to `build/generated/zlib-source` | Upstream C sources and headers | `/usr/lib/libz.a` |
| Git | Tracked C/headers are copied, generated headers/templates are produced, and `config/git-dolly.patch` applies the small lifecycle adaptations | 427 source files, headers, templates, and license | `/usr/lib/libgit.a`, `/usr/bin/git`, and HTTP/HTTPS helpers |
| GNU Make | Checksum-pinned official 4.4.1 release is configured for wasm64; `config/make-dolly.patch` and one Dolly job adapter replace process launch | Exact source manifest, generated configuration, headers, and license | `/usr/bin/make`; all recipes and `$(shell ...)` execute synchronously through `/bin/slop` |
| Zig | Checksum-pinned 0.16.0 source and official Linux stage-zero archives; the external compiler builds only the upstream frontend side module | Patched upstream source library plus ABI-validated `/usr/bin/zig`; its LLVM bridge reuses the runtime's WebAssembly backend | Native Zig runs inside Dolly and emits relocatable wasm64 objects directly into WasmFS |
| Ghostty + uucode | Exact Ghostty checkout and checksum-pinned uucode archive are prepared with reviewed build options | VT and Unicode Zig source, generated configuration/tables, public headers, and licenses | Native Zig emits a wasm64 object; Dolly builds `/usr/lib/libghostty-vt.a`, `/usr/bin/ghostty-vt`, and the resident display module |
| QuickJS-ng | Pinned engine checkout is packaged without `quickjs-libc.c` | Unchanged engine sources plus Dolly's narrow runtime adapter, compiled once into `/usr/lib/libdolly-js.a` | `/usr/bin/qjs` is a separately compiled generic CLI |
| Pi agent | Exact npm versions and integrity hashes are locked; pinned esbuild packages the complete upstream CLI and upstream standalone OAuth loaders with asserted QuickJS compatibility lowerings | Upstream Pi JavaScript/resources, generated ESM, Janis runtime, Dolly tool extension, system prompt, settings, package metadata, and docs | `/usr/bin/pi` is separately compiled against `libdolly-js`; the real TUI, pasted sandbox-owned OpenRouter credentials and model discovery, completed Codex PKCE/manual-code exchange and credential persistence, Slop/WasmFS tools, and dependency-free extension install/reload are browser-tested |
| Lua | Verified official release archive is compiled by the external seed compiler | One ABI-validated bootstrap side module | `/usr/bin/lua`; this is the current exception to browser-time command compilation |
| Bison | Verified host tool used only to generate the Awk parser | Generated Awk C/header files, not Bison itself | No Dolly executable |
| stb_truetype | Exact commit- and checksum-pinned single-header source | Rasterizer source header | Compiled into `/usr/libexec/dolly/display.wasm` inside Dolly |
| IosevkaTerm SemiBold | Commit- and checksum-pinned WOFF2 and TTF assets | WOFF2 bootstrap font and TTF runtime font | Bootstrap progress typography; in-Wasm terminal glyph rasterization |

All source licenses are packaged alongside the corresponding source material
under `/usr/share/licenses` where applicable.

## Dolly-owned layers

| Layer | Canonical location | Responsibility |
| --- | --- | --- |
| Machine contract | `abi/dolly-0.wat` | Exact command imports, exports, memory64/table64 shape, and entry ABI |
| Browser HTTP contract | `abi/dolly-http-0.wat` | The single dispatch import and response mailbox |
| Display contract | `abi/dolly-display-0.wat` | Raw browser input records, bounded user-gesture clipboard buffers, result words, framebuffer publication, and temporary bootstrap sink |
| Snapshot contract | `abi/dolly-snapshot-0.wat` | Opaque capture/restore calls for the packaged precompiled system image |
| HTTP policy | `src/http-policy.mjs` | Trusted exact destination and credential-header allowlists plus redirect, size, time, and quota enforcement |
| Browser import allowlist | `config/browser-imports.json` | Generated-main-module capability audit; JSON is not an ABI source |
| Source pins | `config/source-pins.sh` | External revisions, URLs, image digest, and archive hashes |
| Packaging | `toolchain/CMakeLists.txt` | Maps immutable source/sysroot assets into the initial WasmFS image |
| Build orchestration | `scripts/build.sh` | Fetches/prepares sources, assembles contracts, builds and validates the runtime |
| Snapshot packaging | `scripts/build-system-snapshot.mjs` | Runs headless `/rebuild`, validates the opaque image, and publishes it with build-ID/size/SHA-256 metadata |
| Target compiler/linker | `src/compiler.cpp` | C/C++ compilation, object/archive linking, ABI validation, and publication |
| Runtime bootstrap | `src/dolly.c` | Establishes terminal/environment state, compiles Slop and seed commands, executes startup, then loads the resident display module |
| Display driver | `src/ghostty/display.c` | Ghostty VT state/key encoding plus Iosevka software rasterization into double-buffered RGBA memory |
| Userspace startup | `src/startup.slop` | Traced top-level initialization and build phases; fails on the first unsuccessful command |
| Target build graph | `src/startup.mk` | GNU Make rules for source-built libraries, upstream tools, runtimes, and probes |
| Compatibility shell | `src/slop.c` | Finite shell grammar, PATH lookup, scoped environment, redirection, and serial spooled pipelines; compiled to `/bin/slop` |
| Make job adapter | `src/runtimes/make-dolly.c` | Maps upstream Make's remote-job and `$(shell)` seams to synchronous `/bin/slop -c` calls |
| Port adaptations | `config/*.patch` and `src/runtimes/` | Explicit, reviewable target differences and narrow runtime frontends |
| Port decisions | `docs/port-status.md` | Why a program is included, partial, deferred, or rejected |

## Runtime filesystem layout

```text
/usr/src/        immutable packaged source inputs
/usr/include/    compiler sysroot and public library headers
/usr/lib/        source-built static libraries
/bin/            core source-built executable modules
/usr/bin/        optional source-built tools, Zig/Ghostty, and Lua bootstrap
/usr/libexec/    Git helpers, display module, object guards, and probes
/etc/            system configuration
/home/dolly/     writable HOME and global Git configuration
/workspace/      interactive working directory
/tmp/            compiler objects and staged links
```

Mutable entries in this tree use WasmFS's memory backend. They are not host
directories and disappear with the browser sandbox.

The complete native Zig/Ghostty bootstrap, typed LLVM bridge,
shared-filesystem object path, and browser acceptance proof are documented in
[`zig-ghostty.md`](zig-ghostty.md).

The proposed consolidation of source acquisition, target build steps, checks,
and snapshot retention into one reviewable recipe is described in
[`dollyfile.md`](dollyfile.md).
