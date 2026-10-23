# sdl2 needs touch@0, which neither default nor pi-agent declares

- STATUS: OPEN
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
