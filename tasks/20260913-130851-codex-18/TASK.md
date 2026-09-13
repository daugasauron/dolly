# Remove display and Rust tool dependencies from CMake builders

- STATUS: OPEN
- PRIORITY: 350
- TAGS: audit,core,build

The compiler-base work removed Git/display dependencies from Rust producers,
but cmake-build still derives from system. That makes a Ghostty, rg or fd edit
invalidate CMake, Neovim, SDL2 and the game producers.

Measured at 2c441d4: CMake rebuilt inside Chrome in **1,320 seconds**; Neovim
then took 251 seconds. Their source inputs and all inherited non-recipe system
files were unchanged. This is a much larger cost than the Node test suite.

CMake does need many traditional build commands and libraries. Its module lists
libcurl, zlib, libuv, gzip, dirname and diff; the current diff wrapper calls Git.
Do not simply remove these prerequisites or move compilation to the host.

## Done when

- Reuse a C/C++ build-tools artifact below display and Rust tool packaging, or
  another smaller composition justified by the actual commands.
- Display, rg/fd and startup edits leave CMake/Neovim/SDL2 producer identities
  unchanged; keep the real tool requirements and source provenance.
- Preserve the application images and useful interactive development workflow;
  headless producers must have working build controls.
- Verify CMake and downstream builders in the browser, then measure fanout and
  reuse without repeatedly recompiling unchanged prerequisites.
