# Dear ImGui as a package

- STATUS: CLOSED
- PRIORITY: 200
- TAGS: packages,graphics

Owner (2026-10-14): "One thing I really want is imgui".

Done when: the `imgui` package builds and `demos/sdl2/test/imgui-browser.mjs`
passes in Chromium and Firefox.

## State (2026-10-15, 02:30): built; on Dolly's display and in X

Built in the round tree (`work/rust`, branch `integrate/round-1014b`). The
example still did not draw: it asks for `SDL_INIT_TIMER`, and SDL starts a
timer thread there unless it is Emscripten's threadless build; Dolly's
programs see `__dolly__`, so the init failed for want of threads. Fixed in
`sdl2-dolly.patch`: without threads the subsystem starts without one and
`SDL_AddTimer` says it needs one. `imgui-browser.mjs` passed in Chromium
(02:00, 3.6 s); it now runs Firefox too, in the round's demo suite.

`imgui-x11` (`demos/sdl2`) builds SDL2 again where X's libraries are, so it
has upstream's X11 video driver, and links the same example: in
`x11-desktop`, `imgui-x11 &` in xterm opens it in a twm window of its own.
`x11-browser.mjs` passed in both browsers (02:30): 56 frames a second on
the page; ImGui itself reports 7.3 ms a frame. SDL's XFixes support is off:
SDL declares `XFixesSelectSelectionInput` to return `Status`, libXfixes
declares `void`, and the call through SDL's pointer trapped in WebAssembly.

## State (2026-10-14, 21:15): written, not built

`demos/sdl2/Dollyfile-imgui`: Dear ImGui v1.92.9b from upstream's release
archive, unchanged, with its SDL2 and SDL_Renderer backends in
`libimgui.a`, and `imgui-demo`, upstream's `example_sdl2_sdlrenderer2`. Two
changes to `sdl2` let that example run as upstream wrote it:

- It asks for `SDL_RENDERER_ACCELERATED`, and SDL 2.32 matches the flags of
  each driver unless a hint names one (`src/render/SDL_render.c:1005-1040`):
  the package exports `SDL_RENDER_DRIVER=software`, the one renderer here.
- It initializes `SDL_INIT_GAMECONTROLLER`, which a build with
  `SDL_JOYSTICK=OFF` refuses: the joystick subsystem is on, and with no
  driver for Dolly SDL's CMake takes its dummy one, which finds no
  controllers.

Both rebuild `sdl2` and the images that install it, so they wait for a
round after the one of 2026-10-14.

## Closed 2026-10-15

`imgui-browser.mjs` passed in Chromium (5.0 s) and Firefox (7.5 s) in the round's demo suite, after SDL's timer subsystem stopped needing a thread (`2faec880`); `imgui-x11` draws in its own X window (`x11-browser.mjs`, both browsers). In the round of 2026-10-14/15 on `integrate/round-1014b` (evidence `work/rust/build/round-1014b-evidence/`: source 431/0, artifacts 25/0, the core browser suite and every demo test in their browsers, five GPU tests), fast-forwarded into local `main` (`00caf5ec`).
