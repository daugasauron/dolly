# 0 A.D.

0 A.D. Release 28 as an ordinary wasm64 Dolly process with WebGPU graphics,
OpenAL audio, saves, replays and a relayed two-player match. The engine, its
libraries and SpiderMonkey are built inside Dolly from pinned sources.

## Images

- `zero-ad`: 0 A.D. Release 28: Athens economy and combat scenarios, audio and replay. Requires WebGPU.
- `openal`: OpenAL Soft's mixer through its loopback device, built for the 0 A.D. audio path, a library for programs the `cc` package builds; it brings no compiler.
- `zero-ad-deps`: A build stage: the engine's libraries from their packages, ENet with Dolly's transport, pkgconf and SDL2.
- `spidermonkey`: SpiderMonkey 128.13.0, a library for programs the `cc` package builds, built inside Dolly with mozbuild, Python, Cargo and cbindgen, which it does not bring.
- `zero-ad-engine`: A build stage: the 0 A.D. engine built inside Dolly with Premake and Make.
- `zero-ad-data`: A build stage: 0 A.D.'s release data made into what the game reads, inside Dolly with Python, XZ and Naga.
- `pkgconf`: pkgconf, also as `pkg-config`, which reads the `.pc` files libraries install; built by its own recipe.
- `libpng`: libpng with zlib, a library for programs the `cc` package builds, by upstream's CMake; it brings no compiler.
- `freetype`: FreeType with libpng and zlib, a library for programs the `cc` package builds, by upstream's CMake; it brings no compiler.
- `fmt`: {fmt}, a library for programs the `cc` package builds, by upstream's CMake; it brings no compiler.
- `libxml2`: libxml2 with zlib, a library for programs the `cc` package builds, by upstream's CMake; it brings no compiler.
- `libsodium`: libsodium, a library for programs the `cc` package builds, its sources compiled as its `build.zig` does; it brings no compiler.
- `boost-headers`: Boost's header-only libraries, for programs the `cc` package builds; it brings no compiler.
- `icu`: ICU 68.2's common and i18n libraries with their data, for programs the `cc` package builds; it brings no compiler.
- `premake`: Premake 5.0.0-beta7 as 0 A.D. bundles it, which generates Makefiles from a project's scripts.

Open `/zero-ad/` for the main menu, or run `zero-ad [engine arguments]`, for
example `zero-ad -autostart=scenarios/combat_demo`. F10 opens the game menu;
Ctrl-F10 exits cleanly. Saves and replays live in `/opt/0ad/data`.

## Build

```sh
npm run image -- zero-ad
```

The engine's libraries are packages built from the pinned upstream sources of
[`build-sources.tsv`](build-sources.tsv): CMake projects with CMake, ICU and
libsodium by compiling their source directories (they have only autotools).
`zero-ad-deps` ([`Dollyfile-zero-ad-deps`](Dollyfile-zero-ad-deps)) installs them
with `pkgconf`, builds ENet with Dolly's transport the same way, and copies SDL2
from `sdl2`. `zero-ad-engine` ([`Dollyfile-zero-ad-engine`](Dollyfile-zero-ad-engine))
installs `premake` ([`premake-dolly.patch`](premake-dolly.patch)), generates
upstream's Makefiles and builds `pyrogenesis` with `make -j4`. `zero-ad-data`
([`Dollyfile-zero-ad-data`](Dollyfile-zero-ad-data)) unpacks Wildfire Games' data
archive with `xz` into Dolly's CPython, which keeps its 3.6 GB of mod archives in
its own memory: [`package-data.py`](toolchain/package-data.py) applies the AI
patch, writes the scripts and maps a game without graphics reads, translates the
shaders ([`shaders.py`](toolchain/shaders.py), with the `naga` package) and packs
all content in archives below 24 MiB. `zero-ad` copies the engine and the
content; other pins live in `config/source-pins.sh`. The image is about 2 GB.

The data archive is the one input made outside Dolly: Wildfire Games builds
it, its SPIR-V shaders compiled from the GLSL sources it also holds. One
`SOURCE` holds at most 1 GiB, so image preparation stages the 1.4 GB archive
as its two halves; the recipe joins them and checks the release's digest.

## How it works

- Target patches: [`engine.patch`](engine.patch),
  [`spidermonkey.patch`](toolchain/spidermonkey.patch) (no JIT, serial tasks) and
  [`data.patch`](toolchain/data.patch) (deterministic Petra AI restore).
- Graphics use the upstream backend over `gpu@0` with shaders translated to WGSL.
  Sound uses OpenAL Soft ([`openal-dolly.patch`](openal-dolly.patch), serial
  mixer) over `audio@0`.
- Multiplayer keeps upstream ENet and replaces its sockets with
  [`enet-dolly.c`](enet-dolly.c) over the HTTP broker. The development
  relay [`relay.mjs`](toolchain/relay.mjs) routes bounded datagrams only between
  2–8 pre-created participant URLs and never contacts other hosts.
- `pyrogenesis -dolly-control` adds a line-based JSON protocol (observe, step,
  hash, save, load, reset) for headless games. Browser tests: [`test/`](test/).

## Limits

- Defaults: low textures, no shadows, advanced water or postprocessing.
- Audio latency is about 0.7 s to absorb slow frames.
- No lobby, LAN discovery, native peers or network rejoin; HTTP multiplayer is slow.
- Firefox gives WebGPU only on a display with hardware GL: on Xvfb, and headless with no
  display, Firefox 155 says "WebGPU is disabled by blocklist" and `gfx.webgpu.ignore-blocklist`
  does not lift it (2026-10-28). `test/0ad-menu-browser.mjs firefox` needs such a display.
