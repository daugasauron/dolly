# Tests and hygiene the audit found: artifacts in npm test, tests for the boundary cases, task citations

- STATUS: OPEN
- PRIORITY: 120
- TAGS: tests,hygiene,audit,0.1.6

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, section 6 items 5-6, section 7).

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
