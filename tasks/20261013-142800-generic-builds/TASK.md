# Builds become generic: what a build image makes for itself is a package with its own build

- STATUS: OPEN
- PRIORITY: 330
- TAGS: packages,catalog,owner,0.1.4

Owner (2026-10-13): "Last night when I said "break out more things as
packages" I mean that to simplify and make the current builds more generic.
One example would be breaking out spidermonkey (just an example) into a
package. It seems you just started adding random stuff? It's fine, keep
them, but that was not the point. I want to simplify and create as many
reusable, good, no shortcuts, packages as possible."

Done when: every library, engine and tool that a build image compiles for
itself and that something else could use is a package holding its own build
from its pinned source; the images that needed it install it; no package is
only a view of a demo's build image; each has its check in
`test/amy-browser.mjs` or its consumer's test; the list of what was not
broken out says why for each.


## State (2026-10-27)

Ogg and Vorbis are done (`99a6d3f2`, branch `demo/zero-ad-reconcile`): `zero-ad-deps` installs
`libvorbis`, which brings `libogg`, and builds neither; their sources left `deps.tar.gz` and
`build-sources.tsv`. `xonotic` takes the FreeType, libpng, Ogg and Vorbis licences from those
packages, not from `zero-ad-deps` (it shipped no Ogg or Vorbis notice before). Rebuilt on the
current seed: `zero-ad-deps` 126.5 s, `zero-ad-engine` 341 s (`make` 305 s), `zero-ad` 68 s,
`xonotic` 35 s. Passed: `0ad-spidermonkey`, `0ad-engine` (replay `be99497b…`, save/load
`ff2fbc7d…`: the hashes of 2026-10-01), `0ad-graphics hardware` (NVIDIA, 112 s), `0ad-openal`.

The done-when, read whole, does not hold yet; nobody is on what is left:

- Packages that are still views of a demo's build image: `cmake` (`cmake-build`), `go`
  (`go-build`), `voice` (`speech-build`), `xorg-server` (`xorg-server-build`), `mojo` (five
  `COPY` rows), `rust` and `cargo` (`COPY` rows of `rust-build`, which replaces the seed
  compiler twice by the owner's choice: [the engines](../20261013-145359-builds-engines/TASK.md)).
  In the core, `zig` and `display` (eight `COPY` rows of `ghostty-build`).
- Built inside an image and kept by the ruling of 2026-10-12, "one consumer"
  ([0 A.D.'s libraries](../20261013-145359-builds-zero-ad-deps/investigation.md), §1.2), with no
  decision since the owner's aim of 2026-10-13: fmt 7.1.3 and libxml2 2.13.5 (upstream CMake,
  unchanged), ICU 68.2, libsodium 1.0.20, ENet 1.3.18 (Dolly's transport) and Boost's headers in
  `zero-ad-deps`; premake in `zero-ad-engine`. Not covered by any record: gmqcc in
  `xonotic-build`, transcribe.cpp in `speech-build`.
- With a recorded reason: Neovim's five libraries, the three LLVMs, the two ggml
  ([the engines](../20261013-145359-builds-engines/TASK.md)), Wine's libraries (one executable,
  old series chosen for it, inventory).
## 2026-10-24: the games-and-packages workstream, `demo/slopyard-catapults`

The integrator's brief (2026-10-23): the "Left" list below, raylib, box3d, libuv, a llama.cpp
library and openal as packages that hold their own builds, and three bugs the Opus audits
found in pi-agent sessions, where every game session now installs raylib or SDL2 first
(`tasks/20261023-180000-opus-in-pi/TASK.md`, round 2, on `demo/opus-audit-2`):

1. raylib: `GetTime`, `GetFrameTime` and the key state are dead. Reproduced in the `slopyard`
   image (`raylib/clock.c` in the evidence): 30 frames 16 ms apart, `GetTime 0.000
   GetFrameTime 0.0000 GetFPS 0`, 0.52 s by `clock_gettime`. raylib's `PLATFORM_MEMORY` reads
   the clock only on Windows, Linux, the BSDs and Emscripten, and `SUPPORT_CUSTOM_FRAME_CONTROL`
   leaves frame time and input to the program.
2. libpng: `-lpng` fails; the package ships `libpng16.a` and the `libpng.pc` link, not upstream's
   `libpng.a` link.
3. SDL_ttf and SDL_image as packages (on FreeType and libpng); SDL_mixer only if it fits the
   sound module without new browser authority.

Done (`ad98e33c`):

- raylib holds its build (`demos/slopyard/Dollyfile-raylib`, from the pinned source) with a
  Dolly platform backend compiled into raylib's `rcore.c` as its custom platform: display@0
  for frames (paced by the page's animation frames), input@0 for keys, text, pointer and wheel,
  `CLOCK_MONOTONIC` for `GetTime`; a tap inside one frame still reads as pressed for a frame.
  A hidden window (`FLAG_WINDOW_HIDDEN`), or a program that holds the display (Slopyard,
  `<dolly/raylib.h>`), renders to memory; the adapter hands raylib its key events. Airtime's
  agent mode asks for a hidden window (its viewer shows the frames). Measured in the `default`
  image after `amy install raylib`: 30 frames 16 ms apart read `GetTime 0.516`,
  `GetFrameTime 0.0167` (before 0.000 and 0.0000); Space pressed on the page reaches
  `IsKeyPressed` (before: never). `test/amy-browser.mjs` checks both in its raylib row.
- Box3D holds its build (`Dollyfile-box3d`); `gamedev-sdk` installs both packages and keeps
  Box3D's sources for Slopyard's threaded SIMD build.
- libpng ships upstream's `libpng.a` link: `cc x.c -lpng -lz` links (checked in the default
  image; `test/amy-browser.mjs` too).
- Checked: `bhop` (Chromium, `npm run test:demos -- bhop`), `slopyard-browser.mjs` on the GPU
  display, the images' own checks, the source suite. Not run: the whole `test/amy-browser.mjs`
  (it needs every package built in this tree).

Done (2026-10-24, `2d23f716`):

- `sdl2-ttf` (SDL_ttf 2.24.0) and `sdl2-image` (SDL_image 2.8.8), upstream's release archives
  built unchanged by their CMake projects in `demos/sdl2/`: static libraries, headers,
  pkg-config files and CMake packages. `sdl2-ttf` installs `sdl2` and `freetype` (with libpng
  and zlib). `sdl2-image` takes upstream's default backend, stb_image, which decodes PNG and
  JPEG itself, so it needs no libpng or libjpeg and installs only `sdl2`; the formats that
  need a library of their own (AVIF, JPEG XL, TIFF, WebP) are off. It is configured with
  `SDL2IMAGE_VENDORED=ON`, which builds nothing extra here: with it off, SDL_image's CMake
  package (`SDL2_imageConfig.cmake.in`, the same on upstream's SDL2 branch today) runs
  `find_dependency(JPEG)` and `find_dependency(PNG)` for the stb build too, which fails where
  no libjpeg is installed (read in the file; that build was not made). `sdl2` now keeps SDL's own `sdl2.pc`, which the two `.pc`
  files require (`xorg-server-build` wrote its own copy; that copy is gone).
- `openal` holds its build: `openal-build` (a toolchain only `openal` and `zero-ad-deps` stood on)
  is folded into `Dollyfile-openal`, and `zero-ad-deps` is `FROM cmake-build` with `INSTALL openal`
  (rebuilt here in 299 s; `demos/zero-ad/test/0ad-openal-browser.mjs` passes on its probe).
- Measured in the `default` image (Chromium, `amy install` into a running session, the rows of
  `test/amy-browser.mjs` in order): `cc`, `cmake`, `sdl2`, `pkgconf`, `libpng`, `freetype`,
  `sdl2-ttf` (a word rendered in the terminal's font has ink; linked with
  `pkg-config --static --libs SDL2_ttf`: `-lSDL2_ttf -lfreetype -lpng16 -lz -lSDL2 -lm`),
  `sdl2-image` (a PNG written and read back, built by CMake from `find_package(SDL2_image)`),
  `openal` (the loopback square wave). `demos/sdl2/test/sdl2-browser.mjs` passes (Chromium).
  Not rebuilt here: the 0 A.D. chain after `zero-ad-deps`, `xorg-server-build` and the X11 chain,
  the images that only changed pins.
- A CMake program linking the static FreeType through `find_package(Freetype)` (CMake's
  module) must add libpng and zlib itself; `pkg-config --static` gives them. Upstream's
  behaviour, unchanged.

libuv holds its build (the last commit of the workstream): `Dollyfile-libuv` is `FROM
system-tools` with the rows `cmake-build` had (the same Makefile and source archive), and
`cmake-build` installs it. Built here: `libuv` 8 s (617 kB, the same snapshot both times it was
built), `cmake-build` bootstrapped on it in 1,492 s, then `cmake`, `sdl2`, `libpng`,
`freetype`, `openal`, `sdl2-ttf`, `sdl2-image` on that. Measured in `default` (Chromium): the
`cc`, `cmake`, `libuv`, `sdl2`, `pkgconf`, `libpng`, `freetype`, `sdl2-ttf`, `sdl2-image` and
`openal` rows; `npm run test:demos -- cmake` passes (its libuv probes on `cmake-build`). Every
image on `cmake-build` rebuilds with it, the Rust chain among them (`rust-llvm`, `rust-build`,
the integrator's `hugebuild`), and Pi, Slopyard and Airtime stand on ripgrep and fd from it:
those were not rebuilt in this tree, which is why this change is the branch's last.

SDL_mixer (2026-10-24, after the integrator's decision that SDL2 plays through `audio@0`):
`sdl2-mixer` holds SDL_mixer 2.8.1's build, upstream's release archive unchanged by its CMake
project with the decoders it carries (WAV, AIFF, VOC, Ogg Vorbis by stb_vorbis, MP3 by
minimp3, FLAC by dr_flac, MIDI by Timidity given patches); MOD, Opus, WavPack, GME,
FluidSynth and the external music command need more and are off. Its CMake package looks
for no library it does not link. Measured: `demos/sdl2/test/sdl2-audio-browser.mjs` has a
WAV SDL_mixer decodes and plays on its left channel heard on the left only (Chromium and
Firefox); its amy row (a clip played on a channel until it ends, linked through
`pkg-config --static --libs SDL2_mixer`) passes in `default`. Also new and holding their
builds, for Xonotic's sound: `libogg` and `libvorbis` (the Xonotic task). `zero-ad-deps`
still builds its own Ogg and Vorbis beside them: moving it onto the packages rebuilds the
0 A.D. chain, left for a round that builds it.

Done (2026-10-24, `578edd0c`): `llama-cpp` holds `llama-build`'s build
(llama.cpp, its common library, ggml with the CPU and WebGPU backends) and `webgpu.cpp`, the
WebGPU C API that backend calls, as `libdolly-webgpu.a`, so a program links the package and
`-ldolly-gpu` (which it installs) and nothing else; it declares `gpu@0`, as its programs do.
`llama` holds the `dolly-llama` build (`FROM system-tools`, `USE llama-cpp`, its licences
copied beside it). `llama-build` and `local-llm-build` are gone; `pi-local` installs `llama`.
Measured in `default` (Chromium, SwiftShader's WebGPU adapter): `nena enable gpu`, then
`amy install llama` and `dolly-llama --check` prints `{"ready":true,"shaders":"f32"}`; and
`amy install cc llama-cpp` and a C++ program linked on the archives lists the WebGPU and CPU
devices. Built: `llama-cpp` 276 s (22.7 MB), `llama` 9 s (11.0 MB). Not rebuilt here:
`pi-local` and `dollyfile-studio`, whose 1.6 GB snapshot needs the integrator's `hugebuild`
(the `pi-local` build crashed its page under this tree's 6 GB cap).

Nothing of the list is left.

## State (2026-10-23)

The question was answered and the step after it built: a package's build-only installs
(`USE`), and SpiderMonkey, FreeType, libpng and libjpeg as packages that hold their builds,
passed the round of 2026-10-14/15 and shipped in v0.1.3 ([next round](../20261012-220109-next-round/TASK.md)).
Left, from the candidates below: `openal`, `libuv`, `raylib`, `box3d` and a llama.cpp library
still stand on demo images' builds. Not tagged for v0.1.4.

## State (2026-10-14, 10:10): investigated; one step done, the rest waits on one question

The five groups of [the inventory](inventory.md) were each investigated
(history first, each written out as a recipe, the integrator checking the
counts), and on the owner's word of 2026-10-14 ("If your investigation
confirms they are fixes … go ahead. If you're uncertain, give me a short
description") taken this way:

- Done: [the javascript split](../20261013-135951-javascript-split/TASK.md)
  (`quickjs`, `janis`, `typescript` hold their builds); `xonotic-build` and
  `wine-build` install `freetype` (round of 2026-10-14).
- Nothing to change, closed with the reason:
  [the engines](../20261013-145359-builds-engines/TASK.md),
  [what is compiled twice](../20261013-145359-builds-twice/TASK.md).
- His call: [what a package needs only to build](../20261013-144754-build-needs/TASK.md),
  which every candidate below meets, and
  [`amy`, Git, `download` and `upload` out of `system-tools`](../20261013-145359-builds-root/TASK.md).

The candidates for a package that holds its own build, each written out in
its investigation ([the views](../20261013-145359-builds-views/investigation.md),
[0 A.D.'s libraries](../20261013-145359-builds-zero-ad-deps/investigation.md),
[twice](../20261013-145359-builds-twice/investigation.md)):

- FreeType and libpng: upstream's CMake builds, unchanged, a dozen rows each
  on `cmake-build`; three images use them today.
- libjpeg: about twenty rows; Xonotic and NetSurf then share one flag set.
- SpiderMonkey, the owner's example: needs a base with Python, Rust, Cargo
  and cbindgen, or those arrive with whoever installs it.
- `openal` (options chosen for 0 A.D.; twelve images stand on its build
  image), `libuv` (82 images stand on `cmake-build`), `raylib` and `box3d`
  (Slopyard builds Box3D a second time with other options), a llama.cpp
  library (meets the host-module rule both ways).

## As filed (2026-10-13, main `50c698f8`)

- What was done instead on 2026-10-12 and 2026-10-13: thirty new packages,
  most of them programs the catalog did not have (`sqlite`, `jq`, the
  archivers, …). They stay. Fifteen of the earlier ones (`ninja`, `make`,
  `libuv`, `lua`, `raylib`, `box3d`, `libpng`, `freetype`, `pkgconf`, …) are
  thin recipes over the image that happens to build the thing: the build
  still lives in a demo's image, which is the shortcut the owner does not
  want.
- The aim, in his example: SpiderMonkey is compiled inside
  `demos/zero-ad/Dollyfile-zero-ad-spidermonkey` for 0 A.D. alone. As a
  package with its own build, 0 A.D.'s engine installs it and anything else
  can.
- Since 2026-10-13 a package's `INSTALL` rows are installed by reference, so
  a build that installs ten packages holds none of them, and a package that
  installs another adds nothing to its own snapshot.
- Rebuilding much of the catalog for this is accepted: complete rebuilds are
  the owner's intent ("robust and reliable"), not a cost to avoid.

To do first, before any recipe moves: the inventory. For every build image,
what it compiles that is not its own demo's program (the engines: SpiderMonkey,
QuickJS, the three LLVMs, CPython, llama.cpp, transcribe.cpp; the libraries:
ICU, libsodium, ENet, Boost's headers, Ogg, Vorbis, fmt, libxml2, OpenAL,
SDL2, zlib, tree-sitter, utf8proc, LPeg, luv, libevent, the terminfo
library, Ghostty's terminal library; the tools: gmqcc, pkgconf, CMake,
Ninja, Make), who uses it today, whether two images build the same thing
twice, and the order in which to break them out so that each step leaves
every image building.
