# Patti Cargo subset bugs

- STATUS: OPEN
- PRIORITY: 190
- TAGS: bug,demo,rust

`src/commands/patti.c:1193`: a `[[bin]]` without `path` compiles `src/main.rs` instead of
`src/bin/<name>.rs`; `:1075-1077` applies `--cap-lints allow` to workspace members; `:1131-1132`
does not propagate native link-search paths; `:815` fails path dependencies with prerelease
versions. Suspected: `--resume` fingerprints hash only the package root (`:1012-1030`).

## Evidence

Established: CONFIRMED BY READING. Read in main `4340d03`.

Source: 2026-09-30 takeover audit of main `4340d03` (six read-only subsystem audits plus browser
reproductions in Chrome against the prebuilt `default` image).

## Expected

Cargo-compatible target discovery and lint scoping.

## Done when

- Rust image tests build a crate with multiple `[[bin]]` targets and a prerelease path
  dependency.

## Progress (2026-10-01)

Fixed in `4c53ff0`; `demos/rust/test/patti.test.mjs` covers them with a mock
rustc. Missing: the Rust image build from "Done when".
