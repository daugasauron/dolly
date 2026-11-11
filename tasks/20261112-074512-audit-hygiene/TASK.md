# Tests and hygiene the audit found: artifacts in npm test, tests for the boundary cases, task citations

- STATUS: OPEN
- PRIORITY: 120
- TAGS: tests,hygiene,audit

From the Fable 5.2 audit (`tasks/20261112-074500-audit-fable-core`, section 6 items 5-6, section 7).

## State (2026-11-12)

Filed.

## Do

- `test:artifacts` (the exact import allowlist) runs in `npm test`.
- Tests for: a foreign package directory not writing the pack store, a nena switch's line.
- Comments citing `tasks/2026...` in `src/` and `host/` (4) say the reason instead.
- Re-check the 2026-11-07 duplication groups 1, 3-29, generated files without a currency check
  (M6), Slop including `commands/echo.c`, `printf.c`, `test.c` (S5) and `slop.c`'s size (M2).

## Done when

Each is done or closed with the reason.
