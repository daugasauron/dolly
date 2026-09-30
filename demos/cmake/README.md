# CMake

CMake bootstrapped from upstream source over a small libuv port. Neovim, SDL2,
llama.cpp and OpenAL builds start from this image.

## Images

- `cmake-build`: CMake bootstrap and libuv.

Key files: [`cmake.dm`](cmake.dm), [`Dolly.cmake`](Dolly.cmake) (platform file),
[`libuv.dm`](libuv.dm) and [`libuv-dolly.patch`](libuv-dolly.patch). The libuv
port polls and runs deferred work serially over Dolly's files, processes and
signals; it adds no browser import.
