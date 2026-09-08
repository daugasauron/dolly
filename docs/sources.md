# Sources and reproducibility

Dolly separates the common machine seed from image inputs.

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
the private compiler executable. Emscripten's standalone `dolly-seed.mjs` loader
mounts it at `/seed` only for a root rebuild without a `FROM` base;
`src/dolly.c` installs those inputs into `/usr` before compilation. Prebuilt
images and builds with a base already contain their compiler and do not fetch
the seed. The small kernel does not link the compiler. No permission or
executable-bit policy is added to Dolly.

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
- reports the resulting archive SHA-256.

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
| SDL2 2.32.10 | Pinned release plus a Dolly video backend and target configuration | `sdl2-build` compiles the static software renderer with in-Wasm input/framebuffers; audio and thread creation are explicitly unavailable |
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
