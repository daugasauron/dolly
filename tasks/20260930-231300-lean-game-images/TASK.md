# A compiler-free core base: the C/C++ toolchain as a package

- STATUS: OPEN
- PRIORITY: 280
- TAGS: core,dollyfile,images,packages

## Remaining (2026-10-07)

In the candidate: the `core`, `cc`, `amy`, `posix` and `git` packages;
`default` itself is now a composition without a compiler (14.4 MB;
`20261005-222449-small-default`, closed), which overtook the earlier "default
keeps the compiler" line; `minimal` is gone; `zero-ad` is `FROM system`. The
done-when's four lines hold as "Against the done-when" says, with the limit
that a composition is not a `FROM` base. Left, the design below:

- Stage 1: the builder supplies the engine, so any image, lean ones
  included, can be a `FROM` base and `http@0` leaves images whose programs
  do not use it (a kernel, page and build-script change; a catalog round).
- Stage 2, the rest: sbase, Ninja, the agent commands, `download`/`upload`
  and `session-recover` out of `system-tools` into packages
  (`20261007-003116-package-needs` holds the user-facing gaps); games that
  never compile at run time as compositions (`gpu-fluid` first).
- `gpu-sdk` and `audio-sdk` deleted once their tests open a composition
  built in the page.

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

## Measured and built (2026-10-05, `work/more-packages`, image inputs `2cc92c2b…`)

Owner of this task for the round: the packages agent (`20261005-131645-more-packages`).

### What every image retains from `system-build`

Compared byte for byte against the `system-build` snapshot (scratch script):
the 36 applications and toolchains built on a base (37 before `sdl2-build`
became a package) hold the same three parts, and no package held any of them.

| Part | Paths | Bytes |
| --- | ---: | ---: |
| Toolchain: compiler 78,335,090; `/usr/lib/dolly` 28,436,064; `/usr/include` about 25 MB; Clang headers 7,907,501; compiler-rt 812,590; `cc`, `c++`, `ld`, `ar` 4 x 32,721; Make 383,844; three licences | 2,037 | 135,457,243 |
| Engine: `/bin/dollyfile` | 1 | 122,857 |
| Slop and its 18 commands | 19 | 887,335 |

Share of each snapshot that is toolchain plus engine: `system-build` 99%;
`default`, `system`, `system-tools`, `gpu-sdk`, `audio-sdk` 85%; `gpu-fluid` 84%;
`neovim` 69%; `pi`, `pi-runtime` 52%; `classicube` 51%; `bhop`, `slopyard` 47%;
`gnu-emacs` 45%; `codex` 38%; `rts-arena` 35%; `rust-tools` 33%; `pi-local`,
`dollyfile-studio` 8%; `zero-ad` 7%. Removing it saves 135.6 MB per image
whatever the image, so the gain is large for `gpu-fluid` (161 MB to about
25 MB with the POSIX tools, 11 MB without) and small for `zero-ad`.

`http@0`: the stamped executables in `default` are `amy`, `dollyfile`, `curl`
and the two `git-remote-http(s)` helpers (`http@0`), `download` and `upload`.
The compiler, Make, Slop and the commands stamp nothing. An image that holds
none of the five declares no `http@0`.

About 4.1 MB of the toolchain's headers are Emscripten's SDL 1, GL, GLES, EGL,
GLFW, X11 and WebGL headers, which nothing in Dolly implements; removing them
is a seed change (`scripts/prepare-process-sysroot.sh`), not done here.

### Done without an engine or seed change

A recipe without `FROM` is a root build that keeps only what it installs, so
the lean base is expressible in Dollyfile 6 as it is. Four recipes, none
changing an existing image (no rebuild cascades):

| Image | Role | Recipe | Bytes |
| --- | --- | --- | ---: |
| `core` | package | `FROM system-build`, the 19 `EXPORTS TOOL` rows | 1,038,675 |
| `cc` | package | `FROM system-build`, the toolchain's exports and Make | 135,808,932 |
| `amy` | package | `FROM system-tools`, `amy` and `dollyfile`; `http@0`, `packages@0` | 389,170 |
| `minimal` | application | `INSTALL core`, `INSTALL display`, ENTRY; `display@0` only | 10,406,967 |

| Image | Bytes | Chrome boot | Firefox boot |
| --- | ---: | ---: | ---: |
| `minimal` | 10,406,967 | 0.56 s | 0.70 s |
| `system` | 160,414,572 | 2.46 s | 3.39 s |
| `default` | 160,417,768 | 3.06 s | 3.63 s |

Boot is navigation to the shell prompt on the local test server, median of
five warm loads while other agents used the machine
(`build/packages-evidence/boot.log`).

Verified in Chrome and Firefox:

- `test/minimal-browser.mjs`: `minimal` opens and runs its commands; `cc`,
  `dollyfile`, `curl` and `amy` are absent. An image composed in the page from
  `core`, `display` and `cc` with `display@0` only compiles and runs C and C++
  (`INSTALL cc` in a recipe); a program linked with the HTTP client exits 126
  with `Required host ABI http@0 is unsupported` before it runs. (The refusal
  at load is what a stamped client gets; an unstamped raw call gets `ENOSYS`,
  which `test/host-modules-browser.mjs` shows for `gpu@0`.)
- `test/amy-browser.mjs`, "amy cc": a session composed from `core`, `display`
  and `amy` (`display@0`, `http@0`, `packages@0`) runs `amy install cc` in
  2.0 s (Chrome) and 2.1 s (Firefox), then compiles and runs a program.
- `test/dolly.artifacts.mjs` states the new invariant: an image built on a
  base carries the seed its base retained; a package or a composition keeps
  only what it declares (engine in `amy`, toolchain in `cc`, shell in `core`).

### What a lean image cannot do yet

1. It is not a `FROM` base. The builder restores the base and runs the base's
   `/bin/dollyfile` (`src/runtime-worker.mjs`,
   `dolly_process_bootstrap_resume_prepare` in `src/dolly.c`), so `FROM
   minimal` fails with `invalid base image artifact`. A lean application is
   therefore a composition without build steps: its programs come from
   packages built in toolchains. `docs/dollyfile.md` says so.
2. Image-inventory acceptance builds `FROM` the image and compiles a C
   program in it. `test/image-inventory-browser.mjs` now checks an image
   without the engine by booting it only.
3. All 36 images built on a base still declare `http@0`: the engine is in
   every base.
4. `amy`, Studio and the build service are unaffected: they run in developer
   images. A lean session gets amy by installing the `amy` package and
   declaring its two modules.
5. `minimal` has Slop and 18 commands, not the POSIX tools: sbase, awk, Git
   and the agent commands are built inside `system-tools`, not packaged.

### Design for the rest, with costs

**Stage 1: the builder supplies the engine.** A kernel, page and build-script
change, no change to the Dollyfile language or `dollyfile.c`:

- `npm run build:runtime` already compiles `bootstrap` and the compiler for
  the seed; it would also compile `dollyfile.c` to a release asset. The
  builder writes it to `/etc/dolly/artifacts/` (builder-owned, unlinked after
  every build, never retained) and runs it for every build. `FROM` is then
  the engine's own `load_artifact(IMPORT_FROM)`, which already restores the
  base; the separate restore in `dolly_process_bootstrap_resume_prepare`
  goes.
- Every image becomes a base, with or without the engine: point 1 and the
  inventory special case in point 2 go.
- `system-build` stops exporting `dollyfile`; `http@0` then leaves every
  image whose programs do not use HTTP (point 3). The `amy` package builds
  the engine it ships from source, as `system-build` builds Slop.
- Root compositions (`nvim`, `display`, `rust`, `minimal`, …) stop fetching
  the 78 MB seed and compiling the engine; `src/process/bootstrap.c` goes.
- Costs: the engine that builds images is compiled by the external toolchain
  (a bootstrap exception beside the kernel and the compiler seed, to record
  in `docs/sources.md`); every build path must be re-verified (`npm run
  image`, `/IMAGE/rebuild/`, `/custom/`, Studio's `build@0`, image-browser,
  custom-session, inventory); it changes the seed, so the whole catalog
  rebuilds. Estimate: one to two days with verification.

**Stage 2: the core recipes become compositions.** Recipes only, after
stage 1, one catalog rebuild:

- sbase, awk, Git, Ninja, the agent commands, `download`/`upload` and amy
  move out of `Dollyfile-system-tools` into packages that hold their build
  (`FROM system-build`), and `system-tools` installs them, as it already
  installs `zlib`, `gzip`, `curl` and `display`. About 600 lines move, none
  are added; a lean image then installs the tools it runs (point 5).
- Games that never compile at run time become compositions. `gpu-fluid`:
  `PACKAGE fluid` holds today's build (`FROM system`, `REQUIRES HOST gpu@0`),
  and `APPLICATION gpu-fluid` is `INSTALL core`, `INSTALL display`,
  `INSTALL fluid`, its start script and `REQUIRES HOST display@0`, `gpu@0`:
  161 MB to about 11 MB. Not done here: its recipe fetches external sources
  and its test needs a GPU window. `zero-ad` (`FROM default`) would lose
  135.6 MB of 2,076 MB. `classicube`, `rts-arena` and `bhop` run Pi and
  compile at run time (their tests compile probes), so they stay developer
  images, as the owner decided.
- `default` keeps the compiler (owner decision); as a composition it would
  hold the same bytes.

### gpu-sdk and audio-sdk

Each is `system` plus one `REQUIRES HOST` line and an ENTRY: 12 lines, no
file of its own, a full catalog image because a host set is fixed per image.
Host requirements are not inherited, so `gpu-fluid`'s `FROM gpu-sdk` could
be `FROM system` today. They remain for now because their users are the
GPU and audio browser tests (`audio-browser`, `gpu-indicator-browser`,
`gpu-render-browser`, the host-set assertions) and `gpu-fluid`, which the
WebGPU round (`20261005-131646-webgpu-any-gpu`) is changing and whose tests
need a GPU window. Deleting them is mechanical once those tests open a
composition built in the page (`composed()` in `test/browser.mjs`, or
`FROM system` with the module added, as `displayProbe` in
`demos/browser.mjs` does).

### Against the done-when

- Core base image without compiler and engine, size and boot time recorded:
  done (`minimal`), with the limit that it is not yet a `FROM` base.
- Toolchain as a package, by `INSTALL` and by `amy install`, then `cc`
  compiles and runs: done (`cc`).
- An application without `http@0` whose programs are refused the HTTP
  client: done (`minimal`; the composition test).
- `gpu-sdk` and `audio-sdk`: reason recorded above.

Open: stages 1 and 2.
