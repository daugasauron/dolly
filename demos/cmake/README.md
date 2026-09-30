# CMake

CMake bootstrapped from upstream source over a small libuv port. Neovim, SDL2, llama.cpp and OpenAL builds start from this image.

## Images

- `cmake-build`: CMake bootstrap and libuv.

Browser test: `npm run test:demos -- cmake` (`demos/cmake/test/cmake-browser.mjs`), which also builds libuv from source.
