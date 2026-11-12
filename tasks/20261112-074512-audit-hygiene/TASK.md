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

## Do

- `test:artifacts` (the exact import allowlist) runs in `npm test`.
- Tests for: a foreign package directory not writing the pack store, a nena switch's line.
- Comments citing `tasks/2026...` in `src/` and `host/` (4) say the reason instead.
- Re-check the 2026-11-07 duplication groups 1, 3-29, generated files without a currency check
  (M6), Slop including `commands/echo.c`, `printf.c`, `test.c` (S5) and `slop.c`'s size (M2).

## Done when

Each is done or closed with the reason.
