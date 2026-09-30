# SDL2

SDL2 2.32.10 with a Dolly video backend over the display lease and input records;
ClassiCube, Seven Kingdoms and Airtime build on it.

## Images

- `sdl2-build`: SDL2 software rendering for the Dolly framebuffer.

`sdl2-build` compiles the pinned release inside Dolly ([`sdl2.dm`](sdl2.dm)) with
the backend in [`SDL_dollyvideo.c`](SDL_dollyvideo.c) and
[`sdl2-dolly.patch`](sdl2-dolly.patch). Audio and thread creation are unavailable.
