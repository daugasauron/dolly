# Iteration cost left: serial Ninja, a 32-process cap, slow unchanged demo builds, demo tests in Chrome only

- STATUS: OPEN
- PRIORITY: 170
- TAGS: core,iteration,build,owner

## What a catalog round costs (2026-10-14, 06:00): gathered from the logs, the owner's to read

Owner (2026-10-13): "Recently we're rebuilding from the core all the time
because the core has issues. This is expected but the long term goal is to get
away from that." [The measurements that exist](round-costs.md), image by
image, by a Fable agent that read the logs under `build/` and the tasks and
built nothing. The integrator recomputed its sums from its table, read five
durations in the logs and corrected three things, listed at its top. It gives
no verdict. What it holds:

- A build duration for 124 of the 130 images. They sum to 5.1 hours of single
  builds. Six images take more than 1,000 s each (`mojo-llvm` 2,730,
  `llvm-build` 2,341, `codex-build` 1,769, `rust-build` 1,719, `rust-llvm`
  1,246, `cmake-build` 1,075) and the ten longest are 72% of the sum; 88
  images build in under a minute.
- The longest chain is 6,536 s (1 h 49 min): `system-build`, `zig-build`,
  `ghostty-build`, `display`, `system-tools`, `cmake-build`, `rust-llvm`,
  `rust-build`, `protox`, `codex-build`, `codex`. No job count makes a full
  round shorter than that. Measured at one job: 6,765 s (v0.1.2).
- A change of the seed and a change of `system-tools` cost within 4% of each
  other, because all six long images sit below `cmake-build`. The cost
  halves only at `rust-build` (25 images, 1.6 h) and falls to minutes only
  for what avoids the Rust, LLVM and Mojo chains: `tools-build` and its 25
  dependents 500 s, `pi` and its nine 453 s, a docs file 4 images in 476 s
  wall (measured tonight).
- Heavy images stretch beside each other: `rust-build` 2,940 s beside
  `mojo-llvm` against 1,719 s alone, `mojo-llvm` 4,065 s against 2,730 s.
- Whole rounds: v0.1.2 took 5 h 36 min (3 h 40 min building, 1 h 16 min of
  tests, 37 min publishing); the round of 2026-10-13 5 h 02 min of build
  stages, 77 min of them two failed attempts at the heavy stage, and 66 min
  of tests.
- Tests of a round: the core suite 403 to 427 s in both browsers since it
  runs four files at a time (`d08dca57`), 916 and 951 s before; the demo
  suites 36 to 41 min; the GPU checks 18 to 23 min.
- Not found in any log: the durations of six images whose stage log was
  overwritten, peak memory per image after 2026-10-01, cold against cached
  for one image, what failed in the two heavy attempts of 2026-10-13.

## The README's turnaround table, measured again (2026-10-14, 06:00, load 1)

Each row that needs no edit to measure, twice, in `work/rust` at `eeef65d7`:

| Command | The table said | Measured |
| --- | --- | --- |
| `npm run test:source` | 20 s | 19.9 and 20.0 s |
| `npm run test:artifacts` | 2 s | 23.5 and 24.4 s |
| `npm run test:core`, Chromium | 24-32 s | 24.1 and 24.2 s |
| `npm run test:core`, Firefox | 32-68 s | 31.7 and 31.8 s |
| `npm run build:runtime`, nothing changed | 9-12 s | 10.8 and 12.5 s |
| `npm run image -- default`, nothing changed | 2 s | 2.6 and 3.6 s |
| `npm run test:browser`, both browsers | 17 min | 403 to 427 s in seven runs since `d08dca57` |

The table carries the measured numbers now. Of the artifact tests' 24 s, 19.6 s
are one test, "system snapshots are sealed to their visible recipe chain",
which reads every image's snapshot (130 images today, 23 when the 2 s were
measured), and 4.7 s "published inputs are independent exact pinned files".
Not changed.

## State (2026-10-13)

`AGENTS.md`: "Development iteration speed is king." Since the review of 2026-10-05 this is the
one task for measured iteration cost; `tasks/20260930-231102-parallel-rust` was closed into it
on 2026-10-12.

Done and on `main`: `npm run dev` serves the checkout and the tests and the image builder use
it; nothing under `scripts/` imports from `test/`; `npm run build` and `test:full` are deleted;
`README.md` carries the turnaround table; an unchanged `npm run image -- default` takes 2 s (was
6.5 s). Make runs `-jN`, Slop runs a pipeline's programs at once, Cargo builds at four jobs.

Left:

1. **Every program start copies and hashes the whole executable, one start at a time**
   (measured 2026-10-13, `system`, Chromium, load 9): 40 runs of `cc --version` under Make take
   4.0 to 4.2 s at `-j1` and 3.2 to 3.7 s at `-j8`, 100 ms a start. By reading: the kernel reads
   the 78 MB compiler into its memory, the supervisor copies it out, hashes it with SHA-256 to
   find the compiled module it already has, and does this for one start at a time
   (`#compileProcess` on `launchChain`, `src/process-supervisor.mjs`). An identity the kernel
   can give without reading the file (the file and a count of its writes) would let a cached
   module skip all three. Not built: it is a new kernel export and a change to the start
   protocol.
2. **The supervisor admits 32 processes** (`processWorkerLimit`, `src/process-supervisor.mjs`),
   and a spawn past them fails: the same Makefile at `make -j16` ends in a second with "compiler
   process failed" and `Error 126` for five targets. It holds CMake builds and LLVM at `-j4`. Decided on 2026-10-01 and not built: a memory budget (admit
   a spawn while committed Wasm memory stays under a page budget), the count kept as a
   backstop.
3. **Ninja spawns serially.** Samurai runs one `dolly_spawn` at a time
   (`config/samurai-dolly.patch`): its upstream `jobstart` needs `posix_spawn`'s `addclose` of
   an inherited pipe end, which spawn mappings cannot express, and `addopen`.
4. **Three demo images prepare for half a minute or more with nothing changed.** Measured on
   2026-10-14 (load 1 to 3, twice each, nothing built): `npm run image -- codex` 80 and 87 s,
   `zero-ad` 51 and 52 s, `pi-local` 33 and 33 s; all but 3 to 7 s of each is
   `scripts/prepare-image-sources.sh`. On 2026-10-06 they took 15, 14 and 16 s (the last
   section). `default` takes 3 s. What an unchanged run does, counted from its output: `codex`
   writes 16 archives of 1,052 MB (905 MB and 63,131 files are `codex-sources.tar`), builds 8
   compressed archives again to compare and keep them (241 MB compressed) and patches 60 files;
   `zero-ad` writes 17 (172 MB), compares 9 (402 MB) and patches 12; `pi-local` writes 22
   (240 MB), compares 7 (225 MB), patches 15 and stages the 1.4 GB model. All three closures
   hold `rust-build` (through `ripgrep` and `fd`, or `cbindgen`), so each run extracts, patches
   and archives rustc, its LLVM and Cargo again (58,029 files); `default`'s closure holds none.
   `rust-build` came into these closures with `2370dc85` (2026-10-09), when Rust began to be
   built inside Dolly; the runs were not timed before and after that commit.
   Not measured: the seconds of each preparer. That needs a timed trace of the script; a
   safety check of the session stopped the one tried, and it was not run another way.
5. **Demo tests run in Chrome only.** `demos/run-browser-tests.mjs` starts headless Chrome; ten
   of the thirty demo test files name Firefox. "Every demo test once in Firefox" was on
   v0.1.0's list (`tasks/20261007-133708-v010`) and has not been done.
6. **A single-image run narrows what the suites check, and they do not say so.**
   `npm run image -- NAME` writes `dist/dolly-images.mjs` and the routes for NAME's closure,
   also when nothing is built: 31 images after `-- pi-local`. The artifact tests then read 31
   images and pass, and one skips (`test/zig-sdk.artifacts.mjs:19`, `skip:
   !selected.has("default")`). Found on 2026-10-14 after the timing runs of item 4, when the
   artifact tests went from 25 passes to 24 and a skip; the plain `npm run image` listed 130
   again (155 s, nothing built) and they pass 25.

Not done on 2026-10-13: the day went to reproduced bugs; 1 and 2 are the two that cost every
build inside Dolly and come first.

## Done when

- One documented command serves the working tree with the current `dist/`;
  the tests and the image builder use the same server, and nothing under
  `scripts/` imports from `test/`.
- `npm run test:full` runs to completion or is deleted together with `build`
  and its README line.
- `npm run image -- IMAGE` with nothing changed finishes in under 10 s; the
  time before and after is recorded here.
- The turnaround table is in `README.md` in place of the comments on the check
  commands, with the measured numbers.

## Findings (2026-10-06)

Measured in `work/presenter` on `core/iteration` (image inputs `2cc92c2b…`,
complete current catalog in `dist/`); logs in `build/iteration-evidence/`.

- The two minutes were the whole catalog, not one image. An unchanged
  `npm run image -- default` took 10.3 s at 00:35 (load 15-17, preparation
  9.0 s) and 5.3 s at load 2 (preparation 4.3 s). With every input cached,
  the catalog's preparation took 72 s, not 124 s.
- An unchanged single-image run spent its preparation hashing the whole
  catalog: `update-recipe-pins.mjs --sources` read every staged source of
  every recipe (6.4 GB, of which 2.8 GB model weights and 1.8 GB 0 A.D.).
  `verify-static-sources.mjs` then hashed the closure again, and
  `generate-routes.mjs`, which runs next in both callers, a third time.
- The catalog's remaining preparation is a few demo preparers that redo
  their work on every run: model weights rewrote 3 GB of 1 GiB parts (16 s),
  `demos/codex/prepare-codex-sources.py` re-extracts, re-patches, re-tars and
  re-gzips 405 MB in Python (12-23 s), `demos/zero-ad/toolchain/prepare-distribution.mjs`
  copies 1.8 GB (10 s), and every `.tar.gz` source was recompressed (llvm 5.5 s,
  emacs 5.2 s, cmake 2.8 s, Seven Kingdoms 2.6 s, CPython 2 s).
- An unchanged run is not offline: the first catalog run in this worktree
  downloaded both GGUF models (526 s) and failed on `ftp.gnu.org`, because
  `demos/emacs/prepare-emacs.sh` fetches the archive before it checks for the
  configured tree that makes it unnecessary.

## Changes (2026-10-06)

Decision: delete repeated work and compare content; add no input
fingerprints. The preparers' inputs are implicit (scripts, pins, files across
demos, `build/0ad`, `node_modules`, host tools), so a declared key that misses
one would silently keep a stale source. A content comparison cannot.

- `db825da2`: pins are refreshed only for the selected closure, which is all
  preparation restaged; `verify-static-sources.mjs` is deleted; the archive
  writer keeps an existing `.tar.gz` whose decompressed tar equals the new one.
- `c5537f53`: a staged model part whose bytes equal its slice stays.
- `f56fd246`: `npm run dev [-- IMAGE]` (`scripts/serve-checkout.mjs`) serves
  the checkout and current `dist/`. The test server moved there; the image
  builder uses it; `test/browser-server.mjs` only adds fixtures. The
  allowlist stays exact and loses its hand lists: generated pages come from
  the route table `generate-routes.mjs` writes (`pageRoutes`), fixture
  modules from `test/fixtures/`. It now serves every registry image's routes,
  not only IMAGE's. `demos/gpu-fluid/serve.mjs` duplicated it and is deleted.
  Release acceptance moved to `scripts/accept-release.mjs`: `site-release.mjs`
  runs it against a static server of the staged site (a new Chrome per image,
  900 s each), `test/image-inventory-browser.mjs` against the checkout. The
  builder and acceptance share one in-page build (`page-image-build.mjs`),
  which counts dependency builds; the reproducibility check no longer reads
  "reusing local " from the log. `npm run build` and `npm run test:full` are
  deleted.

Not changed: `scripts/build.sh` still compiles `test/fixtures/*.wat` and runs
`test/build-dso-fixtures.mjs` during `build:runtime`. It builds test inputs and
imports nothing; moving it would add a step before every browser check.

## Measured after (2026-10-06)

Interleaved with the previous scripts at load 2 (`measure-interleaved.log`):

| Unchanged command | Before | After |
| --- | --- | --- |
| `npm run image -- default` | 5.2-5.3 s (preparation 4.3 s) | 1.9-2.0 s (1.0 s) |
| `DOLLY_BUILD_IMAGES=default,pi npm run image` | 7.6-8.1 s (5.2-5.7 s) | 4.3-5.0 s (1.9-2.6 s) |
| catalog preparation | 67.9 s | 53.9 s |
| model weights, `qwen3.5-2b` | 6.5-11.6 s | 2.9-3.5 s |

Changed inputs still rebuild exactly what they should:

- Source: a comment appended to `src/commands/gzip.c` restaged it, re-pinned
  `Dollyfile-gzip` and built only `gzip` through the new server and in-page
  build (9.0 s; `system-build` and `zlib` reused). Restoring it rebuilt `gzip`
  to the original `364a5ed5…` snapshot.
- Compressed source: a comment in `demos/cmake/Dolly.cmake` wrote a new
  `cmake.tar.gz` (`48d45c87…`), and the plan rebuilt only `cmake-build`;
  restored, the writer produced the original `e49a4a2c…` bytes and everything
  was reused. Unchanged, it reported "kept".
- Recipe: a comment in `Dollyfile-gzip` planned `build gzip: recipe changed`.
- Seed: a comment in `src/dollyfile.c` (packed into `dolly.data`) changed the
  image inputs to `ab0c8e41…`, and `zlib` planned both images as "seed or image
  ABI changed"; restored, `2cc92c2b…` and full reuse.
- `npm run image -- zlib --reproducible`: two cold and one cached build are
  byte-identical (`6152eed1…`, 38 s). A warm build on an empty profile fails
  with "did not exercise the warm image cache".
- Acceptance: a wrong manifest hash in the inventory recipe fails it; the
  site server accepted `system-build` and `default` served from a directory.
- `npm run -s test:source` 333/333, `npm run -s test:artifacts` 23 + 1 skip,
  `npm run test:browser chromium firefox` (every `test/*-browser.mjs`, 656 s
  at load 5-13), `node test/image-inventory-browser.mjs chromium firefox`
  and the release tests pass.

## The three demo images, as measured (2026-10-06)

Unchanged runs of three demo images with multi-gigabyte inputs stay above
10 s (preparation + routes + plan, measured): `codex` 13.1 + 0.5 + 1.7 s
(its Python preparer), `zero-ad` 10.2 + 1.3 + 2.3 s (the 1.8 GB copy),
`pi-local` 9.4 + 1.2 + 5.1 s at load 11 (14.6 s of preparation at load 2
before `c5537f53`; its plan re-hashes 24 snapshots). The codex and 0 A.D.
preparers have diverging versions in other worktrees tonight, so they are
left to their demos; the same content comparison applies
(`prepare-codex-sources.py` can let `build-source-tar.mjs` write and keep
its `.tar.gz`; `prepare-distribution.mjs` can keep identical files, and its
`copyFile` currently truncates the staged hard link of the published file in
place). `prepare-emacs.sh` should fetch its archive only when the configured
tree is missing; that edit changes the preparer's own hash, which keys the
tree, so it belongs with the next Emacs change.
