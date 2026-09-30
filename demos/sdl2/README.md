# SDL2

SDL2 with a Dolly video backend for the framebuffer and input; ClassiCube, Seven Kingdoms and Airtime build on it.

## Images

- `sdl2-build`: SDL2 software rendering for the Dolly framebuffer.

## Sources

| Component | Outside-browser preparation | Inside-Dolly result |
| --- | --- | --- |
| SDL2 2.32.10 | Pinned release plus a Dolly video backend and target configuration | `sdl2-build` compiles the static software renderer with in-Wasm input/framebuffers; audio and thread creation are explicitly unavailable |
