# Sources and reproducibility

Dolly separates the common machine seed from image inputs.

## Build flow

```text
config/source-pins.sh
        |
        v
fetch/prepare scripts --> verified .cache checkouts and build/generated trees
        |
        +--> external wasm64 Clang/LLD and native Zig command
        |
        +--> deterministic independent dist/static inputs and ustar archives
        |
        v
toolchain/CMakeLists.txt --> /seed in dist/dolly.data + dist/dolly.wasm
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

The Emscripten data file contains only the compiler/shell seed: sysroot and
Clang headers, Dolly headers and ABI schema, Slop/Dollyfile/core-wrapper source,
and the runtime-owned compiler/linker implementation. Emscripten marks packaged
directory nodes read-only, so it is mounted at `/seed`; `src/dolly.c` copies it
into freshly created mutable `/usr` directories before compilation. No
permission or executable-bit policy is added to Dolly.

Every other input appears as an independent `SOURCE HOST location destination
HASH` row in one of the pinned `/modules/*.dm` recipes selected by `Dollyfile`,
`Dollyfile-pi`, `Dollyfile-python`, `Dollyfile-python-pi`, or
`Dollyfile-gamedev`.
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
- reports the resulting archive SHA-256.

The small `/bin/tar` extractor is inline in `modules/tar.dm` and compiled inside
Dolly before any archive row executes. It accepts only regular files and
directories, rejects absolute/traversal names, and writes solely to WasmFS.

## Component roles

| Component | Outside-browser preparation | Inside-Dolly result |
| --- | --- | --- |
| Emscripten 6.0.8 | Digest-pinned container links the wasm64 main module and packaged seed | libc headers, WasmFS, loader, and shared runtime; the seed explicitly excludes the C++ header tree |
| LLVM/Clang/LLD 24 | Wasm64 libraries are built once and linked into the main module | `/bin/cc`, `/bin/c++`, `/bin/ld`, `/bin/ar` compile/link files in WasmFS |
| Dolly C++ SDK | The exact libc++ header tree is archived separately from the seed; four reviewed C adapters are served independently | `cpp.dm` materializes `/usr/include/c++/v1`, `/usr/lib/libc++.a`, and `/usr/lib/libc++abi.a` as one standalone no-exception SDK module |
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
| Zig 0.16 | Official host Zig builds an ABI-validated wasm64 Zig command; library source is archived | `/usr/bin/zig` emits wasm64 objects through the runtime LLVM bridge |
| Ghostty + uucode | Pinned source and generated configuration/tables are archived | Zig builds Ghostty VT and its static library; Dolly cc builds the resident display shared library |
| QuickJS-ng | Exact engine source is archived; ambient `quickjs-libc.c` is excluded | `/usr/lib/libdolly-js.a`, `qjs`, Janis, and Pi frontend |
| Pi | Locked npm packages are bundled to a checked QuickJS-compatible ESM input | `/usr/bin/pi` runs upstream TUI and Dolly extension files |
| stb_truetype + Iosevka | Commit/digest-pinned header and fonts are served independently | display rasterizer and runtime terminal font |

Host-side preparation is allowed to make pinned upstream trees buildable, but
it must be deterministic and reviewable. It must not compile the ordinary final
commands that a Dolly rebuild claims to build. The explicit exceptions are the
machine/compiler seed and ABI-validated bootstrap modules such as native Zig.

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
/seed/          immutable packaged compiler input, copied during boot
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

Except for the immutable `/seed` package, this is WasmFS memory state. None of
these paths maps to a browser or native-host filesystem.

## Generated files

Generated outputs are divided by authority:

- `build/generated/` contains deterministic host preparation such as Awk parser
  output, selected Git/Make trees, Ghostty tables, and the Pi ESM bundle.
- `dist/static/` contains exactly the bytes named by `SOURCE HOST` rows.
- `dist/dolly-images.mjs` is disposable JavaScript route/policy metadata derived
  from visible recipes; it is not an ABI or recipe source.
- `dist/dolly-<image>-system.snapshot` and matching metadata are products of an
  actual browser rebuild.

`node scripts/verify-static-sources.mjs` is the cheap integrity check.
`npm run snapshot` is the expensive proof that both recipes execute in a real
browser and that the resulting retained files can be serialized.

## Remaining reproducibility limits

- Under the pinned toolchain and browser, target compiler scratch names,
  single-threaded LLD section merging, and CPython build metadata are fixed so
  cold, packaged-prefix, and module-layer builds produce identical snapshot
  bytes. Cross-kernel and cross-browser bit reproducibility is not yet claimed;
  logical identity and every input byte remain sealed and verified there.
- Pi is still host-bundled with pinned esbuild rather than compiled from
  TypeScript inside Dolly.
- Prepared Git/Ghostty/Zig trees contain reviewed target adaptations; reducing
  patches in favor of upstream target configuration remains preferred.
- The common seed is still large because it includes current Clang/LLVM and
  complete compiler headers.
