# Blender

Blender 5.3.0 from upstream's release archive, built headless inside Dolly by
its own CMake project, as the `blender` package: `blender -b` with its Python
and Cycles on the CPU. The plan beyond it (the interface, a WebGPU backend for
Blender's GPU module) is in the tasks tagged `blender`.

## Images

- `blender`: Blender 5.3 without its interface: `blender -b` runs Python scripts on scenes and `.blend` files, and Cycles renders on the CPU.
- `blender-deps`: A build stage: the libraries Blender links beyond Dolly's packages, at the versions it pins (OpenImageIO, OpenColorIO, OpenEXR, oneTBB and ten more), over the packages of FreeType with Brotli, libjpeg-turbo, libtiff, expat and {fmt}.

## Use

```sh
blender -b --python-expr 'import bpy; print(bpy.app.version_string)'
blender -b scene.blend -E CYCLES -o //frame_ -F PNG -f 1
blender -b --python script.py -- arguments
```

- Without a file, Blender starts on its default scene: a camera, a cube and a
  light.
- Python is the `python` package's CPython 3.14 (Blender asks for 3.13 at
  least), linked into the program; `bpy`, `mathutils`, `bmesh` and the rest
  are built in. `sys.platform` is `"dolly"`.
- Cycles renders with its scalar kernel and its own BVH, on as many threads
  as `-t` says (four by default, through oneTBB; `threads@0`). The default
  scene at 1920 by 1080 and 64 samples took 14.4 s on four threads and 50.7 s
  on one, in Chrome on a machine at load 40; Blender's own Linux build, with
  its AVX2 kernel and Embree, took 8.8 s and 32.0 s there at load 10
  (2026-11-17; the two were not measured under the same load).
- Images are written as PNG, JPEG, TIFF and OpenEXR (OpenImageIO), with
  OpenColorIO's colour management.

## Limits

- No interface: the program is built with `WITH_HEADLESS` and neither an
  OpenGL nor a Vulkan backend, so EEVEE and Workbench, which draw on a GPU, do
  not render. Cycles on the CPU is the renderer.
- It is linked through cast emulation (below), so it loads no Python extension
  module: `import numpy` inside Blender fails, and with it the add-ons that
  need NumPy (glTF), and `import ctypes` fails with `MemoryError`, as such a
  program gets no closures. What lifts this is in the
  [task](../../tasks/20261116-230506-blender-2/TASK.md).
- Left out, each by upstream's option: OSL, Embree, the denoiser, path
  guiding, volumes (OpenVDB), USD, Alembic, sound and video, the fluid and
  rigid-body solvers, translations (upstream's `blender_lite.cmake`).
- A driver expression's division by zero gives an infinity instead of an
  error: WebAssembly has no floating-point exception flags.

## Building

[`Dollyfile-blender-deps`](Dollyfile-blender-deps) builds twenty libraries from
the archives Blender pins ([`build-sources.txt`](build-sources.txt)), each by
its own CMake project; [`Dollyfile-blender`](Dollyfile-blender) then configures
Blender with upstream's `blender_lite.cmake`, Cycles on, and builds it with
Make at four jobs. What the platform decided:

- **Options `cc` refuses.** Dolly's `cc` stops at an option it does not know.
  [`ccfilter.c`](ccfilter.c) runs it without the eight that these projects
  pass to every Clang (Cycles' floating-point permissions, ELF's symbol
  versions and others; each has its reason there), as CMake's compiler and
  linker launcher.
- **Threads.** Everything is compiled with `-pthread`; C11's `call_once`,
  which OpenEXR uses, links only so.
- **Function pointer casts.** Blender defines hundreds of Python methods that
  take no arguments with one parameter; CPython calls them with two, which
  WebAssembly traps on. The program is linked with `cc --dolly-cast-emulation`
  ([process model](../../docs/process-model.md)).
- **libpython for a program that embeds it.** CPython builds its HACL archives
  and its own expat beside `libpython3.14.a` and installs neither: the build
  stage makes them with CPython's Makefile in the prepared tree the `python`
  package was built from. That expat and OpenColorIO's share two symbol
  names, which the `expat` package renames.
- **This libc++.** Two upstream sources depend on how an older libc++ behaved:
  Cycles' `StackAllocator` hands out storage inside the allocator, which a
  vector that grows through a copy of its allocator does not survive, and
  OpenImageIO's `ustring` writes `std::string`'s fields by an old layout. Each
  patch takes the plain path (two lines, one line).
- **Systems named in sources.** OpenImageIO chooses its string and system
  helpers by a list of systems, as Blender does `statvfs`: the patches add
  Dolly beside the systems whose plain libc paths it shares
  ([`openimageio-dolly.patch`](openimageio-dolly.patch),
  [`blender-dolly.patch`](blender-dolly.patch)).
- **FreeType reads Brotli** (Blender's fonts are WOFF2), and JPEG is
  libjpeg-turbo's (Blender takes `boolean` as an integer): the packages'.
- **Epoxy** is required by Blender's build even with no OpenGL backend: its
  dispatch is built from its generator and two sources, without Meson.

The stage ends by linking and running an interpreter with the options
Blender's link gets, so a library the `python` package stops bringing fails
there and not after an hour of compiling. Each library's licence files are in
`/usr/share/licenses/blender`, Blender's own notices in
`/usr/share/doc/blender/license`.

In Chrome on a machine busy with other builds (2026-11-17), `blender-deps`
built in about 11 minutes (OpenImageIO 197 s, OpenColorIO 90 s) and `blender`
in 4,562 s, of which `make -j4` took 4,356 s for 2,838 units; the build's
Node and Chrome peaked at 6,590 MiB, the kernel held 1,976 MiB at the end.
The program is 124 MB, its data 68 MB, the package 177 MB.

Test: [`test/blender-browser.mjs`](test/blender-browser.mjs) installs the
package into `default`, runs a script on the default scene (a mesh added and
arrayed, a `.blend` saved and loaded) and renders it with Cycles to a PNG
whose size and pixels it checks, in Chromium (16.3 s) and Firefox (18.1 s).
