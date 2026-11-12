# Tests and hygiene the audit found: artifacts in npm test, tests for the boundary cases, task citations

- STATUS: OPEN
- PRIORITY: 120
- TAGS: tests,hygiene,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, section 6 items 5-6, section 7).

## State (2026-11-12)

On `fix/batch`: `npm test` runs `test:artifacts` after the source suite; the four comments that
cited tasks state their reasons alone. A nena switch's line is asserted already
(`test/nena-browser.mjs`: "This session enabled microphone@0."). A foreign directory's packs in
the pack store goes with `20261104-143110-modules-r5`, which stops keeping them.
Seen today for M6: `src/process-constants.mjs` lagged `TERMINAL_SIZE_SET` until a build
regenerated it; the generated files are current after any build (`build.sh` runs
`generate-abi-constants.mjs` first), not after an edit. Left: the 2026-11-07 re-checks (duplication
groups, S5, M2).

Re-checked 2026-11-12 on `round/batch-1112` (the groups of
`work/audit-core-2026-11-07/REPORT.md` 3.4):
- Gone: 23 (`processChildren()`), 24 (`restore_address`, now only `src/system-snapshot.c`).
- Done on `fix/console-interrupt`: 10, the static aliases of `display.mjs` (25) and `input.mjs`
  (18); every use names the ABI constant (−43 lines).
- Smaller than found: 1, touch holds one lease now; display's and input's lease stacks share
  about 25 lines (find, release by pid, the descent rule), each release doing its own work after.
- Not duplication: 26, `ffi.mjs` encodes LEB128 and `wasm-interface.mjs` decodes it.
- Kept: 27, the configure handshake (11 lines) in the process and runtime Workers: a shared
  module would be a request more at every start (`20261112-090000-audit-startup`).
- Still there, in the seed (commands, module clients, fixtures), for a seed round: 3 (five
  `Dollyfile-libdolly-*`), 6 (`join_path` in cp, du, find, install, ls; `base_name_copy` in cp and
  mv), 7 (`CHECK` in 13 fixtures), 9 (`call` in audio, gpu and nena clients), 15 (layout asserts),
  16 (deadline helpers in display, input and touch clients), 18 (download and upload path
  requests), 20 (`write_all` in cat, gzip, slop), 29 (`createHash("sha256")` in 42 scripts and
  tests).

## Do

- `test:artifacts` (the exact import allowlist) runs in `npm test`.
- Tests for: a foreign package directory not writing the pack store, a nena switch's line.
- Comments citing `tasks/2026...` in `src/` and `host/` (4) say the reason instead.
- Re-check the 2026-11-07 duplication groups 1, 3-29, generated files without a currency check
  (M6), Slop including `commands/echo.c`, `printf.c`, `test.c` (S5) and `slop.c`'s size (M2).

## Done when

Each is done or closed with the reason.
