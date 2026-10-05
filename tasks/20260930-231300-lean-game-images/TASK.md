# A compiler-free core base: the C/C++ toolchain as a package

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,dollyfile,images,packages

Owner decision: games that never compile at runtime may drop the 135 MiB toolchain; developer images keep it (Dollyfile Studio, Neovim, Python, JavaScript, Pi and other build-capable images). rg/fd stay in every Pi image.

Measured on experiment/dollyfile: a compiler-free runtime base built by COPY FROM is 19.7 MB (system: 159.6 MB) and boots about 5x faster locally; builds are byte-reproducible.

Done when: a core compiler-free runtime image exists and the game demos are built on it, verified in Chrome and Firefox.

## Review (2026-10-05, `20261005-131642-big-picture`): this is catalog shape, not a game demo

Retitled and ranked with the core. Packages are now the unit of reuse
(Dollyfile 6), but the core graph still starts from the builder:
`system-build` -> `system-tools` -> `system` -> `default`, so everything that
can be opened is built on the compiler.

Measured on `integrate/1005` (`c5b9e132`):

- All 37 applications and toolchains carry the 135 MiB toolchain (compiler
  75 MiB, process SDK 27 MiB, headers about 25 MiB; from
  `20260930-223000-dollyfile-design`), games included. The lean base measured
  there is 19.7 MB against 159.6 MB and boots in 0.42 s against 2.0 s.
- All 37 declare `REQUIRES HOST http@0` (the 7 recipes without it are
  packages). The line is forced, not chosen: `/bin/dollyfile` links the HTTP
  client (`src/dollyfile.c:17,379`), every base retains it for `FROM` builds,
  and sealing requires every retained executable's module to be declared. So
  the manifest cannot say "this image has no network", and the page enables
  the one agent-selected network edge for a game. The runtime-modules
  investigation rejected an explicit `runtime@0` because "a line that no
  recipe can omit says nothing"; today that describes `http@0` too.
- `gpu-sdk` and `audio-sdk` (12 lines each) add one `REQUIRES HOST` line to
  `system` and no file; `system` (23 lines) adds `snapshot@0` and one 63-line
  tool to `system-tools`. Each is a full catalog image because a host set is
  fixed per image.

Direction: a lean base (Slop, core tools, display) that retains neither the
compiler nor the recipe engine; the toolchain as a package that `default` and
the developer images install; an application built on the lean base declares
only the modules its own programs use. Coordinate with
`20261005-131645-more-packages`, which surveys the demo packages but not the
toolchain itself, the largest candidate by bytes.

## Done when (replaces the line above)

- A core base image exists without the compiler and without `/bin/dollyfile`;
  its size and boot time are recorded here beside `system`'s.
- The C/C++ toolchain installs as a package: in a recipe with `INSTALL` and in
  a session with `amy install`, and `cc` then compiles and runs a program.
- At least one application declares no `http@0`, and a browser test shows its
  programs get `ENOSYS` from the HTTP client.
- `gpu-sdk` and `audio-sdk` are either deleted, with their tests moved to
  images that need the modules, or the reason each must remain a full image
  is recorded here.
