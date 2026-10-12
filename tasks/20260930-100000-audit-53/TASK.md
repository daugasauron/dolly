# Iteration cost left: serial Ninja, a 32-process cap, slow unchanged demo builds, demo tests in Chrome only

- STATUS: OPEN
- PRIORITY: 170
- TAGS: core,iteration,build

## State (2026-10-12)

`AGENTS.md`: "Development iteration speed is king." Since the review of 2026-10-05 this is the
one task for measured iteration cost; `tasks/20260930-231102-parallel-rust` was closed into it
on 2026-10-12.

Done and on `main`: `npm run dev` serves the checkout and the tests and the image builder use
it; nothing under `scripts/` imports from `test/`; `npm run build` and `test:full` are deleted;
`README.md` carries the turnaround table; an unchanged `npm run image -- default` takes 2 s (was
6.5 s). Make runs `-jN`, Slop runs a pipeline's programs at once, Cargo builds at four jobs.

Left:

1. **Three demo images prepare for 10 s or more with nothing changed** (2026-10-06, the last
   section): `codex` 13 s, `zero-ad` 10 s (a 1.8 GB copy), `pi-local` 10 to 15 s (its plan
   re-hashes 24 snapshots). The third done-when line is not met for them. Codex's preparer has
   changed since (`2370dc85`); owed is `npm run image -- NAME` timed unchanged for the three.
2. **Ninja spawns serially.** Samurai runs one `dolly_spawn` at a time
   (`config/samurai-dolly.patch`): its upstream `jobstart` needs `posix_spawn`'s `addclose` of
   an inherited pipe end, which spawn mappings cannot express, and `addopen`.
3. **The supervisor admits 32 processes** (`processWorkerLimit`, `src/process-supervisor.mjs`),
   which holds CMake builds and LLVM at `-j4`. Decided on 2026-10-01 and not built: a memory
   budget (admit a spawn while committed Wasm memory stays under a page budget), the count kept
   as a backstop.
4. **Part of each `cc` launch does not run in parallel**: 40 runs of `cc --version` took 4.2 s
   at `-j1` and 3.3 s at `-j8` (2026-10-01), which capped small-unit builds near 2x. Not
   profiled, not measured again since.
5. **Demo tests run in Chrome only.** `demos/run-browser-tests.mjs` starts headless Chrome; ten
   of the thirty demo test files name Firefox. "Every demo test once in Firefox" was on
   v0.1.0's list (`tasks/20261007-133708-v010`) and has not been done.

Lowered from 300: the done-when lines that cost every edit are met.

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
