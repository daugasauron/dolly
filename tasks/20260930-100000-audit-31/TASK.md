# Slop accepts unsupported syntax and settings as silent no-ops

- STATUS: OPEN
- PRIORITY: 220
- TAGS: bug,slop,core,compatibility

`$'...'`, `{a,b}` and `$!` pass through as literal text; `set -o posix` is accepted and does
nothing; `export` is a no-op because every variable is already exported (`src/slop.c:1712`), so
`IFS` and loop variables leak into every child.

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Unsupported syntax fails with an explicit error; variables are exported only when marked.

## Done when

- Native Slop tests: unsupported constructs produce a diagnostic and non-zero status; unexported
  variables are absent from a child's environment.
