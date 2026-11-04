# The slopyard test without a compiler in its image; http-broker's moving stream without timing

- STATUS: OPEN
- PRIORITY: 250
- TAGS: tests,0.1.5

## State (2026-11-05 02:45 JST): both done on `fix/tests-r1`; close after the round

Both fixes are committed and verified in this tree (image inputs `88959af6`). The round must
build `slopyard-build` (new), `slopyard-game` and `slopyard`, then run
`demos/slopyard/test/slopyard-browser.mjs` on a GPU window as before (one command, one
server). Close when the round's run passes.

## 1. Slopyard's test compiled in an image without a compiler

R1 (`tasks/20261104-135806-module-audit`) assembled `slopyard` from packages: `core`, `posix`,
`display`, `transfer`, `pi-dolly` and `slopyard-game`, a package built FROM `gamedev-sdk` that
keeps only its exports. The test (`demos/slopyard/test/slopyard-browser.mjs`) still uploaded the
checkout's game sources into `slopyard`, compiled 17 C fixtures there (each includes `world.c`
and links the game's libraries) and recompiled the game before driving it. Since the image was
FROM `gamedev-sdk` (bcaed6eca, 8aeec3fcb) it had `cc`; now it has none.

Why it compiles in the session: the fixtures are the game's simulation checks, and compiling the
checkout's sources there checks an edit without an image rebuild (bcaed6eca: "uploads the
checkout's game sources once, compiles and runs each C fixture inside Dolly"). They are quick:
2 to 11 s each with the compile, 90 s for all 17 (round-1104b's log and tonight's).

Decision: the compile belongs where the game is built, in a toolchain the test opens, not in the
package's build.
- Running the fixtures in `slopyard-game`'s build would make every source edit an image rebuild
  before any check runs (AGENTS.md: keep image rebuilds out of source-only iterations), and a
  package's build runs in every catalog round whether the game changed or not.
- The game's build environment did not exist as an image: `slopyard-game` built FROM
  `gamedev-sdk` with `USE libdolly-gpu` and `USE janis`, so its Lua 5.5 and Box3D archives existed
  only in that build root, and the package exported them into the application, which has no
  compiler to link them.
- `rts-build` and `seven-kingdoms` (1ea2bc6a3, tonight) are the same shape: the toolchain where
  the game is compiled is the image the test compiles in; the package keeps the outputs.

Change (35393ee3c), all in `demos/slopyard/prepare-slopyard.mjs`, which writes the three recipes:
- `TOOLCHAIN slopyard-build`: `gamedev-sdk`, `INSTALL libdolly-gpu` and `janis`, then the Lua 5.5,
  Box3D and game steps that were `slopyard-game`'s, and `ENTRY /bin/foreground -i /bin/slop`.
  Modules: `gamedev-sdk`'s retained programs' and `gpu@0` (the game, run by `--check`); 10, no
  `snapshot@0` (as `rts-build`).
- `PACKAGE slopyard-game`: FROM `slopyard-build` with only exports, as `cc` is: `TOOL slopyard`,
  `FOLDER slopyard-source` (the files it reads when it runs), Lua's licence, the manual page. It
  no longer exports `LIB lua55`, `HEADER lua55` or `LIB slopyard-box3d`.
- The test compiles and runs the fixtures in `/slopyard-build/` against the uploaded checkout
  sources (`compileCommand()` reads `Dollyfile-slopyard-build`), closes that page, then opens
  `/slopyard/` and drives the game the image holds with the driver as `check.mjs`. It no longer
  uploads the sources into `slopyard` nor recompiles the game there.

Measured (this tree): `slopyard-build` 171,057,416 bytes (2,354 paths; `gamedev-sdk` is
159,487,738); `slopyard-game` 7,185,730 to 4,815,032 bytes; `slopyard` 99,932,080 to 97,563,781
bytes, 11 modules as before. Built with `DOLLY_BUILD_IMAGES=slopyard-build,slopyard-game,slopyard,default`
in 93 s.

Verified: `slopyard-browser.mjs` passes in Chromium on a GPU window (own Xvfb `:143`, under the
GPU lock): the 17 fixtures in `slopyard-build` (2.5 to 11.3 s each), then in `slopyard` the
driven car (moved 10.5 m), steering, the Eyes camera, import, export of an edited program,
the invalid import kept out, world restore, no HTTP request, no page error
(`build/tests-r1-evidence/gpu-slopyard-1.log`). Source suite, lint and the slopyard artifact
check pass.

## 2. http-broker's moving stream depended on wall-clock scheduling

`test/http-broker.test.mjs`, "a response lasts as long as it moves and times out once it stops":
a stream sent 30 bytes 30 ms apart under a 300 ms timeout (e0951149c widened it from 10 ms and
100 ms), and the program's read was a 1 ms `setInterval`.

Measured tonight, with the night round building in `work/integrate`: the old test failed 3 of 9
suite runs, all three on its lower bound, "cut no sooner than the timeout after its last bytes",
with every byte delivered. Its bound compared `performance.now()` against a Node timer, and Node
counts the loop's time in whole milliseconds: a 30 ms timer armed after an `Atomics.waitAsync`
wake (the broker arms its timeout after the program reads) fired up to 0.93 ms early by
`performance.now()` in 3 of 200 tries; armed from a timer callback, never. The drain's lag (a
late read counts as the program not reading) was the other way to fail, which e0951149c had
widened against.

Fix (715e89990), the test alone: it owns time. `t.mock.timers` (setTimeout) and
`performance.now` advance only when the test passes time; the server enqueues a byte when told;
the program's read waits on the slot word for the broker's notify (`nextRecord`, sharing
`takeRecord` with the interval drain the other tests keep). Five bytes, each 299 ms after the
one before under a 300 ms timeout, arrive whole; then the stream is not cut 299 ms after the last
record and is cut at 300 ms with `ETIMEDOUT`. The broker is unchanged: its three uses of time
(the timer in `moved()`, `check()`'s deadline, the mailbox's wait) all read `performance.now()`
and `setTimeout`, which the mocks cover; an injected clock would be production code for a test,
and the mailbox, which runs in the Worker, could not share it.

Verified: source suite 475 of 475 three runs in a row while image builds ran (go, fingers,
lean-stage0 in a build slot; the old test beside them failed 1 of those 3), and three runs of
three suites at once (`build/tests-r1-evidence/suite-load-*.log`, `suite-heavy-*.log`). The new
test takes 15 ms.

## Not done

- This tree's catalog registers 186 images: 18 (`go`, `go-build`, `go-tools`, `esbuild`, the
  four Lean images, `llvm`, `llvm-build`, `llvm-cc`, `lfm2.5`, `minicpm5-2b`, `qwen3.5-4b`,
  `rust-tools`, the three 0 A.D. images) were never built for this seed here; a plain `npm run
  image` started them and was stopped at `lean-stage0` (Lean and LLVM do not fit a 6 GB build
  slot). `go` failed in it: "fork/exec /usr/lib/go/pkg/tool/dolly_wasm64/compile: Invalid
  argument" (`build/tests-r1-evidence/image-all.log`); not investigated, and this branch changes
  no Go input.

## Lessons

- A test that compiles in an image is a claim about where the build environment lives. R1
  removed the compiler from the application; the fix was not to put one back but to give the
  game's build an image of its own (the toolchain), which also took the static archives out of
  the application. Before choosing where a test step runs, ask which image is for that step.
- A flaky bound is worth measuring before widening: e0951149c widened the margins against the
  drain's lag, but tonight's three failures were all the lower bound, off by under a
  millisecond, which no margin on the same clock fixes. Controlled time (Node's mock timers and
  `performance.now`) made the test exact and 15 ms long, with no change to the broker.
- `npm run image` without `DOLLY_BUILD_IMAGES` is a full round in a tree whose catalog was
  narrowed before: here it planned 19 images, Lean and LLVM among them. Read the plan's
  `build` lines before letting it run; restore a narrowed catalog with the list of `reuse` lines.
