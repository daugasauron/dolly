# Tests and hygiene the audit found: artifacts in npm test, tests for the boundary cases, task citations

- STATUS: OPEN
- PRIORITY: 120
- TAGS: tests,hygiene,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, section 6 items 5-6, section 7).

## State (2026-11-13, seed round)

The groups the re-check left, on `round/0.1.6-seed` after the layout move (paths as moved), with
the default closure rebuilt on them (`build/seedbatch-image-4.log`) and the suites again
(`build/seedbatch-suites-3*/`):
- 5, done (5a9fafa1f): `scripts/prepared-source.sh` holds the skeleton of the trees prepared in
  `build/generated` (the key over the pins and inputs, the published-or-not checks, the staging
  sibling and its one rename); git, zlib, Samurai, WAMR and GNU Make use it: −143 +38 in the five,
  +30 the helper. The five trees it prepared are identical to the ones before (`diff -r`), so the
  staged sources and their images are too. zig-native and ghostty-source keep theirs: they prepare
  in `.cache` and mark a complete tree with a file. `test/preparation-cache.test.mjs` checks the
  helper's key (it tracks Samurai's script and the helper, and survives relocation).
- 11, done (30a3900e8): `copy_bytes` in `programs/commands/path.h` is cp's and install's copy loop,
  which both sourced the header already: −51 +30.
- 19, done in `scripts/build.sh` (92bc9be32): the toolchain container was defined twice, the
  second time only to add the Emscripten cache mount, now one of its mounts: −18 +8. Same runtime
  and image inputs (`79275cdf…`, `build/seedbatch-runtime-19.log`). `prepare-make.sh`'s container
  stays its own: it mounts the checkout alone and works in its configure tree.
- 28, done before: the supervisor's spawn packet takes its size and offsets from
  `DOLLY_PROCESS_SIZEOF` and `DOLLY_PROCESS_OFFSETOF` (`page/process-supervisor.mjs:17-18,153-158`).
- 2, closed: `site/dollyfile-view.mjs` reads recipes where no kernel runs (the pin updater, the
  catalog lint and graph in Node, the custom image page before it boots) and
  `programs/dollyfile.c` is the engine that builds them inside Dolly; one owner would make Node and
  the page run the Wasm engine, or the engine trust the page's parse. `test/image-browser.mjs` runs
  the same cases (`test/fixtures/dollyfile-cases.mjs`) through the engine with the page's rows.
- 4, closed: a package keeps only what it declares (`docs/dollyfile.md`, `FROM`): posix exports 57
  of system-tools' 58 objects (all but ninja), core 22 of system-build's 46. The rows are two
  images' contents, each read in its one file; dropping them takes a Dollyfile operation that
  re-exports a base's objects, a language change for 79 rows.
- 14, closed: two behaviours. Slop resolves into its caller's `PATH_MAX` buffer, reports a path too
  long (126) and takes PATH from its own variables; `programs/commands/run-program.h` allocates and
  fails a non-regular file with EACCES, as `execvp` does, for env, xargs and timeout. Their common
  part is the 10-line walk of PATH's entries.
- 17, closed for now: `programs/compiler.cpp`'s two `wasm-ld` heads (side module and process shared
  object) and lld tails are the pinned seed compiler's; they go with its next round
  (`docs/sources.md`), with the module names of `20261112-074501-modules-modular`.
- 21, closed: each suite's `run` is one line; a shared helper makes each `const run =
  succeeds(session)`, still a line, plus an import: amy's and default's `check` are the only two
  lines it would remove.
- 22, closed: audio's and microphone's providers share the OPEN reply (scope, rate, channels: 4
  lines) and the stale sequence check (3); audio keeps a stream per slot and microphone one
  capture, so the checks around them differ. A helper is an import into two boundary files for 7
  lines.
- 13, closed: what is left of the lease-bridge boilerplate after `leaseBridge` (the runtime's) is
  each module's `worker()`: audio's and microphone's are 11 lines, the same but the import they
  provide, their mailbox export and their reply message; nena's adds its boot files. Those names
  are the module's authority, which the boundary map's reader looks for in its file; a shared
  builder would take them as arguments and save about 14 lines.
- 25, closed: the seven musl include paths of `scripts/build.sh` and `host/threads/seed.sh` in a
  file both source save 3 lines net (its header and a `source` in each), and the compile flags
  differ (`-matomics -mbulk-memory` serial, `-pthread` threaded).
- 12, partly done (50b8c9166): fetch-make.sh's extraction was never read (prepare-make extracts the
  archive into its configure tree): prepare-make fetches the archive itself and the script is gone,
  −21 +1; the prepared tree is identical and every image a cache hit
  (`build/seedbatch-image-5.log`). fetch-uucode and fetch-zig stay: as rows of
  `fetch-pinned-source.sh` their archives get other cache names, which every tree's `.cache` (and
  an offline one) would fetch again, and Zig's is xz, which it does not extract.
Left: 8, the commands' option loops: they take long options too (`--help`, mkdir's `--parents`),
so `getopt` alone does not replace them, and `getopt_long` changes their messages and, in the
native command tests, glibc's argument order.

## State (2026-11-13)

Done before: `npm test` runs `test:artifacts` after the source suite (`fix/batch`); the four
comments that cited tasks state their reasons alone; a nena switch's line is asserted
(`test/nena-browser.mjs`); a foreign directory's packs in the pack store goes with
`20261104-143110-modules-r5`. M6: the generated files are current after any build (`build.sh`
runs `generate-abi-constants.mjs` first), not after an edit.

The groups of `work/audit-core-2026-11-07/REPORT.md` 3.4, re-checked 2026-11-12 on
`round/batch-1112`: 23 and 24 are gone; 10 was done on `fix/console-interrupt` (−43 lines); 1 is
smaller (display's and input's lease stacks share about 25 lines, each release doing its own work
after); 26 is not duplication (LEB128 encoded in `ffi.mjs`, decoded in `wasm-interface.mjs`); 27 is
kept (a shared module would be a request more at every start, `20261112-090000-audit-startup`).

The seed's groups, on `fix/seed-hygiene` (bbc0badda, 1725f4686, b294a264b, b8e802344; image
inputs `2ee43eaf…` before, `43a2aca0…` with them and the module packages of
`20261112-074501-modules-modular`). Measured in `work/seedwork`: the source suite (467 pass), the
artifact tests (all but "dist registers every image", for the narrowed catalog) and the core,
shell, slop, process, pty, console, threads, terminal, cpp, host-modules, display and upload suites
pass in Chromium and Firefox (`build/seedwork-r1-*.log`, `seedwork-r2-*.log`); the default suite
fails only at `amy list`, which is the base's (`20261112-090000-audit-startup`):
- 6, done: `src/commands/path.h` holds `join_path` and `base_name_copy`; cp, du, find, install,
  ls and mv include it (mv's own inline join too), and the two recipes that build them source it.
  −101 +13 in the commands, +35 the header, a SOURCE row in each recipe.
- 16, done: `dolly_deadline` (`<dolly/runtime.h>`, `runtime-adapter.c`) turns a timeout into the
  contract's deadline; the display, input and touch clients and the runtime's spawn and raw
  terminal read use it (five copies were three helpers and two inline): −83 +22, +5 in the header.
- 18, done: `dolly_path_call` (`<dolly/runtime.h>`, the libc adapter's `path_call`) sends a
  module's operation on a path; download's and upload's clients are its call: −42 +8, +5 in the
  header.
- 29, done: `scripts/sha256.mjs` is the one `sha256(bytes)`; the 15 files that defined it again
  (and `snapshot-identity.mjs`'s six importers) import it: −43 +29, +4 the module. The other
  `createHash("sha256")` uses hash incrementally or take raw digests, which it does not replace.
- S5, done: Slop links `commands/echo.c`, `printf.c` and `test.c` as files of their own
  (`-DDOLLY_SHELL_UTILITY` leaves out their `main`), in `Dollyfile-system-build` and the sanitizer
  test; it includes no source.
- 3, closed: with the packages of `20261112-074501-modules-modular` there are thirteen
  `Dollyfile-libdolly-*`, 301 lines, the same rows but the module's name, its sentence and pins.
  Generated from `module.json` they would be build outputs the site, the npm package, the pin
  updater and the catalog lint all read before a build, and a module's package would no longer be
  one file a reviewer reads; a recipe is data, and its pins are already refreshed by tool.
- 7, closed: the 13 `CHECK`s are three behaviours (exit in 8, count and go on in 3, return in 2),
  and each fixture is fetched alone into the image by its suite (process, pty, sockets, image, and
  the pty and sockets "not declared" cases). A shared `check.h` needs a fetch beside every compile
  and an include in each: about as many lines as the 8 exit macros it replaces.
- 9, closed: the shared part is one function already, `dolly_device_request` (`runtime.h`); what is
  left of each `call` (6-8 lines) is the module's own reply rule: an exact length for audio and
  nena, the length returned for microphone, none for gpu.
- 15, closed: each module header is installed and included alone (its package), so the
  `static_assert`/`_Static_assert` switch is per header; the one header they all include is
  `process.h`, whose bytes are the process contract (a change restamps the seed compiler), and
  `<assert.h>` instead would define `assert` for every program that includes a module header.
- 20, closed: three copies of 10 lines in three recipes' single-file programs (cat, gzip, Slop,
  whose returns are the opposite); a shared header costs a SOURCE row in two recipes, its include
  and 12 lines: −20 + 16.
- M2, closed: a split moves code and removes none. The cleanest cut, the line editor (29
  functions, 580 lines), crosses at 10 functions and the `History` type; arithmetic calls 17
  functions outside it, the lexer 7; six files need a header of the 27 shared types (lines 34-170)
  and a prototype for every crossing, and a SOURCE row each in `Dollyfile-system-build`.

Left: groups the 2026-11-12 re-check did not list (2, 4, 5, 8, 11-14, 17, 19, 21, 22, 25, 28);
they are not seed work.

## Do

- `test:artifacts` (the exact import allowlist) runs in `npm test`.
- Tests for: a foreign package directory not writing the pack store, a nena switch's line.
- Comments citing `tasks/2026...` in `src/` and `host/` (4) say the reason instead.
- Re-check the 2026-11-07 duplication groups 1, 3-29, generated files without a currency check
  (M6), Slop including `commands/echo.c`, `printf.c`, `test.c` (S5) and `slop.c`'s size (M2).

## Done when

Each is done or closed with the reason.
