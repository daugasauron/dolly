# Blender 5.3 in Dolly, stage 1: the headless build

- STATUS: OPEN
- PRIORITY: 150
- TAGS: blender,port,demo

Owner (2026-11-17): "would it be possible to compile and run blender in dolly?", then "Also start
this work in a separate agent, follow your plan it looks good." Research and the whole plan:
`work/research/blender-2026-11-17.md`. Stages 2 to 5 are the tasks `blender-2` to `blender-5`
(`tatr ls :blender`).

## State (2026-11-17)

In work on `ws/blender` (`work/blender`). The libraries are being built in a session (headless
Chrome on `cmake-build`, driven by `build/blender-dev/`, not committed); recipes follow what the
session proves.

Built in the session from the archives Blender 5.3.0 pins (`versions.cmake`), unchanged, by
their own CMake projects at four jobs (configure, build):

| Library | Time | Notes |
| --- | --- | --- |
| Imath 3.2.2 | 3 s, 6 s | |
| libdeflate 1.18 | 4 s, 3 s | |
| OpenJPH 0.25.2 | 1 s, 6 s | |
| OpenEXR 3.4.10 | 4 s, 79 s | its archive has one symbolic link, which Dolly's tar refuses: staged without |
| libtiff 4.7.1 | | `-Dlibdeflate=OFF`: its CMake package names a `Deflate::Deflate` target it does not export |
| robin-map 1.3.0, pugixml 1.10, expat 2.7.5, yaml-cpp 0.8.0, minizip-ng 4.2.2 | under 30 s each | expat's archive has one symbolic link |
| pystring 1.1.3 | | one source file, no CMake project |
| OpenColorIO 2.5.0 | 3 s, 188 s | `OCIO_USE_SIMD=OFF` |
| OpenImageIO 3.1.16.0 | 3 s, 230 s | patched, below; with its tools, as Blender's build names the `oiiotool` target |
| Eigen `8a1083e9`, Brotli 1.0.10, FreeType 2.14.3 with Brotli | under 15 s each | Dolly's `freetype` package is built without Brotli, and Blender's fonts are WOFF2 |
| oneTBB 2022.3.0 | 2 s, 20 s | as a generic Unix (`__unix__`); not yet run |
| Epoxy 1.5.10 | 10 s | its OpenGL dispatch alone, by its generator and `cc`: Blender's build requires it even with no OpenGL backend, and its Meson build is not needed for two sources |

All of them, from unpacking: 845 s in one session. Blender then configured (lite, headless,
Cycles on, no OpenGL or Vulkan backend, Python 3.14 from the `python` package).

Blender's first full pass (`make -k -j4`, about 80 minutes on a machine at load 40, Chrome at
3.5 GB): 2,838 units compiled, three sources failed, none of them for a missing interface:

- `makesdna/intern/dna_genfile.cc` and others use `fmt::appender`: Dolly's `fmt` package is
  7.1.3, Blender pins 12.1.0, which the build stage now builds for itself.
- `imbuf/intern/format_jpeg.cc` takes libjpeg's `boolean` as an integer, which it is in
  libjpeg-turbo (Blender's pin, 2.1.3) and not in the IJG library of Dolly's `libjpeg` package:
  the build stage builds libjpeg-turbo without SIMD.
- `blenlib/intern/storage.cc` picks `statfs` or `statvfs` by a list of systems:
  `demos/blender/blender-dolly.patch` adds Dolly to the `statvfs` ones.
- `blenlib/intern/expr_pylike_eval.cc` uses `FE_DIVBYZERO` and `FE_INVALID`, which C defines only
  where the flags exist; WebAssembly has none. The patch defines them as 0 there, so a driver
  expression's division by zero gives an infinity instead of an error.

**It links and starts** (11:39): a 166 MB program (158.4 MiB to prepare, 0.4 s), linked in 4 s;
`blender --version` prints `Blender 5.3.0` in the session. What the link needed:

- Cycles passes `-fno-trapping-math`, `-fno-signed-zeros`, `-freciprocal-math`, `-ffp-contract=on`,
  Blender `-ffast-math` (one file) and `-Wl,--version-script=` (ELF symbol versions): the filter
  leaves them out, for compiles and the link (`CMAKE_<LANG>_LINKER_LAUNCHER`).
- `PYTHON_LINKFLAGS` is `-Xlinker -export-dynamic` by default: `-rdynamic` here, with what
  libpython's built-in modules link (libffi, lzma, bz2, SQLite, curl).
- `libpython3.14.a` is not complete for a program that embeds it: CPython builds its HACL
  archives and its own expat beside it and installs neither, and the `python` package links
  SQLite and bzip2 without keeping their libraries. The build stage makes the seven archives
  with CPython's Makefile in the prepared tree the package was built from, and installs `sqlite`.
- CPython's expat renames its API but not two internal symbols, which OpenColorIO's expat
  defines too: the stage's expat is compiled with those two renamed (`-D`).
- FreeType's Brotli is not on Blender's link line outside its precompiled libraries
  (`BROTLI_LIBRARIES` is set empty): added through `CMAKE_EXE_LINKER_FLAGS`.
- OpenImageIO's static library needs pugixml: `WITH_PUGIXML=ON`.

Findings:

- `call_once` (C11 `threads.h`) links only with `-pthread`: OpenEXR's core uses it, so every
  library here is compiled and linked with `-pthread`.
- OpenImageIO names operating systems for its string and system helpers and stops at "No idea
  what platform this is"; the patch gives Dolly the branches upstream gives Emscripten, which
  are the plain libc ones (ten lines in all).
- Dolly's `tar` extracts only; `sed` has no `-i`; `grep` no `-A`.

- Dolly's `cc` refuses options it does not know. OpenImageIO passes `-Qunused-arguments` to every
  Clang. The build runs the compiler through a small filter
  (`CMAKE_<LANG>_COMPILER_LAUNCHER`) that leaves such options out; the driver accepting them
  belongs to a compiler round.
- OpenImageIO's `typedesc.h` assumes that an LP64 platform other than macOS and OpenBSD has
  `int64_t` as `long`. On WebAssembly it is `long long`: `demos/blender/openimageio-dolly.patch`
  adds `__wasm__` to that list (one line).
- The tree's images are the 0.1.7 release's and 90 of its recipes have changed since; `python`
  was rebuilt here (897 s with its closure's cache hits).

## Left

Blender's build (running in the session) and `blender -b --python-expr`. Then the recipes in `demos/blender/`, the test and the README.

## Done when

`demos/blender/test/blender-browser.mjs` runs `blender -b --python-expr` printing its version in
Chromium and Firefox, from images the recipes built.
