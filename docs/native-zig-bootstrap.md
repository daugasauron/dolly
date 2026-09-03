# Native Zig bootstrap: implementation handoff

Status: migrated into Dolly and browser-tested

Last updated: 2026-09-03

## What to take

This implementation replaces the interpreted Zig-to-C bootstrap with a proper
native wasm64 Zig compiler. The resulting `/usr/bin/zig` runs upstream Zig frontend
code and its LLVM WebAssembly backend inside Dolly and emits relocatable
WebAssembly objects directly. It has been built, ABI-inspected, used to compile
both a small Zig fixture and the full Ghostty VT source graph, and tested in a
real Chrome sandbox through final framebuffer presentation.

The change is intentionally one architecture, not a compatibility wrapper:

```text
official checksum-pinned Zig (external stage zero)
  -> upstream Zig compiler compiled to wasm64-emscripten PIC
  -> Dolly links/stamps/validates it as a side module
  -> packaged /usr/bin/zig runs inside Dolly
  -> Zig LLVM backend emits .o directly into WasmFS
  -> Dolly ar/cc produce the final library and commands
```

No generated C, nested compiler interpreter, precompiled Ghostty object, host
subprocess, or browser compilation service exists in this path.

## Why this path

Three approaches were investigated independently:

1. Zig 0.16's source bootstrap seed was rejected because that stage emits C.
   Even with a faster interpreter, it would preserve the shortcut the native
   compiler work is meant to remove.
2. Zig's self-hosted no-LLVM WebAssembly backend was rejected for this target.
   Its upstream WebAssembly path still contains an imported-stack-pointer TODO
   and memory32 assumptions, so it does not currently produce Dolly-compatible
   memory64 shared-everything objects.
3. Compiling upstream Zig with LLVM works. A first static-LLVM side module was
   roughly 49 MB and duplicated a large engine already linked into Dolly. The
   selected design keeps Zig native but imports a narrow, typed LLVM bridge from
   the main runtime. The final side module is roughly 15 MB.

Using an official compiler as stage zero is normal compiler bootstrapping. It
is checksum-pinned, only runs during the outer application build, and never
enters Dolly. All user-requested Zig compilation and the full Ghostty build run
inside the browser.

## File map

### Bootstrap scripts and pins

- `config/source-pins.sh` pins the Zig source archive and official x86_64-linux
  and AArch64-linux host archives by SHA-256.
- `scripts/fetch-zig-host.sh` selects the two supported Linux host
  architectures, verifies the archive, and extracts it under `.cache/`.
- `scripts/fetch-zig.sh` fetches and verifies the independent source archive.
- `scripts/prepare-zig-native.sh` copies that source into a patch-digest cache
  directory and applies `patches/zig-0.16.0-dolly-native.patch`.
- `scripts/build-native-zig.sh` invokes the official host Zig with
  `build-obj -target wasm64-emscripten`, `-fPIC`, atomics, single-threaded libc,
  and compiler-rt. It links the result through `bin/dolly-cc`, validates it
  against `build/dolly-0.wasm`, and caches the expensive frontend object
  separately from its cheap ABI-specific link. A Dolly ABI change therefore
  relinks and restamps the object without recompiling Zig.

### Native command

- `src/zig/native-main.zig` exports `dolly_main`, calls upstream
  `compiler.main`, and supplies target-local POSIX denial shims. Raw sockets,
  process creation, dynamic loading, and unavailable threading operations do
  not become ambient imports.
- `src/zig/native-build-options.zig` configures a small `.core`, LLVM-enabled,
  WebAssembly-only Zig build.

The production image does not retain a `zig-check`, object checker, or tiny
answer fixture. The ordinary browser acceptance suite creates a disposable
source/object/program in `/workspace`, while Ghostty is the real rebuild-time
compiler workload.

### LLVM bridge and machine ABI

- `abi/dolly-0.wat` adds 21 exact functions used by the compiler's enabled
  code-generation path: five WebAssembly target initializers, LLVM context and
  bitcode helpers, target-machine creation/emission/disposal, Zig's target
  wrappers, archive writer, option parser, and Wasm LLD entry.
- `toolchain/CMakeLists.txt` compiles the prepared upstream `src/zig_llvm.cpp`
  into the trusted main runtime and links the required LLVM WebAssembly and LLD
  libraries. `Dollyfile` fetches the ABI-validated native side module as
  `/usr/bin/zig` and the pinned Zig library archive, then `/bin/tar` writes the
  library tree to `/usr/lib/zig` before Zig is run.
- `modules/zig.dm` exports `ZIG_LIB_DIR=/usr/lib/zig`; image environment comes
  from selected modules rather than hardcoded runtime knowledge.

The module inspection after the final build showed only shared memory64,
table64/base relocation state, Dolly libc/lifecycle calls, and the 21 LLVM
bridge calls. It had no WASI, JavaScript, raw socket, native process, Fetch, or
host-filesystem imports. Networking remains governed exclusively by the outer
runtime's `env.dolly_http_dispatch` boundary.

### Target build graph

`modules/ghostty.dm` carries its focused Makefile inline and builds Ghostty
directly:

```make
zig ... -femit-bin=/tmp/ghostty-vt.o
ar rcs /usr/lib/libghostty-vt.a /tmp/ghostty-vt.o
```

The old WAMR interpreter, Zig wrapper command, generated-C compatibility
header, fetch script, and C checkpoint path are deleted.

## Upstream Zig patch details

`patches/zig-0.16.0-dolly-native.patch` is deliberately small and auditable:

- `lib/std/os/emscripten.zig`
  - returns `SIG` from `W.STOPSIG`;
  - defines `nfds_t` as `u32`, matching Emscripten's `unsigned int` even under
    memory64;
  - defines `nlink_t` as `usize`, matching Emscripten's pointer-width `_Reg`.
    The latter is essential: `u32` shifted memory64 `struct stat` fields, so
    Zig observed zero file sizes and copied empty source files.
- `lib/std/Io/Threaded.zig` avoids `O_PATH` on Emscripten. WasmFS declares the
  value for source compatibility but rejects it with `EINVAL`.
- `src/main.zig` uses `/usr/bin/zig` as the self executable path.
- `src/dev.zig` enables the ordinary `version` command in the reduced `.core`
  build; this avoids a fake wrapper-side version implementation.
- `src/codegen/llvm.zig` initializes only WebAssembly LLVM targets and traps on
  a non-WebAssembly target in this deliberately narrow compiler.
- `src/zig_llvm.cpp` adapts the Zig 0.16 LLVM 21-facing bridge to Dolly's LLVM
  24: obsolete `FloatABIType` writes are ignored for WebAssembly, OptBisect uses
  intervals, the current optimization pipeline API is used, and unused COFF
  and ELF LLD bridges are disabled. Wasm LLD remains real.

Pinned Emscripten layout was checked directly while diagnosing `nlink_t`:

```text
sizeof(nlink_t)       = 8
offsetof(stat,st_size)= 32
offsetof(stat,st_ino) = 96
sizeof(struct stat)   = 104
```

## Ghostty correctness fix

After the compiler successfully emitted and linked Ghostty, the VT runtime
trapped while freeing a bitmap/grapheme. An A/B test compiled the identical
Ghostty graph with official host Zig and loaded that object into the same
runtime; it failed identically. This ruled out the LLVM bridge and native
compiler output.

The real issue was the existing Ghostty wasm page-pool adaptation. It changed
the pool to libc's allocator, but Ghostty zeroed returned page buffers only for
runtime-safe or freestanding targets. `wasm64-emscripten` with libc is neither,
and compiler heap activity made the recycled memory visibly dirty.
`config/ghostty-dolly.patch` now zeros buffers in both initial allocation and
recycling paths when the architecture is WebAssembly and libc is linked.

## Reproduce

Prerequisites are the repository's normal Node dependencies, container engine,
pinned Emscripten cache, and wasm64 LLVM toolchain:

```sh
npm install
./scripts/build-toolchain.sh
./scripts/build.sh
npm run snapshot
```

Build or validate just the native command after `build/dolly-0.wasm` exists:

```sh
./scripts/build-native-zig.sh
node scripts/dolly-abi.mjs inspect build/native-zig/zig-native.wasm
node scripts/dolly-abi.mjs validate-command \
  build/dolly-0.wasm build/native-zig/zig-native.wasm
```

Run the static and real-browser proofs:

```sh
node --test test/dolly.test.mjs
./scripts/test-browser.sh
DOLLY_BROWSER_MODE=pi ./scripts/test-browser.sh
```

The final unchanged real-browser rerun passed with:

```text
browser: sandbox Ghostty rendered 800x600 (129x29 cells), raw keys/zoom/fullscreen passed
```

It compiled the complete Ghostty object during the image rebuild and a
disposable small object during acceptance before exercising the command suite,
filesystem, lifecycle, network broker, Pi tool turn, raw keys, zoom,
fullscreen, and framebuffer checks.

## Measured characteristics

These are observations from this development worktree, not performance
guarantees:

| Artifact or action | Observed result |
| --- | --- |
| Native compiler relocatable object | about 21 MB |
| ABI-stamped native compiler module | about 15 MB |
| Cold outer native-compiler build | about 2m36s to 3m10s |
| Cached `build-native-zig.sh` with ABI validation | about 0.03s |
| ABI-only relink from the cached frontend object | about 6.5s |
| Common compiler-seed data package | about 27 MB in the current integrated build |
| Captured retained system snapshot | about 254 MB in the current integrated build |

The cache key avoids rebuilding the compiler when all relevant inputs are
unchanged. The `/rebuild` snapshot-export path compiles Ghostty in a fresh
in-memory userspace as the end-to-end source proof; normal `/` boot restores
the resulting digest-checked static system snapshot.

## Known limitations and sensible follow-ups

- This compiler deliberately supports WebAssembly targets only. General native
  Zig cross-compilation would require more LLVM target libraries and ABI
  imports and should be justified by a concrete Dolly workload.
- `zig cc` and `zig ar` are not duplicated; use `/bin/cc`, `/bin/c++`, and
  `/bin/ar`.
- The compiler is single-threaded because Dolly version 0 has synchronous
  process-shaped behavior. Parallel code generation is future substrate work.
- The full retained `/usr/lib/zig` tree is the largest snapshot cost. Build a
  traced manifest from successful answer and Ghostty builds before pruning it;
  do not guess away compiler or standard-library files.
- The LLVM 24 small-code path currently selects O2 in the compatibility bridge.
  Restoring a size-specific modern pass pipeline is a contained optimization
  follow-up after preserving output parity.
- The Zig patch currently applies with minor patch fuzz/offset to the pinned
  archive. Regenerating it from the exact prepared tree would improve review
  cleanliness without changing behavior.
- The first browser acceptance attempt after the correctness fix passed all
  compiler and userspace assertions but observed a transient post-fullscreen
  canvas-size mismatch. An unchanged rerun passed. If it recurs, diagnose the
  browser presentation timing independently of Zig compilation.

## Integration guardrails

The compiler scripts are not a standalone shortcut. The ABI additions,
main-runtime LLVM bridge, Emscripten type corrections, direct-object startup
graph, object guard, and Ghostty page-pool fix are one implementation and must
remain versioned and tested together.
