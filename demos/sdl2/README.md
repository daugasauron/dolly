# SDL2

SDL2 2.32.10 with a Dolly video backend over the display lease and input records;
ClassiCube, Seven Kingdoms and Airtime build on it.

## Images

- `sdl2`: libSDL2, which draws in software into Dolly's display, for programs the `cc` and `cmake` packages build; it brings neither.
- `imgui`: Dear ImGui with its SDL2 and SDL_Renderer backends, a library for programs the `cc` package builds, and `imgui-demo`, upstream's example.
- `imgui-x11`: upstream's ImGui example as an X client: SDL2 with its X11 video driver, which it takes where `DISPLAY` names a server ([the X11 demo](../x11/README.md)).

`sdl2` compiles the pinned release inside Dolly ([`Dollyfile-sdl2`](Dollyfile-sdl2)) with
the backend in [`SDL_dollyvideo.c`](SDL_dollyvideo.c) and
[`sdl2-dolly.patch`](sdl2-dolly.patch). Audio and thread creation are unavailable, and so are timers (`SDL_AddTimer`), which need a thread; the timer subsystem starts without one.

Test: `npm run test:demos -- sdl2` ([`test/`](test/)).
