# Zig and Ghostty

`/usr/bin/zig` is an ordinary private Wasm executable containing the pinned
upstream frontend and its LLVM/LLD WebAssembly backend. It is independent of
Clang and installed only in the `ghostty-build` image.

That image compiles Ghostty/uucode source to `/tmp/ghostty-vt.o` inside Dolly.
Dolly ar/cc produce `libghostty-vt.a` and the resident `/usr/lib/libdisplay.so`.
There is no Zig-to-C translation, nested interpreter or host compilation service.

`Dollyfile-system` copies the completed display plugin, font and licenses from
`Dollyfile-ghostty-build`. Default, Pi, Python and game images do not inherit
Zig's SDK or Ghostty development archives. Prebuilt boots do not compile Ghostty.

## Bootstrap and SDK

```text
pinned official host Zig
  → patched upstream Zig frontend object for wasm64
  → LLVM bridge + LLVM/LLD → ABI-validated private zig executable
  → ghostty-build: Zig compiles Ghostty → Dolly ar/cc link display plugin
```

The first two compilation/link stages are explicit external bootstrap exceptions.
User-requested Zig compilation and the complete Ghostty target build run in Wasm.

[config/zig-sdk-files.txt](../config/zig-sdk-files.txt) positively selects
`/usr/lib/zig`: std, runners, headers, compiler-rt and C/sanitizer support.
The target is `wasm64-emscripten`; libc/C++ come from Dolly's process SDK.
Desktop libc trees, duplicate C++/unwind libraries and compiler web docs are omitted.
Do not prune by filename: ordinary compilation needs some `*_test.zig` files.

Clang and Zig each link their own LLVM/LLD. This duplicates builder code but lets
ordinary images omit Zig without a shared LLVM loader or compiler-specific API.
Each invocation receives fresh memory, table, allocator, globals and TLS.

## Target adaptations

Pins live in `config/source-pins.sh`.
`patches/zig-0.16.0-dolly-native.patch` selects the WebAssembly backend,
adapts the pinned LLVM bridge, fixes memory64 libc types, avoids unsupported
O_PATH and retains `zig version` in the reduced build.
`src/zig/native-main.zig` enters upstream `compiler.main`.

`config/ghostty-dolly.patch` zeros libc-backed Wasm page-pool buffers on
allocation and recycle. Generated options/Unicode tables have pinned provenance
under `src/ghostty/generated/`; they are source inputs, not Ghostty binaries.

Ghostty supplies libghostty-vt, not its desktop application. Dolly's driver
rasterizes its grid with pinned IosevkaTerm SemiBold. The display driver is the
sole resident kernel plugin and is admitted through the separate typed
`dolly-kernel-plugin-0` contract. Ordinary games use process display operations,
not that plugin ABI.

## Verification

`scripts/build-native-zig.sh` caches the frontend by compiler/source pins,
patches, roots and flags; trapped staging publishes only a completed artifact.
Contract changes can relink without recompiling the frontend.

Browser regressions compile Zig with Clang temporarily absent, then restore
Clang to link/run a C driver. They cover math, 128-bit division, allocation and
a Zig test object. C++ is separately exercised in images without Zig.
Image tests verify copied terminal bytes and absent build dependencies;
`/ghostty-build/rebuild/` builds the full Ghostty graph.

See [processes](process-model.md), [display](display.md) and [ABI](../abi/README.md).
