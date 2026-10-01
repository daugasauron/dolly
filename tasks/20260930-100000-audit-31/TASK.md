# Slop accepts unsupported syntax and settings as silent no-ops

- STATUS: CLOSED
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

## Resolution (2026-10-01)

Rechecked on `rebuild-batch` with a native Slop build:
- `export` already marks variables; only inherited, exported or prefix-assigned
  ones reach children (docs/slop.md). `set -o posix` already fails with status 2.
- `{a,b}` stays literal, as POSIX `sh` requires; brace expansion is a Bash
  extension.
- `$!` expanded to the literal text `$!`. Slop runs no background jobs, so `$!`
  is now an always-unset special parameter: empty, and an error under `set -u`.
- `$'...'` expanded to `$` plus a single-quoted string. It now fails at parse
  time like `&`.
- Slop cases for both, checked against Bash; reverting the change fails them.
