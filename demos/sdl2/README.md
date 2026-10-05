# SDL2

SDL2 2.32.10 with a Dolly video backend over the display lease and input records;
ClassiCube, Seven Kingdoms and Airtime build on it.

## Images

- `sdl2`: SDL2 software rendering for the Dolly framebuffer, as a package.

`sdl2` compiles the pinned release inside Dolly ([`Dollyfile-sdl2`](Dollyfile-sdl2)) with
the backend in [`SDL_dollyvideo.c`](SDL_dollyvideo.c) and
[`sdl2-dolly.patch`](sdl2-dolly.patch). Audio and thread creation are unavailable.

Test: `npm run test:demos -- sdl2` ([`test/`](test/)).
