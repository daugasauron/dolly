# Ghostty's GTK application on Ghostty 1.4: its OpenGL renderer needs Mesa's EGL

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: graphics,demo,zig

Found by the Zig 0.17 upgrade (`tasks/20261103-102041-zig017`), which moves Dolly's terminal to
Ghostty v1.4.0, the first release that builds with Zig 0.17 (no Ghostty commit builds with both
0.16 and 0.17: `minimum_zig_version` went from 0.16.0 to 0.17.0 in one merge, `3d07ef9e`,
2026-10-20).

`demos/ghostty-gtk` builds Ghostty's GTK application with `zig-llvm` over Mesa's GLX on Xlib with
softpipe (`Dollyfile-mesa-build`: `-Dglx=xlib -Degl=disabled`), and its `ghostty-dolly.patch` loaded
GTK's GLX context through `glXGetProcAddressARB`. Since ed350cbb ("renderer: share render
device state across renderers", 2026-09-29) Ghostty's OpenGL renderer makes its own EGL context per
surface (`src/renderer/opengl/Device.zig`: `EGL_PLATFORM_SURFACELESS_MESA`, or GTK's EGL display
when it has one, 4cd0eb5c), so Ghostty 1.4 on Dolly needs Mesa's EGL: the surfaceless platform with
softpipe, built static into the program as the GLX is now. The demo's patch needed a rebase too:
on v1.4.0 plus the core's patch, 7 of its 22 files were rejected even with fuzz. The Zig 0.17
branch rebased them by hand (the GLX context hunks dropped) and mapped `zig-packages.txt` to
v1.4.0's packages, so the staging runs; nothing of it was built in Dolly (no `zig-llvm` on LLVM
22 then, no EGL), so `ghostty-gtk` and `ghostty-x11` are expected to fail until this is done.

Mesa 26.2.5 refuses EGL beside the Xlib GLX the demo builds: "EGL requires DRI, but GLX is being
built with xlib support" (`meson.build:563`; EGL requires DRI, Haiku, Windows or Android, :562).
So the step is Mesa's DRI frontend with softpipe for both GLX and EGL (swrast over X11, the
surfaceless platform for Ghostty), which loads its gallium driver library at run time (`dso@0`,
which `ghostty-gtk` already requires), not a flag beside the current build. In that tree, EGL
turns DRI on only where the system has KMS/DRM (`with_dri`, `meson.build:364`; `-Dglx=dri` turns
it on regardless, :535), and the driver is `libgallium_dri`, a `shared_library`
(`src/gallium/targets/dri/meson.build:42`) that the loader opens with `dlopen`
(`src/loader/loader.c:899`).

Done when `ghostty-x11` opens Ghostty 1.4's window on Dolly's X server with a shell in it, in
Chromium and Firefox (`npm run test:demos -- ghostty-gtk`), with Ghostty's renderer drawing through
Mesa's EGL and softpipe, and no GLX context loaded by hand.


## clang out of memory on glslang's SPIRV/doc.cpp (2026-11-04)

`work/integrate`'s round failed `ghostty-gtk` at 10:36 (three images in parallel) and again at
11:37 with it building alone: `SPIRV/doc.cpp: clang terminated with signal ABRT`, `LLVM ERROR:
out of memory`, `Buffer allocation failed` (LLVM's `allocate_buffer`: `operator new` returned
null), in `zig build-lib ... -OReleaseFast` of Ghostty's `pkg/glslang`.

Measured on the host with the host's Zig 0.17.0 (clang 22.1.8), the recorded clang command for
wasm64-emscripten (`build/ghostty-evidence/native/`, 8 GB scope, `/usr/bin/time -v`):

| clang 22 on doc.cpp | peak RSS | time |
|---|---|---|
| `-O2 -gdwarf-4` (Zig's) | over 8.2 GB (killed at 8.4 GB in `zig build-lib`) | 7.8 s |
| x86_64-linux target, same flags | 8.2 GB | 7.8 s |
| `-O2 -g0` | 904 MB | 6.6 s |
| `-O2 -gdwarf-4 -Xclang -fexperimental-assignment-tracking=disabled` | 1,078 MB | 8.1 s |
| `-O2 -gdwarf-4`, IR only (`-emit-llvm`) | 447 MB | 3.6 s |
| `-O1 -gdwarf-4` | 138 MB | 1.0 s |
| Zig 0.16.0 (clang 21.1.0), same flags | 137 MB | 1.2 s |

- Under `ulimit -v 3000000` with `-mllvm -debug-pass=Executions`, the last pass before the failure
  is `Assignment Tracking Analysis` on `spv::Parameterize()::$_0::operator()`, the lambda that
  fills the instruction tables (1,211 `OperandParameters::push` calls).
- The cause is libc++ 22's headers, which Zig 0.17 bundles, not clang 22's optimizer: clang 22
  with Zig 0.16's libc++ 21 headers makes the same lambda as clang 21 (1,885 IR lines, one
  block, 1,211 calls of `push`). With libc++ 22 (`vector::emplace_back`'s slow path now a separate
  lambda) `push` is inlined at every call: 89,077 IR lines, 7,266 blocks, 8,477 lifetime markers.
  LLVM's assignment tracking (on by default at -O1 and above with -g) keeps per-block state for
  every inlined variable, so its memory grows with blocks times variables; its only cutoff,
  `-debug-ata-max-blocks`, is 10,000 blocks.
- A Dolly process has at most 8 GiB (`abi/dolly-process-0.wat`, 131072 pages; `zig` declares
  cc's default, `src/compiler.cpp` `--max-memory=8589934592`), so malloc returns null there.
- Not the cause: the spawn budget (`src/process-supervisor.mjs`, 4 GiB of committed memory)
  only admits or delays a spawn; each `zig clang` is its own process with its own memory
  (`evalZigLlvmProcess`), so Zig's parallel jobs (4: `emscripten_num_logical_cores`) do not
  share it, and it failed with the image building alone.
- That debug information is never kept: Ghostty strips its executable at ReleaseFast
  (`src/build/Config.zig`, `strip` defaults true for fast and small), its packages' modules
  set no `strip`, so Zig compiles them with `-gdwarf-4`, and Dolly's link of a program without
  `-g` passes `--strip-debug` (`src/compiler.cpp`; Zig's `emscriptenLink` passes no `-g`).

The fix: glslang's module strips where Ghostty strips its program (`ghostty-dolly.patch`,
`.strip = optimize == .fast or optimize == .small` beside the hunk's `single_threaded`): the
compile no longer computes variable locations nobody keeps, at no cost to the code. Not a lower
optimisation or job count, and not a larger process: 8.2 GB of variable locations for one
table-filling function is not a setting to make room for.

## blueprint-compiler 0.20, or Ghostty's release tarball (2026-11-04)

The same build (`catalog-heavy.log`) failed a second step: Ghostty 1.4's `gtk_blueprint_check`
wants blueprint-compiler 0.20.0 or newer "when building from a Git checkout"; the recipe built
0.18.0. Since 0.20 (NEWS.md: "now uses libgirepository to load typelib information, rather than
a custom parser") blueprint-compiler needs PyGObject and libgirepository, which Dolly has neither
of; 0.18's own typelib reader was what the demo's patch relied on.

Ghostty's `PACKAGING.md` asks everyone but its developers to build from its release tarball,
which carries the compiled GTK resources (`src/apprt/gtk/ghostty_resources.c` and `.h`) and the
frame data, and its build uses them when they exist outside a Git checkout
(`src/build/GhosttyDist.zig`, `Resource.path`). `ghostty-1.4.0.tar.gz` is the pinned commit
(83fb956) plus those three files and `VERSION` (`diff -r` against the checkout; minisign
signature verified with the key in `PACKAGING.md`). `prepare-ghostty.sh` now stages it, and
blueprint-compiler, its patch and the Arch Linux typelibs (a bootstrap exception) are gone.

## Mesa's EGL (2026-11-04)

In Mesa 26.2.5 libEGL and libGL link the gallium driver library (`src/egl/meson.build`:
`link_for_egl += libgallium_dri`); only GBM opens one with `dlopen` (`src/gbm/main/backend.c`).
So no `dso@0` loading is needed: libEGL and `libgallium_dri` become static libraries linked
into the program, as the Xlib libGL was (`shared_library` to `library`, and the driver's
`name_suffix : 'so'` dropped). EGL needs DRI, which Meson turns on only with KMS or
`-Dglx=dri`; the patch lets a software driver have it (`with_gallium_swrast`), which is the
configuration a Linux EGL-only softpipe build gets. Two more hunks, each found by a build: the
DRI frontend's `dri_util.c` calls `dri2.c`, which Meson compiles only for a DRM-like DRI platform
(`with_dri2`), so with the `none` platform libEGL did not link (11 undefined symbols, all in
`dri2.c`); Dolly (Meson's `host_machine.system()` is `dolly`, from `uname`) gets GNU Hurd's
`pseudo-drm`, DRI without the kernel's DRM and without libdrm.
And Mesa's DRM uapi `drm.h`, which `drm_fourcc.h` includes, takes `<sys/ioccom.h>` everywhere
but Linux and GNU; musl has the ioctl encoding in `<sys/ioctl.h>`, as GNU has, so `drm.h` takes
that where `<sys/ioccom.h>` does not exist (`__has_include`). No GLX and no X11 platform: Ghostty renders
offscreen on the surfaceless platform and hands GTK the pixels (`OpenGL.present`: a dmabuf when
the apprt can take one, otherwise `glReadPixels`), and GTK draws with cairo; libepoxy's
`dlopen` of libEGL or libGL fails in a static program, so GDK has no GL display to offer
Ghostty (`renderDeviceOptions`), which takes the surfaceless one. libepoxy's rebuild and patch,
and the xcb render and randr bindings Mesa's GLX linked, are gone. `mesa-build` ends with a
program that clears a renderbuffer through EGL and softpipe and reads the pixel back.

## Ghostty 1.4's compile for Dolly (2026-11-04)

With Mesa's EGL in place, the executable's Zig compile failed with three errors (`build-5.log`):

- `std/Io/Threaded.zig:960`: `comptime assert(builtin.cpu.has(.wasm, .atomics))`. On Emscripten
  Zig 0.17 waits on a futex with wasm's `memory.atomic.wait32`, so threaded code needs the
  `atomics` feature; without it Zig would also lower atomic operations to plain ones in a
  program whose threads share memory. The executable's modules were compiled
  `-mcpu baseline+simd128`: Ghostty adds `simd128` to the query when none names a CPU
  (`src/build/Config.zig`), and that resolves Zig's wasm baseline, `lime1`, without atomics.
  Dolly's `native` is the CPU `zig` itself was built for (`zig-0.17.0-dolly-llvm.patch`;
  zig2 is generated `-mcpu=generic+atomics`), which is why plain `zig build-exe
  -fno-single-threaded` works: the zig-llvm demo's test, threaded program included, passed on
  Zig 0.17 in Chromium (199.7 s) and Firefox (241.2 s), 2026-11-04. Dolly's `cc` compiles every
  program for LLVM's `generic` plus `atomics` (`src/compiler.cpp`), since every process
  imports a shared memory; the recipe asks Zig for the same with Ghostty's addition,
  `-Dcpu=generic+atomics+simd128`.
- `pkg/opengl/egl.zig:99`: `EGL_DEFAULT_DISPLAY` is a `c_int`: Khronos's `eglplatform.h` gives
  `__EMSCRIPTEN__` the browser's integer handles, and Dolly's toolchain defines it (Emscripten's
  libc) though its EGL is Mesa's. `EGL_NO_PLATFORM_SPECIFIC_TYPES`, which the header checks first,
  makes them `void *`, the pointers Ghostty passes: one `extra_args` define in the translation of
  `pkg/opengl` (`ghostty-dolly.patch`).

## Built in 9 GB; Ghostty's frame called a null function (2026-11-04)

The integrator gave `bigbuild` (9 GB). `ghostty-gtk` built in 710 s (`build-7.log`, its scope's
`memory.peak` 7.21 GB with page cache, anonymous memory sampled every 10 s from 13:21 at most
5.68 GB; the 6 GB slot had killed it at 6.26 GB), `ghostty +version` printing 1.4.0, so
glslang compiles in Dolly with the fix. `ghostty-x11` then opened its window, but no prompt came.

A temporary image whose init kept Ghostty's output in a file showed EGL and OpenGL up (`EGL
vendor=Mesa Project`, `loaded OpenGL 4.3`, the shell started), then `dolly: process 106 failed:
null function`: Ghostty itself. A C program in `mesa-build` doing what Ghostty does for a frame
(`OpenGL.present`: blit, `eglCreateImage` of the texture, `eglExportDMABUFImageQueryMESA`) traps
at the query. Mesa built without libdrm, as Dolly's and GNU Hurd's are, neither advertises
`EGL_MESA_image_dma_buf_export` nor gives its dri2 driver the functions (`egl_dri2.c`, under
`HAVE_LIBDRM`), and the entry point only `assert`s the extension (compiled out) before calling
`disp->Driver->ExportDMABUFImageQueryMESA`. Ghostty calls it on every frame without checking
the display's extensions, which EGL leaves to the application. The fix is Ghostty's: the
device records whether its display has the extension, and `present` exports only then
(`ghostty-dolly.patch`, `Device.zig` and `OpenGL.zig`). Without the export Ghostty also skips
the full-frame blit it made before each attempt, which softpipe shades pixel by pixel.

## Closed (2026-11-04)

Done when `ghostty-x11` opens Ghostty 1.4's window on Dolly's X server with a shell in it, in
Chromium and Firefox, drawing through Mesa's EGL and softpipe, with no GLX context loaded by
hand: on `demo/ghostty-egl` at `6e572f129`,
`node demos/ghostty-gtk/test/ghostty-x11-browser.mjs chromium firefox` passed (window and Slop's
prompt in 4 s and 6 s, the typed command run, amy found) and `npm run test:demos -- ghostty-gtk`
passed in Chromium. Ghostty logged `EGL vendor=Mesa Project` and `loaded OpenGL 4.3` on the
surfaceless display; Mesa is built with softpipe alone and no GLX. A key's echo takes 46 ms in
Chromium and 44 ms in Firefox (median of 15). Both failures of the round of 4 November are
fixed: the clang out-of-memory (glslang stripped) and blueprint-compiler (the release tarball).
The round must rebuild `mesa-build`, `ghostty-gtk` and `ghostty-x11`; `ghostty-gtk` needs more
than a 6 GB build slot (killed at 6.26 GB of anonymous memory) and built in a 9 GB one in 710 and
752 s, sampled anonymous peak 5.68 GB.

## Lessons

- An out-of-memory inside Dolly is first a question for the host: the recorded `zig clang`
  command, run by the host's Zig 0.17 under `/usr/bin/time -v`, reproduced it in 8 s where a
  Dolly build cycle takes 10 to 20 minutes, and bisecting flags, then compilers (Zig 0.16's
  clang 21), then headers (clang 22 over libc++ 21's) found the cause in about 15 minutes. The
  limits the brief named (process memory, spawn budget, parallel jobs) were innocent; the
  compiler's own analysis was not.
- Read a library's build targets before planning how it loads: the task assumed EGL `dlopen`s
  `libgallium_dri` (a `dso@0` port); Mesa 26's `src/egl/meson.build` links it. And read what
  Meson sees: inside Dolly `host_machine.system()` is `dolly` (from `uname`), not
  `emscripten`, which one guessed hunk cost a nine-minute cycle.
- Check an upstream's packaging guidance before porting its developer tools: Ghostty's release
  tarball removed blueprint-compiler, its patch and the typelibs taken from Arch Linux, where
  blueprint-compiler 0.20 would have needed PyGObject and libgirepository.
- A scope's `memory.peak` counts page cache: Mesa's build reached the slot's 6 GiB with 2.8 GB
  of anonymous memory and lived. Sample `memory.stat`'s `anon` to know what a build needs, and
  find the scope by its processes' working directory: a browser test in the same tree is a
  second scope that the sampler latched onto once.
- When a program dies with `null function` and its binary has no names, reproduce its calls in
  a small C program in the build stage, printing before each: Ghostty's per-frame EGL sequence
  pointed at one call in two minutes, where mapping function indices was hopeless.
