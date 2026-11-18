# Packages users can install: break out every useful library and tool, one consumer or not

- STATUS: OPEN
- PRIORITY: 220
- TAGS: packages,owner

## State (2026-11-18)

Round two on `ws/packages`, merged with `integrate/0.1.8` (`0ae1331a2`, then `29b2adfb1`). New
packages, each with its own build from a pinned upstream archive, a licence record in its demo and
an amy case:

- `demos/tools`: `eigen`, `imath`, `libdeflate`, `openjph`, `openexr`, `robin-map`, `pugixml`,
  `yaml-cpp`, `pystring`, `minizip-ng`, `opencolorio`, `openimageio` (with `oiiotool`, `iinfo` and
  its other programs) and `onetbb`, at the releases Blender 5.3 pins (their pins moved there from
  `demos/blender/build-sources.txt`, which is gone), and `glslang`, which Blender's WebGPU backend
  brought with the second merge. `ccfilter` was a package until that merge, whose `cc` takes the
  options it dropped (`465296072`): it is gone, and nothing launches it.
- `demos/gtk`: `libepoxy`, as GTK built it (Meson, with EGL and GLX dispatch); its `epoxy.pc` requires
  `x11` and `egl`, so it installs `x11-libs` and `mesa` (as `libxkbfile` installs `x11-libs`).
- `demos/slopyard`: `lua5.5` (`lua5.5`, `luac5.5`, the library and its headers).
- `demos/neovim`: `utf8proc` and `tree-sitter` (the runtime library).
- `demos/mojo`: `xxhash` (`xxhsum` and libxxhash) and `opentelemetry-cpp` (API, SDK, exporters).
- `demos/zero-ad`: `enet`, with Dolly's transport.
- `demos/x11`: `libmd` (all of it, where xorg-server built its SHA-1) and `libxfont2`.
- `demos/sdl2`: `sdl2-x11`, SDL2 with its X11 video driver beside `sdl2` (`/usr/lib/sdl2-x11`).
- `demos/ghostty-gtk`: `libadwaita`, for GTK programs built in `gtk-build`.

Their consumers install or use them instead of building them: `blender-deps` (no `deps.tar.gz`;
`blender` copies the packages' licences), `gtk-build` (libepoxy), `slopyard-build`
(`prepare-slopyard.mjs`), `nvim`, `mojo` (`bazel-to-cmake.py` links `-lxxhash` and takes
OpenTelemetry's headers from `/usr/include`), `zero-ad-deps`, `xorg-server`, `imgui-x11`,
`ghostty-gtk`.

Dolly's `cc` compiles every unit with atomics and bulk memory and links shared memory
(`programs/compiler.cpp`), so a library links into a program with or without `-pthread`. Only
the libraries whose use takes threads are compiled with it and declare `threads@0`: `openexr`
(C11's `call_once`), `opencolorio`, `openimageio`, `onetbb`, `opentelemetry-cpp`, `glslang`.

OpenBLAS is already the `openblas` package (`demos/python`, since `demo/scipy`, 2026-11-04):
python-data's `openblas` session installs it alone, and passed in tonight's integration round
(`work/integrate-018/build/early-demos.log`). packages-01's note meant only that this tree had not
built it.

Left, each with its reason (none is the consumer count):
- Box3D with threads: Slopyard's build reaches Box3D's pthread and Wasm SIMD paths by defining
  `__EMSCRIPTEN__` (`demos/slopyard/src/box3d-simd.c`); a package for users waits for Box3D's
  platform detection to know Dolly.
- OpenAL Soft's {fmt} 11.1.1: its CMake adds the bundled copy unconditionally
  (`add_subdirectory(fmt-11.1.1)`, `alsoft::fmt`), with no option for another; the `fmt` package
  (12.1.0) is the one a user installs.
- ggml: llama.cpp's is built by Dolly's own `demos/local-llm/CMakeLists.txt`, with the WebGPU
  backend, inside llama.cpp's tree. A package needs that file split, `llama-cpp` built over
  `LLAMA_USE_SYSTEM_GGML`, and the local-llm and speech chains rebuilt and tested on WebGPU;
  transcribe.cpp's ggml is another commit. Not reached.

packages-00's other verdicts, read again against the owner's measure: none of them is a library
or tool a session would install that has no package. GNU termcap is linked into `less`; the zig1
runner and the LLVMs are their compilers' bootstrap at their pins; Godot's and Wine's copies are
patched or ancient versions inside one build; python-data's libraries, `rust`, `cargo`, `ninja`
and `posix` are packages already; Git's objects, Lean's stages and the games are no libraries.
libghostty-vt (the core's terminal) could be one, but it is the core's `ghostty-build`, and the
`display` package that every image holds would change with it.

Found on the way: a static reference bound to a temporary traps at exit on an indirect call of
another type (`20261118-171000-static-temporary-exit`), as yaml-cpp's Emitter does after emitting
a string; the yaml-cpp case parses only.

Built in `work/packages` and tested there, each case alone in Chromium and Firefox (the tools
demo's, neovim's, slopyard's, mojo's, zero-ad's, x11's, sdl2's and gtk's `amy-cases.json`, their
new sessions; logs in `work/packages-evidence-1118/runs`): eigen, imath, libdeflate,
openjph, openexr, robin-map, pugixml, yaml-cpp, pystring, minizip-ng, opencolorio, openimageio
(oiiotool and a program over the library), onetbb, lua5.5, utf8proc, tree-sitter, xxhash, enet,
opentelemetry-cpp, libmd, libxfont2, sdl2-x11, libepoxy, and after the second merge glslang (a
fragment shader compiled to SPIR-V). Built over them: `blender-deps` (every
package's library, Eigen's and robin-map's headers, and `oiiotool` in it; libepoxy
brings Mesa and X's client libraries, 42 MB of this build-only stage), `gtk-build` (Meson finds
the epoxy package), `libadwaita`, `xorg-server` (over the libmd and libxfont2 packages),
`imgui-x11` (over `sdl2-x11`) and `x11-desktop`, where `x11-browser.mjs` passed in Chromium and
Firefox (the server, its windows, ImGui at 54 frames/s, tmux; with `tmux` registered beside them).

Not built here: the heavy chains (`ghostty-gtk`, whose closure rebuilds `llvm22` and `zig-llvm`
since round one's python change, `nvim`, `slopyard-build`, `mojo`, `zero-ad-deps`, `blender`).
`libadwaita` has no amy case: it links GTK's static libraries, which only the `gtk-build`
toolchain holds, and a toolchain has no amy; `ghostty-gtk`'s build and test are its use.
The source archives that shrank, Mojo's and zero-ad-deps', were staged alone and their `SOURCE`
pins refreshed; Blender's archive, staged again, is byte for byte the one pinned.

The round builds what these change and runs, besides the source tests: the amy tests of tools,
neovim, slopyard, mojo, zero-ad, x11, sdl2 and gtk (new), and `neovim-browser.mjs`,
`studio-browser.mjs`, `slopyard-browser.mjs`, `mojo-browser.mjs`, `deep-hedger-browser.mjs`,
`0ad-enet-browser.mjs`, `0ad-multiplayer-browser.mjs`, `x11-browser.mjs`, `godot-x11-browser.mjs`,
`photocraft-x11-browser.mjs`, `ghostty-gtk-browser.mjs`, `blender-browser.mjs` and
`blender-gpu-browser.mjs`. Every package here but glslang was built before the second merge, with
the `cc` it replaced; `onetbb` and `openimageio` build without `ccfilter` first in the round.

The owner, 2026-11-18 morning, on `20261117-123021-packages-00`'s verdicts:

> Regarding not breaking out packages because there "is a single consumer", thats not an
> argument. I want users that try dolly to have as many useful packages to choose from as
> possible.

So the measure of a candidate is whether a user of Dolly would install it. How many of the
catalog's builds use it today does not count. Each candidate gets its own package with its own
build, a test or amy case, and a licence record, and the builds that compile it for themselves
`INSTALL` it.

## Reopened from packages-00

These are packages-00's verdicts given for one consumer, or for one example:
- ENet, from 0 A.D.;
- libmd and libXfont2, from xorg-server;
- utf8proc and Tree-sitter, from Neovim;
- libadwaita, from Ghostty;
- xxHash and OpenTelemetry's headers, from Mojo;
- OpenAL Soft's bundled {fmt}, against the `fmt` package;
- Blender's own libraries: OpenImageIO, OpenColorIO, OpenEXR, Imath, oneTBB, Eigen and the rest;
- Lua 5.5, from Slopyard;
- SDL2 with X11's video driver, from `imgui-x11`;
- Box3D with threads and SIMD, from Slopyard;
- libepoxy, from GTK and Blender;
- ggml, from llama.cpp and transcribe.cpp.

Other packages-00 verdicts stand where their reason is not the consumer count: a version a package
cannot share, or a build that patches its copies, decides those. Each such reason is to be read
again against the owner's measure.

## Done when

Every candidate above is a package that installs and passes its case in Chrome and Firefox, or
has a recorded reason that is not "one consumer".
