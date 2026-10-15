# Ghostty, the whole application, in an X11 window in Dolly

- STATUS: OPEN
- PRIORITY: 80
- TAGS: graphics,demo,owner

Owner (2026-10-14): "There is no rational reason for this. I just want to
make it work because its cool." Dolly's terminal already is Ghostty's core
(libghostty-vt in `Dollyfile-ghostty-build`); this is Ghostty's GTK window
with its own renderer, running on Dolly's X server.

Done when `ghostty` opens a window on Dolly's X server and a shell runs in it,
with a browser test.

## State (2026-10-15, 09:10): X11 runs; Ghostty's build.zig builds libghostty-vt; GTK is next

Each step needs the one before it; details from memory are marked.

1. X11 on Dolly: done and on `main` (`demos/x11`, [windows](../20261014-211501-windows/TASK.md)):
   Xsdl, twm, xclock, xeyes, xterm, and SDL2 programs through SDL's X11
   driver (`imgui-x11`).
2. GTK on X11: a GTK3 application, then GTK4 and its libraries built inside
   Dolly. Ghostty's Linux front end is GTK4 (from memory). The X11 port's
   estimate (not tried): GLib, cairo, pango, harfbuzz, fribidi, fontconfig,
   gdk-pixbuf and libepoxy with Meson; xcb render/shm, Xrandr, Xcursor,
   Xinerama, Xcomposite and Xdamage; `threads@0` for GLib; RandR in the
   server's SDL output. The likely long pole is calls through function
   pointers of another type, which trap in WebAssembly: GObject's signal
   handlers, and SDL's own `XFixesSelectSelectionInput` already did
   (`imgui-x11` builds SDL without XFixes). That needs patches or a
   cast-emulating option in Dolly's toolchain, a core decision. GLib needs
   libffi: Dolly has one already (corrected 2026-10-15): CPython's
   `demos/python/libffi-dolly.c` makes calls and closures through dso@0's
   FFI operations, and ctypes callbacks pass in the Python test. GObject
   needs only `ffi_call` (`gobject/gclosure.c`, GLib 2.86.0), so the step
   is to make that libffi a package of its own. Precedent: QEMU's Emscripten port (2025) builds GLib for wasm64 and
   replaced GLib calls that cast function pointers (`g_list_sort` and
   others); GLib's issue is #3596, and wasm-vips keeps a fork (searched
   2026-10-15).
3. OpenGL without a GPU: Ghostty's renderer needs OpenGL 4.3
   (`MIN_VERSION_*` in `src/renderer/OpenGL.zig` at the pinned commit; read
   2026-10-15), drawn in GTK's `GtkGLArea`. Mesa's software "xlib" driver does GL in the client and sends
   finished frames as images, so the X server needs no GL (from memory,
   unchecked), with softpipe as the rasterizer: llvmpipe generates machine
   code at run time, which a Wasm process cannot run.
4. Ghostty: `zig build` runs in Dolly ([Zig with LLVM](../20261014-234000-zig-llvm/TASK.md),
   package `zig-llvm`). Upstream's unmodified `build.zig` at the pinned
   commit, `zig build -Demit-lib-vt=true` in a session (scratch probe in
   `work/zig`, 2026-10-15 05:25), built `zig-out/lib/libghostty-vt.a`
   (20.7 MB, Debug) in 127 s: the build runner, uucode's table generator,
   translate-c and the library, all compiled by Zig in Dolly. The packages
   (uucode and six lazy ones) were fetched on the host into the project's
   `zig-pkg/`: a session reaches no network but the broker, and Zig's own
   fetch fails there with NameServerFailure. The step that failed is
   Ghostty's browser module (`ghostty-vt.wasm`, "unsupported arch" in
   `std/start.zig`), which Dolly does not need. Fixed on the way, in the
   demo's Zig patch (on `main`, `8edcaa0d`): a file placed without
   replacing (Dolly has no hard links), the compiler's stack (48 MB, as
   upstream), Emscripten's `NAME_MAX`. Next: the GTK application, with its
   C dependencies compiled by Zig.
   Threads exist (`threads@0`) for its renderer and IO threads.
5. What Ghostty's GTK front end needs at the pinned commit (read
   2026-10-15): GTK4 and libadwaita, both linked unconditionally; from a
   git checkout, `blueprint-compiler` 0.16 or newer for its `.ui` files
   (release tarballs ship them generated), which reads the Gtk and Adw
   typelibs; `src/Command.zig` starts the shell with `fork`, which Dolly
   has not, so it needs a spawn path; its event loop is libxev (which
   backend serves Emscripten is not checked). Size: GLib, the X11 client
   libraries GTK4 uses, cairo, pango, harfbuzz, fribidi, fontconfig,
   freetype, pixman, graphene, libepoxy, gdk-pixbuf, GTK4, libadwaita, Mesa
   and Ghostty's patches. This is the largest port Dolly has taken on;
   each library is a step that can be verified on its own.

## GLib in Dolly (2026-10-15, 09:00-10:30, probe in `work/gtk`)

- GLib 2.90.1 with PCRE2 10.49 (a Makefile over its generic config)
  configures, compiles and installs in a session of `xorg-server-build`
  (`meson compile` 151-190 s, 494 steps). It needed one GLib patch
  (`g_unix_fd_query_path` has an `#error` for platforms it does not know;
  Dolly's answer is "not supported", as Hurd's) and three things libc lacks,
  stubbed in the probe and owed to the next seed round: `res_query` (no name
  server: fails with `NO_RECOVERY`), `pthread_getname_np` in the threaded
  libc (declared, not defined), `in6addr_loopback` (`in6addr_any` is
  defined).
- A GLib program is threaded and GObject's generic marshaller calls through
  libffi, which is dso@0's: "a program using threads@0 cannot use dso@0".
  Decided and done on `core/ffi-threads`: dso@0 serves each thread's Worker
  of a threaded program; a call works in any thread (it reads the same table
  entry in every Worker), loading and closures are refused there (`ENOTSUP`),
  since a table entry added in one Worker is missing in the others.
- Then every GObject program traps with "function signature mismatch":
  `G_DEFINE_TYPE` registers `class_intern_init (gpointer)` and `init (Self *)`
  as `GClassInitFunc`/`GInstanceInitFunc`, which take two arguments, and C
  code throughout GLib, GTK and libadwaita calls handlers and callbacks of
  fewer parameters through casts (`G_CALLBACK`, `(GFunc) g_object_unref`,
  `g_list_sort`). Decided: GObject programs are linked with Binaryen's
  function-pointer cast emulation (`wasm-opt --fpcast-emu`: every indirect
  call goes through one canonical signature and every table entry through a
  thunk), not patched cast by cast. Measured: wasm-opt 132 rewrites a Dolly
  wasm64 program and keeps its `dolly.process` sections. Owed: Binaryen
  built in Dolly, the step in the toolchain, and dso@0's FFI calling such a
  program in the canonical signature.
- Binaryen 133 builds in Dolly with its own CMake (`cmake` package in a
  `xorg-server-build` session, `--target wasm-opt` in 461 s at `-j4`, 24 MB),
  after removing two flags Dolly's `cc` refuses (`-fno-omit-frame-pointer`,
  `-fuse-ld=lld`: the next round's seed gaps). It runs single-threaded
  (`BINARYEN_CORES=1`).
- Measured in one session (11:00): GLib's check program, linked as usual,
  traps; passed through `wasm-opt --fpcast-emu` it runs: a `G_DEFINE_TYPE`
  class, a signal to a handler of fewer parameters than the signal passes,
  `g_list_sort` through its cast, a GThread, a main loop with an idle and a
  timeout, and GIO reading a file ("GLIB-CHECK-OK"). Next: dso@0's FFI must
  call a cast-emulated program's table entries in its signature (every
  argument an i64: i32 and f32 bits zero-extended, f64 bits; 16 of them; an
  i64 result), which GObject's generic marshaller needs.

## GTK 4 in Dolly (2026-10-15, 11:00-13:20, session probes in `work/gtk`)

- Every library under GTK builds in a session of `xorg-server-build` with
  the `cmake` package: FreeType, FriBidi, HarfBuzz, expat, gperf 3.1,
  fontconfig 2.18.3, libpng, libjpeg-turbo, libtiff, pixman, cairo (Xlib),
  five X extension libraries, graphene, libepoxy, gdk-pixbuf (PNG and JPEG
  built in) and pango 1.58; then GTK 4.24.1 with its X11 backend alone
  (1062 build steps). A GTK hello (window, label, button), cast-emulated,
  ran on Xsdl in the session: "GTK-HELLO-PRESENTED", alive until killed 25 s
  later, with GModule's and D-Bus's expected warnings. A screenshot is owed
  (a fresh session rebuilding everything runs from 13:05).
- Found on the way, each fixed or decided:
  - seed (`core/gtk-seed`, unbuilt): libc `res_query`, `in6addr_loopback`,
    threaded `pthread_getname_np`, SysV shm refusals, and (still to commit)
    `pthread_getaffinity_np`, `__sched_cpucount` and `ftw` (musl's casts its
    callback to nftw's type, which traps: Dolly's calls through an adapter);
    `cc` takes `-fno-omit-frame-pointer` and `-fuse-ld=lld`, preprocesses
    `-E -c` as Clang does, and links with `--dolly-cast-emulation` (wasm-opt
    `--fpcast-emu`, 32 parameters: GTK has an indirect call of 17); GLib's
    `gobject-2.0.pc` asks for it, so every GObject program a build runs
    (gdk-pixbuf's loader query) is emulated. Still open: `cc`'s fixed 16 MiB
    `--initial-memory` (FriBidi's table generator needs 37 MB; its recipe
    passes a larger one), `/usr/bin/env` (GLib's scripts are rewritten to
    `/usr/bin/python3`), and Slop's `test -shared = -o` ("unsupported
    expression"; POSIX makes three arguments with `=` a comparison).
  - FFI (`core/ffi-threads`): a cast-emulated program's thunk width comes
    from its table (16 or more), and the FFI pads each call to it.
  - patches: fontconfig's `fcstat.c` names `__dolly__` beside Linux and
    Emscripten; GTK's library follows `default_library` (upstream always
    builds it shared; a threaded program loads no library).
  - Dolly's own `EGL/eglplatform.h` (an `int` window type) conflicts with
    GTK's X11 EGL code: `gtk-build` installs Khronos's headers from Mesa.
- Recipes on `demo/gtk` (`work/gtk-code`, `f404cbea`): `pcre2`, `glib`,
  `libffi` (out of Python's recipe), `binaryen` (tools) and the toolchain
  `gtk-build`; they build in the next seed round.
- Next: Mesa with `glx=xlib` and softpipe for Ghostty's GL. softpipe offers
  GLSL 4.00 and Ghostty asks for 4.3 (Mesa's version overrides, if the
  features it uses are there); llvmpipe generates machine code at run time,
  which a Wasm process cannot run. Mesa's GLSL grammars need GNU bison and
  flex, which need configure scripts: generated on the host while staging,
  as Wine's parsers are. Then libadwaita 1.10 and Ghostty's own GTK build.
