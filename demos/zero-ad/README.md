# 0 A.D.

0 A.D. Release 28 as an ordinary wasm64 Dolly process with WebGPU graphics,
OpenAL audio, saves, replays and a relayed two-player match. The engine and its
libraries are built inside Dolly; SpiderMonkey is still cross-compiled outside
Dolly, an explicit bootstrap exception
([task](../../tasks/20260930-231200-self-host-zero-ad/TASK.md)).

## Images

- `zero-ad`: 0 A.D. Release 28: Athens economy and combat scenarios, audio and replay. Requires WebGPU.
- `openal-build`: OpenAL Soft built for the 0 A.D. audio path.
- `zero-ad-deps`: Build-only: the engine's libraries, pkgconf and SDL2 built from pinned sources.
- `zero-ad-engine`: Build-only: the 0 A.D. engine built inside Dolly with premake and Make.

Open `/zero-ad/` for the main menu, or run `zero-ad [engine arguments]`, for
example `zero-ad -autostart=scenarios/combat_demo`. F10 opens the game menu;
Ctrl-F10 exits cleanly. Saves and replays live in `/opt/0ad/data`.

## Build

```sh
bash demos/zero-ad/toolchain/build-spidermonkey.sh  # external SpiderMonkey bootstrap
bash demos/zero-ad/toolchain/prepare-headless.sh
bash demos/zero-ad/toolchain/prepare-shaders.sh     # SPIR-V to WGSL with Naga
python3 demos/zero-ad/toolchain/package-graphics.py .cache/0ad/0ad-0.28.0
node demos/zero-ad/toolchain/prepare-distribution.mjs
npm run image -- zero-ad
```

`zero-ad-deps` builds the engine's libraries from
[`build-sources.tsv`](build-sources.tsv) ([`Dollyfile-zero-ad-deps`](Dollyfile-zero-ad-deps)):
CMake projects with CMake, ICU, libsodium and ENet by compiling their source
directories (they have only autotools), pkgconf for premake; SDL2 is copied from
`sdl2-build`.
`zero-ad-engine` ([`Dollyfile-zero-ad-engine`](Dollyfile-zero-ad-engine)) bootstraps premake
([`premake-dolly.patch`](premake-dolly.patch)), generates upstream's Makefiles
and builds `pyrogenesis` with `make -j4`; `zero-ad` copies it. Other pins live in
`config/source-pins.sh`; [`prepare-distribution.mjs`](toolchain/prepare-distribution.mjs)
pins the content as published `SOURCE` inputs of [`zero-ad.dm`](zero-ad.dm). The
image is about 2 GB.

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
