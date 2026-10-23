# sdl2 needs touch@0, which neither default nor pi-agent declares

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: sdl2,touch,packages,agent-experience,0.1.4


Found by Opus 5.5 in Pi (`tasks/20261023-180000-opus-in-pi`, round 4, `r4-tiles/`): asked
for a tile game with PNG assets and a real font, it ran `amy install sdl2 freetype libpng`
in pi-agent and read

```
dollyfile: /v0.1.4/demos/sdl2/Dollyfile-sdl2 needs touch@0: nena enable touch
amy: sdl2: not installed
```

It then left SDL2 out ("SDL2 requires touch support, which would mean enabling it through
nena and relying on the user's session also having it enabled") and wrote its own framebuffer
on `display.h`, FreeType and libpng: a good game, but not the reuse the owner asks for.

Reproduction, in pi-agent or `default` (neither declares `touch@0`; both have `nena@0`):
`amy install sdl2` refuses as above; after `nena enable touch` it installs.

Since the touch merge, the `sdl2` package `REQUIRES HOST touch@0` because its video driver
calls the touch client, though the driver goes on with mouse and keys when no touchscreen is
there (`SDL_dollyvideo.c`: `if (dolly_touch_acquire(...) != 0) video->touch = 0;`). So every
SDL program needs a module neither general image declares. For the owner or the integrator,
one of: `default` and `pi-agent` declare `touch@0`; or SDL's touch is linked so that a
program runs without the module. Pi's skill says `nena enable touch` until then (`d2457991`).

## Done (2026-10-24, branch `demo/opus-audit-2`)

Decided by the integrator: the images declare `touch@0`; SDL and its requirement record stay
as they are (every SDL2 program records `touch@0`, which grants only finger positions to the
lease holder, as `input@0` does). `REQUIRES HOST touch@0` is added to `default` and to every
image that declares `packages@0` with `display@0` and `input@0` and lacked it: pi-agent,
pi-local, closed-source-agent, dollyfile-studio and tmux-panes (`codex-agent` declares no
`packages@0`, so nothing is installed there at run time). `test/host-modules.test.mjs`
expects it in `default`'s set; `test/nena-browser.mjs` reads each module's state from the
page and needs no change; `docs/dollyfile.md` names default's modules.

Measured on the rebuilt `default` and `pi-agent` (`build/opus-evidence/r7/probe-sdl.*.out`,
probe.mjs, Chromium and Firefox): `nena` lists `touch@0 declared`; `amy install sdl2`
installs (89 files); a program that opens a 320x240 window with an accelerated renderer and
draws until stopped prints "window open" and ends at `timeout 5` with status 124.
`demos/pi/test/pi-browser.mjs` passes on the rebuilt pi-agent (Chromium 49.6 s). Not rebuilt
here: pi-local, closed-source-agent, dollyfile-studio, tmux-panes (repinned).
