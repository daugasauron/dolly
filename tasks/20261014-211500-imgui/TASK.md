# Dear ImGui as a package

- STATUS: OPEN
- PRIORITY: 200
- TAGS: packages,graphics

Owner (2026-10-14): "One thing I really want is imgui".

Done when: the `imgui` package builds and `demos/sdl2/test/imgui-browser.mjs`
passes in Chromium and Firefox.

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
