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
