# Make more of the catalog installable packages

- STATUS: CLOSED
- PRIORITY: 300
- TAGS: dollyfile,packages,amy

Owner (2026-10-05): "Make more things into packages, it works really nicely."

## Work

Survey every image of the catalog. Convert to `PACKAGE` what a user would
`amy install` into a running session or what several images repeat, so
applications become thin compositions of `INSTALL` lines and `default` stays
small. Candidates to measure, not a decision: fd, protox, Neovim, CMake,
TypeScript, SDL2, Zig, curl, the llama runtime, Codex. State the rule for
"what is a package" in `docs/dollyfile.md` if it is not already crisp, and
remove any core special case the survey exposes.

Owned elsewhere, do not edit: `demos/pi`, `demos/studio`
(`20261005-131647-pi-1`), `demos/local-llm` (`20261005-131646-webgpu-any-gpu`),
`demos/zero-ad`, `demos/slopyard`.

## Done when

- A table here lists each image's role before and after, snapshot bytes before
  and after, and the `amy install` time of each new package.
- Each new package installs and runs in a running `default` session in a real
  browser, covered by a test.
- The touched images' demo tests pass.

## Review note (2026-10-05, `20261005-131642-big-picture`)

The largest package candidate by bytes is not on the list: the C/C++
toolchain, 135 MiB of every application and toolchain (37 of 37). It and the lean base
are `20260930-231300-lean-game-images`, now a core task; a rule for "what is
a package" should cover it. Also measured: all 37 declare `http@0` because
`/bin/dollyfile` is retained in every base.

## Survey and result (2026-10-05, `work/more-packages`, image inputs `2cc92c2b…`)

Before: 51 images (13 applications, 24 toolchains, 14 packages). fd, protox,
Neovim (`nvim`), curl, gzip and zlib from the candidate list were packages
already. After: 58 images (14 applications, 23 toolchains, 21 packages). Bytes
are snapshot sizes in `dist/`; an image whose bytes did not change was not
rebuilt.

| Image | Role before | Role after | Bytes before | Bytes after | Reusable software | Consumed by |
| --- | --- | --- | ---: | ---: | --- | --- |
| `default` | application | application | 160,417,768 | 160,417,768 | nothing of its own: `system`, the start-up script and amy's host modules | zero-ad (FROM) |
| `amy` | – | package | – | 389,170 | amy and the engine (`/bin/dollyfile`) | – |
| `audio-sdk` | toolchain | toolchain | 160,414,783 | 160,414,783 | nothing: `system` with `audio@0` | – |
| `bhop` | application | application | 287,914,667 | 287,931,734 | the bhop game, viewer and agent | – |
| `cc` | – | package | – | 135,808,932 | compiler, drivers, headers, libraries, host clients, Make | – |
| `classicube` | application | application | 267,723,365 | 267,740,657 | ClassiCube agent, viewer and pack tool | – |
| `classicube-build` | toolchain | toolchain | 262,867,905 | 174,652,902 | ClassiCube | classicube (COPY) |
| `cmake` | – | package | – | 87,925,226 | CMake and its modules | – |
| `cmake-build` | toolchain | toolchain | 248,580,212 | 248,580,212 | CMake, libuv | cmake (FROM), llama-build (FROM), llvm-tablegen (FROM), neovim-build (FROM), openal-build (FROM), sdl2 (FROM) |
| `codex` | application | application | 357,487,114 | 357,487,102 | nothing of its own: entry script | – |
| `codex-build` | toolchain | toolchain | 338,411,776 | 338,411,776 | Codex | codex-cli (COPY) |
| `codex-cli` | – | package | – | 197,281,376 | Codex, its launcher and configuration, with ripgrep and fd | codex (INSTALL) |
| `core` | – | package | – | 1,038,675 | Slop and 18 core commands | minimal (INSTALL) |
| `curl` | package | package | 500,447 | 500,447 | curl, libcurl | rust-build (INSTALL), system-tools (INSTALL) |
| `display` | package | package | 9,516,150 | 9,516,150 | the Ghostty display plugin and font | minimal (INSTALL), rust-sdk (INSTALL), system-tools (INSTALL) |
| `dollyfile-studio` | application | application | 1,699,368,852 | 1,699,368,852 | dollyfile-lint, dollyfile-build | – |
| `emacs` | package | package | 141,291,504 | 141,291,504 | GNU Emacs | gnu-emacs (INSTALL) |
| `fd` | package | package | 4,013,964 | 4,013,964 | fd | codex-cli (INSTALL), pi-coding-agent (INSTALL) |
| `gamedev-sdk` | toolchain | toolchain | 181,803,474 | 181,803,474 | raylib, box3d, dolly-raylib | bhop (FROM), slopyard (FROM) |
| `ghostty-build` | toolchain | toolchain | 209,020,712 | 209,020,712 | libghostty-vt, the display plugin | display (COPY) |
| `gnu-emacs` | application | application | 301,494,961 | 301,494,961 | nothing of its own: entry script | – |
| `gpu-fluid` | application | application | 161,139,986 | 161,139,986 | the fluid demo | – |
| `gpu-sdk` | toolchain | toolchain | 160,414,759 | 160,414,759 | nothing: `system` with `gpu@0` | gpu-fluid (FROM) |
| `gzip` | package | package | 487,432 | 487,432 | gzip | rust-sdk (INSTALL), system-tools (INSTALL) |
| `javascript` | package | package | 28,225,850 | 28,225,850 | QuickJS (`qjs`), Janis, TypeScript (`tsc`), libdolly-js | bhop (INSTALL), pi-coding-agent (INSTALL), pi-runtime (INSTALL), slopyard (INSTALL) |
| `llama-build` | toolchain | toolchain | 261,024,196 | 261,024,196 | llama.cpp and ggml libraries | local-llm-build (FROM), pi-local (COPY) |
| `llvm-tablegen` | toolchain | toolchain | 342,894,264 | 342,894,264 | llvm-tblgen, clang-tblgen | – |
| `local-llm-build` | toolchain | toolchain | 268,047,637 | 268,047,637 | dolly-llama | pi-local (COPY) |
| `minicpm5-2b` | package | package | 1,561,542,275 | 1,561,542,275 | model weights | – |
| `minimal` | – | application | – | 10,406,967 | nothing of its own: `core` and `display` | – |
| `neovim` | application | application | 196,639,097 | 196,639,097 | nothing of its own: entry script | – |
| `neovim-build` | toolchain | toolchain | 289,140,437 | 289,140,437 | Neovim, Lua 5.1, LPeg, luv, utf8proc, tree-sitter | nvim (COPY) |
| `nvim` | package | package | 36,429,394 | 36,429,394 | Neovim, its runtime and parsers | dollyfile-studio (INSTALL), neovim (INSTALL) |
| `openal-build` | toolchain | toolchain | 251,971,063 | 251,971,063 | OpenAL Soft | – |
| `pi` | application | application | 259,837,276 | 259,837,276 | nothing of its own: entry script | pi-local (FROM) |
| `pi-build` | toolchain | toolchain | 251,832,222 | 251,832,222 | Pi and its node_modules | pi-coding-agent (COPY) |
| `pi-coding-agent` | package | package | 99,628,510 | 99,628,510 | Pi, with javascript, ripgrep and fd | bhop (INSTALL), pi-runtime (INSTALL), slopyard (INSTALL) |
| `pi-local` | application | application | 1,663,087,852 | 1,663,087,852 | dolly-llama, the local model provider | dollyfile-studio (FROM) |
| `pi-runtime` | toolchain | toolchain | 259,832,717 | 259,832,717 | nothing of its own: `system`, javascript, pi-coding-agent | classicube (FROM), pi (FROM), rts-arena (FROM) |
| `protox` | package | package | 2,506,763 | 2,506,763 | protox | codex-build (INSTALL) |
| `python` | package | package | 47,287,767 | 47,287,767 | CPython 3.14, pip, libffi | llvm-tablegen (INSTALL) |
| `qwen3.5-2b` | package | package | 1,396,422,568 | 1,396,422,568 | model weights | pi-local (INSTALL) |
| `ripgrep` | package | package | 4,274,796 | 4,274,796 | rg | codex-cli (INSTALL), pi-coding-agent (INSTALL) |
| `rts-arena` | application | application | 385,782,467 | 385,799,780 | arena, viewer, spectator | – |
| `rts-build` | toolchain | toolchain | 367,106,721 | 278,891,718 | Seven Kingdoms and its data | rts-arena (COPY) |
| `rust` | – | package | – | 250,507,988 | the Rust SDK (`rustc`) and Patti | rust-tools (INSTALL) |
| `rust-build` | toolchain | toolchain | 397,261,795 | 397,261,795 | Patti | codex-build (FROM), fd (FROM), protox (FROM), ripgrep (FROM), rust (COPY) |
| `rust-sdk` | toolchain | toolchain | 396,616,423 | 396,616,423 | the Rust SDK | rust-build (FROM) |
| `rust-tools` | toolchain | toolchain | 410,745,538 | 410,745,833 | nothing of its own: `system` and rust | – |
| `sdl2` | – | package | – | 3,906,861 | SDL2 library, headers, CMake package | bhop (INSTALL), classicube (INSTALL), classicube-build (INSTALL), rts-arena (INSTALL), rts-build (INSTALL) |
| `sdl2-build` | toolchain | removed | 252,270,353 | – | SDL2 library, headers, CMake package | – |
| `slopyard` | application | application | 288,098,777 | 288,098,777 | Slopyard, Lua 5.5 | – |
| `system` | toolchain | toolchain | 160,414,572 | 160,414,572 | session-recover | default (FROM), audio-sdk (FROM), codex (FROM), codex-cli (FROM), emacs (FROM), gamedev-sdk (FROM), gnu-emacs (FROM), gpu-sdk (FROM), minicpm5-2b (FROM), neovim (FROM), pi-coding-agent (FROM), pi-runtime (FROM), python (FROM), qwen3.5-2b (FROM), rust-tools (FROM) |
| `system-build` | toolchain | toolchain | 136,948,619 | 136,948,619 | compiler, headers, libraries, Slop, core commands, tar, Make, the engine | cc (FROM), core (FROM), curl (FROM), gzip (FROM), rust-sdk (FROM), system-tools (FROM), zig-build (FROM), zlib (FROM) |
| `system-tools` | toolchain | toolchain | 160,369,319 | 160,369,319 | sbase, awk, Git, Ninja, download, upload, agent commands, amy | amy (FROM), classicube-build (FROM), cmake-build (FROM), rts-build (FROM), system (FROM), typescript-build (FROM) |
| `typescript-build` | toolchain | toolchain | 188,376,086 | 188,376,086 | QuickJS, Janis, TypeScript | javascript (FROM), pi-build (FROM) |
| `zero-ad` | application | application | 2,075,728,078 | 2,075,728,078 | 0 A.D. | – |
| `zig-build` | toolchain | toolchain | 197,478,605 | 197,478,605 | Zig (C backend) | ghostty-build (FROM) |
| `zlib` | package | package | 380,735 | 380,735 | zlib | gzip (INSTALL), rust-sdk (INSTALL), system-tools (INSTALL) |

### The rule

[`docs/dollyfile.md`](../../docs/dollyfile.md#packages-and-amy): software is a
package when a session would install it or more than one image uses it; an
application, or a toolchain people open, is then a base, `INSTALL` rows and
its own entry and configuration; a toolchain remains where software is built;
the same `COPY` rows in two recipes are a missing package. The doc also names
the three shapes a package takes (holds its build; `FROM` a builder and only
`EXPORTS`; `COPY` rows), that an install composes no `PATH`, and that a
library or compiler package declares the host modules every program built
with it needs.

### Converted

| Package | From | Removes or adds | `amy install` (Chrome / Firefox) |
| --- | --- | --- | --- |
| `cmake` | `FROM cmake-build`, two exports; `cmake-build` untouched | CMake in a session: configure, build and run a project | 1.4–2.6 s / 2.1–3.4 s |
| `sdl2` | the `sdl2-build` toolchain, now a package holding the build | one image; the `COPY` and `EXPORTS` blocks of `bhop`, `classicube`, `rts-arena` (15 rows to 3); `classicube-build` and `rts-build` start from `system-tools`, 88 MB smaller each | 0.2 s / 0.2–0.3 s |
| `rust` | `COPY` from `rust-build`, `rustc` launcher in `/usr/bin` | `rust-tools` is `system` plus `INSTALL rust`; Rust in a session | 1.9–4.1 s / 1.9–4.7 s |
| `codex-cli` | `COPY` from `codex-build`, the launcher, `ripgrep`, `fd` | `codex` is `system` plus `INSTALL codex-cli` and its entry; Codex in a session | 1.7–2.4 s / 1.3–3.5 s |
| `cc`, `core`, `amy` | `FROM system-build` / `system-tools`, exports only | the lean base, `20260930-231300-lean-game-images` | `cc`: 2.0 s / 2.1 s |

Times are two runs of `node test/amy-browser.mjs` from the shell prompt to the
next prompt, packs served by the local test server, the second while a boot
benchmark ran. `python`, for scale: 0.8–1.3 s / 0.9–1.5 s.

### Left as they are

- Zig: measured as a package (60.7 MB, installs in 1.0 s; a hello world takes
  `zig build-exe -ofmt=c`, a second run for compiler_rt and `cc`, 7 s in
  all, and `zig version` panics). The C backend alone has no `zig build`,
  `run` or `cc`, so a session cannot use it as a compiler; the recipe is ten
  lines (`FROM zig-build`, three exports) once it can.
- TypeScript: stays in `javascript`; every consumer wants both and Pi's
  system prompt promises `tsc`.
- Git, sbase, awk, Ninja, the agent commands: every image built on
  `system-tools` has them and none wants one alone; packaging them is stage 2
  of the lean base, with a catalog rebuild.
- Lua 5.1 and libuv: private dependencies of Neovim and CMake, one consumer
  each through `FROM`.
- ClassiCube and Seven Kingdoms: one consumer each, which takes exact outputs
  from its own builder with `COPY`; nobody installs a game into a shell.
- `llvm-tablegen`: a port that discovers requirements; nothing consumes it.
- `fluid` (`gpu-fluid`): one consumer, and `default` declares no `gpu@0`; it
  becomes a package when `gpu-fluid` becomes a lean composition.
- Owned elsewhere this round, for the integrator:
  - `demos/local-llm`: a `dolly-llama` package (`PACKAGE dolly-llama`,
    `REQUIRES HOST gpu@0`, `FROM …/Dollyfile-local-llm-build <pin>`,
    `EXPORTS TOOL dolly-llama`, `FOLDER /usr/share/licenses/dolly-llm`)
    replaces the two `COPY` rows and `EXPORTS TOOL dolly-llama` in
    `Dollyfile-pi-local` with one `INSTALL`, and makes the runner installable
    beside a model package (7.0 MB).
  - `demos/slopyard`: raylib and box3d reach `slopyard` and `bhop` through
    `FROM gamedev-sdk`; nothing repeats, leave.
  - `demos/pi`, `demos/studio`, `demos/zero-ad`: already compositions of
    packages, or one consumer.

### Found on the way

- SDL2's exported CMake package named `libSDL2main.a`, which `sdl2-build` did
  not retain, so `find_package(SDL2)` failed in every image. The `sdl2`
  package exports it; the amy test builds a CMake project against it.
- `amy list` marked only what the session installed. In `default` it showed
  `curl`, `display`, `gzip` and `zlib` as not installed although the image's
  recipes installed them, and after `amy install codex-cli` it showed
  `ripgrep` and `fd` the same way; `amy install curl` copied identical files
  again. `/etc/dolly/installed` was written by live installs only. Fixed in
  the engine on `work/more-packages-seed` (a seed change): `INSTALL` records
  its row in builds as in sessions and merges the rows of the packages a
  package itself installed; a package recipe starts its own record; `COPY`
  never imports the record. `src/dollyfile.c` grew 47 lines; `amy.c` is
  unchanged. One limit remains until the core recipes are compositions
  (stage 2 of `20260930-231300-lean-game-images`): images built on
  `system-build` hold the files of `core`, `cc` and `amy` without their
  rows, because they are the builders those packages are kept from.
- An image's digest depended on the order its directories were created in
  (measured by the kernel-boundary agent: `system-build` with 2,062 of 2,063
  records identical and a different digest). `collect_paths` walks in
  `readdir` order and the receipt (`/etc/dolly/artifact`) stored each
  export's members in that order, while the manifest is sorted. Fixed on
  `work/more-packages-seed`: members are sorted when an export is captured,
  the one place the filesystem's order enters, and the receipt reader rejects
  a list that is not strictly increasing, as the snapshot reader does for
  records. The lists stay in the receipt: they are what lets a consumer keep
  an imported export exactly as it was sealed instead of recapturing a
  directory from a later filesystem. (They are also a large part of a
  receipt's 0.2–0.6 MB; that is a size question for the format, not decided
  here.)
  `test/image-browser.mjs` runs the engine twice over the same recipe with
  the exported files created in two orders and compares the receipts; it
  failed before the fix.
- The shared root `node_modules` holds Pi 0.84.4 while this branch locks
  0.99.2, so staging `pi-build` failed (`Pi runtime package is not exact`);
  this worktree's `node_modules` link points at `work/host-modules`.
- `demos/cmake`'s browser test fails at the libuv SIGINT probe on the
  unchanged `cmake-build` image (twice); the round's `fix/signal-regression`
  owns it. Its CMake half passes.

### Evidence

Logs in `build/packages-evidence/` (not committed). Rebuilt with
`DOLLY_IMAGE_JOBS=2 DOLLY_BUILD_IMAGES=… npm run image`: `cmake`, `sdl2`,
`classicube-build`, `classicube`, `rts-build`, `rts-arena`, `bhop`, `rust`,
`rust-tools`, `codex-cli`, `codex`, `core`, `cc`, `amy`, `minimal`; all 58
images then plan as `reuse`. Recipe pins: `node scripts/update-recipe-pins.mjs`
rewrote only recipes whose content changed.

- `node test/amy-browser.mjs chromium firefox`: `amy`, `amy programs`
  (`cmake`, `sdl2`, `rust`, `codex-cli`), `amy cc` and `amy refusal` pass in
  both browsers.
- `node test/minimal-browser.mjs chromium firefox`: both tests pass in both.
- `node test/core-browser.mjs chromium firefox`: 85.6 s and 66.3 s, pass.
- `node test/browser-tests.mjs chromium`: every browser suite passes in
  611 s; `firefox`: in 696 s.
- `npm run test:source`: 332 pass. `npm run test:artifacts`: 24 pass.
- `npm run test:demos -- sdl2 cmake codex rust classicube rts bhop`: `sdl2`
  5.0 s, `codex` 39.3 s, `rust` 80.3 s, `classicube` 424.5 s, `rts` 278.5 s
  and `bhop` 210.7 s pass in Chrome; `cmake` fails as described above.
- Image inventory with `minimal` as its image passes in both browsers.

### Evidence for the engine changes (`work/more-packages-seed`)

Two seed changes in `src/dollyfile.c`, each followed by `npm run
build:runtime` and a rebuild of the chains it could be tested on (image inputs
`7a0afb0d…` after the record, `23154443…` after the receipt order; the last
build through `work/build-slot.sh` with one builder).

- Record, on `7a0afb0d…` (`default` chain, `core`, `cc`, `amy`, `minimal`,
  `python`, `rust`, `rust-tools`, `pi-coding-agent`, `cmake-build`, `cmake`,
  `sdl2`): `test/amy-browser.mjs` passes in both browsers with `codex-cli`
  replaced by `pi-coding-agent` in a scratch copy, which shows the rows a
  package brings (`javascript`, `ripgrep`, `fd` marked installed, `amy
  install fd` already installed); `minimal`, `image`, `image-inventory`,
  `custom-session` and `core` pass in both; artifacts 24, source 332.
- Receipt order, on `23154443…` (`default` chain, `core`, `cc`, `amy`,
  `minimal`, `python`, `rust`, `rust-tools`): the same suites pass in both
  browsers, the amy programs reduced to `rust`; artifacts 24, source 332.
- Not run on the new seeds, by the round's memory rule: the `codex-cli` step
  of the amy test (needs `codex-build`), and `cmake` and `sdl2` on the last
  seed. The integrator's catalog rebuild runs them.

## Closed (2026-10-06)

Four demo packages (`cmake`, `sdl2`, `rust`, `codex-cli`) and the packaged
core (`core`, `cc`, `amy`, with the `minimal` image) are on
`work/more-packages` (`8bfcd884`, `d4ab4f63`); the installed record and the
receipt order are on `work/more-packages-seed`. The table, the tests and the
demo runs above meet the done-when. What is left is the lean base's stages 1
and 2, in `20260930-231300-lean-game-images`.
