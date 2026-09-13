# Remove display and Rust tool dependencies from CMake builders

- STATUS: CLOSED
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

## Resolution

`system-tools` now builds the C/C++ libraries, Git and conventional utilities
without display/Rust packaging. `system` composes it with Ghostty, rg and fd.
CMake, Neovim, SDL2 and the game producers inherit the headless build branch.
The interactive leaves still compose the system and their completed artifacts.

CMake builds in Chrome in 1,348 seconds and produces 225,308,820 bytes, about
17 MB smaller than the earlier interactive base. The snapshot has no display
plugin, DISPLAY variable, Rust compiler, Zig, rg or fd. A browser then configured,
built, installed and reran a C/C++ CMake project. Neovim built in 256 seconds;
Studio packaged in 9 seconds. SDL built in 200 seconds. Chrome passed SDL rendering, input, screenshots,
ordered batches and cancellation; Studio passed visible Neovim lint/highlighting
and Pi startup; Rust tools passed their source-build smoke check.

Graph inspection finds 21 affected images for a Ghostty or fd recipe edit,
including the producer itself. CMake, Neovim/SDL/game producers and the Rust
compiler branch are outside those closures. Compilation itself is not faster;
the improvement is avoiding unrelated recompilation.

Release acceptance now runs its compiled C filesystem/PATH inventory inside a
headless build worker for producer images. It previously waited for a terminal
on the producer's build page. The headless proof checks the original manifest,
rejects a wrong digest and an unexpected system file, and accounts for only the
four fixed build-staging paths. CMake passed without display or seed loading.

The sealed local release passed live inventory acceptance for all 18 selected
images, including the headless C/C++, Rust, CMake, SDL and Neovim producers.
The inventory fixture uses only commands present in the small compiler base.
Local release: `6fbc79ee43043c13b6878cfe3b2b46f07b27b43efbc54131bc0327636136610c`
(source commit `9e45b32`); 740,407,026 site bytes, 145 shared snapshot packs.
The archive and acceptance records are under `/dev/shm/dolly-core-release.O2Y1IG/`.
This was local packaging and verification, with no external deployment.
