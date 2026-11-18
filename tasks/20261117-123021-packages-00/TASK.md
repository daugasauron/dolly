# Candidates for packages decided against

- STATUS: CLOSED
- PRIORITY: 90
- TAGS: packages,audit

The pass over every build image and stage recipe of 2026-11-17 (`ws/packages`, from
`integrate/0.1.8` at `ace0a54c1`) for what a build makes for itself that another builds too or
could reuse. What was broken out is in `packages-01` to `packages-10`. These were looked at and
left as they are, a line each:

- **libepoxy**: GTK builds it whole by Meson (EGL, GLX and X11 dispatch); Blender builds its GL
  dispatch alone from the generator, ten lines, for a build that never draws. One package would put
  X11's headers into Blender's build or take GLX from GTK's X11 backend.
- **ggml**: llama.cpp and transcribe.cpp each vendor a snapshot of it, at different commits, with
  llama.cpp's WebGPU backend; ggml's API changes from week to week, so one copy is a source fork of
  one of them.
- **Lua 5.5** (Slopyard's, `LUA_USE_C89`, 15 lines) beside the `lua` package's 5.1, which Neovim
  needs: one consumer, and a version neither can share.
- **SDL2 with X11's video driver** in `imgui-x11`: built into `/tmp` for that example alone; as a
  package it would sit on the `sdl2` package's paths.
- **GNU termcap in `less`**: the core's `less` reads the display's one `/etc/termcap`; tmux's
  `libterminfo` is a demo's, which the core may not install, and has its own terminal database.
- **Box3D twice**: the `box3d` package is single-threaded; Slopyard compiles it again with threads
  and SIMD, which would make every program that links the package need `threads@0`.
- **WAMR's zig1 runner** in `zig-build` (core) and `zig-llvm-build` (demo): two configurations
  (the core's WebAssembly target patch, the demo's x86-64 target with `invokeNative_general`), the
  core cannot install a demo's package, and both are Zig's heavy chains.
- **The LLVMs**: Dolly's compiler at the seed's commit, LLVM 22.1.8 for Zig (`llvm22`), Rust's fork
  at Rust's pin (`rust-llvm`: WebAssembly alone, position-independent) and Mojo's at Modular's pin
  with MLIR. Each revision is its consumer's; `rust-llvm` on `llvm22` would give rustc every target
  or Zig none of its own.
- **Godot's `thirdparty/`** (FreeType, libpng, Ogg, Vorbis, WebP, zstd...): Godot patches several
  of its copies and builds them into one SCons build; `builtin_*=no` would change a heavy chain for
  libraries the program links statically either way.
- **Wine's GIMP and NetSurf libraries**: GTK+ 2.6, GLib 2.12, Pango 1.14, fontconfig 2.3.2 and
  expat 2.7.1 are the versions GIMP 2.2 needs, and IJG libjpeg is compiled into NetSurf's module
  with Wine's headers and flags; all of it is one Winelib process with per-module symbol renames.
  The IJG pin and licence record moved to `demos/wine` with the `libjpeg` package's removal.
- **python-data's packages** (`numpy`, `pandas`, `matplotlib`, `seaborn`, `python-dateutil`): they
  are `COPY` views of python-data-build's roots, as the integrator's brief of 2026-11-05 decided
  (`npm-offline`): python-data-build exists for them alone and builds nothing else, one build in
  dependency order with the build tools all of them use, and nothing else builds NumPy for itself.
  Mesa's build modules (Mako, PyYAML, MarkupSafe, packaging) are wheels a step unpacks.
- **Single consumers**: ENet (0 A.D.), libmd and libXfont2 (xorg-server), utf8proc and
  Tree-sitter (Neovim), libadwaita (Ghostty), xxHash and OpenTelemetry's headers (Mojo), OpenAL
  Soft's bundled {fmt} 11.1.1 (part of its release), and Blender's own libraries (OpenImageIO,
  OpenColorIO, OpenEXR, Imath, oneTBB, Eigen and the rest), at the versions Blender pins.
- **Git's objects twice**: `git-http` compiles Git's sources again to link its remote helper with
  libcurl; `git`, in every toolchain, keeps no `libgit.a` (Git's internal archive, no API), and
  keeping it would grow every image for one core package's build.
- **Ghostty twice**: the core's terminal links libghostty-vt 1.0.0 (`ghostty-build`); the GTK
  application is Ghostty 1.4.0 built whole by its `build.zig`, with the Zig packages it pins.
- **`ninja` and `posix`** keep the outputs of `system-tools`, as the core's `core`, `cc` and
  `dollyfile` do (`docs/dollyfile.md`); nothing builds them twice. **`rust` and `cargo`** `COPY`
  what Rust's bootstrap (`rust-build`) makes and **`display`** what `ghostty-build` makes, the
  expensive builders `docs/dollyfile.md` names for this: Cargo cannot be built without a Cargo,
  and `rust-build` is the toolchain the Rust packages build in.
- **Vendored crates** of Codex and PhotoCraft: Cargo builds them per program from each one's lock
  file; Codex installs the ripgrep, fd and protox packages already.
- **Lean's stages** (`lean-stage0`, `lean-std`, `lean-meta`) are Lean's own bootstrap, over the
  libuv package; **the games** (ClassiCube, Seven Kingdoms, Xonotic, Slopyard, the Godot projects,
  fingers) build their own sources over the sdl2, raylib, Box3D, Ogg and Vorbis packages; the three
  recipes that read stb_truetype read one staged header, a SOURCE row each.

Closed 2026-11-17: nothing in these rebuilds what another build makes at the same version and
options, or a package would serve one consumer.
