# 0 A.D.

0 A.D. Release 28 as an ordinary wasm64 Dolly process with WebGPU graphics,
OpenAL audio, saves, replays and a relayed two-player match. The engine is
cross-compiled outside Dolly: an explicit bootstrap exception.

## Images

- `zero-ad`: 0 A.D. Release 28: Athens economy and combat scenarios, audio and replay. Requires WebGPU.
- `openal-build`: OpenAL Soft built for the 0 A.D. audio path.

Open `/zero-ad/` for the main menu, or run `zero-ad [engine arguments]`, for
example `zero-ad -autostart=scenarios/combat_demo`. F10 opens the game menu;
Ctrl-F10 exits cleanly. Saves and replays live in `/opt/0ad/data`.

## Build

```sh
bash demos/zero-ad/toolchain/build-engine.sh        # external engine bootstrap
bash demos/zero-ad/toolchain/prepare-headless.sh
bash demos/zero-ad/toolchain/prepare-shaders.sh     # SPIR-V to WGSL with Naga
python3 demos/zero-ad/toolchain/package-graphics.py .cache/0ad/0ad-0.28.0
node demos/zero-ad/toolchain/prepare-distribution.mjs
npm run image -- zero-ad
```

Pins live in `config/source-pins.sh` and [`dependencies.tsv`](toolchain/dependencies.tsv);
[`prepare-distribution.mjs`](toolchain/prepare-distribution.mjs) pins the engine
and content as `SOURCE HOST` inputs of [`zero-ad.dm`](zero-ad.dm). The image is
about 2 GB.

## How it works

- Target patches: [`engine.patch`](toolchain/engine.patch),
  [`spidermonkey.patch`](toolchain/spidermonkey.patch) (no JIT, serial tasks) and
  [`data.patch`](toolchain/data.patch) (deterministic Petra AI restore).
- Graphics use the upstream backend over `gpu@0` with shaders translated to WGSL.
  Sound uses OpenAL Soft ([`openal-dolly.patch`](openal-dolly.patch), serial
  mixer) over `audio@0`.
- Multiplayer keeps upstream ENet and replaces its sockets with
  [`enet-dolly.c`](toolchain/enet-dolly.c) over the HTTP broker. The development
  relay [`relay.mjs`](toolchain/relay.mjs) routes bounded datagrams only between
  2–8 pre-created participant URLs and never contacts other hosts.
- `pyrogenesis -dolly-control` adds a line-based JSON protocol (observe, step,
  hash, save, load, reset) for headless games. Browser tests: [`test/`](test/).

## Limits

- Defaults: low textures, no shadows, advanced water or postprocessing.
- Audio latency is about 0.7 s to absorb slow frames.
- No lobby, LAN discovery, native peers or network rejoin; HTTP multiplayer is slow.
