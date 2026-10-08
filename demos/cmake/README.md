# CMake

CMake bootstrapped from upstream source over a small libuv port. Neovim, SDL2,
llama.cpp and OpenAL builds start from this image.

## Images

- `cmake-build`: CMake bootstrap and libuv.
- `cmake`: CMake, as a package.

Key files: [`Dollyfile-cmake-build`](Dollyfile-cmake-build), [`Dolly.cmake`](Dolly.cmake) (platform file),
[`Dollyfile-cmake-build`](Dollyfile-cmake-build) and [`libuv-dolly.patch`](libuv-dolly.patch). The libuv
port polls and runs deferred work serially over Dolly's files, processes and
signals; it adds no browser import. A child's stdio pipe is a kernel pipe in
one direction and a local socket pair in both; an IPC pipe passes
descriptors, which Dolly's sockets do not, and fails with `UV_ENOTSUP`.

Test: `npm run test:demos -- cmake` ([`test/`](test/)).
