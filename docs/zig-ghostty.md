# Native Zig and Ghostty inside Dolly

Status: direct native compilation passes in Chrome
Last updated: 2026-08-30

## Result

Dolly contains a real Zig 0.16.0 compiler as a wasm64 dynamic command. It runs
upstream Zig semantic analysis and the LLVM WebAssembly backend in the same
shared address space as the rest of Dolly. It reads the upstream standard
library from `/usr/lib/zig`, reads project sources from WasmFS, and writes
relocatable WebAssembly objects back to WasmFS.

At browser startup, `/usr/bin/zig` compiles the pinned Ghostty/uucode source
graph directly to `/tmp/ghostty/ghostty-vt.o`. Dolly's `ar` and `cc` then build
`/usr/lib/libghostty-vt.a`, `/usr/bin/ghostty-vt`, and
`/usr/libexec/dolly/display.wasm`. There is no Zig-to-C translation, nested
wasm32 interpreter, host compilation service, or precompiled Ghostty object.

The target is Ghostty's upstream `libghostty-vt`, not its GTK or macOS desktop
application. It supplies the parser, screen model, terminal modes, and key
encoder. A Dolly-owned renderer loads pinned IosevkaTerm SemiBold through
WasmFS and converts the Ghostty grid into bounded shared RGBA framebuffers.

## Bootstrap chain

```text
checksum-pinned official Zig 0.16.0 host archive
                         |
                         | build-obj -target wasm64-emscripten
                         v
patched upstream Zig compiler object
                         |
                         | dolly-cc link + ABI stamp/validation
                         v
              build/native-zig/zig-native.wasm
                         |
                         | preload as /usr/bin/zig
                         v
pinned Ghostty/uucode Zig source in WasmFS
                         |
                         | native Zig LLVM backend in Chrome
                         v
             /tmp/ghostty/ghostty-vt.o
                         |
                         | Dolly ar / Dolly cc
                         v
     libghostty-vt.a, ghostty-vt, display.wasm
```

The official host compiler is a stage-zero build input only. It never enters
the browser filesystem and is not callable by sandbox programs. The wasm64
compiler it produces is a normal Dolly command with `dolly_main`, shared
memory64/table64, a `dylink.0` section, and the exact `dolly.abi` stamp.

## LLVM sharing

Statically linking a second LLVM into the command produced a much larger
module and duplicated facilities already present in Dolly's trusted main
runtime. The shipped command is instead a roughly 15 MB side module. Zig's
upstream `src/zig_llvm.cpp` is compiled once into the main runtime, and the
command imports 21 exact LLVM bridge functions declared by `abi/dolly-0.wat`.
Those imports cover target-machine creation, module emission, and the other
operations used by the enabled WebAssembly code-generation path.

The compiler initializes only the WebAssembly LLVM target. COFF and ELF LLD
entry points return failure, while Zig's WebAssembly linker remains available.
`zig cc` and `zig ar` direct users to Dolly's separately audited `/bin/cc` and
`/bin/ar`; the native command does not embed duplicate Clang or archive-driver
frontends.

## Source adaptations

`patches/zig-0.16.0-dolly-native.patch` contains the reviewed target changes:

- initialize only the WebAssembly LLVM target and adapt Zig's LLVM 21-facing
  bridge code to Dolly's pinned LLVM 24 build;
- use `/usr/bin/zig` as the executable path on Emscripten and allow the normal
  `version` command in the reduced `.core` build;
- correct Emscripten memory64 libc types (`nfds_t` and `nlink_t`) and signal
  typing;
- avoid adding `O_PATH`, which WasmFS declares but does not implement;
- keep the compiler WebAssembly-only and omit unavailable target backends.

`src/zig/native-main.zig` supplies the Dolly command entry and explicit
in-userspace failures for unsupported sockets, subprocesses, dynamic plugins,
and related POSIX facilities. Entropy, clocks, files, arguments, environment,
and command-local exit terminate at Dolly's typed substrate.

Ghostty has one relevant target adaptation. Its libc-backed wasm page pool can
recycle dirty allocator memory, so both allocation and recycling paths must
zero page buffers. `config/ghostty-dolly.patch` makes that invariant explicit
for wasm plus libc. This was confirmed independently: a Ghostty object emitted
by the official host Zig exhibited the same failure before the zeroing fix, so
the issue was not native compiler code generation.

## Reproducibility and caching

The canonical pins are in `config/source-pins.sh`. Both supported host archives
(x86_64 Linux and AArch64 Linux) have SHA-256 checksums. The preparation script
copies the checksum-pinned Zig source and applies the patch to a digest-named
cache directory. The native command's cache key includes its target flags,
source pin, patch, root modules, build script, and Dolly linker wrapper.

A cold native compiler build took approximately 2 minutes 36 seconds to 3
minutes 10 seconds on the development machine. Its output was a roughly 21 MB
relocatable object and 15 MB linked side module. An unchanged cached invocation
still performs ABI validation and returned in about 0.17 seconds.

The complete Zig library preload makes the current data package large (about
274 MB). Pruning that tree and reducing compiler cold-start/build latency are
useful follow-ups, but they do not change the machine architecture.

## Browser acceptance proof

A real Chrome run proves, in one sandbox lifetime, that:

1. `/usr/bin/zig version` executes the native upstream command.
2. Zig compiles `answer.zig` directly to a wasm64 relocatable object; a target
   guard checks the WebAssembly magic before Dolly links and runs it.
3. The same compiler compiles the full pinned Ghostty VT/uucode graph directly
   to `ghostty-vt.o`.
4. Dolly archives that object and links the VT probe and resident display
   module through ordinary WasmFS paths.
5. The VT probe parses text and SGR state and exposes the expected cell grid.
6. Chrome presents a checked 800-by-600 Ghostty framebuffer, with 129-by-29
   cells, and passes raw keys, zoom, fullscreen resize, Lua, Pi, filesystem,
   lifecycle, and brokered-network checks.

The final command was:

```sh
./scripts/test-browser.sh
```

and completed with:

```text
browser: sandbox Ghostty rendered 800x600 (129x29 cells), raw keys/zoom/fullscreen passed
```

## Security boundary

- The native compiler has no WASI, browser, raw-socket, or host-filesystem
  imports. Its imports are the versioned Dolly command surface plus the typed
  LLVM bridge.
- Source, cache, object, archive, and executable files used at runtime live in
  Dolly's mutable WebAssembly memory.
- Subprocess, raw socket, and plugin loading paths fail inside the command;
  they cannot escape to JavaScript or a native host.
- `env.dolly_http_dispatch` remains the sole intentional agent-selected
  network edge of the outer runtime.
- A compromised compiler can corrupt the shared Dolly userspace, as permitted
  by the shared-everything model, but gains no authority beyond the outer
  runtime's audited browser import allowlist.

## Display boundary

`abi/dolly-display-0.wat` defines fixed input records and two bounded
framebuffer addresses. The resident module owns Ghostty parsing, mode-aware key
encoding, terminal sizing, font rasterization, and frame publication.
JavaScript validates dimensions, stride, capacity, and memory ranges before a
stable frame copy. It contains no VT parser, grid model, or command logic.

Before the source build finishes, a narrow bootstrap text callback displays
the traced startup log. The callback is hidden when the resident display module
activates; subsequent terminal output is rendered from inside Dolly.
