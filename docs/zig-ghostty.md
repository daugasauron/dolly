# Native Zig and Ghostty

## Result

Dolly's private compiler process contains the upstream Zig 0.16 frontend and
its LLVM WebAssembly backend alongside Clang and LLD. `/usr/bin/zig` is a small
ordinary `dolly-process-0` frontend that selects Zig mode in that compiler.
Source and output paths are kernel-backed WasmFS paths.

During an image rebuild, Zig compiles the pinned Ghostty/uucode source graph
inside Dolly to `/tmp/ghostty-vt.o`. Dolly's `ar` and `cc` then create
`/usr/lib/libghostty-vt.a` and the resident `/usr/lib/libdisplay.so`. There is
no Zig-to-C translation, nested Wasm interpreter, host compilation service, or
precompiled Ghostty object in the image.

The target is Ghostty's upstream `libghostty-vt`, not its GTK or macOS desktop
application. It supplies the parser, screen model, terminal modes, selection,
scrollback, and key encoder. Dolly's small driver loads pinned IosevkaTerm
SemiBold from WasmFS and rasterizes the grid into kernel RGBA buffers.

## Bootstrap chain

```text
checksum-pinned official host Zig 0.16 (outer build only)
  -> compile patched upstream Zig frontend object for wasm64 Emscripten
  -> link object + Zig LLVM bridge + Clang/LLD into private compiler.wasm
  -> validate compiler.wasm as a dolly-process-0 executable
  -> /usr/bin/zig starts a fresh compiler process in the browser
  -> Zig emits Ghostty .o into WasmFS
  -> Dolly ar/cc build libghostty-vt.a and sealed libdisplay.so
```

Using an official compiler as stage zero is ordinary compiler bootstrapping.
It is checksum-pinned, runs only during the outer repository build, and never
enters the browser filesystem. All user-requested compilation and the complete
Ghostty target build run inside Dolly.

## Why the compiler is one private process

The earlier shared-side-module experiment placed LLVM bridge functions in the
kernel contract and could not reliably reclaim LLVM, libc++, loader, or Zig
global state between commands. The current design links those components once
into the private compiler executable instead. Each invocation gets fresh
memory, table, libc, allocator, globals, and TLS; completion or cancellation
reclaims all of it.

This makes the compiler module larger, but keeps the resident kernel small and
the public executable ABI independent of LLVM. The compiler imports exactly
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
bridge calls used by the combined compiler executable. Raw sockets and host
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

The real browser gate verifies that Zig emits a disposable wasm64 object, that
the full Ghostty graph builds during `/rebuild/`, that the resident display
loads, and that terminal rendering, input, zoom, fullscreen, and framebuffer
lease restoration work through the same paths a user exercises.

See [the process model](process-model.md), [display contract](display.md), and
[machine contracts](../abi/README.md).
