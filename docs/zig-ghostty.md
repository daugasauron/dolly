# Native Zig and Ghostty

## Result

Dolly's `/usr/bin/zig` contains the upstream Zig 0.16 frontend and its LLVM/LLD
WebAssembly backend. It is an ordinary `dolly-process-0` executable, independent
of the Clang compiler at `/usr/libexec/dolly/process-bin/compiler`.
Source and output paths are kernel-backed WasmFS paths.

During a `ghostty-build` image rebuild, Zig compiles the pinned Ghostty/uucode source graph
inside Dolly to `/tmp/ghostty-vt.o`. Dolly's `ar` and `cc` then create
`/usr/lib/libghostty-vt.a` and the resident `/usr/lib/libdisplay.so`. There is
no Zig-to-C translation, nested Wasm interpreter, host compilation service, or
precompiled Ghostty object in the image.

[`Dollyfile-ghostty-build`](../Dollyfile-ghostty-build) starts from bootstrap,
core tools, tar and Make, not from `system`. It retains Zig's compiler/SDK and
Ghostty's development files. [`Dollyfile-system`](../Dollyfile-system) uses
`COPY FROM` to take only the finished display plugin, font and licenses. Thus
default, Pi, Python and game images do not inherit Zig or Ghostty's headers and
static archive. `/ghostty-build/` remains available for Zig development.

The target is Ghostty's upstream `libghostty-vt`, not its GTK or macOS desktop
application. It supplies the parser, screen model, terminal modes, selection,
scrollback, and key encoder. Dolly's small driver loads pinned IosevkaTerm
SemiBold from WasmFS and rasterizes the grid into kernel RGBA buffers.

## Bootstrap chain

```text
checksum-pinned official host Zig 0.16 (outer build only)
  -> compile patched upstream Zig frontend object for wasm64 Emscripten
  -> link object + Zig LLVM bridge + LLVM/LLD into zig.wasm (no Clang)
  -> validate zig.wasm as a dolly-process-0 executable
  -> install as /usr/bin/zig in ghostty-build; each invocation is a fresh process
  -> Zig emits Ghostty .o into WasmFS
  -> Dolly ar/cc build libghostty-vt.a and sealed libdisplay.so
```

Using an official compiler as stage zero is ordinary compiler bootstrapping.
It is checksum-pinned, runs only during the outer repository build, and never
enters the browser filesystem. All user-requested compilation and the complete
Ghostty target build run inside Dolly.

## Installed SDK

[`config/zig-sdk-files.txt`](../config/zig-sdk-files.txt) is the positive install
list for `/usr/lib/zig`. It keeps upstream `std`, compiler runners and headers,
compiler-rt, and C/sanitizer support intact. Dolly's target is
`wasm64-emscripten`; libc and C++ come from Dolly's process SDK, not Zig's
bundled operating-system SDKs. Desktop libc trees, duplicate C++/unwind
libraries, and compiler web documentation are not installed.

Do not prune individual files by name: ordinary user compilation reads
`compiler_rt/udivmodti4_test.zig`, despite its name and 10 MB size. The browser
regression compiles and runs math, 128-bit division, and an allocated container
through a C driver, and compiles a Zig test object. Image rebuilds exercise the
full Ghostty source graph.

At the 2026-09-06 browser checkpoint, installed Zig files fell from 19,662 /
199,004,158 bytes to 1,330 / 52,203,828 bytes. Each of the five snapshots lost
148,156,314 bytes. Default prebuilt boot's kernel memory extent fell from
971,046,912 to 763,625,472 bytes in Chrome; this measures Wasm memory, not
whole-browser RSS. No source module was rewritten to achieve the reduction.

## Independent compiler processes

The earlier shared-side-module experiment placed LLVM bridge functions in the
kernel contract and could not reliably reclaim LLVM, libc++, loader, or Zig
global state between commands. Both compilers now use ordinary private process
executables. Each invocation gets fresh
memory, table, libc, allocator, globals, and TLS; completion or cancellation
reclaims all of it.

Clang and Zig each statically link their LLVM/LLD dependencies. This duplicates
some code in the build image but allows ordinary images to omit Zig entirely,
without introducing a shared LLVM loader or compiler-specific platform API.
At the 2026-09-07 checkpoint, the default snapshot fell from 214,109,838 to
145,817,753 bytes (31.9%). Clang fell from 92,476,305 to 78,332,187 bytes;
the separate Zig executable is 48,485,458 bytes. These are uncompressed file
sizes, not HTTP transfer sizes.
Each compiler imports exactly
the same two things as `ls`: private memory64 and `dolly_process_0.call`.
Immutable `WebAssembly.Module` compilation can still be cached by the browser.

## Source adaptations

`patches/zig-0.16.0-dolly-native.patch` contains the reviewed upstream target
changes:

- initialize only the WebAssembly LLVM target and adapt the LLVM-facing bridge
  to the pinned LLVM 24 APIs;
- use `/usr/bin/zig` as the executable path and retain the normal `version`
  command in the reduced `.core` build;
- correct Emscripten memory64 libc types such as `nfds_t` and `nlink_t`;
- avoid `O_PATH`, which WasmFS declares but does not implement; and
- omit unavailable non-WebAssembly backends.

`src/zig/native-main.zig` enters upstream `compiler.main` and exports the Zig
bridge calls used by the standalone Zig executable. Raw sockets and host
processes are never supplied as imports.

Ghostty has one focused target fix. Its libc-backed WebAssembly page pool may
recycle dirty allocator memory, so `config/ghostty-dolly.patch` zeros page
buffers on both allocation and recycle. The same failure reproduced with an
object emitted by official host Zig, which isolated the issue from Dolly's
native compiler path.

## Resident display plugin

Terminal state must survive foreground process replacement, so the Ghostty
driver is the only resident kernel plugin. The private compiler accepts this
output only with `cc --dolly-kernel-plugin -shared`, validates its exact imports
against `abi/dolly-kernel-plugin-0.wat`, stamps it, validates again, and
publishes it. The image snapshot seals the bytes before kernel boot loads it.

Ordinary programs, including the gamedev framebuffer demo, remain private
process executables. They use the display packet operations in
`include/dolly/process.h`; they do not link against the kernel-plugin ABI.

## Reproducibility and tests

Pins are in `config/source-pins.sh`. `scripts/build-native-zig.sh` keys its
cached frontend object from the host compiler/source pins, patch, root modules,
and exact target flags, stages output in a trapped temporary directory, and
publishes it atomically. Contract changes relink the private compiler without
recompiling the Zig frontend object.

The real browser gate compiles Zig objects with the Clang executable temporarily
removed, restores Clang to link and run a C driver, and exercises C++ in images
without Zig. Snapshot tests verify exact copied terminal bytes and absent build
dependencies. The full Ghostty graph builds during `/ghostty-build/rebuild/`.
Terminal rendering, input, zoom, fullscreen and framebuffer lease restoration
use the same paths a user exercises.

See [the process model](process-model.md), [display contract](display.md), and
[machine contracts](../abi/README.md).
