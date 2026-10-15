# Ghostty, the whole application, in an X11 window in Dolly

- STATUS: CLOSED
- PRIORITY: 80
- TAGS: graphics,demo,owner

Owner (2026-10-14): "There is no rational reason for this. I just want to
make it work because its cool." Dolly's terminal already is Ghostty's core
(libghostty-vt in `Dollyfile-ghostty-build`); this is Ghostty's GTK window
with its own renderer, running on Dolly's X server.

Done when `ghostty` opens a window on Dolly's X server and a shell runs in it,
with a browser test.

## Closed (2026-10-16, 05:30)

Built in a round and tested: `mesa-build`, `ghostty-gtk` (a package) and
`ghostty-x11` (an application) in `demos/ghostty-gtk/`, on branch
`integrate/ghostty` with `core/gtk-seed`, `core/zig-threads`,
`core/pty-master`, `demo/gtk`, `demo/zsh`. `ghostty-x11` opens Ghostty's
window on Xsdl in 4 s; `demos/ghostty-gtk/test/ghostty-x11-browser.mjs`
types a command through the X server into Ghostty's shell, ends the server
and reads the file it wrote: passed twice in Chromium and in Firefox (7 s
each, the tab's peak 2.2 GB). Evidence: `work/evidence-2026-10-16/ghostty-x11/`.

What the round found, beyond the session:

- Source archives hold files only: Mesa's and Ghostty's links, Ghostty's
  fuzzing corpus and SPIRV-Cross's test shaders (names too long for ustar)
  are left out in staging.
- GLib's recipe: its check lacked `<stdio.h>`; `COPYING` is a link to the
  licence. Mesa's check links by `c++` (libGL is partly C++). gtk-build's
  HarfBuzz builds its GObject library, which Ghostty's bindings link.
- Ghostty's tree takes the core's `config/ghostty-dolly.patch` first, then
  the application's, as the session's tree had.
- xmllint is not built: GLib's resource compiler would run it by fork. As
  root it finds no program on PATH without an execute bit, which Dolly's
  files do not carry; without it, it keeps the blanks of Ghostty's interface
  files and says so (as in the session).
- `threads@0` allows 32 Workers a process (64 in all, unchanged): GLib's task
  pool holds about 11 threads at startup, and in Firefox Ghostty's renderer
  and IO threads came at that peak, past 16, and its terminal failed with
  `EAGAIN` (`error.SystemResources`).

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

## Event loop, threads, Mesa, blueprints (2026-10-15, 13:50-15:00)

- libxev (Ghostty's event loop) has no backend for Emscripten. Added `poll`
  (`demo/ghostty-gtk` `18d9a63f`, `demos/ghostty-gtk/libxev-dolly.patch`):
  epoll's loop with its own registry of armed completions handed to poll(2);
  Async through a pipe; Process through a thread waiting in waitpid. Its
  check printed `XEV-POLL-OK` in a zig-llvm session.
- A threaded Zig program (`-fno-single-threaded`) did not start in Dolly:
  seven std bugs for Emscripten (`core/zig-threads` `aba5524d`, in the core
  Zig patch): musl's 128-byte sigset_t where Emscripten has two longs (so
  sigaction read the mask as flags), handlers typed int, the processor
  count through sysctlbyname, a guard page and an alternate signal stack per
  thread (Dolly refuses both: linear memory has neither), WasmAllocator as
  the page allocator (single-threaded only), a futex timeout that does not
  compile. Unbuilt: the next seed round rebuilds Zig and zig-llvm.
- Ghostty: `.single_threaded = false` on its executable (Zig makes wasm
  single-threaded by default; `demos/ghostty-gtk/ghostty-dolly.patch`), the
  core's Ghostty patch, `-Dapp-runtime=gtk` and Dolly's own FreeType,
  HarfBuzz, fontconfig, libpng and zlib (`-fsys=`), else GTK's static copies
  and Ghostty's collide. Its 38 Zig packages were fetched on the host (Zig's
  git fetch fails here with NameServerFailure; zigimg came as GitHub's
  tarball, whose hash matches).
- Mesa (`glx=xlib`, softpipe) configures in a session: Dolly's libxcb lacks
  the render and randr extensions Mesa requires (generated in the session;
  owed to `x11-build`), and Mesa requires `nm` even without tests (patched
  to `required : with_tests`). Its three grammars use Bison 3 directives
  byacc lacks, and its scanners flex 2.6 options reflex 2.5.4 lacks: host
  preparation runs the pinned Bison and flex, as Wine's does, and a patch
  points Meson at the outputs. Bison and m4 in Dolly would remove this.
- The `.ui` files: blueprint-compiler reads typelibs itself; PyGObject
  only names the search path (a 30-line patch: `GI_TYPELIB_PATH` and
  `/usr/lib/girepository-1.0`). Nothing in Dolly writes typelibs
  (gobject-introspection's scanner runs a dumper program and a Python C
  extension), so 15 come from Arch's packages of the same versions (gtk4
  4.24.1, libadwaita 1.10.0, glib2 2.90.1, pango 1.58.2, gdk-pixbuf2 2.44.8,
  graphene 1.10.8, harfbuzz 14.6.0, gobject-introspection-runtime 1.86.0): a
  bootstrap exception, data read at build time. On the host the patched
  compiler turned Ghostty's command palette into builder XML.

## Building Ghostty in a session (2026-10-15, 15:00-17:45)

- Mesa builds in a session in 8 minutes (`libGL.a`, 26.8 MB) with
  `demos/ghostty-gtk/mesa-dolly.patch` (`demo/ghostty-gtk` `53a3d777`): the
  parsers and scanners from host Bison and flex, `nm` and `dril` only where
  used (`dril` needs DRM), and `detect_os.h`/`os_misc.c` treating any other
  `__unix__` as POSIX. Meson gets `-D_GNU_SOURCE` (Mesa defines it only for
  systems it names). GLX works: `GL_VERSION 3.3 (Compatibility Profile) Mesa
  26.2.5`, softpipe, GLSL 3.30, `glXGetProcAddressARB` resolves.
- libepoxy finds GL by `dlopen`, which a threaded program cannot: patched to
  take the program's own `glXGetProcAddressARB` (weak) when the library does
  not open. Unrun until Ghostty's window.
- Ghostty's build in Dolly needed, beyond the patches above:
  `translate_c` reading `ZIG_LIBC` (`translate-c-dolly.patch`); Ghostty's
  wasm code paths that mean the browser's module taken only without libc,
  glslang multi-threaded (it locks a `std::mutex`), no `ghostty-vt` shared
  library and no `tic` on Emscripten, `pty.c` taking musl's headers,
  `Command.zig` starting the shell by `posix_spawn`, `-ldolly-pty`, and no
  `bzip2` (`ghostty-dolly.patch`); `-fsys=` for FreeType, HarfBuzz,
  fontconfig, libpng and zlib, HarfBuzz built with its GObject library;
  Zig std fixes (`core/zig-threads`: directory listing on Emscripten and
  `jitCmd` reading `ZIG_LIBC`); and 1024 descriptors a process
  (`core/gtk-seed` `e9d7abe8`: Zig holds a directory per module and failed
  with EMFILE at 256).
- The probe links Ghostty through a `cc` wrapper: Zig hands a link to `cc`
  without the program's flags, so GObject's cast emulation (`wasm-opt
  --fpcast-emu` after the link), the initial memory and Mesa's GLX
  (`-lGL`, `--undefined=glXGetProcAddressARB`) are added there. Owed: a way
  for the link to know (an object in GObject that records the need, as
  host-module clients record theirs, is the candidate).

## Ghostty runs (2026-10-15, 18:00-22:00)

Ghostty's GTK application ran on Xsdl in a session: libadwaita's window,
the OpenGL renderer on Mesa (GL 4.3 core by `MESA_GL_VERSION_OVERRIDE`,
shaders compiled by softpipe), `/bin/slop` on a pseudo-terminal, and a
command typed through the X server (an XTEST client in the session) answered
in the window. Screenshots and the session's scripts:
`work/evidence-2026-10-15/ghostty-x11/` (`ghostty-typed.png`).

What it took after the build, in order met:
- Zig: no libc++/libunwind of its own for Emscripten (cc links Dolly's),
  `std.c.T` and `HOST_NAME_MAX` for Emscripten, and link errors reported
  (a failed `cc` link had counted as success) (`core/zig-threads`
  `0027eddf`; the link-error part type-checked on the host only).
- Ghostty (`demo/ghostty-gtk` `ed98efd1`): Emscripten in its platform
  switches; no GTK pre-exec hook (no fork); Dear ImGui's GL backend for
  desktop GL; GTK's GL context through `glXGetProcAddressARB` (glad opens
  `libGL.so.1` otherwise); the shell's signals reset by spawn attributes,
  without which Dolly's `posix_spawn` refuses (`ENOTSUP`) because Ghostty
  ignores `SIGPIPE`.
- libadwaita static: five GTK builder helpers it copies renamed at its
  build (`-D_gtk_builder_check_parent=adw_gtk_builder_check_parent` and the
  rest); its UI and stylesheet resources kept by exporting
  `adw_get_resource` and `adw_stylesheet_get_resource` (wasm-ld runs a
  constructor only of an object something keeps; `--undefined` extracts but
  does not keep).
- libepoxy with EGL as well as GLX (GTK refers to EGL; at run time it only
  probes for libEGL). `xmllint` (libxml2 2.13.5, static) for GLib's
  resource compiler.
- pty: termios on a master reaches the pair's mode, as on Linux; Ghostty
  sets `IUTF8` through the master (`core/pty-master` `952a09de`, pty and
  tmux tests pass in both browsers). The session ran on the older kernel
  with that step made non-fatal in Ghostty.
- A long session runs out of memory: the filesystem is in Wasm memory, and
  this one held 5 GB of build trees; Ghostty's 16 MiB thread stacks and
  `zig` itself then failed to start (`EAGAIN`, "Out of memory"). Removing
  the build trees fixed it. Recipes should delete their build trees.

