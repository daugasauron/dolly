# SDL2

SDL2 2.32.10 with a Dolly video backend over the display lease, input records
and touch records; ClassiCube, Seven Kingdoms and Airtime build on it. Each
finger on the page's canvas is one of SDL's finger events, and SDL makes its
mouse of the first one, so every program built on the package declares
`touch@0` ([input](../../docs/input.md#touch)).

## Images

- `sdl2`: libSDL2, which draws in software into Dolly's display, for programs the `cc` and `cmake` packages build; it brings neither.
- `sdl2-ttf`: SDL_ttf, TrueType text into SDL surfaces through the `freetype` package, which it brings with `sdl2`.
- `sdl2-image`: SDL_image, which loads PNG, JPEG, GIF, BMP, SVG, QOI and more into SDL surfaces and saves PNG and JPEG, with `sdl2`.
- `sdl2-mixer`: SDL_mixer, which mixes sound effects and plays music (WAV, Ogg Vorbis, MP3, FLAC, MIDI with Timidity) through `sdl2`'s audio, with `sdl2`.
- `imgui`: Dear ImGui with its SDL2 and SDL_Renderer backends, a library for programs the `cc` package builds, and `imgui-demo`, upstream's example.
- `imgui-x11`: upstream's ImGui example as an X client: SDL2 with its X11 video driver alone, drawing on the server `DISPLAY` names ([the X11 demo](../x11/README.md)).

`sdl2` compiles the pinned release inside Dolly ([`Dollyfile-sdl2`](Dollyfile-sdl2)) with
the backend in [`SDL_dollyvideo.c`](SDL_dollyvideo.c) and
[`sdl2-dolly.patch`](sdl2-dolly.patch). Sound plays through `audio@0` ([`SDL_dollyaudio.c`](SDL_dollyaudio.c)), so every SDL2 program and every image that runs one declares it. Thread creation is unavailable, so SDL's audio callback runs from the event pump (`SDL_PollEvent`, `SDL_PumpEvents` with a window open) and keeps 100 ms queued; timers (`SDL_AddTimer`) need a thread too, and the timer subsystem starts without one.

Test: `npm run test:demos -- sdl2` ([`test/`](test/)).
