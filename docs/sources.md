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
Dollyfile rows --> browser broker --> exact SHA-256-checked files in WasmFS
        |
        v
/bin/dollyfile executes RUN/CHECK synchronously and seals KEEP paths
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

Every other input appears as an independent `SOURCE HOST ... SHA256 ...` row in
`Dollyfile`, `Dollyfile-gamedev`, or `Dollyfile-python`.
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
- accepts exact source-visible suffix exclusions for reviewed generated files;
- rejects symlinks and unsafe paths;
- sorts records using a fixed locale;
- emits regular files only with fixed owner, mode, and timestamp fields;
- writes no host paths or ambient metadata;
- reports the resulting archive SHA-256.

The small `/bin/tar` extractor is itself fetched as text and compiled inside
Dolly before any archive row executes. It accepts only regular files and
directories, rejects absolute/traversal names, and writes solely to WasmFS.

## Component roles

| Component | Outside-browser preparation | Inside-Dolly result |
| --- | --- | --- |
| Emscripten 6.0.8 | A digest-pinned container links the wasm64 main module; an independently commit-pinned Emscripten source tree is archived without target objects | musl and libc++ headers plus the current libc++/libc++abi sources are available under `/usr/src/emscripten`; Dolly compiles its no-exception bootstrap C++ archives in WasmFS |
| LLVM/Clang/LLD 24 | Wasm64 libraries are built once and linked into the main module | `/bin/cc`, `/bin/c++`, `/bin/ld`, `/bin/ar` compile/link files in WasmFS |
| GNU Make 4.4.1 | Pinned release is configured, a reviewed serial Dolly adapter is applied, and unguarded headers receive deterministic include guards | Seven source-visible amalgamation partitions compile `/usr/bin/make`; recipes run synchronously through `/bin/slop` |
| Samurai 1.3 | Exact pinned upstream C99 source plus one reviewed scheduler patch is archived | `/usr/bin/ninja`; the Ninja parser, graph evaluation, dirty checking, depfiles, and logs are upstream Samurai while build edges execute serially through `/bin/slop` |
| sbase | Exact source/helper subset is archived | separate text, path, checksum, ordering, delay, and status utilities: `grep`, `sed`, `head`, `wc`, `cut`, `od`, `printf`, `sort`, `uniq`, `basename`, `dirname`, `tr`, `cmp`, `comm`, `paste`, `join`, `seq`, `expr`, `nl`, `split`, `strings`, `cksum`, `fold`, `expand`, `unexpand`, `tsort`, `pathchk`, `date`, `mktemp`, `sha256sum`, `md5sum`, `sleep`, `true`, `false`, `ln`, `readlink`, and `rmdir` |
| One True Awk | Pinned Bison generates parser C/header; sources are archived | target `maketab` runs, then `/bin/awk` is compiled |
| curl | Official headers/license plus Dolly Fetch implementation are served | `/usr/lib/libcurl.a` and `/usr/bin/curl` over the broker |
| zlib | Selected pinned upstream C tree is archived | `/usr/lib/libz.a` and public headers |
| Git | Generated config/version files, tracked C sources, templates, and reviewed target patch are archived | `/usr/bin/git`, `libgit.a`, and HTTP helpers |
| CPython 3.14 | A pinned upstream tree is configured for Dolly's wasm64 target; matching frozen headers and generated build files plus a narrow reviewed target patch are archived | Every target object and `/usr/bin/python` are compiled inside Dolly; `sys.platform` is `dolly`, user-site paths live under the shared `/home/dolly`, entropy uses Dolly's in-Wasm source, thread creation fails through CPython's single-thread stubs, the import-compatible `_socket` module terminates raw socket operations at local `ENOSYS` stubs, and upstream `faulthandler` supplies synchronous dumps without an OS resource-limit dependency |
| Bonnie | Dolly C frontend and Python resolver are served independently | `/usr/bin/bonnie` uses the default image's libcurl broker backend and CPython's standard library to parse arguments or strict requirements files, resolve, download, hash/CRC/path-check the complete portable graph, then install it without resolver-time target mutations; console entry points are compiled separately by the in-sandbox C compiler |
| raylib 6.0 + Box3D 0.1.0 | Exact pinned upstream source trees are archived; no host target objects are kept | GNU Make compiles raylib's `PLATFORM_MEMORY` modules and Box3D's portable C17 objects into static libraries; Dolly's adapters provide serial task semantics and present directly into the inactive RGBA buffer, pace frames, and consume semantic input |
| Zig 0.16 | Official host Zig builds an ABI-validated wasm64 Zig command; library source is archived | `/usr/bin/zig` emits wasm64 objects through the runtime LLVM bridge |
| Ghostty + uucode | Pinned source and generated configuration/tables are archived | Zig builds Ghostty VT, its static library, and resident display module |
| QuickJS-ng | Exact engine source is archived; ambient `quickjs-libc.c` is excluded | `/usr/lib/libdolly-js.a`, `qjs`, Janis, and Pi frontend; the Dolly runner delegates bare ESM resolution to Janis's finite WasmFS-only package resolver |
| TypeScript 5.9.3 | The digest-pinned official npm `.tgz` is kept untouched; Dolly's source-built `gzip` and `tar` extract it | `/usr/bin/tsc` runs the unchanged CommonJS compiler under Janis and emits single-/multi-file ESM into WasmFS |
| Pi | The exact Git commit, ordinary package resources, generated model data from the exact pinned published package, and a source-visible external runtime profile are archived independently; each external package must match `package-lock.json` version and integrity metadata | Dolly compiles all 495 modules in seven workspace packages with a narrow target config, retains source/output under `/usr/src/pi-source`, publishes unchanged manifests under `/usr/lib/node_modules/@earendil-works`, and compiles `/usr/bin/pi` to load that unbundled graph through Janis; no host application bundle is generated |
| stb_truetype + Iosevka | Commit/digest-pinned header and fonts are served independently | display rasterizer and runtime terminal font |

Host-side preparation is allowed to make pinned upstream trees buildable, but
it must be deterministic and reviewable. It must not compile the ordinary final
commands that a Dolly rebuild claims to build. The explicit exceptions are the
machine/compiler seed and ABI-validated bootstrap modules such as native Zig.

The libc++ bootstrap uses the pinned upstream headers and keeps its target
archive deliberately narrower than a native libc++ dylib. Dolly's allocation
and hash adapters replace native weak-symbol interposition and an
implementation-defined hash algorithm. Small C shims implement the out-of-line
string, clock, allocation, and serialized static-initialization paths required
by ordinary no-exception C++ commands against the pinned libc++ ABI-v2 wasm64
layout; the hundreds of unrelated
explicit instantiations in upstream `string.cpp` are not compiled during every
browser rebuild. All adapters are fetched as source and compiled inside
the sandbox. Version 0 has no C++ exception transport, so its deterministic
`libc++abi.a` is empty and exception-dependent programs fail at the normal link
boundary. No libc++ target object is prepared on the host.

The `ninja` command is Samurai rather than the reference C++ Ninja executable.
Samurai implements the same build language and the command-line surface Meson
uses. Its unguarded upstream headers receive only deterministic `#pragma once`
lines. Dolly's source-visible selector compiles the compact C99 graph as its 13
ordinary upstream translation units, avoiding the pathological optimizer cost
of cross-file amalgamation. `util.c` uses two explicit loop checkpoints and a
local `fprintf`-to-`vfprintf` adapter so it can compile at `-O0` without adding
an ABI import; this avoids a measured optimizer cliff without losing cooperative
cancellation. Dolly changes only the process scheduler:
ready edges run one at a time as `/bin/slop -c COMMAND`, `-j` remains accepted
for compatibility, and a child status 130 terminates the build with status 130.
No browser process, worker scheduler, pipe emulation, or host filesystem is
involved. Make and Samurai use `-O1` because bootstrap latency matters more
than scheduler throughput; Samurai keeps Dolly's compiler-inserted edge
safepoints in addition to its explicit child-boundary checkpoints.

The Pi runtime profile is a reviewed reachability allowlist, not a copy of all
declared npm dependencies. It currently excludes Photon: its CommonJS loader
reaches a nested wasm32 `WebAssembly.Module`, which QuickJS-ng cannot
instantiate. Dolly disables Pi auto-resize so supported image formats pass
through unchanged; the unusable nested module is not shipped merely because it
appears in the upstream lockfile.

## Runtime layout

```text
/seed/          immutable packaged compiler input, copied during boot
/usr/src/       fetched and extracted target source
/usr/include/   mutable compiler and library headers
/usr/lib/       source-built libraries and retained runtimes
/bin/           core commands and Slop
/usr/bin/       optional tools, runtimes, Pi, Zig, and Ghostty probes
/usr/libexec/   helpers, display module, and validation programs
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
  output, selected Git/Make trees, and Ghostty tables. Pi's executable ESM is
  generated inside Dolly rather than in this host directory.
- `dist/static/` contains exactly the bytes named by `SOURCE HOST` rows.
- `dist/dolly-images.mjs` is disposable JavaScript route/policy metadata derived
  from visible recipes; it is not an ABI or recipe source.
- `dist/dolly-<image>-system.snapshot` and matching metadata are products of an
  actual browser rebuild.

`node scripts/verify-static-sources.mjs` is the cheap integrity check.
`npm run snapshot` is the expensive proof that every registered recipe executes
in a real browser and that the resulting retained files can be serialized. It refreshes
the derived route and broker metadata first, so a changed Dollyfile cannot be
served under stale byte limits. For an exact two-build check, run
`DOLLY_SNAPSHOT_IMAGE=python npm run snapshot:reproducible` (substitute any
source-visible image).

`npm run census -- IMAGE` verifies one packaged snapshot and writes a
deterministic typed import census under `build/`. The report is derived audit
output, not an ABI source or a new runtime communication channel; see
[`platform-census.md`](platform-census.md).

`npm run pi:census` audits the separate external JavaScript profile. It records
each package's exact lock integrity, declared license and retained root license
files, install-lifecycle/native/nested-Wasm flags, plus conservative categories
of files that might be removable. It neither executes package scripts nor
prunes files; reachability and license retention must be established first.

`npm run build:runtime` preserves an existing image only after the successful
build has revalidated its runtime build ID, exact inherited recipe chain, byte
length, and SHA-256. It removes only stale image/metadata pairs. A Python-only
recipe edit therefore does not discard current default or gamedev snapshots,
while any runtime change invalidates all of them.

## Remaining reproducibility limits

- Repeated builds with the same browser/runtime inputs are expected to be
  byte-identical. Recipes must set deterministic compiler inputs explicitly;
  for example the Python image fixes CPython's build-info `DATE`/`TIME` macros
  and disables `.pyc` writes during image checks. Reproducibility across
  different host kernels, browser engines, and tool versions is not yet
  promised; logical identity and all input bytes remain sealed and verified.
- Pi's complete seven-package runtime TypeScript workspace emits and executes
  inside Dolly. The target emit uses `noCheck` and `types: []`: it proves
  target parsing, JavaScript generation, package resolution, and executable
  behavior, but not full type completeness. The external profile is explicit
  and lockfile-verified; generated external-package source maps are explicitly
  excluded because QuickJS/Janis has no source-map consumer, but it is not yet
  a general package manager. Pi's emitted
  `dist`, themes, export assets, docs, and examples share one conventional
  installed package root, and the recipe runs its full startup-benchmark path
  to detect an incomplete runtime layout.
- Prepared Git/Ghostty/Zig trees contain reviewed target adaptations; reducing
  patches in favor of upstream target configuration remains preferred.
- The common seed is still large because it includes current Clang/LLVM and
  complete compiler headers.
