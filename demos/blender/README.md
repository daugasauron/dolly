# Blender

Blender 5.3.0 from upstream's release archive, built inside Dolly by its own
CMake project, as the `blender` package: its window on the page, drawn by a
WebGPU backend of Blender's GPU module on `gpu@0`, and `blender -b` with its
Python and Cycles on the CPU. The stages and what is left are in the tasks
tagged `blender`.

## Images

- `blender`: Blender 5.3: its window on the page, drawn on `gpu@0` where the browser grants WebGPU, and `blender -b`, which runs Python scripts on scenes and `.blend` files and renders with Cycles on the CPU.
- `blender-deps`: A build stage: the libraries Blender links beyond Dolly's packages, at the versions it pins (OpenImageIO, OpenColorIO, OpenEXR, oneTBB, glslang and sixteen more).
- `blender-ui`: Blender's window on the page at once; quitting it leaves a shell.

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

## The window

`blender` without `-b` opens Blender's window on the page, where the browser
grants WebGPU; `blender-ui` opens it at once. Two parts of the port draw it:

- **A GHOST system for Dolly** ([`ghost/`](ghost)): one window at a time fills
  the page (`display@0`); keys, text, the pointer, the wheel and focus are
  `input@0`'s records as GHOST's events (letters by the layout's key, the rest
  by the key's place); the clipboard is `clipboard@0`'s; Blender's standard
  cursors are the page's CSS ones.
- **A WebGPU backend of Blender's GPU module** ([`webgpu/`](webgpu)), on
  `gpu@0`, as the Godot port's renderer is: Blender's GLSL, generated as its
  Vulkan backend writes it, is compiled to SPIR-V by glslang and translated to
  WGSL by `spirv-wgsl`; textures, buffers, pipelines and passes are `gpu@0`'s
  explicit records, every object counted in its quota. Frames are drawn into a
  texture of the window's own and drawn upright onto the page's surface.

The interface draws whole (widgets, text, icons, the splash's image), and the
3D view shows the default scene in Workbench's solid mode, with the selected
cube's outline, the floor grid and its axes, the camera, the light and the
navigation gizmo.

On the NVIDIA adapter, with the machine at load 15 to 20 (2026-11-18, 18:40),
the 3D view first drew 10.7 s after the command in Chrome and 11.8 s in
Firefox, most of it compiling some 300 shaders (glslang and the translation
run in the program); Blender's redraw timer gave the whole window 25.0 ms
(Firefox 15.4), the 3D view 0.9 ms (1.1) and its header 0.9 ms (0.7). At load
40 these were 20.9 s (32.1 s) and 43.7, 2.8 and 2.4 ms. A full redraw sends
about 0.7 MB of records, nearly all of it the frame's staged data.

What WebGPU leaves to the backend:

- Blender's GLSL is generated as for Vulkan; NaN, which WGSL cannot spell, is
  read from a private variable; `texture()` of an integer texture, which WGSL
  cannot sample, reads the texel at the point; a vertex shader stores its
  position once, at its end, as the translation negates its y.
- Normals are 16 bits a component: WebGPU has no signed 10-10-10-2 format.
- The largest texture's side is reported as a power of two: Firefox grants
  32,767 on NVIDIA, and Blender's font atlas, as wide as that, addresses its
  texels by a mask of it.

## Limits

- On Chrome's software adapter (SwiftShader) the floor grid draws only
  towards the horizon: SwiftShader drops a line that crosses the camera's
  plane, and the grid's lines reach the view's clip end. On the NVIDIA adapter
  Chrome draws the grid whole, with its axes, and Firefox draws such a line.
- Curves, point clouds, Grease Pencil and Gaussian splats do not draw (their
  shaders read a texel buffer, which WebGPU lacks); EEVEE is not tried.
- Where the browser grants no WebGPU, Blender says it found no GPU backend
  and quits; `blender -b` works everywhere.
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
  names, which the stage's expat is compiled without.
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
- **Three of Dolly's packages are not used.** FreeType is built again with
  Brotli (Blender's fonts are WOFF2), {fmt} at 12 (the package is 7), and
  libjpeg-turbo in place of IJG's library (Blender takes `boolean` as an
  integer).
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

[`test/blender-gpu-browser.mjs`](test/blender-gpu-browser.mjs) opens the
window on a hardware adapter (the private X display `DISPLAY` names, under the
GPU lock), reads its frame back (Firefox under Xvfb shows no WebGPU canvas),
draws words on the GPU against Blender's font library drawing them on the
CPU, times the redraws above and presses K, which its script's key map item
takes to quit.
